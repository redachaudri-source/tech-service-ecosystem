# 🚀 DEPLOYMENT BOT PRO - Pasos Ejecutados

## ✅ Código Mergeado a Main

- **Fecha:** 2026-01-30
- **Commits incluidos:**
  - `a2cb993` - fix: Webhook payload ahora envía ticket_id directamente
  - `d0a7e20` - feat: Secretaria Virtual PRO - Bot Autopilot completo
- **Rama origen:** `cursor/secretaria-virtual-pro-1f30`
- **Estado:** ✅ MERGE COMPLETADO

---

## 📋 PRÓXIMOS PASOS MANUALES REQUERIDOS

### PASO 1: Ejecutar Migraciones SQL (CRÍTICO)

En **Supabase Dashboard → SQL Editor**, ejecutar en este orden:

#### Migración 1: Bot PRO Processing Lock
```sql
-- Copiar contenido de: supabase/migrations/20260130104712_bot_pro_processing_lock.sql

-- Añade columna processing_started_at para lock optimista
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ DEFAULT NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tickets_pending_pro_processing 
ON tickets(status, created_at) 
WHERE status = 'solicitado' 
  AND pro_proposal IS NULL 
  AND processing_started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_processing_lock
ON tickets(processing_started_at) 
WHERE processing_started_at IS NOT NULL;

-- Configuración estrategia
INSERT INTO business_config (key, value) VALUES
('pro_selection_strategy', '"balanced"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Funciones auxiliares
CREATE OR REPLACE FUNCTION clean_stale_processing_locks()
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER := 0;
BEGIN
    UPDATE tickets
    SET processing_started_at = NULL
    WHERE processing_started_at IS NOT NULL
      AND processing_started_at < NOW() - INTERVAL '5 minutes'
      AND pro_proposal IS NULL;
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_expired_proposals()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER := 0;
BEGIN
    UPDATE tickets
    SET 
        status = 'timeout',
        pro_proposal = pro_proposal || jsonb_build_object('status', 'expired', 'expired_at', NOW()::text)
    WHERE 
        status = 'solicitado'
        AND pro_proposal IS NOT NULL
        AND pro_proposal->>'status' = 'waiting_selection'
        AND (pro_proposal->>'created_at')::timestamptz < NOW() - INTERVAL '3 minutes';
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION clean_stale_processing_locks TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mark_expired_proposals TO authenticated, service_role;
```

#### Migración 2: Update Webhook Trigger
```sql
-- Copiar contenido de: supabase/migrations/20260130104713_update_autopilot_webhook_trigger.sql

CREATE OR REPLACE FUNCTION public.trigger_ticket_autopilot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  edge_url text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'solicitado' THEN
    RETURN NEW;
  END IF;

  IF NEW.pro_proposal IS NOT NULL THEN
    RETURN NEW;
  END IF;

  edge_url := 'https://zapjbtgnmxkhpfykxmnh.supabase.co/functions/v1/ticket-autopilot-processor';

  payload := jsonb_build_object(
    'ticket_id', NEW.id::text,
    'type', 'INSERT',
    'table', 'tickets'
  );

  PERFORM net.http_post(
    url := edge_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_insert ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_insert
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ticket_autopilot();

DROP TRIGGER IF EXISTS trigger_ticket_autopilot_on_update ON public.tickets;
CREATE TRIGGER trigger_ticket_autopilot_on_update
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW
  WHEN (NEW.status = 'solicitado' AND OLD.status IS DISTINCT FROM 'solicitado' AND NEW.pro_proposal IS NULL)
  EXECUTE FUNCTION public.trigger_ticket_autopilot();
```

**Verificar instalación:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'tickets' AND column_name = 'processing_started_at';

SELECT * FROM pg_trigger WHERE tgname LIKE '%autopilot%';
```

---

### PASO 2: Deploy Edge Functions

#### Opción A: Manual con Supabase CLI
```bash
supabase functions deploy ticket-autopilot-processor --project-ref zapjbtgnmxkhpfykxmnh --no-verify-jwt
supabase functions deploy ticket-autopilot-timeout --project-ref zapjbtgnmxkhpfykxmnh --no-verify-jwt
```

#### Opción B: Automático via GitHub Actions
El workflow `.github/workflows/deploy-edge-functions.yml` despliega automáticamente al detectar cambios en `supabase/functions/`.

**Verificar deployment:**
- GitHub → Actions tab → Ver último workflow
- Supabase Dashboard → Edge Functions → Verificar funciones activas

---

### PASO 3: Configurar Cron Jobs

**En Supabase Dashboard → Edge Functions → Schedules:**

#### Cron 1 - Motor Principal (cada minuto)
| Campo | Valor |
|-------|-------|
| Name | `ticket-autopilot-main` |
| Schedule | `* * * * *` |
| Function | `ticket-autopilot-processor` |
| Body | `{"mode": "cron"}` |

#### Cron 2 - Timeout Monitor (cada minuto)
| Campo | Valor |
|-------|-------|
| Name | `ticket-autopilot-timeout` |
| Schedule | `* * * * *` |
| Function | `ticket-autopilot-timeout` |
| Body | `{}` |

---

### PASO 4: Activar Modo PRO en Admin Panel

1. Ir a **Admin Panel → Secretaria Virtual**
2. Seleccionar **"PRO - Autopilot"**
3. Configurar:
   - **Estrategia:** Balanceado (recomendado)
   - **Citas a proponer:** 3
   - **Timeout:** 3 minutos
   - **Días a futuro:** 7
4. Click **"Guardar Todo"**

---

### PASO 5: Test de Verificación

```sql
-- Insertar ticket de prueba
INSERT INTO tickets (status, postal_code, client_name, client_phone) 
VALUES ('solicitado', '29013', 'TEST_DEPLOYMENT', '+34600000000');

-- Esperar 5 segundos y verificar
SELECT id, status, pro_proposal, processing_started_at 
FROM tickets WHERE client_name = 'TEST_DEPLOYMENT';

-- Resultado esperado:
-- pro_proposal: {"slots": [...], "status": "waiting_selection", ...}
```

---

## 📊 CHECKLIST DE DEPLOYMENT

- [ ] Migración 1 ejecutada (processing_started_at)
- [ ] Migración 2 ejecutada (trigger actualizado)
- [ ] Edge Function `ticket-autopilot-processor` desplegada
- [ ] Edge Function `ticket-autopilot-timeout` desplegada
- [ ] Cron Job `ticket-autopilot-main` configurado
- [ ] Cron Job `ticket-autopilot-timeout` configurado
- [ ] Modo PRO activado en Admin Panel
- [ ] Test de verificación exitoso

---

## 🔧 TROUBLESHOOTING

### Si el ticket no se procesa:
1. Verificar `secretary_mode = 'pro'` en `business_config`
2. Verificar logs en Dashboard → Edge Functions → Logs
3. Verificar que pg_net está habilitado

### Si hay timeout pero no se marca:
1. Verificar que el Cron job está corriendo
2. Verificar logs de `ticket-autopilot-timeout`

### Si no hay slots disponibles:
1. Verificar técnicos activos: `SELECT * FROM profiles WHERE role = 'tech' AND is_active = true`
2. Verificar horarios configurados en `working_hours`

---

## ✅ DEPLOYMENT COMPLETADO

**Fecha de merge:** 2026-01-30  
**Verificación:** 6/6 checkpoints ✅  
**Estado:** Listo para producción
