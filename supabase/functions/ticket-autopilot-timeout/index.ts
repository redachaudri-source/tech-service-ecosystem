// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: ticket-autopilot-timeout
// Monitor de timeout: Marca propuestas expiradas (>3 min sin respuesta)
// VERSION: 2.0 - Con logging exhaustivo para debugging
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⏰ TIMEOUT MONITOR INICIADO');
  console.log('📅 Timestamp:', new Date().toISOString());

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
  console.log('🔑 Credenciales presentes:', supabaseUrl && supabaseKey ? 'SÍ' : 'NO');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ═══════════════════════════════════════════════════════════════
    // PASO 1: Verificar si modo PRO está activo
    // ═══════════════════════════════════════════════════════════════
    console.log('⚙️  PASO 1: Verificando modo PRO...');
    const { data: modeConfig, error: modeError } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'secretary_mode')
      .single();

    if (modeError) {
      console.error('❌ Error obteniendo config:', modeError);
    }

    const secretaryMode = (modeConfig?.value ?? '').toString().toLowerCase().replace(/"/g, '');
    console.log('   Valor actual:', secretaryMode);

    if (secretaryMode !== 'pro') {
      console.log('⏸️  Modo PRO no activo. Saltando monitor de timeout.');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return new Response(JSON.stringify({ message: 'PRO mode not active', currentMode: secretaryMode }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Modo PRO activo');

    // ═══════════════════════════════════════════════════════════════
    // PASO 2: Obtener configuración de timeout
    // ═══════════════════════════════════════════════════════════════
    console.log('⚙️  PASO 2: Obteniendo configuración timeout...');
    const { data: proConfigData } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'pro_config')
      .single();

    const proConfig = proConfigData?.value || { timeout_minutes: 3 };
    const timeoutMinutes = proConfig.timeout_minutes || 3;

    console.log('   Timeout configurado:', timeoutMinutes, 'minutos');

    // Calcular fecha límite
    const fechaLimite = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
    console.log('   Propuestas anteriores a:', fechaLimite, 'serán marcadas como expiradas');

    // ═══════════════════════════════════════════════════════════════
    // PASO 3: Buscar propuestas pendientes
    // ═══════════════════════════════════════════════════════════════
    console.log('🔍 PASO 3: Buscando propuestas pendientes...');
    const { data: ticketsConPropuesta, error: fetchError } = await supabase
      .from('tickets')
      .select('id, pro_proposal, client_name')
      .eq('status', 'solicitado')
      .not('pro_proposal', 'is', null);

    if (fetchError) {
      console.error('❌ Error buscando tickets:', fetchError);
      throw fetchError;
    }

    console.log(`   Tickets con propuesta encontrados: ${ticketsConPropuesta?.length || 0}`);

    if (!ticketsConPropuesta || ticketsConPropuesta.length === 0) {
      console.log('✅ No hay propuestas pendientes que verificar');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return new Response(JSON.stringify({ expired: 0, checked: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 4: Filtrar y procesar propuestas expiradas
    // ═══════════════════════════════════════════════════════════════
    console.log('⏰ PASO 4: Verificando expiración de cada propuesta...');
    const ahora = Date.now();
    let expiredCount = 0;
    let skippedCount = 0;

    for (const ticket of ticketsConPropuesta) {
      const proposal = ticket.pro_proposal;
      
      console.log(`   📋 Ticket #${ticket.id} (${ticket.client_name})`);
      console.log(`      Status propuesta: ${proposal?.status}`);

      // Verificar que está en estado waiting_selection
      if (proposal?.status !== 'waiting_selection') {
        console.log(`      ⏭️  Saltando (status: ${proposal?.status})`);
        skippedCount++;
        continue;
      }

      // Verificar si ha expirado
      const createdAt = proposal?.created_at;
      if (!createdAt) {
        console.log('      ⏭️  Saltando (sin created_at)');
        skippedCount++;
        continue;
      }

      const createdTime = new Date(createdAt).getTime();
      const expirationTime = createdTime + (timeoutMinutes * 60 * 1000);
      const remainingMs = expirationTime - ahora;

      console.log(`      Creada: ${createdAt}`);
      console.log(`      Expira: ${new Date(expirationTime).toISOString()}`);

      if (ahora > expirationTime) {
        console.log(`      🔴 EXPIRADA (hace ${Math.round(-remainingMs/1000)}s)`);

        // Marcar como timeout
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            status: 'timeout',
            pro_proposal: {
              ...proposal,
              status: 'expired',
              expired_at: new Date().toISOString()
            }
          })
          .eq('id', ticket.id);

        if (updateError) {
          console.error(`      ❌ Error actualizando: ${updateError.message}`);
        } else {
          console.log('      ✅ Marcado como timeout');
          expiredCount++;
        }
      } else {
        console.log(`      🟢 Vigente (quedan ${Math.round(remainingMs/1000)}s)`);
        skippedCount++;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 5: Limpiar locks de procesamiento antiguos
    // ═══════════════════════════════════════════════════════════════
    console.log('🧹 PASO 5: Limpiando locks antiguos...');
    const hace5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: locksLimpiados } = await supabase
      .from('tickets')
      .update({ processing_started_at: null })
      .lt('processing_started_at', hace5min)
      .is('pro_proposal', null)
      .select('id');

    if (locksLimpiados && locksLimpiados.length > 0) {
      console.log(`   ✅ Limpiados ${locksLimpiados.length} locks antiguos`);
    } else {
      console.log('   ✅ No había locks antiguos');
    }

    // ═══════════════════════════════════════════════════════════════
    // RESUMEN
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESUMEN TIMEOUT MONITOR:');
    console.log(`   - Propuestas verificadas: ${ticketsConPropuesta.length}`);
    console.log(`   - Marcadas como timeout: ${expiredCount}`);
    console.log(`   - Vigentes/saltadas: ${skippedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Response(JSON.stringify({ 
      expired: expiredCount, 
      checked: ticketsConPropuesta.length,
      skipped: skippedCount,
      timeout_minutes: timeoutMinutes
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 ERROR CRÍTICO EN TIMEOUT MONITOR:', error);
    console.error('💥 Stack:', error.stack);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
