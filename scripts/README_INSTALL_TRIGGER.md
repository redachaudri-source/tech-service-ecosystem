# Instalación del trigger Autopilot

## Orden de ejecución

1. **Activar pg_net**  
   En Supabase: Dashboard → Database → Extensions → buscar `pg_net` → Enable.

2. **Aplicar la migración del RPC**  
   En Supabase: SQL Editor → pegar y ejecutar el contenido de  
   `supabase/migrations/20260129_rpc_install_autopilot_trigger.sql`.

3. **Ejecutar el script** (instala el trigger llamando al RPC):
   ```bash
   SUPABASE_URL=https://TU_PROJECT.supabase.co SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key node scripts/install_trigger.cjs
   ```
   En PowerShell:
   ```powershell
   $env:SUPABASE_URL="https://TU_PROJECT.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY="tu_key"
   node scripts/install_trigger.cjs
   ```

Si el trigger ya está creado por la migración `20260129_ticket_autopilot_webhook_trigger.sql`, el script sirve para reinstalarlo/verificarlo vía RPC.
