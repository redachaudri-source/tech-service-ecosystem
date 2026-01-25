import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
}

interface BotConfig {
    company: {
        name: string;
        phone: string;
        email: string;
    };
    messages: Record<string, string>;
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
        greeting: '¡Hola! 👋 Bienvenido a {company_name}. Soy tu asistente virtual para gestionar servicios técnicos.\n\n¿Qué electrodoméstico necesita reparación?\n\n_(Ejemplo: Lavadora, Lavavajillas, Frigorífico, Horno...)_',
        ask_brand: '¿Cuál es la marca del {appliance}?',
        ask_model: '¿Conoces el modelo? _(puedes escribir "no sé" si no lo tienes a mano)_',
        ask_problem: 'Describe brevemente el problema que presenta el {appliance}',
        ask_address: '¿Cuál es la dirección completa donde realizaremos el servicio?\n\n_(Incluye calle, número, piso y código postal)_',
        ask_name: '¿A nombre de quién agendamos la cita?',
        ask_phone: '¿Un teléfono de contacto?\n\n_(Escribe "este mismo" para usar este número de WhatsApp)_',
        ticket_created: '✅ *¡Registrado!*\n\nTu solicitud *#{ticket_id}* está en proceso.\n\n📋 *Resumen:*\n• Equipo: {appliance} {brand}\n• Problema: {problem}\n• Dirección: {address}\n\nTe contactaremos pronto para confirmar día y hora de la visita.\n\n¡Gracias por confiar en {company_name}! 🙏',
        outside_hours: 'Gracias por contactarnos. 🕐\n\nNuestro horario de atención es de {start} a {end}.\n\nTu mensaje ha sido recibido y te responderemos lo antes posible.',
        bot_disabled: 'Gracias por tu mensaje. En este momento no podemos atenderte de forma automática.\n\nUn agente te contactará pronto.',
        error_message: 'Disculpa, hubo un problema procesando tu mensaje. Por favor, intenta de nuevo o llámanos directamente.'
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

/**
 * Normaliza número de teléfono a formato internacional
 */
function normalizePhone(phone: string): string {
    return phone.replace(/[^+\d]/g, '');
}

/**
 * Reemplaza variables en un mensaje: {company_name}, {appliance}, etc.
 */
function replaceVariables(message: string, variables: Record<string, string>): string {
    let result = message;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
    }
    return result;
}

/**
 * Verifica si estamos dentro del horario de atención
 */
function isWithinWorkingHours(config: BotConfig): boolean {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Madrid'
    });

    const start = config.settings.working_hours_start;
    const end = config.settings.working_hours_end;

    return currentTime >= start && currentTime <= end;
}

/**
 * Genera respuesta TwiML para Twilio
 */
