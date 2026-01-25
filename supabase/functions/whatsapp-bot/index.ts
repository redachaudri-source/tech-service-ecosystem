import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Palabras clave que reinician la conversación
const RESET_KEYWORDS = ['hola', 'hello', 'hi', 'reiniciar', 'reset', 'empezar', 'inicio', 'comenzar', 'nueva', 'nuevo'];

// ============================================================================
// TIPOS
// ============================================================================

interface ConversationState {
    id: string;
    phone: string;
    current_step: string;
    collected_data: CollectedData;
    expires_at: string;
}

interface CollectedData {
    appliance?: string;
    brand?: string;
    model?: string;
    problem?: string;
    address?: string;
    name?: string;
    phone?: string;
    legal_accepted?: boolean;
}

interface BotConfig {
    company: {
        name: string;
        phone: string;
        email: string;
    };
    messages: Record<string, string>;
    legal?: {
        service_conditions?: string;
    };
    settings: {
        bot_enabled: boolean;
        working_hours_start: string;
        working_hours_end: string;
        response_delay_seconds: number;
    };
}

// ============================================================================
// CONFIGURACIÓN POR DEFECTO (fallback)
// ============================================================================

const DEFAULT_CONFIG: BotConfig = {
    company: {
        name: 'Fixarr Servicio Técnico',
        phone: '+34633489521',
        email: 'info@fixarr.es'
    },
    messages: {
        greeting: '¡Hola! 👋 Bienvenido a {company_name}. Soy tu asistente virtual.',
        ask_appliance: '¿Qué electrodoméstico necesita reparación?',
        ask_brand: '¿Cuál es la marca del {appliance}?',
        ask_model: '¿Conoces el modelo? (puedes escribir "no sé")',
        ask_problem: 'Describe brevemente el problema que presenta',
        ask_address: '¿Cuál es la dirección completa donde realizaremos el servicio? (Incluye calle, número, piso y código postal)',
        ask_name: '¿A nombre de quién agendamos la cita?',
        ask_phone: '¿Un teléfono de contacto? (Escribe "este mismo" para usar este número de WhatsApp)',
        ticket_created: '✅ *¡Registrado!*\n\nTu solicitud *#{ticket_id}* está en proceso.\n\n📋 *Resumen:*\n• Equipo: {appliance} {brand}\n• Problema: {problem}\n• Dirección: {address}\n\nTe contactaremos pronto para confirmar día y hora.\n\n¡Gracias por confiar en {company_name}! 🙏',
        outside_hours: 'Gracias por contactarnos. 🕐\n\nNuestro horario de atención es de {start} a {end}.\n\nTe responderemos lo antes posible.',
        bot_disabled: 'Gracias por tu mensaje. Un agente te contactará pronto.',
        error_message: 'Disculpa, hubo un problema procesando tu mensaje. Por favor, intenta de nuevo.'
    },
    legal: {
        service_conditions: 'Al continuar, aceptas que un técnico acuda a tu domicilio para realizar el diagnóstico. El servicio de visita tiene un coste mínimo de desplazamiento.'
    },
    settings: {
        bot_enabled: true,
        working_hours_start: '09:00',
        working_hours_end: '19:00',
        response_delay_seconds: 2
    }
};

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function normalizePhone(phone: string): string {
    return phone.replace(/[^+\d]/g, '');
}

function replaceVariables(message: string, variables: Record<string, string>): string {
    let result = message || '';
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
    }
    return result;
}

function isWithinWorkingHours(config: BotConfig): boolean {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Madrid'
    });
    return currentTime >= config.settings.working_hours_start && currentTime <= config.settings.working_hours_end;
}

