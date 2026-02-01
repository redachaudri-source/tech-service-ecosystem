// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: ticket-autopilot-processor
// Motor PRO: Procesa tickets con prioridad bifurcada y lock optimista
// VERSION: 2.0 - Con logging exhaustivo para debugging
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlotFromRPC {
  technician_id: string;
  technician_name: string;
  slot_start: string;
  is_optimal_cp: boolean;
  efficiency_score: number;
}

interface ProposedSlot {
  option: number;
  date: string;
  time_start: string;
  time_end: string;
  technician_id: string;
  technician_name: string;
}

interface ProProposal {
  slots: ProposedSlot[];
  created_at: string;
  expires_at: string;
  status: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Calcular tiempo de viaje entre dos códigos postales (HEURÍSTICA LOCAL)
// Replica la lógica de GlobalAgenda.jsx: getTravelTime(cpA, cpB)
// Fórmula: min(60, 15 + (diferencia_CP * 2))
// ═══════════════════════════════════════════════════════════════════════════
function calcTravelTime(cpA: string | null, cpB: string | null): number {
  if (!cpA || !cpB || cpA.trim() === '' || cpB.trim() === '') {
    return 15; // Default mínimo si falta algún CP
  }

  // Extraer solo dígitos del código postal
  const numA = parseInt(cpA.replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(cpB.replace(/\D/g, ''), 10) || 0;

  if (numA === 0 || numB === 0) {
    return 15; // Default si no se puede parsear
  }

  const diff = Math.abs(numA - numB);
  return Math.min(60, 15 + (diff * 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// Calcular duración del servicio dinámicamente
// Replica la lógica de calc_service_duration() del RPC PostgreSQL
// ═══════════════════════════════════════════════════════════════════════════
function calcServiceDuration(serviceTypeName: string | null, applianceType: string | null): number {
  const service = (serviceTypeName || '').toLowerCase();
  const appliance = (applianceType || '').toLowerCase();

  // DIAGNÓSTICO: 30 min
  if (service.includes('diagnos') || service.includes('revisión') || service.includes('revision')) {
    return 30;
  }

  // INSTALACIÓN
  if (service.includes('instalac')) {
    // Aire Acondicionado: 240 min (4 horas)
    if (appliance.includes('aire') || appliance.includes('acondicionado') || appliance.includes('split')) {
      return 240;
    }
    // Calentador: 120 min
    if (appliance.includes('calentador') || appliance.includes('termo') || appliance.includes('boiler')) {
      return 120;
    }
    // Otros: 90 min por defecto
    return 90;
  }

  // REPARACIÓN
  if (service.includes('reparac') || service.includes('repair') || service.includes('estándar') || service.includes('estandar')) {
    // Frigorífico, Calentador, Termo, Aire Acondicionado: 90 min
    if (appliance.includes('frigo') || appliance.includes('nevera') ||
      appliance.includes('calentador') || appliance.includes('termo') ||
      appliance.includes('aire') || appliance.includes('acondicionado')) {
      return 90;
    }
    // Lavadora, Lavavajillas: 60 min
    if (appliance.includes('lavadora') || appliance.includes('lavavajillas')) {
      return 60;
    }
    // Otros: 60 min
    return 60;
  }

  // MANTENIMIENTO: 90 min
  if (service.includes('mantenim')) {
    return 90;
  }

  // DEFAULT: 60 min
  return 60;
}

serve(async (req) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤖 BOT PRO PROCESSOR INICIADO');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('🌐 Request method:', req.method);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight - respondiendo OK');
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  console.log('🔑 SUPABASE_URL presente:', supabaseUrl ? 'SÍ' : '❌ NO');
  console.log('🔑 SERVICE_ROLE_KEY presente:', supabaseKey ? 'SÍ (longitud: ' + supabaseKey.length + ')' : '❌ NO');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const rawBody = await req.text();
    console.log('📨 Body recibido (raw):', rawBody || '(vacío)');

    let payload: any = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (e) {
      console.error('❌ Error parseando JSON:', e);
      payload = {};
    }

    const { mode, ticket_id } = payload;
    console.log('📋 Payload parseado:');
    console.log('   - mode:', mode || '(no especificado)');
    console.log('   - ticket_id:', ticket_id || '(no especificado)');
    console.log('   - type:', payload?.type || '(no especificado)');
    console.log('   - record?.id:', payload?.record?.id || '(no especificado)');

    // ═══════════════════════════════════════════════════════════════
    // MODO WEBHOOK: Procesar ticket específico
    // ═══════════════════════════════════════════════════════════════
    if (ticket_id) {
      console.log('🔵 MODO WEBHOOK - Procesando ticket específico:', ticket_id);
      const result = await procesarTicket(supabase, ticket_id);
      console.log('✅ Resultado procesamiento:', JSON.stringify(result));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return new Response(JSON.stringify({ processed: ticket_id, result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODO CRON: Buscar y procesar siguiente pendiente
    // ═══════════════════════════════════════════════════════════════
    if (mode === 'cron') {
      console.log('🔄 MODO CRON - Iniciando ciclo de procesamiento');

      // 1. Limpiar locks antiguos (>5 min)
      console.log('🧹 Paso 1: Limpiando locks antiguos (>5 min)...');
      await limpiarLocksAntiguos(supabase);

      // 2. Buscar tickets con prioridad bifurcada
      console.log('🔍 Paso 2: Buscando tickets pendientes...');
      const tickets = await buscarTicketsPriorizados(supabase);
      console.log(`📊 Tickets encontrados: ${tickets.length}`);

      if (tickets.length === 0) {
        console.log('⏸️  No hay tickets pendientes. Esperando próximo ciclo.');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return new Response(JSON.stringify({ message: 'No pending tickets', count: 0 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 3. Procesar solo el primero
      const ticketToProcess = tickets[0];
      console.log('🎯 Paso 3: Ticket seleccionado para procesar:');
      console.log('   - ID:', ticketToProcess.id);
      console.log('   - Ticket ID:', ticketToProcess.id);
      console.log('   - Status:', ticketToProcess.status);
      console.log('   - Creado:', ticketToProcess.created_at);
      console.log('   - CP:', ticketToProcess.postal_code);

      const result = await procesarTicket(supabase, ticketToProcess.id);

      console.log('✅ Ciclo CRON completado. Resultado:', JSON.stringify(result));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return new Response(JSON.stringify({ processed: ticketToProcess.id, result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODO SCAN (compatibilidad con ticket-autopilot existente)
    // ═══════════════════════════════════════════════════════════════
    if (mode === 'scan') {
      console.log('🔄 MODO SCAN - Procesando hasta 5 tickets');
      await limpiarLocksAntiguos(supabase);
      const tickets = await buscarTicketsPriorizados(supabase);

      let processed = 0;
      for (const ticket of tickets.slice(0, 5)) {
        console.log(`   Procesando ticket ${ticket.id}...`);
        const result = await procesarTicket(supabase, ticket.id);
        if (result?.success) processed++;
      }

      console.log(`✅ SCAN completado. Procesados: ${processed}/${tickets.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return new Response(JSON.stringify({ processed, scanned: tickets.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // MODO TRIGGER: Procesar ticket desde trigger INSERT
    // ═══════════════════════════════════════════════════════════════
    if (payload?.record?.id && payload?.type === 'INSERT') {
      const ticketId = payload.record.id;
      console.log('🔵 MODO TRIGGER INSERT - Ticket:', ticketId);
      const result = await procesarTicket(supabase, ticketId);
      console.log('✅ Resultado:', JSON.stringify(result));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return new Response(JSON.stringify({ processed: ticketId, result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('❌ MODO NO RECONOCIDO');
    console.log('   Modos válidos: ticket_id, mode=cron, mode=scan, type=INSERT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return new Response(JSON.stringify({ error: 'Invalid mode', received: payload }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 ERROR CRÍTICO EN PROCESSOR:', error);
    console.error('💥 Stack:', error.stack);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Limpiar locks antiguos (>5 minutos)
// ═══════════════════════════════════════════════════════════════════════════
async function limpiarLocksAntiguos(supabase: any) {
  const hace5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  console.log('   🧹 Buscando locks anteriores a:', hace5min);

  const { data, error } = await supabase
    .from('tickets')
    .update({ processing_started_at: null })
    .lt('processing_started_at', hace5min)
    .is('pro_proposal', null)
    .select('id');

  if (error) {
    console.error('   ❌ Error limpiando locks:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log(`   ✅ Limpiados ${data.length} locks antiguos:`, data.map((t: any) => t.id));
  } else {
    console.log('   ✅ No había locks antiguos que limpiar');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Buscar tickets con prioridad bifurcada: Día DESC + Hora ASC
// CRITERIOS SIMPLIFICADOS: Solo status + sin propuesta válida + sin lock
// ═══════════════════════════════════════════════════════════════════════════
async function buscarTicketsPriorizados(supabase: any) {
  console.log('   🔍 Ejecutando query en tabla tickets...');
  console.log('   📋 Criterios de búsqueda (SIMPLIFICADOS):');
  console.log('      - status = "solicitado"');
  console.log('      - SIN propuesta válida (pro_proposal NULL o status=no_slots/no_technicians)');
  console.log('      - processing_started_at IS NULL (no está siendo procesado)');

  // Query única: buscar TODOS los tickets 'solicitado' sin lock y filtrar en JS
  const { data: allSolicitados, error: queryError } = await supabase
    .from('tickets')
    .select('*')
    .eq('status', 'solicitado')
    .is('processing_started_at', null);

  if (queryError) {
    console.error('   ❌ Error en query:', queryError);
    return [];
  }

  console.log(`   ✅ Tickets 'solicitado' sin lock: ${allSolicitados?.length || 0}`);

  // Filtrar: sin propuesta O con propuesta fallida/rechazada
  const data = (allSolicitados || []).filter((t: any) => {
    const propStatus = t.pro_proposal?.status;

    // Sin propuesta = OK
    if (!t.pro_proposal) {
      console.log(`      ✓ #${t.ticket_number}: sin propuesta -> INCLUIR`);
      return true;
    }

    // Con propuesta fallida = OK (reintentar)
    if (propStatus === 'no_slots' || propStatus === 'no_technicians') {
      console.log(`      ✓ #${t.ticket_number}: propuesta fallida (${propStatus}) -> INCLUIR para reintentar`);
      return true;
    }

    // 🆕 Cliente rechazó propuesta O hizo reset = INCLUIR para buscar nuevas opciones
    if (propStatus === 'client_rejected' || propStatus === 'reset_by_client') {
      console.log(`      ✓ #${t.ticket_number}: cliente rechazó/reset (${propStatus}) -> INCLUIR para nuevas opciones`);
      return true;
    }

    // Con propuesta válida = EXCLUIR
    console.log(`      ✗ #${t.ticket_number}: propuesta válida (${propStatus}) -> EXCLUIR`);
    return false;
  });

  console.log(`   ✅ Total a procesar: ${data.length}`);

  if (data.length === 0) {
    console.log('   ℹ️  No hay tickets pendientes de procesar');

    // Query de diagnóstico: mostrar TODOS los tickets en status solicitado
    console.log('   🔬 Diagnóstico: todos los tickets "solicitado"...');
    const { data: allSolicitados } = await supabase
      .from('tickets')
      .select('id, ticket_number, status, pro_proposal, processing_started_at')
      .eq('status', 'solicitado')
      .limit(10);

    if (allSolicitados && allSolicitados.length > 0) {
      console.log(`   🔬 Encontrados ${allSolicitados.length} tickets "solicitado":`);
      allSolicitados.forEach((t: any, i: number) => {
        const propStatus = t.pro_proposal?.status || 'NULL';
        const processing = t.processing_started_at ? 'LOCKED' : 'libre';
        console.log(`      ${i + 1}. #${t.ticket_number}: pro_proposal.status=${propStatus}, lock=${processing}`);
      });
    } else {
      console.log('   🔬 NO hay tickets con status="solicitado"');
    }

    return [];
  }

  // Ordenar: Día más reciente primero, FIFO dentro del mismo día
  console.log('   🔄 Ordenando por prioridad bifurcada (día DESC, hora ASC)...');
  const sorted = data.sort((a: any, b: any) => {
    const diaA = a.created_at.split('T')[0];
    const diaB = b.created_at.split('T')[0];

    if (diaA !== diaB) {
      return diaB.localeCompare(diaA); // Día más reciente primero
    }

    return a.created_at.localeCompare(b.created_at); // FIFO dentro del día
  });

  console.log('   📋 Tickets ordenados (listos para procesar):');
  sorted.slice(0, 5).forEach((t: any, i: number) => {
    console.log(`      ${i + 1}. ID: ${t.id} | created: ${t.created_at}`);
  });
  if (sorted.length > 5) {
    console.log(`      ... y ${sorted.length - 5} más`);
  }

  return sorted;
}

// ═══════════════════════════════════════════════════════════════════════════
// Procesar un ticket individual
// ═══════════════════════════════════════════════════════════════════════════
async function procesarTicket(supabase: any, ticketId: string): Promise<any> {
  console.log('  ══════════════════════════════════════════════════');
  console.log('  🎯 PROCESANDO TICKET:', ticketId);
  console.log('  ══════════════════════════════════════════════════');

  try {
    // PASO 1: Verificar modo PRO activo
    console.log('  ⚙️  PASO 1: Verificando modo PRO activo...');
    const { data: modeConfig, error: modeError } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'secretary_mode')
      .single();

    if (modeError) {
      console.error('  ❌ Error obteniendo secretary_mode:', modeError);
      return { skipped: 'config_error', error: modeError.message };
    }

    console.log('  📋 Valor de secretary_mode (raw):', modeConfig?.value);
    console.log('  📋 Tipo:', typeof modeConfig?.value);

    const secretaryMode = (modeConfig?.value ?? '').toString().toLowerCase().replace(/"/g, '');
    console.log('  📋 Valor normalizado:', secretaryMode);

    if (secretaryMode !== 'pro') {
      console.log('  ⚠️  MODO PRO NO ACTIVO (valor actual: "' + secretaryMode + '")');
      console.log('  ⏭️  Saltando procesamiento');
      return { skipped: 'mode_not_pro', currentMode: secretaryMode };
    }

    console.log('  ✅ Modo PRO confirmado');

    // PASO 2: Lock optimista (SIMPLIFICADO - solo verifica que no esté siendo procesado)
    console.log('  🔒 PASO 2: Intentando lock optimista...');

    // Primero verificar estado actual del ticket
    const { data: currentTicket, error: fetchError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (fetchError || !currentTicket) {
      console.error('  ❌ Error obteniendo ticket:', fetchError);
      return { skipped: 'ticket_not_found', error: fetchError?.message };
    }

    console.log('  📋 Estado actual del ticket:');
    console.log('     - status:', currentTicket.status);
    console.log('     - pro_proposal:', currentTicket.pro_proposal ? JSON.stringify(currentTicket.pro_proposal).substring(0, 100) : 'NULL');
    console.log('     - processing_started_at:', currentTicket.processing_started_at || 'NULL');

    // Verificar si ya tiene propuesta válida (waiting_selection o selected)
    const propStatus = currentTicket.pro_proposal?.status;
    if (propStatus === 'waiting_selection' || propStatus === 'selected') {
      console.log('  ⏭️  Ticket ya tiene propuesta válida (status:', propStatus, ')');
      return { skipped: 'already_has_valid_proposal', propStatus };
    }

    // Verificar si está siendo procesado por otra instancia
    if (currentTicket.processing_started_at) {
      const lockTime = new Date(currentTicket.processing_started_at).getTime();
      const now = Date.now();
      const lockAgeMinutes = (now - lockTime) / 60000;

      if (lockAgeMinutes < 5) {
        console.log('  ⏭️  Ticket siendo procesado por otra instancia (lock age:', lockAgeMinutes.toFixed(1), 'min)');
        return { skipped: 'being_processed' };
      }
      console.log('  🔓 Lock antiguo detectado (', lockAgeMinutes.toFixed(1), 'min), ignorando...');
    }

    // Adquirir lock
    const { data: locked, error: lockError } = await supabase
      .from('tickets')
      .update({ processing_started_at: new Date().toISOString() })
      .eq('id', ticketId)
      .eq('status', 'solicitado')
      .select('*');

    if (lockError) {
      console.error('  ❌ Error en lock:', lockError);
      return { skipped: 'lock_error', error: lockError.message };
    }

    if (!locked || locked.length === 0) {
      console.log('  ⏭️  Lock fallido - Ticket cambió de estado');
      return { skipped: 'status_changed' };
    }

    console.log('  ✅ Lock adquirido exitosamente');
    const ticket = locked[0];
    console.log('     - Ticket data loaded');
    console.log('     - Teléfono:', ticket.client_phone);
    console.log('     - CP:', ticket.postal_code || ticket.address_cp);
    console.log('     - Origen:', ticket.origin_source);

    // 🆕 PASO 2.5: Calcular duración dinámica del servicio
    console.log('  ⏱️  PASO 2.5: Calculando duración dinámica...');
    let serviceDuration = 60; // Default

    // Intentar obtener duración de service_types si existe service_type_id
    if (ticket.service_type_id) {
      console.log('     - service_type_id encontrado:', ticket.service_type_id);
      const { data: serviceType } = await supabase
        .from('service_types')
        .select('name, estimated_duration_min')
        .eq('id', ticket.service_type_id)
        .single();

      if (serviceType?.estimated_duration_min) {
        serviceDuration = serviceType.estimated_duration_min;
        console.log(`     - Duración desde service_types: ${serviceDuration} min (${serviceType.name})`);
      }
    }

    // Si no hay service_type, calcular basándose en appliance_info
    if (serviceDuration === 60 && ticket.appliance_info?.type) {
      // Asumimos "Reparación" como tipo de servicio por defecto
      const applianceType = ticket.appliance_info?.type || '';
      serviceDuration = calcServiceDuration('reparación', applianceType);
      console.log(`     - Duración calculada para "${applianceType}": ${serviceDuration} min`);
    }

    // Si el ticket tiene estimated_duration, usar ese (admin lo puede haber editado)
    if (ticket.estimated_duration && ticket.estimated_duration !== serviceDuration) {
      console.log(`     - ⚠️ Ticket tiene estimated_duration personalizado: ${ticket.estimated_duration} min`);
      serviceDuration = ticket.estimated_duration;
    }

    console.log(`     ✅ Duración final del servicio: ${serviceDuration} minutos`);

    // PASO 3: Obtener configuración PRO
    console.log('  ⚙️  PASO 3: Obteniendo configuración PRO...');
    const { data: proConfigData } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'pro_config')
      .single();

    const proConfig = proConfigData?.value || { slots_count: 3, timeout_minutes: 3, search_days: 7 };
    console.log('     - slots_count:', proConfig.slots_count);
    console.log('     - timeout_minutes:', proConfig.timeout_minutes);
    console.log('     - search_days:', proConfig.search_days);

    // PASO 4: Buscar disponibilidad usando RPC (7 días)
    console.log('  📅 PASO 4: Buscando disponibilidad...');
    let slotsEncontrados: SlotFromRPC[] = [];

    // 🔧 FIX: Obtener CP del ticket correctamente (igual que SmartAssignmentModal)
    let postalCode: string | null = ticket.postal_code || ticket.address_cp || null;

    // Si no hay CP directo en el ticket, buscarlo en client_addresses o profiles
    if (!postalCode && ticket.address_id) {
      console.log('     🔍 Buscando CP en client_addresses (address_id:', ticket.address_id, ')...');
      const { data: addrData } = await supabase
        .from('client_addresses')
        .select('postal_code')
        .eq('id', ticket.address_id)
        .single();
      if (addrData?.postal_code) {
        postalCode = addrData.postal_code;
        console.log('     ✅ CP encontrado en client_addresses:', postalCode);
      }
    }

    if (!postalCode && ticket.client_id) {
      console.log('     🔍 Buscando CP en profiles (client_id:', ticket.client_id, ')...');
      const { data: profileData } = await supabase
        .from('profiles')
        .select('postal_code, address')
        .eq('id', ticket.client_id)
        .single();
      if (profileData?.postal_code) {
        postalCode = profileData.postal_code;
        console.log('     ✅ CP encontrado en profiles.postal_code:', postalCode);
      } else if (profileData?.address) {
        // Extraer CP de la dirección con regex
        const match = profileData.address.match(/\b\d{5}\b/);
        if (match) {
          postalCode = match[0];
          console.log('     ✅ CP extraído de profiles.address:', postalCode);
        }
      }
    }

    console.log('     📍 CP FINAL para nuevo cliente:', postalCode || 'N/A');
    console.log('     🔍 DEBUG - Datos del ticket:');
    console.log('        - ticket.postal_code:', ticket.postal_code);
    console.log('        - ticket.address_cp:', ticket.address_cp);
    console.log('        - ticket.address_id:', ticket.address_id);
    console.log('        - ticket.client_id:', ticket.client_id);

    // Verificar técnicos activos primero
    console.log('  👨‍🔧 Verificando técnicos activos...');
    const { data: techs, error: techError } = await supabase
      .from('profiles')
      .select('id, full_name, is_active')
      .eq('role', 'tech')
      .eq('is_active', true);

    if (techError) {
      console.error('  ❌ Error consultando técnicos:', techError);
    } else {
      console.log(`  ✅ Técnicos activos encontrados: ${techs?.length || 0}`);
      techs?.forEach((t: any) => console.log(`     - ${t.full_name} (${t.id})`));
    }

    if (!techs || techs.length === 0) {
      console.log('  ⚠️  NO HAY TÉCNICOS ACTIVOS - No se pueden generar slots');
      await supabase.from('tickets').update({
        pro_proposal: { status: 'no_technicians', proposed_at: new Date().toISOString() },
        processing_started_at: null
      }).eq('id', ticketId);
      return { success: false, reason: 'no_technicians' };
    }

    // Verificar horarios configurados
    console.log('  ⏰ Verificando configuración de horarios...');
    const { data: hoursConfig } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'working_hours')
      .single();
    console.log('     working_hours config:', JSON.stringify(hoursConfig?.value || 'NO CONFIGURADO'));

    // 🆕 Detectar si el cliente rechazó propuesta anterior o hizo reset (buscar desde MAÑANA)
    const previousProposal = ticket.pro_proposal;

    // 🔍 DEBUG: Ver valores exactos
    console.log('  🔍 DEBUG pro_proposal:', JSON.stringify(previousProposal));
    console.log('  🔍 DEBUG pro_proposal?.status:', previousProposal?.status);
    console.log('  🔍 DEBUG pro_proposal?.search_from_tomorrow:', previousProposal?.search_from_tomorrow);

    const searchFromTomorrow = previousProposal?.search_from_tomorrow === true ||
      previousProposal?.status === 'client_rejected' ||
      previousProposal?.status === 'reset_by_client';

    console.log('  🔍 DEBUG searchFromTomorrow resultado:', searchFromTomorrow);

    // Si cliente rechazó, empezar desde mañana y buscar solo 3 días
    const startDay = searchFromTomorrow ? 1 : 0;
    const maxDays = searchFromTomorrow ? 3 : (proConfig.search_days || 7);

    if (searchFromTomorrow) {
      console.log('  🔄 MODO REINTENTO: Cliente rechazó opciones anteriores');
      console.log(`     → Buscando desde MAÑANA (day=${startDay}) hasta ${maxDays} días`);
    } else {
      console.log('  ℹ️  Modo normal: buscando desde HOY');
    }

    // Buscar slots por día
    let allSlotsAllDays: any[] = [];
    for (let day = startDay; day < startDay + maxDays; day++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + day);
      const dateStr = targetDate.toISOString().split('T')[0];
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][targetDate.getDay()];

      console.log(`     📆 Día ${day}: ${dateStr} (${dayName})`);

      // Verificar si ese día está configurado
      const dayConfig = hoursConfig?.value?.[dayName];
      console.log(`        Config para ${dayName}:`, dayConfig === null ? 'CERRADO' : JSON.stringify(dayConfig));

      // 🆕 Usar duración DINÁMICA calculada para este ticket
      console.log(`        🔄 Llamando RPC get_tech_availability:`);
      console.log(`           - target_date: ${dateStr}`);
      console.log(`           - duration_minutes: ${serviceDuration} (DINÁMICO)`);
      console.log(`           - target_cp: ${postalCode || 'NULL'}`);

      const { data: slots, error: rpcError } = await supabase.rpc('get_tech_availability', {
        target_date: dateStr,
        duration_minutes: serviceDuration,
        target_cp: postalCode
      });

      if (rpcError) {
        console.error(`     ❌ Error RPC día ${day}:`, rpcError);
        console.error(`        Código: ${rpcError.code}`);
        console.error(`        Mensaje: ${rpcError.message}`);
        console.error(`        Hint: ${rpcError.hint}`);
        console.error(`        Details: ${rpcError.details}`);
        continue;
      }

      console.log(`        ✅ RPC exitoso - Slots encontrados: ${slots?.length || 0}`);

      // FILTRAR SLOTS PASADOS: Si es HOY, excluir slots cuya hora ya pasó (en hora España)
      let validSlots = slots || [];
      if (day === 0 && validSlots.length > 0) {
        // Hora actual en España (UTC + 1 hora en invierno)
        const now = new Date();
        const nowSpain = new Date(now.getTime() + 1 * 60 * 60 * 1000); // +1h para España
        const nowPlusBuffer = new Date(nowSpain.getTime() + 60 * 60 * 1000); // +60 min buffer adicional

        console.log(`        ⏰ Hora actual UTC: ${now.toISOString()}`);
        console.log(`        ⏰ Hora actual España: ${nowSpain.toISOString().split('T')[1].slice(0, 5)}`);
        console.log(`        ⏰ Umbral mínimo (España + 1h buffer): ${nowPlusBuffer.toISOString().split('T')[1].slice(0, 5)}`);

        const beforeFilter = validSlots.length;
        validSlots = validSlots.filter((s: any) => {
          const slotTimeUTC = new Date(s.slot_start);
          // Convertir slot a hora España para comparar
          const slotTimeSpain = new Date(slotTimeUTC.getTime() + 1 * 60 * 60 * 1000);
          const isValid = slotTimeSpain > nowPlusBuffer;
          if (!isValid) {
            console.log(`           ✗ Slot ${slotTimeSpain.toISOString().split('T')[1].slice(0, 5)} (España) ya pasó o está muy cerca`);
          }
          return isValid;
        });
        console.log(`        📋 Slots válidos después de filtrar: ${validSlots.length}/${beforeFilter}`);
      }

      if (validSlots.length > 0) {
        console.log(`        📋 Primeros 3 slots válidos (antes de filtro viaje):`, JSON.stringify(validSlots.slice(0, 3)));
      } else {
        console.log(`        ⚠️ No hay slots válidos para este día`);
      }

      // ═══════════════════════════════════════════════════════════════
      // 🚗 FILTRO DE TIEMPO DE VIAJE (replica lógica de SmartAssignmentModal)
      // Para cada técnico, buscar su servicio anterior y calcular gap dinámico
      // ═══════════════════════════════════════════════════════════════
      if (validSlots.length > 0) {
        console.log(`        🚗 Aplicando filtro de tiempo de viaje...`);

        // Obtener IDs únicos de técnicos en estos slots
        const techIds = [...new Set(validSlots.map((s: any) => s.technician_id))];
        console.log(`        🔍 Técnicos en slots: ${techIds.length}`);

        // Buscar TODOS los servicios de estos técnicos en este día
        // IGUAL QUE SmartAssignmentModal: usar JOIN para traer profiles con CP
        const { data: existingServices, error: svcError } = await supabase
          .from('tickets')
          .select('id, ticket_number, technician_id, scheduled_at, scheduled_end_at, estimated_duration, status, address_id, client_id, profiles:client_id(postal_code, address), client_address:address_id(postal_code)')
          .in('technician_id', techIds)
          .gte('scheduled_at', `${dateStr}T00:00:00`)
          .lt('scheduled_at', `${dateStr}T23:59:59`)
          .not('scheduled_at', 'is', null)
          .order('scheduled_at', { ascending: true });

        console.log(`        📊 Query servicios - Raw result: ${existingServices?.length || 0} tickets`);

        if (svcError) {
          console.error(`        ❌ Error buscando servicios existentes:`, svcError);
          console.error(`        ❌ Código: ${svcError.code}, Mensaje: ${svcError.message}`);
        } else {
          // Filtrar status manualmente para evitar problemas de sintaxis SQL
          const excludedStatuses = ['cancelado', 'rejected', 'finalizado', 'anulado'];
          const activeServices = (existingServices || []).filter((svc: any) =>
            !excludedStatuses.includes((svc.status || '').toLowerCase())
          );

          console.log(`        📊 Servicios encontrados: ${existingServices?.length || 0} total, ${activeServices.length} activos`);

          // DEBUG: Mostrar cada servicio encontrado
          activeServices.forEach((svc: any) => {
            const start = new Date(svc.scheduled_at);
            const end = svc.scheduled_end_at ? new Date(svc.scheduled_end_at) : new Date(start.getTime() + (svc.estimated_duration || 60) * 60000);
            console.log(`        📋 #${svc.ticket_number}: ${start.toISOString().slice(11, 16)}-${end.toISOString().slice(11, 16)} UTC | status=${svc.status} | client_id=${svc.client_id?.slice(0, 8)}...`);
          });

          // Agrupar servicios por técnico
          const servicesByTech: Record<string, any[]> = {};
          for (const svc of activeServices) {
            if (!servicesByTech[svc.technician_id]) {
              servicesByTech[svc.technician_id] = [];
            }
            servicesByTech[svc.technician_id].push(svc);
          }

          // Helper: Extraer CP del servicio (usando datos del JOIN - igual que SmartAssignmentModal)
          const extractCPFromService = (svc: any): string | null => {
            // 1. Desde client_address (JOIN con address_id)
            if (svc.client_address?.postal_code) {
              return svc.client_address.postal_code;
            }
            // 2. Desde profiles (JOIN con client_id)
            if (svc.profiles?.postal_code) {
              return svc.profiles.postal_code;
            }
            // 3. Extraer de la dirección del perfil
            if (svc.profiles?.address) {
              const match = svc.profiles.address.match(/\b\d{5}\b/);
              if (match) return match[0];
            }
            return null;
          };

          // CP del nuevo cliente (el del ticket actual)
          const newClientCP = postalCode;
          console.log(`        🎯 CP nuevo cliente (Torrox/destino): ${newClientCP || 'N/A'}`);

          // Filtrar slots que no cumplan con el margen de viaje
          const beforeTravelFilter = validSlots.length;
          const filteredByTravel: any[] = [];

          console.log(`        🔍 Evaluando ${validSlots.length} slots...`);

          for (const slot of validSlots) {
            const techServices = servicesByTech[slot.technician_id] || [];
            const slotStart = new Date(slot.slot_start);
            const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);
            let isValid = true;
            let rejectionReason = '';

            // DEBUG: Mostrar info del slot
            const slotTimeStr = slotStart.toISOString().slice(11, 16);

            if (techServices.length === 0) {
              console.log(`        ✅ ${slot.technician_name} @ ${slotTimeStr} UTC - Sin servicios previos, ACEPTADO`);
            }

            for (const svc of techServices) {
              const svcStart = new Date(svc.scheduled_at);
              const svcDuration = svc.estimated_duration || 60;
              const svcEnd = svc.scheduled_end_at
                ? new Date(svc.scheduled_end_at)
                : new Date(svcStart.getTime() + svcDuration * 60 * 1000);

              // Obtener CP del servicio anterior (usando datos del JOIN)
              const prevServiceCP = extractCPFromService(svc);

              // Calcular tiempo de viaje dinámico
              const travelTime = calcTravelTime(prevServiceCP, newClientCP);

              // Calcular hora mínima disponible después del servicio anterior
              const minAvailableAfter = new Date(svcEnd.getTime() + travelTime * 60 * 1000);

              // DEBUG detallado
              console.log(`        🔄 ${slot.technician_name} @ ${slotTimeStr} UTC vs #${svc.ticket_number}:`);
              console.log(`           Servicio: ${svcStart.toISOString().slice(11, 16)}-${svcEnd.toISOString().slice(11, 16)} UTC`);
              console.log(`           CP origen: ${prevServiceCP || 'N/A'} → CP destino: ${newClientCP || 'N/A'}`);
              console.log(`           Tiempo viaje: ${travelTime} min`);
              console.log(`           Min disponible: ${minAvailableAfter.toISOString().slice(11, 16)} UTC`);
              console.log(`           Slot propuesto: ${slotTimeStr} UTC`);
              console.log(`           ¿Slot >= svcStart? ${slotStart >= svcStart} | ¿Slot < minAvailable? ${slotStart < minAvailableAfter}`);

              // REGLA 1: Slot empieza durante/después del servicio pero antes del margen de viaje
              if (slotStart >= svcStart && slotStart < minAvailableAfter) {
                rejectionReason = `Viaje ${travelTime}min desde CP ${prevServiceCP || 'N/A'}, disponible: ${minAvailableAfter.toISOString().slice(11, 16)} UTC`;
                console.log(`        ❌ RECHAZADO: ${slot.technician_name} @ ${slotTimeStr} - ${rejectionReason}`);
                isValid = false;
                break;
              }

              // REGLA 2: Overlap
              if (slotStart < svcStart && slotEnd > svcStart) {
                rejectionReason = `Overlap con servicio ${svcStart.toISOString().slice(11, 16)} UTC`;
                console.log(`        ❌ RECHAZADO: ${slot.technician_name} @ ${slotTimeStr} - ${rejectionReason}`);
                isValid = false;
                break;
              }

              console.log(`        ✅ ${slot.technician_name} @ ${slotTimeStr} - Pasa validación vs #${svc.ticket_number}`);
            }

            if (isValid) {
              filteredByTravel.push(slot);
            }
          }

          validSlots = filteredByTravel;
          console.log(`        🚗 RESULTADO filtro viaje: ${beforeTravelFilter} -> ${validSlots.length} slots`);
        }
      }

      if (validSlots.length > 0) {
        console.log(`        📋 Primeros 3 slots válidos (después de filtro viaje):`, JSON.stringify(validSlots.slice(0, 3)));
      }

      allSlotsAllDays.push({ day, date: dateStr, dayName, slots: validSlots.length });

      if (validSlots.length > 0) {
        slotsEncontrados = validSlots;
        console.log(`  ✅ Disponibilidad encontrada en ${dateStr}`);
        console.log(`     Primer slot: ${validSlots[0].technician_name} - ${validSlots[0].slot_start}`);
        break;
      }
    }

    console.log('  📊 Resumen búsqueda:', JSON.stringify(allSlotsAllDays));

    // PASO 5: Sin disponibilidad
    if (slotsEncontrados.length === 0) {
      console.log('  ⚠️  SIN DISPONIBILIDAD en los próximos', proConfig.search_days, 'días');
      await supabase
        .from('tickets')
        .update({
          pro_proposal: {
            status: 'no_slots',
            proposed_at: new Date().toISOString()
          },
          processing_started_at: null
        })
        .eq('id', ticketId);
      console.log('  ✅ Ticket marcado como sin_slots');
      return { success: false, reason: 'no_availability' };
    }

    // PASO 6: Aplicar Regla de Oro
    console.log('  🎲 PASO 6: Aplicando Regla de Oro...');
    const totalHuecos = slotsEncontrados.length;
    let cantidad: number;
    if (totalHuecos < 5) cantidad = 1;
    else if (totalHuecos < 8) cantidad = 2;
    else cantidad = 3;

    // Respetar config máximo
    cantidad = Math.min(cantidad, proConfig.slots_count || 3);

    console.log(`     Total huecos disponibles: ${totalHuecos}`);
    console.log(`     Propuestas a generar: ${cantidad}`);

    // PASO 7: Seleccionar slots según estrategia
    console.log('  🎯 PASO 7: Seleccionando slots según estrategia...');
    const seleccionados = await aplicarEstrategia(supabase, slotsEncontrados, cantidad);

    // PASO 8: Construir propuesta
    console.log('  📝 PASO 8: Construyendo propuesta...');
    const timeoutMinutes = proConfig.timeout_minutes || 3;

    // Convertir a hora España (UTC+1 en invierno, UTC+2 en verano)
    const toSpainTime = (utcDate: Date): { date: string, time: string } => {
      // España está en CET (UTC+1) en invierno y CEST (UTC+2) en verano
      // Usamos offset fijo de +1 para simplificar (invierno)
      const spainOffset = 1; // horas
      const spainDate = new Date(utcDate.getTime() + spainOffset * 60 * 60 * 1000);
      return {
        date: spainDate.toISOString().split('T')[0],
        time: spainDate.toISOString().split('T')[1].slice(0, 5)
      };
    };

    const propuesta: ProProposal = {
      slots: seleccionados.map((s: SlotFromRPC, i: number) => {
        const slotDate = new Date(s.slot_start);
        // 🆕 Usar duración DINÁMICA calculada para este ticket
        const slotEndDate = new Date(slotDate.getTime() + serviceDuration * 60 * 1000);

        const startSpain = toSpainTime(slotDate);
        const endSpain = toSpainTime(slotEndDate);

        console.log(`     Slot ${i + 1}: UTC ${slotDate.toISOString()} -> España ${startSpain.date} ${startSpain.time}`);

        return {
          option: i + 1,
          date: startSpain.date,
          time_start: startSpain.time,
          time_end: endSpain.time,
          technician_id: s.technician_id,
          technician_name: s.technician_name
        };
      }),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(),
      status: 'waiting_selection'
    };

    console.log('     Propuesta generada:');
    propuesta.slots.forEach((slot) => {
      console.log(`        Opción ${slot.option}: ${slot.date} ${slot.time_start}-${slot.time_end} (${slot.technician_name})`);
    });
    console.log(`     Expira: ${propuesta.expires_at}`);

    // PASO 9: Guardar propuesta y liberar lock
    console.log('  💾 PASO 9: Guardando propuesta en BD...');
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        pro_proposal: propuesta,
        processing_started_at: null // Liberar lock
      })
      .eq('id', ticketId);

    if (updateError) {
      console.error('  ❌ Error guardando propuesta:', updateError);
      await rollback(supabase, ticketId);
      return { success: false, error: updateError.message };
    }

    console.log('  ✅ PROPUESTA GUARDADA EXITOSAMENTE');

    // PASO 10: Enviar notificación WhatsApp si corresponde
    const originSource = ticket.origin_source || 'admin';
    console.log('  📱 PASO 10: Verificando envío WhatsApp...');
    console.log('     Origen del ticket:', originSource);
    console.log('     Teléfono cliente:', ticket.client_phone);

    if (originSource === 'whatsapp' && ticket.client_phone) {
      console.log('  📤 Enviando propuesta por WhatsApp...');
      await enviarNotificacionWhatsApp(supabase, ticket, propuesta);
    } else {
      console.log('  ⏭️  No se envía WhatsApp (origen no es whatsapp o no hay teléfono)');
    }

    console.log('  ══════════════════════════════════════════════════');
    console.log('  ✅ TICKET PROCESADO EXITOSAMENTE');
    console.log('  ══════════════════════════════════════════════════');

    return { success: true, slotsProposed: cantidad };

  } catch (error) {
    console.error('  💥 ERROR PROCESANDO TICKET:', error);
    console.error('  💥 Stack:', error.stack);
    await rollback(supabase, ticketId);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Aplicar estrategia de selección de slots
// ═══════════════════════════════════════════════════════════════════════════
async function aplicarEstrategia(supabase: any, slots: SlotFromRPC[], cantidad: number): Promise<SlotFromRPC[]> {
  console.log('     Obteniendo estrategia configurada...');

  const { data: config } = await supabase
    .from('business_config')
    .select('value')
    .eq('key', 'pro_selection_strategy')
    .single();

  const estrategia = (config?.value ?? 'balanced').toString().replace(/"/g, '');
  console.log(`     Estrategia activa: ${estrategia}`);

  const seleccionados: SlotFromRPC[] = [];

  // Slot 1: Siempre el primero (más cercano en tiempo)
  seleccionados.push(slots[0]);
  console.log(`     ✓ Slot 1: ${new Date(slots[0].slot_start).toISOString()} - ${slots[0].technician_name}`);

  if (cantidad >= 2 && slots.length >= 2) {
    let slot2: SlotFromRPC | undefined;

    if (estrategia === 'speed') {
      slot2 = slots[1];
    } else if (estrategia === 'variety') {
      slot2 = slots.find((s, i) =>
        i > 0 && s.technician_id !== seleccionados[0].technician_id
      );
    } else {
      // Balanceado: tarde o técnico diferente
      slot2 = slots.find((s, i) => {
        if (i === 0) return false;
        const hour = new Date(s.slot_start).getHours();
        return hour >= 14 || s.technician_id !== seleccionados[0].technician_id;
      });
    }

    seleccionados.push(slot2 || slots[1]);
    console.log(`     ✓ Slot 2: ${new Date(seleccionados[1].slot_start).toISOString()} - ${seleccionados[1].technician_name}`);
  }

  if (cantidad >= 3 && slots.length >= 3) {
    const techsUsados = seleccionados.map(s => s.technician_id);
    const slot3 = slots.find((s, i) =>
      i > 1 && !techsUsados.includes(s.technician_id)
    ) || slots.find((s, i) => i > 1 && !seleccionados.includes(s)) || slots[2];

    seleccionados.push(slot3);
    console.log(`     ✓ Slot 3: ${new Date(slot3.slot_start).toISOString()} - ${slot3.technician_name}`);
  }

  return seleccionados;
}

// ═══════════════════════════════════════════════════════════════════════════
// Rollback: Liberar lock en caso de error
// ═══════════════════════════════════════════════════════════════════════════
async function rollback(supabase: any, ticketId: string) {
  console.log('  🔄 Ejecutando rollback (limpiando lock)...');
  const { error } = await supabase
    .from('tickets')
    .update({ processing_started_at: null })
    .eq('id', ticketId);

  if (error) {
    console.error('  ❌ Error en rollback:', error);
  } else {
    console.log('  ✅ Rollback completado');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Enviar notificación WhatsApp con propuesta de citas
// ═══════════════════════════════════════════════════════════════════════════
async function enviarNotificacionWhatsApp(supabase: any, ticket: any, propuesta: ProProposal) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
  };

  let message = `📅 *Citas disponibles para tu servicio #${ticket.id}*\n\n`;
  message += `Elige una opción respondiendo con el número:\n\n`;

  propuesta.slots.forEach((slot) => {
    message += `*${slot.option}.* ${formatDate(slot.date)} de ${slot.time_start} a ${slot.time_end}\n`;
    message += `    👨‍🔧 ${slot.technician_name}\n\n`;
  });

  message += `⏰ _Tienes 3 minutos para elegir_`;

  try {
    console.log('     📤 Invocando send-whatsapp...');
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        to: ticket.client_phone,
        message: message
      }
    });

    if (error) {
      console.error('     ❌ Error enviando WhatsApp:', error);
    } else {
      console.log('     ✅ WhatsApp enviado exitosamente');
    }
  } catch (e) {
    console.error('     ❌ Excepción enviando WhatsApp:', e);
  }
}
