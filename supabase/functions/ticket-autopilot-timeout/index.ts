// ═══════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: ticket-autopilot-timeout
// Monitor de timeout: Marca propuestas expiradas (>3 min sin respuesta)
// Ejecutar cada 1 minuto via Cron Job
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    console.log('[Timeout-Monitor] Starting timeout check...');

    // ═══════════════════════════════════════════════════════════════
    // PASO 1: Verificar si modo PRO está activo
    // ═══════════════════════════════════════════════════════════════
    const { data: modeConfig } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'secretary_mode')
      .single();

    const secretaryMode = (modeConfig?.value ?? '').toString().toLowerCase().replace(/"/g, '');
    if (secretaryMode !== 'pro') {
      console.log('[Timeout-Monitor] PRO mode not active, skipping');
      return new Response(JSON.stringify({ message: 'PRO mode not active' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 2: Obtener configuración de timeout
    // ═══════════════════════════════════════════════════════════════
    const { data: proConfigData } = await supabase
      .from('business_config')
      .select('value')
      .eq('key', 'pro_config')
      .single();

    const proConfig = proConfigData?.value || { timeout_minutes: 3 };
    const timeoutMinutes = proConfig.timeout_minutes || 3;

    // Calcular fecha límite (propuestas creadas hace más de X minutos)
    const fechaLimite = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    console.log(`[Timeout-Monitor] Checking proposals older than ${timeoutMinutes} min (${fechaLimite})`);

    // ═══════════════════════════════════════════════════════════════
    // PASO 3: Buscar propuestas expiradas
    // ═══════════════════════════════════════════════════════════════
    const { data: ticketsConPropuesta, error: fetchError } = await supabase
      .from('tickets')
      .select('id, pro_proposal')
      .eq('status', 'solicitado')
      .not('pro_proposal', 'is', null);

    if (fetchError) {
      console.error('[Timeout-Monitor] Error fetching tickets:', fetchError);
      throw fetchError;
    }

    if (!ticketsConPropuesta || ticketsConPropuesta.length === 0) {
      console.log('[Timeout-Monitor] No tickets with proposals found');
      return new Response(JSON.stringify({ expired: 0, checked: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 4: Filtrar propuestas expiradas y procesarlas
    // ═══════════════════════════════════════════════════════════════
    const ahora = Date.now();
    let expiredCount = 0;

    for (const ticket of ticketsConPropuesta) {
      const proposal = ticket.pro_proposal;
      
      // Verificar que está en estado waiting_selection
      if (proposal?.status !== 'waiting_selection') {
        continue;
      }

      // Verificar si ha expirado
      const createdAt = proposal?.created_at;
      if (!createdAt) continue;

      const createdTime = new Date(createdAt).getTime();
      const expirationTime = createdTime + (timeoutMinutes * 60 * 1000);

      if (ahora > expirationTime) {
        console.log(`[Timeout-Monitor] Ticket #${ticket.id} proposal expired`);

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
          console.error(`[Timeout-Monitor] Error updating ticket #${ticket.id}:`, updateError);
        } else {
          expiredCount++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASO 5: Limpiar locks de procesamiento antiguos (bonus)
    // ═══════════════════════════════════════════════════════════════
    const hace5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from('tickets')
      .update({ processing_started_at: null })
      .lt('processing_started_at', hace5min)
      .is('pro_proposal', null);

    console.log(`[Timeout-Monitor] ✅ Completed: ${expiredCount} proposals expired, ${ticketsConPropuesta.length} checked`);

    return new Response(JSON.stringify({ 
      expired: expiredCount, 
      checked: ticketsConPropuesta.length,
      timeout_minutes: timeoutMinutes
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Timeout-Monitor] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
