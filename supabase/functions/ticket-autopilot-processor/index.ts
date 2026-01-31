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

  // Primero: tickets sin ninguna propuesta
  const { data: sinPropuesta, error: error1 } = await supabase
    .from('tickets')
    .select('*')
    .eq('status', 'solicitado')
    .is('pro_proposal', null)
    .is('processing_started_at', null);

  // Segundo: tickets con propuesta fallida (no_slots o no_technicians) que se pueden reintentar
  const { data: conFallo, error: error2 } = await supabase
    .from('tickets')
    .select('*')
    .eq('status', 'solicitado')
    .is('processing_started_at', null)
    .or('pro_proposal->status.eq.no_slots,pro_proposal->status.eq.no_technicians');

  if (error1) {
    console.error('   ❌ Error en query 1:', error1);
  }
  if (error2) {
    console.error('   ❌ Error en query 2:', error2);
  }

  // Combinar resultados (sin duplicados)
  const ticketMap = new Map();
  (sinPropuesta || []).forEach((t: any) => ticketMap.set(t.id, t));
  (conFallo || []).forEach((t: any) => ticketMap.set(t.id, t));
  
  const data = Array.from(ticketMap.values());

  console.log(`   ✅ Tickets sin propuesta: ${sinPropuesta?.length || 0}`);
  console.log(`   ✅ Tickets con fallo reintentable: ${conFallo?.length || 0}`);
  console.log(`   ✅ Total únicos: ${data.length}`);

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
        console.log(`      ${i+1}. #${t.ticket_number}: pro_proposal.status=${propStatus}, lock=${processing}`);
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
    console.log(`      ${i+1}. ID: ${t.id} | created: ${t.created_at}`);
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

    // PASO 2: Lock optimista
    console.log('  🔒 PASO 2: Intentando lock optimista...');
    const { data: locked, error: lockError } = await supabase
      .from('tickets')
      .update({ processing_started_at: new Date().toISOString() })
      .eq('id', ticketId)
      .is('processing_started_at', null)
      .eq('status', 'solicitado')
      .is('pro_proposal', null)
      .select('*');

    if (lockError) {
      console.error('  ❌ Error en lock:', lockError);
      return { skipped: 'lock_error', error: lockError.message };
    }

    if (!locked || locked.length === 0) {
      console.log('  ⏭️  Lock fallido - Ticket ya procesado o no cumple criterios');
      return { skipped: 'already_processing' };
    }

    console.log('  ✅ Lock adquirido exitosamente');
    const ticket = locked[0];
    console.log('     - Ticket data loaded');
    console.log('     - Teléfono:', ticket.client_phone);
    console.log('     - CP:', ticket.postal_code || ticket.address_cp);
    console.log('     - Origen:', ticket.origin_source);

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
    const postalCode = ticket.postal_code || ticket.address_cp || null;
    console.log('     CP para búsqueda:', postalCode);
    console.log('     🔍 DEBUG - Datos del ticket:');
    console.log('        - postal_code:', ticket.postal_code);
    console.log('        - address_cp:', ticket.address_cp);
    console.log('        - address:', ticket.address);
    console.log('        - client_id:', ticket.client_id);
    
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
    
    // Buscar slots por día (empezando desde HOY = day 0)
    let allSlotsAllDays: any[] = [];
    for (let day = 0; day < (proConfig.search_days || 7); day++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + day);
      const dateStr = targetDate.toISOString().split('T')[0];
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][targetDate.getDay()];

      console.log(`     📆 Día ${day}: ${dateStr} (${dayName})`);
      
      // Verificar si ese día está configurado
      const dayConfig = hoursConfig?.value?.[dayName];
      console.log(`        Config para ${dayName}:`, dayConfig === null ? 'CERRADO' : JSON.stringify(dayConfig));

      // Usar duración estándar de 90 min (igual que Asistente Inteligente)
      console.log(`        🔄 Llamando RPC get_tech_availability:`);
      console.log(`           - target_date: ${dateStr}`);
      console.log(`           - duration_minutes: 90`);
      console.log(`           - target_cp: ${postalCode || 'NULL'}`);
      
      const { data: slots, error: rpcError } = await supabase.rpc('get_tech_availability', {
        target_date: dateStr,
        duration_minutes: 90,
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
      if (slots && slots.length > 0) {
        console.log(`        📋 Primeros 3 slots:`, JSON.stringify(slots.slice(0, 3)));
      } else {
        console.log(`        ⚠️ RPC devolvió array vacío o null`);
      }
      allSlotsAllDays.push({ day, date: dateStr, dayName, slots: slots?.length || 0 });

      if (slots && slots.length > 0) {
        slotsEncontrados = slots;
        console.log(`  ✅ Disponibilidad encontrada en ${dateStr}`);
        console.log(`     Primer slot: ${slots[0].technician_name} - ${slots[0].slot_start}`);
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
    const propuesta: ProProposal = {
      slots: seleccionados.map((s: SlotFromRPC, i: number) => {
        const slotDate = new Date(s.slot_start);
        return {
          option: i + 1,
          date: slotDate.toISOString().split('T')[0],
          time_start: slotDate.toTimeString().slice(0, 5),
          time_end: new Date(slotDate.getTime() + 90 * 60 * 1000).toTimeString().slice(0, 5),
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
