# 🚀 Bot PRO Autopilot - Guía de Despliegue

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOT PRO AUTOPILOT                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MOTOR PRINCIPAL: Cron Job cada 30s (loop orgánico)            │
│  ├─ Busca tickets pendientes                                   │
│  ├─ Ordena por prioridad (día DESC + hora ASC)                 │
│  ├─ Procesa el primero                                         │
│  └─ Repite cada 30s                                            │
│                                                                 │
│  ACELERADOR: Webhook (reduce latencia a <2s)                   │
│  └─ Dispara procesamiento inmediato para tickets nuevos        │
│                                                                 │
│  TIMEOUT MONITOR: Cron cada 1 minuto                           │
│  └─ Marca propuestas expiradas (>3 min)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Requisitos Previos

- Supabase Project configurado
- pg_net extension habilitada
- pg_cron extension habilitada (opcional, para cron jobs)
- Edge Functions desplegadas

---

## FASE 1: Base de Datos

### Ejecutar migración SQL

En **Dashboard → SQL Editor**, ejecutar:

```sql
-- Archivo: supabase/migrations/20260130104712_bot_pro_processing_lock.sql
```

### Verificar instalación

```sql
-- Verificar columnas creadas
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name IN ('pro_proposal', 'processing_started_at');

-- Verificar configuración
SELECT * FROM business_config 
WHERE key IN ('secretary_mode', 'pro_selection_strategy', 'pro_config');
```

---

## FASE 2: Deploy Edge Functions

### Opción A: Supabase CLI

```bash
# Deploy procesador principal
supabase functions deploy ticket-autopilot-processor --no-verify-jwt

# Deploy monitor de timeout
supabase functions deploy ticket-autopilot-timeout --no-verify-jwt
```

### Opción B: GitHub Actions (Automático)

El workflow `.github/workflows/deploy-edge-functions.yml` despliega automáticamente al hacer push.

---

## FASE 3: Configurar Cron Jobs

### Opción A: Supabase Dashboard (Recomendado)

1. Ve a **Dashboard → Edge Functions → Schedules**
2. Crear schedule:

| Nombre | Function | Cron Expression | Body |
|--------|----------|-----------------|------|
| `ticket-autopilot-main` | `ticket-autopilot-processor` | `* * * * *` | `{"mode": "cron"}` |
| `ticket-autopilot-timeout` | `ticket-autopilot-timeout` | `* * * * *` | `{}` |

### Opción B: pg_cron SQL

```sql
-- Ejecutar scripts/CRON_BOT_PRO.sql en SQL Editor
```

---

## FASE 4: Configurar Webhook

### Opción A: Trigger pg_net (ya instalado)

El trigger `trigger_ticket_autopilot_on_insert` se crea automáticamente con la migración.

Verificar:
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE '%autopilot%';
```

### Opción B: Database Webhook (Alternativa)

1. **Dashboard → Database → Webhooks → Create**
2. Configurar:
   - **Name:** `ticket_autopilot_instant`
   - **Table:** `tickets`
   - **Events:** INSERT
   - **Type:** Supabase Edge Function
   - **Function:** `ticket-autopilot-processor`

---

## FASE 5: Activar en Admin Panel

1. Ir a **Secretaria Virtual** en el Admin Panel
2. Seleccionar modo **PRO - Autopilot**
3. Configurar:
   - **Estrategia:** Balanceado (recomendado)
   - **Citas a proponer:** 3
   - **Timeout:** 3 minutos
   - **Días a futuro:** 7
   - **Canales:** WhatsApp + App

---

## FASE 6: Testing

### Test 1: Ticket nuevo (Webhook)

```sql
-- Insertar ticket de prueba
INSERT INTO tickets (status, postal_code, client_name, client_phone) 
VALUES ('solicitado', '29013', 'Cliente Test', '+34600000000');

-- Verificar propuesta creada (esperar 2 segundos)
SELECT id, status, pro_proposal, processing_started_at 
FROM tickets 
WHERE client_name = 'Cliente Test';
```

### Test 2: Cron Motor

```bash
# Llamar manualmente al procesador
curl -X POST https://[PROJECT].supabase.co/functions/v1/ticket-autopilot-processor \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"mode":"cron"}'
```

### Test 3: Timeout Monitor

```bash
# Llamar manualmente al monitor de timeout
curl -X POST https://[PROJECT].supabase.co/functions/v1/ticket-autopilot-timeout \
  -H "Authorization: Bearer [ANON_KEY]"
```

### Test 4: Prioridad Bifurcada

```sql
-- Insertar tickets de diferentes días
INSERT INTO tickets (status, postal_code, client_name, created_at) VALUES 
('solicitado', '29013', 'Cliente Ayer', NOW() - INTERVAL '1 day'),
('solicitado', '29013', 'Cliente Hoy Temprano', NOW() - INTERVAL '2 hours'),
('solicitado', '29013', 'Cliente Hoy Tarde', NOW());

-- El bot debería procesar en orden:
-- 1. Cliente Hoy Temprano (día más reciente, FIFO dentro del día)
-- 2. Cliente Hoy Tarde
-- 3. Cliente Ayer
```

### Test 5: Verificar Estrategia

```sql
-- Verificar estrategia configurada
SELECT value FROM business_config WHERE key = 'pro_selection_strategy';

-- Debería ser: "balanced", "speed" o "variety"
```

---

## Checklist Final

- [ ] **FASE 1:** Migración SQL ejecutada
- [ ] **FASE 2:** Edge Functions desplegadas
- [ ] **FASE 3:** Cron Jobs configurados
- [ ] **FASE 4:** Webhook/Trigger activo
- [ ] **FASE 5:** Modo PRO activado en Admin Panel
- [ ] **FASE 6:** Tests pasados

---

## Troubleshooting

### No se procesan tickets

1. Verificar que `secretary_mode` = `"pro"` en `business_config`
2. Verificar logs de Edge Functions en Dashboard
3. Verificar que pg_net está habilitado

### Propuestas sin slots

1. Verificar que hay técnicos activos: `SELECT * FROM profiles WHERE role = 'tech' AND is_active = true`
2. Verificar configuración de horarios: `SELECT * FROM business_config WHERE key = 'working_hours'`

### Timeout no funciona

1. Verificar que el cron job está configurado
2. Verificar logs de `ticket-autopilot-timeout`

---

## Logs y Monitoreo

### Ver logs Edge Functions

**Dashboard → Edge Functions → [function] → Logs**

### Ver historial cron jobs

```sql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

### Métricas de procesamiento

```sql
-- Tickets procesados hoy
SELECT 
  COUNT(*) FILTER (WHERE pro_proposal->>'status' = 'waiting_selection') as pending,
  COUNT(*) FILTER (WHERE status = 'timeout') as expired,
  COUNT(*) FILTER (WHERE pro_proposal->>'status' = 'accepted') as accepted
FROM tickets
WHERE created_at >= CURRENT_DATE;
```