function twimlResponse(message: string): Response {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
    return new Response(xml, { headers: { 'Content-Type': 'text/xml' } });
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ============================================================================
// ACCESO A BASE DE DATOS
// ============================================================================

async function getBotConfig(): Promise<BotConfig> {
    try {
        const { data, error } = await supabase
            .from('business_config')
            .select('value')
            .eq('key', 'whatsapp_bot_config')
            .single();

        if (error || !data) {
            console.log('[Bot] Using default config');
            return DEFAULT_CONFIG;
        }

        const config = data.value;
        return {
            company: { ...DEFAULT_CONFIG.company, ...config.company },
            messages: { ...DEFAULT_CONFIG.messages, ...config.messages },
            legal: { ...DEFAULT_CONFIG.legal, ...config.legal },
            settings: { ...DEFAULT_CONFIG.settings, ...config.settings }
        };
    } catch (e) {
        console.error('[Bot] Error getting config:', e);
        return DEFAULT_CONFIG;
    }
}

async function getConversation(phone: string): Promise<ConversationState | null> {
    const normalizedPhone = normalizePhone(phone);
    const { data } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('phone', normalizedPhone)
        .single();

    if (data && new Date(data.expires_at) > new Date()) {
        return data;
    }
    return null;
}

async function createConversation(phone: string): Promise<ConversationState> {
    const normalizedPhone = normalizePhone(phone);

    // Delete any existing conversation first
    await supabase
        .from('whatsapp_conversations')
        .delete()
        .eq('phone', normalizedPhone);

    const { data, error } = await supabase
        .from('whatsapp_conversations')
        .insert({
            phone: normalizedPhone,
            current_step: 'greeting',
            collected_data: {},
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            message_count: 0
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function updateConversation(phone: string, step: string, data: CollectedData): Promise<void> {
    const { error } = await supabase
        .from('whatsapp_conversations')
        .update({
            current_step: step,
            collected_data: data,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('phone', normalizePhone(phone));

    if (error) throw error;
}

async function deleteConversation(phone: string): Promise<void> {
    await supabase
        .from('whatsapp_conversations')
        .delete()
        .eq('phone', normalizePhone(phone));
}

async function createTicketFromConversation(data: CollectedData, phone: string): Promise<number> {
    const normalizedPhone = normalizePhone(phone);
    console.log('[Bot] 📝 Creating ticket with data:', JSON.stringify(data));

    // 1. Find or create client
    let { data: existingClient } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalizedPhone)
        .single();

    let clientId: string;

    if (existingClient) {
        clientId = existingClient.id;
        console.log('[Bot] 👤 Using existing client:', clientId);
        await supabase
            .from('profiles')
            .update({ full_name: data.name, address: data.address })
            .eq('id', clientId);
    } else {
        console.log('[Bot] 👤 Creating new client');
        const { data: newClient, error: clientError } = await supabase
            .from('profiles')
            .insert({
                phone: normalizedPhone,
                full_name: data.name || 'Cliente WhatsApp',
                address: data.address,
                role: 'client'
            })
            .select('id')
            .single();

        if (clientError) {
            console.error('[Bot] ❌ Error creating client:', clientError);
            throw clientError;
        }
        clientId = newClient.id;
    }

    // 2. Create ticket
    const applianceInfo = {
        type: data.appliance || 'No especificado',
        brand: data.brand || 'No especificado',
        model: data.model || 'No especificado'
    };

    const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
            client_id: clientId,
            appliance_info: applianceInfo,
            description_failure: data.problem || 'Reportado por WhatsApp',
            status: 'pendiente_asignacion',
            origin_source: 'whatsapp_bot'
        })
        .select('id')
        .single();

    if (ticketError) {
        console.error('[Bot] ❌ Error creating ticket:', ticketError);
        throw ticketError;
    }

    console.log('[Bot] ✅ Created ticket:', ticket.id);
    await deleteConversation(phone);
    return ticket.id;
}

// ============================================================================
// MÁQUINA DE ESTADOS
// ============================================================================

interface StepResult {
    nextStep: string;
    responseMessage: string;
    updatedData: CollectedData;
}

function processStep(
    currentStep: string,
    userMessage: string,
    currentData: CollectedData,
    config: BotConfig
): StepResult {
    const message = userMessage.trim();
    const data = { ...currentData };
    const vars: Record<string, string> = {
        company_name: config.company.name,
        appliance: data.appliance || '',
        brand: data.brand || '',
        model: data.model || '',
        problem: data.problem || '',
        address: data.address || '',
        start: config.settings.working_hours_start,
        end: config.settings.working_hours_end
    };

    console.log(`[Bot] ═══ STEP: ${currentStep}`);
    console.log(`[Bot] 💬 Message: "${message}"`);
    console.log(`[Bot] 📦 Data: ${JSON.stringify(data)}`);

    switch (currentStep) {
        // ─────────────────────────────────────────────────────────────────────
        case 'greeting': {
            const greetingMsg = replaceVariables(config.messages.greeting, vars);
            const askApplianceMsg = replaceVariables(config.messages.ask_appliance || '¿Qué electrodoméstico necesita reparación?', vars);
            return {
                nextStep: 'ask_appliance',
                responseMessage: `${greetingMsg}\n\n${askApplianceMsg}`,
                updatedData: data
            };
        }

        // ─────────────────────────────────────────────────────────────────────
        case 'ask_appliance':
            data.appliance = message;
            vars.appliance = message;
            return {
                nextStep: 'ask_brand',
                responseMessage: replaceVariables(config.messages.ask_brand, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────
        case 'ask_brand':
            data.brand = message;
            vars.brand = message;
            return {
                nextStep: 'ask_model',
                responseMessage: replaceVariables(config.messages.ask_model, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────
        case 'ask_model': {
            const noModel = ['no sé', 'no se', 'nose', 'desconocido', 'no lo sé', 'ns', 'no'];
            data.model = noModel.some(n => message.toLowerCase().includes(n)) ? 'No especificado' : message;
            return {
                nextStep: 'ask_problem',
                responseMessage: replaceVariables(config.messages.ask_problem, vars),
                updatedData: data
            };
        }

        // ─────────────────────────────────────────────────────────────────────
        case 'ask_problem': {
            data.problem = message;
            vars.problem = message;
            // Next: show legal before personal data
            const legalText = config.legal?.service_conditions || DEFAULT_CONFIG.legal?.service_conditions || '';
            return {
                nextStep: 'show_legal',
                responseMessage: `📋 *Condiciones del Servicio*\n\n${legalText}\n\n¿Estás de acuerdo? Responde *Sí* o *No*`,
                updatedData: data
            };
        }

        // ─────────────────────────────────────────────────────────────────────
        case 'show_legal': {
            const acceptKeywords = ['si', 'sí', 'yes', 'de acuerdo', 'acepto', 'ok', 'vale', 'claro', 'por supuesto'];
            const accepted = acceptKeywords.some(kw => message.toLowerCase().includes(kw));

            if (accepted) {
                data.legal_accepted = true;
                return {
                    nextStep: 'ask_address',
                    responseMessage: replaceVariables(config.messages.ask_address, vars),
                    updatedData: data
                };
            } else {
                // User rejected - end conversation
                return {
                    nextStep: 'rejected',
                    responseMessage: 'Entendido. No podemos continuar sin tu aceptación de las condiciones.\n\nSi cambias de opinión, escríbenos de nuevo con un simple "Hola". ¡Hasta pronto! 👋',
                    updatedData: {}
                };
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        case 'ask_address':
            data.address = message;
            vars.address = message;
            return {
                nextStep: 'ask_name',
                responseMessage: replaceVariables(config.messages.ask_name, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────
        case 'ask_name':
            data.name = message;
            return {
                nextStep: 'ask_phone',
                responseMessage: replaceVariables(config.messages.ask_phone, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────
        case 'ask_phone': {
            const useSamePhone = ['este', 'mismo', 'este mismo', 'el mismo', 'si', 'sí'];
            data.phone = useSamePhone.some(p => message.toLowerCase().includes(p))
                ? 'USE_WHATSAPP_NUMBER'
                : message;
            return {
                nextStep: 'create_ticket',
                responseMessage: '',
                updatedData: data
            };
        }

        // ─────────────────────────────────────────────────────────────────────
        case 'completed':
        case 'rejected':
            // These states allow restart with any message
            return {
                nextStep: 'greeting',
                responseMessage: '',
                updatedData: {}
            };

        // ─────────────────────────────────────────────────────────────────────
        default:
            console.log(`[Bot] ⚠️ Unknown step: ${currentStep}, resetting`);
            return {
                nextStep: 'greeting',
                responseMessage: '',
                updatedData: {}
            };
    }
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

serve(async (req: Request) => {
    console.log('[Bot] ════════════════════════════════════════════════════════');
    console.log('[Bot] 🔔 Incoming request at', new Date().toISOString());

    try {
        if (req.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const formData = await req.formData();
        const from = formData.get('From')?.toString() || '';
        const body = formData.get('Body')?.toString() || '';

        console.log(`[Bot] 📱 From: ${from}`);
        console.log(`[Bot] 💬 Body: "${body}"`);

        if (!from || !body) {
            return twimlResponse('Error: datos incompletos');
        }

        const config = await getBotConfig();
        console.log(`[Bot] ⚙️ Bot enabled: ${config.settings.bot_enabled}`);

        if (!config.settings.bot_enabled) {
            return twimlResponse(config.messages.bot_disabled);
        }

        if (!isWithinWorkingHours(config)) {
            console.log('[Bot] 🕐 Outside working hours');
            return twimlResponse(replaceVariables(config.messages.outside_hours, {
                start: config.settings.working_hours_start,
                end: config.settings.working_hours_end
            }));
        }

        // Check for reset keywords
        const isResetRequest = RESET_KEYWORDS.some(kw => body.toLowerCase().trim() === kw);

        // Get existing conversation
        let conversation = await getConversation(from);

        // Reset if: keyword match OR conversation is in terminal state
        const shouldReset = isResetRequest ||
            (conversation && ['completed', 'rejected'].includes(conversation.current_step));

        if (shouldReset && conversation) {
            console.log(`[Bot] 🔄 Resetting conversation for ${from}`);
            await deleteConversation(from);
            conversation = null;
        }

        // Create new conversation if needed
        if (!conversation) {
            console.log(`[Bot] 🆕 Creating new conversation for ${from}`);
            conversation = await createConversation(from);
        }

        console.log(`[Bot] 📍 Current step: ${conversation.current_step}`);
        console.log(`[Bot] 📦 Current data: ${JSON.stringify(conversation.collected_data)}`);

        // Process current step
        const { nextStep, responseMessage, updatedData } = processStep(
            conversation.current_step,
            body,
            conversation.collected_data,
            config
        );

        console.log(`[Bot] ➡️ Next step: ${nextStep}`);

        // Handle ticket creation
        if (nextStep === 'create_ticket') {
            console.log('[Bot] 🎫 Creating ticket...');

            if (updatedData.phone === 'USE_WHATSAPP_NUMBER') {
                updatedData.phone = normalizePhone(from);
            }

            const ticketId = await createTicketFromConversation(updatedData, from);
            console.log(`[Bot] ✅ Created ticket #${ticketId}`);

            const confirmVars: Record<string, string> = {
                company_name: config.company.name,
                ticket_id: ticketId.toString(),
                appliance: updatedData.appliance || '',
                brand: updatedData.brand || '',
                problem: updatedData.problem || '',
                address: updatedData.address || ''
            };

            console.log('[Bot] ════════════════════════════════════════════════════════');
            return twimlResponse(replaceVariables(config.messages.ticket_created, confirmVars));
        }

        // Handle rejected state (conversation ends)
        if (nextStep === 'rejected') {
            await updateConversation(from, 'rejected', {});
            console.log('[Bot] ❌ User rejected terms');
            console.log('[Bot] ════════════════════════════════════════════════════════');
            return twimlResponse(responseMessage);
        }

        // Update conversation for next step
        await updateConversation(from, nextStep, updatedData);

        console.log(`[Bot] 📤 Response: ${responseMessage.substring(0, 80)}...`);
        console.log('[Bot] ════════════════════════════════════════════════════════');

        return twimlResponse(responseMessage);

    } catch (error) {
        console.error('[Bot] ❌ Error:', error);
        return twimlResponse(DEFAULT_CONFIG.messages.error_message);
    }
});