function twimlResponse(message: string): Response {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;

    return new Response(xml, {
        headers: { 'Content-Type': 'text/xml' }
    });
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

/**
 * Obtiene la configuración del bot desde business_config
 */
async function getBotConfig(): Promise<BotConfig> {
    try {
        const { data, error } = await supabase
            .from('business_config')
            .select('value')
            .eq('key', 'whatsapp_bot_config')
            .single();

        if (error || !data) {
            console.log('[WhatsApp Bot] Using default config');
            return DEFAULT_CONFIG;
        }

        // Merge con defaults para campos faltantes
        const config = data.value;
        return {
            company: { ...DEFAULT_CONFIG.company, ...config.company },
            messages: { ...DEFAULT_CONFIG.messages, ...config.messages },
            settings: { ...DEFAULT_CONFIG.settings, ...config.settings }
        };
    } catch (e) {
        console.error('[WhatsApp Bot] Error getting config:', e);
        return DEFAULT_CONFIG;
    }
}

/**
 * Obtiene o crea una conversación para un número de teléfono
 */
async function getOrCreateConversation(phone: string): Promise<ConversationState> {
    const normalizedPhone = normalizePhone(phone);

    // Intentar obtener conversación existente
    const { data: existing } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('phone', normalizedPhone)
        .single();

    // Si existe y no ha expirado, retornarla
    if (existing && new Date(existing.expires_at) > new Date()) {
        return existing;
    }

    // Crear nueva conversación (o resetear si expiró)
    const { data: newConv, error } = await supabase
        .from('whatsapp_conversations')
        .upsert({
            phone: normalizedPhone,
            current_step: 'greeting',
            collected_data: {},
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            message_count: 0
        })
        .select()
        .single();

    if (error) {
        console.error('[WhatsApp Bot] Error creating conversation:', error);
        throw error;
    }
    return newConv;
}

/**
 * Actualiza el estado de una conversación
 */
async function updateConversation(
    phone: string,
    step: string,
    data: CollectedData
): Promise<void> {
    const { error } = await supabase
        .from('whatsapp_conversations')
        .update({
            current_step: step,
            collected_data: data,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('phone', normalizePhone(phone));

    if (error) {
        console.error('[WhatsApp Bot] Error updating conversation:', error);
        throw error;
    }
}

/**
 * Crea el ticket y cliente al finalizar la conversación
 */
async function createTicketFromConversation(
    data: CollectedData,
    phone: string
): Promise<number> {
    const normalizedPhone = normalizePhone(phone);

    console.log('[WhatsApp Bot] Creating ticket with data:', data);

    // 1. Buscar cliente existente por teléfono
    let { data: existingClient } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalizedPhone)
        .single();

    let clientId: string;

    if (existingClient) {
        clientId = existingClient.id;
        console.log('[WhatsApp Bot] Found existing client:', clientId);

        // Actualizar datos si han cambiado
        await supabase
            .from('profiles')
            .update({
                full_name: data.name || undefined,
                address: data.address || undefined
            })
            .eq('id', clientId);
    } else {
        // 2. Crear nuevo cliente
        console.log('[WhatsApp Bot] Creating new client');
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
            console.error('[WhatsApp Bot] Error creating client:', clientError);
            throw clientError;
        }
        clientId = newClient.id;
    }

    // 3. Crear ticket con los campos correctos del schema
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
        console.error('[WhatsApp Bot] Error creating ticket:', ticketError);
        throw ticketError;
    }

    console.log('[WhatsApp Bot] Created ticket:', ticket.id);

    // 4. Limpiar conversación
    await supabase
        .from('whatsapp_conversations')
        .delete()
        .eq('phone', normalizedPhone);

    return ticket.id;
}

