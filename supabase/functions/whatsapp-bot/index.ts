import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CONFIGURACIÓN - META CLOUD API
// ============================================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Meta Cloud API credentials
const META_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN')!;
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID')!;
const META_VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN')!;

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

// ============================================================================
// TIPOS - IDENTIFICACIÓN DE CLIENTE (Fase 2)
// ============================================================================

interface ClientAddress {
    id: string;
    label: string;
    address_line: string;
    floor?: string | null;
    apartment?: string | null;
    postal_code?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    is_primary: boolean;
}

interface ClientProfile {
    id: string;
    full_name: string;
    phone: string;
    email?: string | null;
    address?: string | null; // Fallback address from profile
    registration_source?: string; // 'app' | 'office'
}

interface ClientIdentity {
    exists: boolean;
    client?: ClientProfile;
    addresses?: ClientAddress[];
    isAppUser?: boolean; // True if registered via APP - should redirect to app
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
    // Fase 2: Identidad del cliente (cacheada)
    client_identity?: ClientIdentity;
    selected_address_id?: string;
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

/**
 * Normaliza número de teléfono para Meta API: formato con +
 * Meta envía sin +, así que normalizamos a formato con +
 */
function normalizePhone(phone: string): string {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    // If doesn't start with +, add it
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }
    return cleaned;
}

/**
 * Normaliza número de teléfono para queries a la BD: 9 dígitos sin prefijo
 * Esto coincide con el trigger normalize_phone en la base de datos
 */
