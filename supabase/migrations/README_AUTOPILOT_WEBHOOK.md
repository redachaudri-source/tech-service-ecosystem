# Autopilot Webhook – Cómo activarlo

## Opción A: Script Node (recomendado)

1. **Activar pg_net:** Dashboard → Database → Extensions → "pg_net" → Enable.
2. Obtener **Connection string (URI)** en Dashboard → Project Settings → Database.
3. Ejecutar:
   ```bash
   DATABASE_URL='postgresql://...' npm run install:trigger
   ```
   O bien `node scripts/install_trigger.js` con `DATABASE_URL` o `SUPABASE_DB_URL` en el entorno.

Con esto se crea el trigger `ticket_autopilot_on_insert` en `tickets` (INSERT + `status = 'solicitado'`).

## Opción A2: Migración SQL

1. Activar pg_net (igual que arriba).
2. Ejecutar en SQL Editor el contenido de `20260129_ticket_autopilot_webhook_trigger.sql` (o `supabase db push` si usas CLI).

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

## Opción C: Escaneo continuo (cron cada minuto)

Si quieres que el bot revise continuamente tickets en estado `solicitado`, puedes programar
una llamada cada minuto a la Edge Function con `mode: "scan"`.

1. Activa la extensión **pg_cron** en Dashboard → Database → Extensions.
2. Ejecuta el SQL en `scripts/CRON_AUTOPILOT_SCAN.sql`.