// ============================================================================
// MÁQUINA DE ESTADOS - LÓGICA PRINCIPAL
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
    const companyName = config.company.name;

    // Variables comunes para reemplazar en mensajes
    const vars: Record<string, string> = {
        company_name: companyName,
        appliance: data.appliance || '',
        brand: data.brand || '',
        model: data.model || '',
        problem: data.problem || '',
        address: data.address || '',
        start: config.settings.working_hours_start,
        end: config.settings.working_hours_end
    };

    switch (currentStep) {
        // ─────────────────────────────────────────────────────────────────────────
        case 'greeting':
            // Primer mensaje del usuario - responder con saludo Y preguntar electrodoméstico
            // Concatenamos ambos mensajes para una mejor experiencia
            const greetingMsg = replaceVariables(config.messages.greeting || '', vars);
            const askApplianceMsg = replaceVariables(config.messages.ask_appliance || '¿Qué electrodoméstico necesita reparación?', vars);
            return {
                nextStep: 'ask_appliance',
                responseMessage: `${greetingMsg}\n\n${askApplianceMsg}`,
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        case 'ask_appliance':
            // Usuario dice qué electrodoméstico es
            data.appliance = message;
            vars.appliance = message;
            return {
                nextStep: 'ask_brand',
                responseMessage: replaceVariables(config.messages.ask_brand, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        case 'ask_brand':
            data.brand = message;
            vars.brand = message;
            return {
                nextStep: 'ask_model',
                responseMessage: replaceVariables(config.messages.ask_model, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        case 'ask_model':
            // Aceptar "no sé", "no se", "desconocido", etc.
            const noModel = ['no sé', 'no se', 'nose', 'desconocido', 'no lo sé', 'ns'];
            data.model = noModel.some(n => message.toLowerCase().includes(n))
                ? 'No especificado'
                : message;
            return {
                nextStep: 'ask_problem',
                responseMessage: replaceVariables(config.messages.ask_problem, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        case 'ask_problem':
            data.problem = message;
            vars.problem = message;
            return {
                nextStep: 'ask_address',
                responseMessage: replaceVariables(config.messages.ask_address, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        case 'ask_address':
            data.address = message;
            vars.address = message;
            return {
                nextStep: 'ask_name',
                responseMessage: replaceVariables(config.messages.ask_name, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        case 'ask_name':
            data.name = message;
            return {
                nextStep: 'ask_phone',
                responseMessage: replaceVariables(config.messages.ask_phone, vars),
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        case 'ask_phone':
            // "este mismo" significa usar el número de WhatsApp
            const useSamePhone = ['este', 'mismo', 'este mismo', 'el mismo', 'si', 'sí'];
            data.phone = useSamePhone.some(p => message.toLowerCase().includes(p))
                ? 'USE_WHATSAPP_NUMBER'
                : message;
            return {
                nextStep: 'create_ticket',
                responseMessage: '', // Se genera después de crear el ticket
                updatedData: data
            };

        // ─────────────────────────────────────────────────────────────────────────
        default:
            // Estado desconocido - reiniciar
            console.log('[WhatsApp Bot] Unknown step, resetting:', currentStep);
            return {
                nextStep: 'greeting',
                responseMessage: replaceVariables(config.messages.greeting, vars),
                updatedData: {}
            };
    }
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

serve(async (req: Request) => {
    console.log('[WhatsApp Bot] ═══════════════════════════════════════════════');
    console.log('[WhatsApp Bot] Incoming request at', new Date().toISOString());

    try {
        // Solo aceptar POST
        if (req.method !== 'POST') {
            console.log('[WhatsApp Bot] Method not allowed:', req.method);
            return new Response('Method not allowed', { status: 405 });
        }

        // Parsear datos de Twilio (form-urlencoded)
        const formData = await req.formData();
        const from = formData.get('From')?.toString() || '';
        const body = formData.get('Body')?.toString() || '';

        console.log(`[WhatsApp Bot] From: ${from}`);
        console.log(`[WhatsApp Bot] Body: "${body}"`);

        if (!from || !body) {
            console.log('[WhatsApp Bot] Missing from or body');
            return twimlResponse('Error: datos incompletos');
        }

        // Obtener configuración del bot
        const config = await getBotConfig();
        console.log(`[WhatsApp Bot] Bot enabled: ${config.settings.bot_enabled}`);

        // Verificar si el bot está habilitado
        if (!config.settings.bot_enabled) {
            console.log('[WhatsApp Bot] Bot is disabled');
            return twimlResponse(config.messages.bot_disabled);
        }

        // Verificar horario de atención
        if (!isWithinWorkingHours(config)) {
            console.log('[WhatsApp Bot] Outside working hours');
            const vars = {
                start: config.settings.working_hours_start,
                end: config.settings.working_hours_end
            };
            return twimlResponse(replaceVariables(config.messages.outside_hours, vars));
        }

        // Obtener o crear conversación
        const conversation = await getOrCreateConversation(from);
        console.log(`[WhatsApp Bot] Current step: ${conversation.current_step}`);
        console.log(`[WhatsApp Bot] Collected data:`, conversation.collected_data);

        // Procesar el paso actual
        const { nextStep, responseMessage, updatedData } = processStep(
            conversation.current_step,
            body,
            conversation.collected_data,
            config
        );

        console.log(`[WhatsApp Bot] Next step: ${nextStep}`);

        // Si el siguiente paso es crear ticket
        if (nextStep === 'create_ticket') {
            console.log('[WhatsApp Bot] Creating ticket...');

            // Si el teléfono es "USE_WHATSAPP_NUMBER", usar el número de WhatsApp
            if (updatedData.phone === 'USE_WHATSAPP_NUMBER') {
                updatedData.phone = normalizePhone(from);
            }

            // Crear el ticket
            const ticketId = await createTicketFromConversation(updatedData, from);
            console.log(`[WhatsApp Bot] ✅ Created ticket #${ticketId}`);

            // Generar mensaje de confirmación
            const confirmVars: Record<string, string> = {
                company_name: config.company.name,
                ticket_id: ticketId.toString(),
                appliance: updatedData.appliance || '',
                brand: updatedData.brand || '',
                problem: updatedData.problem || '',
                address: updatedData.address || ''
            };
            const confirmMessage = replaceVariables(config.messages.ticket_created, confirmVars);

            console.log('[WhatsApp Bot] ═══════════════════════════════════════════════');
            return twimlResponse(confirmMessage);
        }

        // Actualizar conversación
        await updateConversation(from, nextStep, updatedData);

        console.log('[WhatsApp Bot] Response:', responseMessage.substring(0, 100) + '...');
        console.log('[WhatsApp Bot] ═══════════════════════════════════════════════');

        return twimlResponse(responseMessage);

    } catch (error) {
        console.error('[WhatsApp Bot] ❌ Error:', error);
        return twimlResponse(DEFAULT_CONFIG.messages.error_message);
    }
});