function normalizePhoneForDB(phone: string): string {
    if (!phone) return '';
    // Remove all non-digit characters
    let clean = phone.replace(/\D/g, '');
    // Remove 34 prefix if longer than 9 digits
    if (clean.length > 9 && clean.startsWith('34')) {
        clean = clean.slice(2);
    }
    return clean;
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

// ============================================================================
// META CLOUD API - ENVÍO DE MENSAJES
// ============================================================================

/**
 * Envía un mensaje de WhatsApp usando Meta Cloud API
 */
async function sendWhatsAppMessage(to: string, text: string): Promise<boolean> {
    try {
        // Meta espera el número SIN el + 
        const toNumber = to.replace('+', '');

        console.log(`[Bot] 📤 Sending to ${toNumber}: "${text.substring(0, 50)}..."`);

        const response = await fetch(
            `https://graph.facebook.com/v17.0/${META_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${META_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: toNumber,
                    type: 'text',
                    text: { body: text }
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            console.error('[Bot] ❌ Meta API Error:', JSON.stringify(result));
            return false;
        }

        console.log('[Bot] ✅ Message sent successfully:', result.messages?.[0]?.id);
        return true;

    } catch (error) {
        console.error('[Bot] ❌ Error sending WhatsApp message:', error);
        return false;
    }
}

// ============================================================================
// IDENTIFICACIÓN DE CLIENTE (Fase 2)
// ============================================================================

/**
 * Obtiene las direcciones de un cliente, ordenadas por is_primary DESC
 */
async function getClientAddresses(clientId: string): Promise<ClientAddress[]> {
    const { data, error } = await supabase
        .from('client_addresses')
        .select('*')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[Bot] ❌ Error getting addresses:', error);
        return [];
    }

    return data || [];
}

/**
 * Identifica si un número de WhatsApp corresponde a un cliente existente
 * @param waId - Número de WhatsApp (formato: +34633489521 o 34633489521)
 * @returns ClientIdentity con exists, client y addresses
 */
async function identifyClient(waId: string): Promise<ClientIdentity> {
    const normalizedPhone = normalizePhoneForDB(waId);

    console.log(`[Bot] 🔍 Identifying client with phone: ${normalizedPhone}`);

    try {
        // Buscar cliente por teléfono usando formato 9-dígitos
        // Ordenar por updated_at DESC para tomar el más reciente si hay duplicados
        const { data: clientsData, error } = await supabase
            .from('profiles')
            .select('id, full_name, phone, email, address, registration_source')
            .eq('phone', normalizedPhone)
            .eq('role', 'client')
            .order('updated_at', { ascending: false })
            .limit(1);

        if (error || !clientsData || clientsData.length === 0) {
            console.log(`[Bot] 👤 Client NOT found for ${normalizedPhone}`);
            return { exists: false };
        }

        const clientData = clientsData[0];
        const isAppUser = clientData.registration_source === 'app';

        // Log warning if there might be duplicates
        if (clientsData.length > 1) {
            console.warn(`[Bot] ⚠️ DUPLICATE PHONES DETECTED for ${normalizedPhone}! Using most recent: ${clientData.full_name}`);
        }

        console.log(`[Bot] ✅ Client found: ${clientData.full_name} (${clientData.id})`);
        console.log(`[Bot] 📱 Registration source: ${clientData.registration_source || 'N/A'} | isAppUser: ${isAppUser}`);
        console.log(`[Bot] 📍 Profile address: ${clientData.address || 'N/A'}`);

        // Cargar direcciones del cliente
        const addresses = await getClientAddresses(clientData.id);
        console.log(`[Bot] 📍 Loaded ${addresses.length} addresses from client_addresses`);

        return {
            exists: true,
            isAppUser, // Flag for APP-registered clients
            client: {
                id: clientData.id,
                full_name: clientData.full_name,
                phone: clientData.phone,
                email: clientData.email,
                address: clientData.address, // Fallback address from profile
                registration_source: clientData.registration_source
            },
            addresses
        };

    } catch (e) {
        console.error('[Bot] ❌ Error identifying client:', e);
        return { exists: false };
    }
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
            return DEFAULT_CONFIG;
        }

        const config = data.value;
        return {
            company: { ...DEFAULT_CONFIG.company, ...config?.company },
            messages: { ...DEFAULT_CONFIG.messages, ...config?.messages },
            legal: { ...DEFAULT_CONFIG.legal, ...config?.legal },
            settings: { ...DEFAULT_CONFIG.settings, ...config?.settings }
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
    const normalizedPhone = normalizePhoneForDB(phone);

    console.log('[Bot] ══════════════════════════════════════════════════════');
    console.log('[Bot] 🎫 STARTING TICKET CREATION');
    console.log('[Bot] 📦 Full data:', JSON.stringify(data, null, 2));
    console.log('[Bot] 📱 Phone:', normalizedPhone);

    let clientId: string;

    try {
        // Step 1: Find or create client
        console.log('[Bot] 👤 Step 1: Looking for existing client...');

        const { data: existingClient, error: findError } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', normalizedPhone)
            .single();

        if (findError && findError.code !== 'PGRST116') {
            console.error('[Bot] ❌ Error finding client:', JSON.stringify(findError));
        }

        if (existingClient) {
            clientId = existingClient.id;
            console.log('[Bot] 👤 Found existing client:', clientId);

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ full_name: data.name, address: data.address })
                .eq('id', clientId);

            if (updateError) {
                console.error('[Bot] ⚠️ Error updating client (non-fatal):', JSON.stringify(updateError));
            }
        } else {
            console.log('[Bot] 👤 Creating new client...');
            const { data: newClient, error: clientError } = await supabase
                .from('profiles')
                .insert({
                    phone: normalizedPhone,
                    full_name: data.name || 'Cliente WhatsApp',
                    address: data.address,
                    role: 'client',
                    registration_source: 'whatsapp' // WhatsApp-registered clients
                })
                .select('id')
                .single();

            if (clientError) {
                console.error('[Bot] ❌ CLIENT CREATE ERROR:', JSON.stringify(clientError));
                throw clientError;
            }
            clientId = newClient.id;
            console.log('[Bot] ✅ Created new client:', clientId);
        }

        // Step 2: Create ticket
        console.log('[Bot] 🎫 Step 2: Creating ticket...');

        const applianceInfo = {
            type: data.appliance || 'No especificado',
            brand: data.brand || 'No especificado',
            model: data.model || 'No especificado'
        };

        const ticketData: Record<string, any> = {
            client_id: clientId,
            appliance_info: applianceInfo,
            description_failure: data.problem || 'Reportado por WhatsApp',
            status: 'solicitado',
            origin_source: 'whatsapp_bot'
        };

        // Add address_id if selected
        if (data.selected_address_id) {
            ticketData.address_id = data.selected_address_id;
        }

        console.log('[Bot] 🎫 Ticket payload:', JSON.stringify(ticketData, null, 2));

        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert(ticketData)
            .select('id')
            .single();

        if (ticketError) {
            console.error('[Bot] ❌ TICKET CREATE ERROR:', JSON.stringify(ticketError));
            throw ticketError;
        }

        console.log('[Bot] ✅ Created ticket ID:', ticket.id);

        // Step 3: Update last_used_at if address was selected
        if (data.selected_address_id) {
            console.log('[Bot] 📍 Updating last_used_at for address:', data.selected_address_id);
            await supabase
                .from('client_addresses')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', data.selected_address_id);
        }

        // Step 4: Clean up conversation
        console.log('[Bot] 🧹 Step 4: Deleting conversation...');
        await deleteConversation(phone);

        console.log('[Bot] 🎉 TICKET CREATION COMPLETE! ID:', ticket.id);

        return ticket.id;

    } catch (error: any) {
        console.error('[Bot] ❌ FATAL ERROR in createTicketFromConversation:', error);
        throw error;
    }
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

    switch (currentStep) {
        case 'greeting': {
            // Fase 2: Saludo personalizado según identidad del cliente
            const identity = data.client_identity;

            if (identity?.exists && identity.client) {
                // Cliente conocido: saludo personalizado
                const clientName = identity.client.full_name.split(' ')[0]; // Primer nombre
                console.log(`[Bot] 👋 Known client greeting: ${clientName}`);

                // Pre-cargar nombre para que no lo pida después
                data.name = identity.client.full_name;

                return {
                    nextStep: 'ask_appliance',
                    responseMessage: `¡Hola ${clientName}! 👋 ¿En qué podemos ayudarte hoy?\n\n¿Qué electrodoméstico necesita reparación?`,
                    updatedData: data
                };
            } else {
                // Cliente nuevo: bienvenida estándar
                console.log('[Bot] 🆕 New client greeting');
                const greetingMsg = replaceVariables(config.messages.greeting, vars);
                const askApplianceMsg = replaceVariables(config.messages.ask_appliance || '¿Qué electrodoméstico necesita reparación?', vars);
                return {
                    nextStep: 'ask_appliance',
                    responseMessage: `${greetingMsg}\n\n${askApplianceMsg}`,
                    updatedData: data
                };
            }
        }

        case 'ask_appliance':
            data.appliance = message;
            vars.appliance = message;
            return {
                nextStep: 'ask_brand',
                responseMessage: replaceVariables(config.messages.ask_brand, vars),
                updatedData: data
            };

        case 'ask_brand':
            data.brand = message;
            vars.brand = message;
            return {
                nextStep: 'ask_model',
                responseMessage: replaceVariables(config.messages.ask_model, vars),
                updatedData: data
            };

        case 'ask_model': {
            const noModel = ['no sé', 'no se', 'nose', 'desconocido', 'no lo sé', 'ns', 'no'];
            data.model = noModel.some(n => message.toLowerCase().includes(n)) ? 'No especificado' : message;
            return {
                nextStep: 'ask_problem',
                responseMessage: replaceVariables(config.messages.ask_problem, vars),
                updatedData: data
            };
        }

        case 'ask_problem': {
            data.problem = message;
            vars.problem = message;
            const legalText = config.legal?.service_conditions || DEFAULT_CONFIG.legal?.service_conditions || '';
            return {
                nextStep: 'show_legal',
                responseMessage: `📋 *Condiciones del Servicio*\n\n${legalText}\n\n¿Estás de acuerdo? Responde *Sí* o *No*`,
                updatedData: data
            };
        }

        case 'show_legal': {
            const acceptKeywords = ['si', 'sí', 'yes', 'de acuerdo', 'acepto', 'ok', 'vale', 'claro', 'por supuesto'];
            const accepted = acceptKeywords.some(kw => message.toLowerCase().includes(kw));

            if (accepted) {
                data.legal_accepted = true;

                // Si el cliente está identificado, usar sus datos
                const identity = data.client_identity;
                if (identity?.exists && identity.client) {
                    console.log('[Bot] 🎫 Known client - checking addresses');
                    data.name = identity.client.full_name;
                    data.phone = identity.client.phone;

                    // Verificar direcciones del cliente
                    const addresses = identity.addresses || [];

                    if (addresses.length === 0) {
                        // Sin direcciones: usar del perfil o pedir
                        if (identity.client.address) {
                            data.address = identity.client.address;
                            console.log(`[Bot] 📍 Using address from profile: ${data.address}`);
                            return {
                                nextStep: 'create_ticket',
                                responseMessage: '',
                                updatedData: data
                            };
                        } else {
                            console.log('[Bot] ⚠️ No address found, asking client');
                            return {
                                nextStep: 'ask_address',
                                responseMessage: replaceVariables(config.messages.ask_address, vars),
                                updatedData: data
                            };
                        }
                    } else if (addresses.length === 1) {
                        // Solo 1 dirección: usar directamente
                        data.address = addresses[0].address_line;
                        data.selected_address_id = addresses[0].id;
                        console.log(`[Bot] 📍 Single address: ${data.address}`);
                        return {
                            nextStep: 'create_ticket',
                            responseMessage: '',
                            updatedData: data
                        };
                    } else {
                        // Múltiples direcciones: mostrar selector
                        console.log(`[Bot] 📍 Multiple addresses (${addresses.length}), showing selector`);

                        // Construir mensaje con lista de direcciones
                        let addressList = '📍 *¿A cuál dirección iremos?*\n\n';

                        // Para <=5 direcciones: mostrar todas
                        // Para >5: mostrar primeras 5 + opción "ver más"
                        const showAll = addresses.length <= 5;
                        const displayAddresses = showAll ? addresses : addresses.slice(0, 5);

                        displayAddresses.forEach((addr, i) => {
                            const isPrimary = addr.is_primary ? ' ⭐' : '';
                            addressList += `*${i + 1}.* ${addr.label || 'Dirección'}${isPrimary}\n   📍 ${addr.address_line}\n\n`;
                        });

                        if (!showAll) {
                            addressList += `*6.* Ver todas (${addresses.length - 5} más)\n\n`;
                        }

                        addressList += '_Responde con el número de la dirección_';

                        return {
                            nextStep: 'select_address',
                            responseMessage: addressList,
                            updatedData: data
                        };
                    }
                }

                // Cliente nuevo: pedir dirección
                return {
                    nextStep: 'ask_address',
                    responseMessage: replaceVariables(config.messages.ask_address, vars),
                    updatedData: data
                };
            } else {
                return {
                    nextStep: 'rejected',
                    responseMessage: 'Entendido. No podemos continuar sin tu aceptación de las condiciones.\n\nSi cambias de opinión, escríbenos de nuevo con un simple "Hola". ¡Hasta pronto! 👋',
                    updatedData: {}
                };
            }
        }

        case 'ask_address':
            data.address = message;
            vars.address = message;
            return {
                nextStep: 'ask_name',
                responseMessage: replaceVariables(config.messages.ask_name, vars),
                updatedData: data
            };

        case 'select_address': {
            // Parse user's address selection
            const addresses = data.client_identity?.addresses || [];
            const msgLower = message.toLowerCase().trim();

            // Check for "ver todas" / "ver más" / "6"
            if (addresses.length > 5 && (msgLower === '6' || msgLower.includes('ver') || msgLower.includes('todas'))) {
                // Show all addresses
                let fullList = '📍 *Todas tus direcciones:*\n\n';
                addresses.forEach((addr, i) => {
                    const isPrimary = addr.is_primary ? ' ⭐' : '';
                    fullList += `*${i + 1}.* ${addr.label || 'Dirección'}${isPrimary}\n   📍 ${addr.address_line}\n\n`;
                });
                fullList += '_Responde con el número de la dirección_';
                return {
                    nextStep: 'select_address',
                    responseMessage: fullList,
                    updatedData: data
                };
            }

            // Parse number selection
            const numMatch = message.match(/(\d+)/);
            let selectedAddr = null;

            if (numMatch) {
                const idx = parseInt(numMatch[1]) - 1;
                if (idx >= 0 && idx < addresses.length) {
                    selectedAddr = addresses[idx];
                }
            }

            // Try matching by alias/label
            if (!selectedAddr) {
                selectedAddr = addresses.find(a =>
                    a.label?.toLowerCase().includes(msgLower) ||
                    a.address_line?.toLowerCase().includes(msgLower)
                );
            }

            if (selectedAddr) {
                data.address = selectedAddr.address_line;
                data.selected_address_id = selectedAddr.id;
                console.log(`[Bot] 📍 Selected address: ${selectedAddr.label} - ${data.address}`);

                // Update last_used_at for this address (fire-and-forget)
                // This will be done via a separate update call

                return {
                    nextStep: 'create_ticket',
                    responseMessage: '',
                    updatedData: data
                };
            }

            // Invalid selection - ask again
            return {
                nextStep: 'select_address',
                responseMessage: '❓ No reconocí esa opción. Por favor, responde con el *número* de la dirección.',
                updatedData: data
            };
        }

        case 'ask_name':
            data.name = message;
            return {
                nextStep: 'ask_phone',
                responseMessage: replaceVariables(config.messages.ask_phone, vars),
                updatedData: data
            };

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

        case 'completed':
            // No auto-restart - user must explicitly say "hola" or "reiniciar"
            return {
                nextStep: 'completed',
                responseMessage: '✅ Tu solicitud ya fue registrada. Si necesitas otra reparación, escribe "Hola" para comenzar.',
                updatedData: currentData
            };

        case 'rejected':
            return {
                nextStep: 'rejected',
                responseMessage: 'Si cambias de opinión, escríbenos "Hola" para comenzar de nuevo. ¡Hasta pronto! 👋',
                updatedData: {}
            };

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
// HANDLER PRINCIPAL - META CLOUD API
// ============================================================================

serve(async (req: Request) => {
    // ═══════════════════════════════════════════════════════════════════════
    // VERBOSE ENTRY LOGGING - DEBUG
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[Bot] ══════════════════════════════════════════════════════════');
    console.log('[Bot] 🚀 REQUEST RECEIVED:', new Date().toISOString());
    console.log('[Bot] Method:', req.method);
    console.log('[Bot] URL:', req.url);

    const url = new URL(req.url);

    // ═══════════════════════════════════════════════════════════════════════
    // GET: Verificación del webhook de Meta
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method === 'GET') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        console.log('[Bot] 🔐 Webhook verification request');
        console.log(`[Bot] Mode: ${mode}, Token: ${token}, Challenge: ${challenge}`);

        if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
            console.log('[Bot] ✅ Webhook verified successfully');
            return new Response(challenge, { status: 200 });
        }

        console.log('[Bot] ❌ Webhook verification failed');
        return new Response('Forbidden', { status: 403 });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST: Mensaje entrante de Meta
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method !== 'POST') {
        console.log('[Bot] ⚠️ Method not allowed:', req.method);
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        // Leer el body raw primero para logging
        const clonedReq = req.clone();
        const rawBody = await clonedReq.text();
        console.log('[Bot] 📦 RAW BODY:', rawBody.substring(0, 500));

        const json = JSON.parse(rawBody);
        console.log('[Bot] 📨 Parsed JSON successfully');

        // Extraer el mensaje del payload de Meta
        const entry = json.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messageData = value?.messages?.[0];

        // Si no hay mensaje (es un status update), responder OK y salir
        if (!messageData) {
            console.log('[Bot] ℹ️ No message in payload (status update), ignoring');
            return new Response('OK', { status: 200 });
        }

        // Extraer from, body y message_id
        const from = messageData.from; // ej: "34633489521" (sin +)
        const body = messageData.text?.body || '';
        const messageId = messageData.id; // Meta message ID para deduplicación
        const messageTimestamp = parseInt(messageData.timestamp || '0', 10);

        console.log(`[Bot] 📱 From: ${from}`);
        console.log(`[Bot] 💬 Body: "${body}"`);
        console.log(`[Bot] 🆔 Message ID: ${messageId}`);

        if (!from || !body) {
            console.log('[Bot] ⚠️ Missing from or body');
            return new Response('OK', { status: 200 });
        }

        // Filtrar mensajes antiguos (más de 2 minutos)
        // Esto previene loops cuando Meta re-envía mensajes acumulados
        const nowSeconds = Math.floor(Date.now() / 1000);
        const messageAgeSeconds = nowSeconds - messageTimestamp;
        console.log(`[Bot] ⏱️ Message age: ${messageAgeSeconds} seconds`);

        if (messageAgeSeconds > 120) {
            console.log(`[Bot] ⏰ Ignoring stale message (${messageAgeSeconds}s old)`);
            return new Response('OK', { status: 200 });
        }

        // ═══════════════════════════════════════════════════════════════════
        // LÓGICA DEL BOT (igual que antes)
        // ═══════════════════════════════════════════════════════════════════

        const config = await getBotConfig();
        console.log(`[Bot] ⚙️ Bot enabled: ${config.settings.bot_enabled}`);

        if (!config.settings.bot_enabled) {
            await sendWhatsAppMessage(from, config.messages.bot_disabled);
            return new Response('OK', { status: 200 });
        }

        if (!isWithinWorkingHours(config)) {
            console.log('[Bot] 🕐 Outside working hours');
            await sendWhatsAppMessage(from, replaceVariables(config.messages.outside_hours, {
                start: config.settings.working_hours_start,
                end: config.settings.working_hours_end
            }));
            return new Response('OK', { status: 200 });
        }

        // Normalizar el número (Meta lo envía sin +)
        const normalizedFrom = normalizePhone(from);

        // Check for reset keywords (hola, reiniciar, etc)
        const isResetRequest = RESET_KEYWORDS.some(kw => body.toLowerCase().trim() === kw);

        // Get existing conversation
        let conversation = await getConversation(normalizedFrom);

        // Only reset if explicit reset keyword is used
        const shouldReset = isResetRequest;

        if (shouldReset && conversation) {
            console.log(`[Bot] 🔄 Resetting conversation for ${normalizedFrom}`);
            await deleteConversation(normalizedFrom);
            conversation = null;
        }

        // Create new conversation if needed
        if (!conversation) {
            console.log(`[Bot] 🆕 Creating new conversation for ${normalizedFrom}`);
            conversation = await createConversation(normalizedFrom);
        }

        console.log(`[Bot] 📍 Current step: ${conversation.current_step}`);

        // ═══════════════════════════════════════════════════════════════════
        // FASE 2: Identificación de cliente (con caché)
        // ═══════════════════════════════════════════════════════════════════
        if (!conversation.collected_data.client_identity) {
            console.log('[Bot] 🔍 First message - identifying client...');
            conversation.collected_data.client_identity = await identifyClient(normalizedFrom);

            // Detailed logging
            const identity = conversation.collected_data.client_identity;
            console.log(`[Bot] 📋 Identity result: exists=${identity.exists}`);
            if (identity.exists && identity.client) {
                console.log(`[Bot] 👤 Client name: ${identity.client.full_name}`);
                console.log(`[Bot] 📍 Client profile address: ${identity.client.address || 'NULL'}`);
                console.log(`[Bot] 📍 Addresses count: ${identity.addresses?.length || 0}`);
            }
        } else {
            console.log('[Bot] 📦 Using cached client identity');
            const identity = conversation.collected_data.client_identity;
            console.log(`[Bot] 📋 Cached: name=${identity.client?.full_name}, addr=${identity.client?.address || 'NULL'}`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // REDIRECCIÓN A APP: Clientes registrados vía APP deben usar la app
        // ═══════════════════════════════════════════════════════════════════
        const identity = conversation.collected_data.client_identity;
        if (identity?.isAppUser) {
            console.log('[Bot] 📱 APP USER DETECTED - Redirecting to mobile app');

            const appRedirectMessage = `¡Hola ${identity.client?.full_name?.split(' ')[0] || ''}! 👋

Veo que ya tienes cuenta en nuestra *App de Clientes*. 📱

Para solicitar una reparación o consultar el estado de tus servicios, por favor usa la app. Allí podrás:

✅ Solicitar nuevas reparaciones
✅ Ver el estado en tiempo real
✅ Seguir al técnico en el mapa
✅ Gestionar tus direcciones y equipos

🔗 *Accede aquí:* https://webcliente.fixarr.es

Si tienes alguna urgencia, llámanos al 633 489 521.`;

            await sendWhatsAppMessage(from, appRedirectMessage);

            // Delete conversation to avoid leaving it in a broken state
            await deleteConversation(normalizedFrom);

            return new Response('OK', { status: 200 });
        }

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
                updatedData.phone = normalizedFrom;
            }

            const ticketId = await createTicketFromConversation(updatedData, normalizedFrom);
            console.log(`[Bot] ✅ Created ticket #${ticketId}`);

            const confirmVars: Record<string, string> = {
                company_name: config.company.name,
                ticket_id: ticketId.toString(),
                appliance: updatedData.appliance || '',
                brand: updatedData.brand || '',
                problem: updatedData.problem || '',
                address: updatedData.address || ''
            };

            await sendWhatsAppMessage(from, replaceVariables(config.messages.ticket_created, confirmVars));

            // Mark conversation as completed to prevent immediate restart
            await updateConversation(normalizedFrom, 'completed', updatedData);

            return new Response('OK', { status: 200 });
        }

        // Handle rejected state
        if (nextStep === 'rejected') {
            await updateConversation(normalizedFrom, 'rejected', {});
            await sendWhatsAppMessage(from, responseMessage);
            return new Response('OK', { status: 200 });
        }

        // Update conversation for next step
        await updateConversation(normalizedFrom, nextStep, updatedData);

        // Send response
        const finalResponse = responseMessage || 'Gracias por tu mensaje. ¿En qué puedo ayudarte?';
        await sendWhatsAppMessage(from, finalResponse);

        console.log('[Bot] ════════════════════════════════════════════════════════');
        return new Response('OK', { status: 200 });

    } catch (error) {
        console.error('[Bot] ❌ Error:', error);
        // Siempre responder 200 a Meta para evitar reintentos
        return new Response('OK', { status: 200 });
    }
});
