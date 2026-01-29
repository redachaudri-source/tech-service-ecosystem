# Autopilot Webhook – Cómo activarlo

## Opción A: Trigger con pg_net (recomendado)

1. **Activar pg_net:** Dashboard → Database → Extensions → buscar "pg_net" → Enable.
2. **Aplicar la migración:** Ejecutar en SQL Editor el contenido de `20260129_ticket_autopilot_webhook_trigger.sql` (o aplicar migraciones con `supabase db push` si usas CLI).

Con esto, cada INSERT en `tickets` con `status = 'solicitado'` llamará a la Edge Function `ticket-autopilot`.

## Opción B: Database Webhook desde el Dashboard

Si no quieres usar pg_net o el trigger falla:

1. Dashboard → Database → Webhooks → Create a new hook.
2. **Name:** `ticket_autopilot_trigger`
3. **Table:** `tickets`
4. **Events:** INSERT
5. **Type:** Supabase Edge Function
6. **Edge Function:** `ticket-autopilot`
7. Guardar.

Supabase inyectará la autorización y enviará el payload esperado por la función.
