# Checklist Bot Autopilot (PRO) – 7 pasos

Auditoría de `supabase/functions/ticket-autopilot/index.ts` frente al flujo que haría un humano en el Dashboard.

---

## Paso 1: ¿BÚSQUEDA CONSTANTE?

**Estado: SÍ (con matiz)**

- **Trigger:** Sí. Al hacer INSERT en `tickets`, el trigger `trigger_ticket_autopilot_on_insert` (BD) hace `pg_net.http_post` a la Edge Function con `record` = fila nueva. No está en este archivo; está en migraciones / `scripts/fix_infrastructure.sql`.
- **Cron / Scan:** Sí. Si la función recibe `payload.mode === 'scan'` o no recibe `payload.record`, entra en modo scan (líneas 185-191). Entonces llama a `scanPendingTickets(supabase)`, que hace la búsqueda de tickets con `status = 'solicitado'`:
  - **Líneas 142-149:**  
    `supabase.from('tickets').select('*').eq('status', 'solicitado').is('technician_id', null).is('scheduled_at', null).order('created_at', { ascending: true }).limit(10)`  
  - El script `scripts/CRON_AUTOPILOT_SCAN.sql` define un job pg_cron que llama a la función con `body := '{"mode": "scan"}'`. Es decir: la “búsqueda constante” existe si ese cron está instalado y activo.

---

## Paso 2: ¿ELECCIÓN DEL SERVICIO?

**Estado: SÍ**

- Por **trigger:** el payload trae `record` (el NEW del INSERT), que es el ticket completo (id, client_id, appliance_info, description_failure, origin_source, etc.). Ese `record` se usa como `ticket` en `processTicket` (línea 201-205).
- Por **scan:** `scanPendingTickets` hace `.select('*')` sobre `tickets` (línea 144), así que cada ticket tiene todos los datos (cliente, aparato, avería).
- En ambos casos el bot “recibe el ID del ticket y tiene sus datos”; no hace un clic como el humano, pero tiene la misma información.

---

## Paso 3: ¿ACCESO A ASIGNACIÓN?

**Estado: SÍ**

- El equivalente al “Asignar” del humano es entrar en la lógica de búsqueda de técnicos y huecos.
- Eso ocurre en **línea 94:**  
  `const slots = await findAvailableSlots(supabase, proConfig);`  
- Se hace después de comprobar status, que no esté asignado, modo PRO y canales. Es decir, el bot sí entra en la lógica de “asignación” (búsqueda de huecos).

---

## Paso 4: ¿LÓGICA "ASISTENTE INTELIGENTE 3.0" (calendarios/eventos)?

**Estado: NO – modelo distinto**

- El código **no** usa tablas `technician_calendars` ni `events`.
- Usa:
  - **profiles** (role = 'tech') para listar técnicos (líneas 231-235).
  - **tickets** con `technician_id`, `scheduled_at` y `status in ('asignado','en_camino','en_proceso')` para construir los huecos ocupados (líneas 252-259).
- Los “huecos reales” se infieren por lo que ya tienen ticket asignado, no por un calendario o eventos. Es un modelo válido pero distinto al “God Mode” con calendarios/eventos.

---

## Paso 5: ¿BARRIDO DE CALENDARIO?

**Estado: SÍ**

- **Líneas 279-286:**  
  `for (let d = 0; d <= search_days && slots.length < slots_count; d++)`  
  con `checkDate.setDate(checkDate.getDate() + d)`.
- Empieza en “hoy” (`d = 0`) y avanza día a día hasta `search_days`. Se excluyen fines de semana (líneas 284-285).  
- Coincide con “mirar primero hoy, luego mañana…”.

---

## Paso 6: ¿REGLA DE ORO DE LOS SLOTS? (1 / 2 / 3 según huecos)

**Estado: SÍ (implementado)**

- Se calculan **todos** los huecos libres (`allSlots`), luego se aplica la regla:
  - `totalFree < 5` → ofrecer **1** opción  
  - `totalFree < 8` → ofrecer **2** opciones  
  - en caso contrario → **3** (o menos si hay menos de 3 huecos).
- El resultado se limita además por `pro_config.slots_count` (si el admin pone máximo 2, no se ofrecen 3).
- Log: `[Autopilot] Total free slots: X → offering Y (rule: Z, config max: W)`.

---

## Paso 7: ¿ENVÍO DE PROPUESTA?

**Estado: SÍ**

- **Líneas 119-122:**  
  `await supabase.from('tickets').update({ pro_proposal: proposalData }).eq('id', ticket.id);`  
- `proposalData` incluye `proposed_slots`, `proposed_at`, `timeout_at`, `status: 'waiting_selection'`.  
- El frontend puede reaccionar por Realtime a cambios en `pro_proposal`.  
- Para WhatsApp, además se llama a `sendWhatsAppSlotProposal` (líneas 128-129) si aplica.

---

## Resumen en tabla

| Paso | Estado | Explicación breve |
|------|--------|-------------------|
| 1. Búsqueda constante | SÍ | Trigger en INSERT + modo `scan` (scanPendingTickets) con query `status='solicitado'`; cron en `CRON_AUTOPILOT_SCAN.sql` si está instalado. |
| 2. Elección del servicio | SÍ | Trigger: `record` = ticket completo; scan: `.select('*')` en tickets. |
| 3. Acceso a asignación | SÍ | `findAvailableSlots(supabase, proConfig)` en línea 94. |
| 4. Asistente 3.0 (calendarios/eventos) | NO | No usa `technician_calendars` ni `events`; usa `profiles` + ocupación inferida desde `tickets`. |
| 5. Barrido de calendario | SÍ | Bucle desde hoy con `checkDate.setDate(getDate() + d)`, saltando fines de semana. |
| 6. Regla de oro (1/2/3 slots) | SÍ | Implementado: &lt;5→1, &lt;8→2, else→3; respetando además `slots_count` de config. |
| 7. Envío de propuesta | SÍ | `UPDATE tickets SET pro_proposal = ...` + opcional `sendWhatsAppSlotProposal`. |

---

## Paso 6 – Código implementado

La regla de oro está en `findAvailableSlots`: se construye `allSlots` completo, luego se aplica la fórmula y se devuelve `allSlots.slice(0, capped)`. (Implementado en código.) Es decir: en `findAvailableSlots`, primero calcular todos los huecos libres, contar el total, aplicar la regla 1/2/3 y luego quedarse solo con ese número de opciones.

**Opción A – Dentro de `findAvailableSlots` (recomendada):**

1. Construir una lista `allSlots` con todos los huecos libres (mismo bucle que ahora pero sin parar en `slots_count`; parar cuando se acaben días/horas).
2. Contar `totalFree = allSlots.length`.
3. Aplicar:
   - si `totalFree < 5` → `slotsToOffer = 1`
   - si `totalFree < 8` → `slotsToOffer = 2`
   - si no → `slotsToOffer = Math.min(3, totalFree)`
4. Devolver `allSlots.slice(0, slotsToOffer)`.

**Opción B – En `processTicket`, después de `findAvailableSlots`:**

1. Llamar a una nueva función `findAllAvailableSlots(supabase, config)` que devuelva **todos** los huecos (sin tope por `slots_count`).
2. En `processTicket`:  
   `totalFree = slots.length`  
   luego aplicar la misma regla 1/2/3 y hacer `slots = slots.slice(0, slotsToOffer)` antes de montar `proposalData` y hacer el UPDATE.

La opción A mantiene toda la lógica de “cuántos ofrecer” dentro de `findAvailableSlots` y deja a `processTicket` igual que ahora (solo usa el array que devuelve la función).
