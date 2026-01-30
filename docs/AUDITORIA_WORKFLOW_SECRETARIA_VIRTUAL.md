# Auditoría: Workflow Secretaría Virtual (Básico vs PRO)

**Rol:** Senior Software Architect  
**Objetivo:** Entender cómo está montado el flujo y por qué ni el Bot Básico ni el Bot PRO funcionan tras los últimos cambios.

---

## 1. EL PUNTO DE ENTRADA (The Entry Point)

### ¿Quién se entera primero cuando se crea un ticket (status: 'solicitado')?

Hay **dos orígenes** de creación de ticket; en ambos el **único** mecanismo que reacciona al INSERT es el **trigger de base de datos**.

| Origen | Archivo / Acción | ¿Llama a ticket-autopilot directamente? |
|--------|------------------|------------------------------------------|
| **Web/App cliente** | `client_web_portal/src/pages/dashboard/NewService.jsx` (líneas 169–191) | **No.** Solo hace `supabase.from('tickets').insert([...]).select('id').single()`. |
| **WhatsApp (fin de conversación)** | `supabase/functions/whatsapp-bot/index.ts` (líneas 782–785) | **No.** El bot hace `supabase.from('tickets').insert(ticketData)`. |

**Conclusión:**  
- El frontend **nunca** invoca la Edge Function `ticket-autopilot`.  
- La única forma de que `ticket-autopilot` se ejecute al crear un ticket es el **trigger** `trigger_ticket_autopilot_on_insert` (AFTER INSERT en `tickets`), que hace un `net.http_post` a la URL de la Edge Function.

### ¿Hay doble llamada?

**No.** No hay dos caminos compitiendo:  
- Un solo camino: **INSERT en `tickets` → trigger → pg_net POST → ticket-autopilot**.

### Riesgo en migraciones

- **`20260129_autopilot_trigger.sql`**: hace **DROP** del trigger y de la función.  
- **`20260129_ticket_autopilot_webhook_trigger.sql`**: **crea** de nuevo la función y el trigger.

Orden alfabético: `autopilot_trigger` se ejecuta **antes** que `ticket_autopilot_webhook_trigger`.  
Tras aplicar todas las migraciones, el trigger **debería** existir. Si en algún momento se aplicó solo la primera migración (o se revirtió la segunda), el trigger **no existiría** y `ticket-autopilot` **nunca** se ejecutaría al crear un ticket.

---

## 2. LA BIFURCACIÓN (The Fork)

### ¿Dónde se decide Básico vs PRO?

El único lugar donde se decide “PRO o no” es la Edge Function **ticket-autopilot**:

**Archivo:** `supabase/functions/ticket-autopilot/index.ts`  
**Líneas 74–76:**

```ts
if (secretaryModeNorm !== 'pro') {
    console.log('[Autopilot] PRO mode not active (secretary_mode=' + secretaryModeNorm + '), skipping');
    return { skipped: 'mode' };
}
```

- **Condición:** `secretary_mode` (de `business_config`) normalizado a minúsculas igual a `'pro'`.  
- Si **no** es PRO: la función **retorna** `{ skipped: 'mode' }` y **no hace nada más** (no llama a ningún “código antiguo”, no delega en nadie).

### Si el modo es 'basic', ¿qué pasa?

- **ticket-autopilot:** solo hace skip y termina. No llama a `whatsapp-bot` ni a ningún otro servicio.  
- **whatsapp-bot:** es un **punto de entrada distinto**. No es invocado por el trigger ni por el frontend; es invocado **por Meta** cuando el usuario escribe por WhatsApp.  
- En modo Básico, el “bot antiguo” es exactamente **el mismo** `whatsapp-bot`: misma función, misma conversación (electrodoméstico, problema, dirección, etc.); la única diferencia es que al **final** del flujo, en Básico **no** se proponen slots (no entra en el bloque PRO de slots en `whatsapp-bot`).

Por tanto: **no hay “devolución de control al código antiguo”**. En Basic, ticket-autopilot no hace nada; el “bot básico” es whatsapp-bot respondiendo a WhatsApp, sin proponer citas.

---

## 3. EL BOT BÁSICO (Missing in Action)

### ¿Por qué ha dejado de funcionar?

El Bot Básico **es** la Edge Function **whatsapp-bot** cuando el usuario escribe por WhatsApp.  
No depende del trigger de tickets: el flujo es:

1. Usuario envía mensaje por WhatsApp.  
2. Meta llama al **webhook** de la función (URL pública de `whatsapp-bot`).  
3. La función procesa el mensaje, actualiza conversación, y al final puede crear un ticket.

Si el bot “ha dejado de funcionar”, la causa **no** es que el trigger “consuma” el evento: el trigger solo se dispara al hacer **INSERT** en `tickets`. Los mensajes de WhatsApp no insertan tickets hasta el **final** del flujo; hasta entonces, solo interviene `whatsapp-bot` vía webhook de Meta.

### Causas probables por las que el Básico “no hace nada”

1. **La petición de Meta nunca llega al código (401)**  
   Por defecto, las Edge Functions de Supabase exigen **JWT**. Meta **no** envía JWT. Si `whatsapp-bot` se desplegó **con** verificación JWT, Supabase rechaza la petición **antes** de ejecutar la función → el bot “muere en silencio” (nada en logs de la función, solo 401 en infraestructura).  
   **Solución ya planteada en el proyecto:** `config.toml` con `verify_jwt = false` para `whatsapp-bot` y redespliegue.

2. **Salidas tempranas dentro de whatsapp-bot**  
   - **Líneas 1218–1221:** `if (!config.settings.bot_enabled)` → envía mensaje de “bot deshabilitado” y retorna.  
   - **Líneas 1224–1230:** `if (!isWithinWorkingHours(config))` → envía mensaje de “fuera de horario” y retorna.  
   - **Líneas 1238–1242:** `if (!isBotActiveDay(secretaryConfig.bot_active_days))` → **retorna 200 sin enviar ningún mensaje** (“No responder en días no activos”).  
   - **Líneas 1307–1324:** Si el cliente está identificado como `isAppUser`, redirige a la app y borra la conversación.

Ninguna de estas comprobaciones “sobrescribe” la lógica del Básico; simplemente hacen que el bot **no responda** o responda con un mensaje fijo. La más peligrosa para “parecer que no hace nada” es **día inactivo** (`isBotActiveDay`): retorna 200 sin mensaje.

### ¿Hemos sobreescrito la lógica del Básico?

**No.** La lógica de conversación (pasos, creación de ticket al final) es la misma para Básico y PRO. La única rama extra en PRO es el bloque de **propuesta de slots** (líneas 1436–1485 en `whatsapp-bot`). En Básico ese bloque no se ejecuta y se usa el mensaje `ticket_created` (líneas 1486–1502).

### ¿El trigger “se come” el evento para el Básico?

**No.** El trigger solo reacciona al **INSERT** en `tickets`. El Básico no depende de ese evento para responder a los mensajes de WhatsApp; depende solo del webhook de Meta a `whatsapp-bot`.

---

## 4. DIAGRAMA DE FLUJO ACTUAL

### Creación de ticket desde Web/App

```
Usuario rellena formulario (NewService.jsx)
    → supabase.from('tickets').insert([...]) (status: 'solicitado', origin_source: 'client_web')
    → INSERT en BD
    → Trigger trigger_ticket_autopilot_on_insert
    → pg_net: POST a ticket-autopilot con { type, table: 'tickets', record: NEW }
    → ticket-autopilot recibe payload
    → getSecretaryConfig() → secretary_mode
    → processTicket()
        → Si status !== 'solicitado' → skip
        → Si secretary_mode !== 'pro' → return { skipped: 'mode' }  ← AQUÍ TERMINA EN BÁSICO
        → Si es PRO: busca slots, actualiza pro_proposal, (opcional) envía WhatsApp
```

En **modo Básico**, el flujo se corta en `processTicket` con `{ skipped: 'mode' }`. No hay más pasos ni “handoff” al bot legacy.

### Flujo WhatsApp (Bot Básico = whatsapp-bot)

```
Usuario escribe por WhatsApp (ej. "hola")
    → Meta envía POST al webhook (URL de whatsapp-bot)
    → Supabase recibe la petición
        → Si verify_jwt = true (por defecto): 401 Unauthorized → LA FUNCIÓN NI SE EJECUTA  ← FALLO TÍPICO
        → Si verify_jwt = false: se ejecuta whatsapp-bot
    → whatsapp-bot: getBotConfig(), isWithinWorkingHours(), getSecretaryConfig(), isBotActiveDay()
    → Si bot_enabled false / fuera horario / día inactivo → respuesta fija o 200 sin mensaje
    → Si no: getConversation(), processStep(), updateConversation(), sendWhatsAppMessage()
    → Cuando el usuario completa todos los pasos → createTicketFromConversation()
        → INSERT en tickets (status: 'solicitado', origin_source: 'whatsapp_bot')
        → Trigger → ticket-autopilot (en Básico hace skip)
    → whatsapp-bot: si secretary_mode === 'pro' → propone slots; si no → envía ticket_created y cierra
```

El “Bot Básico” falla si la petición de Meta **no llega** a la función (p. ej. JWT) o si alguna de las comprobaciones anteriores hace que se retorne sin (o con) mensaje.

### Resumen en una línea

- **Ticket creado** → **Solo** trigger DB → **Solo** ticket-autopilot.  
- **IF Pro** → ticket-autopilot busca slots, escribe `pro_proposal`, puede enviar WhatsApp.  
- **ELSE (Basic)** → ticket-autopilot retorna `{ skipped: 'mode' }` y **no hace nada más**.  
- El “Bot Básico” **no** es ese camino; es **whatsapp-bot** invocado por **Meta**, independiente del trigger.

---

## 5. CONCLUSIONES Y PUNTOS DE FALLO

### “El Bot Básico falla porque…”

1. **Causa más probable:** La Edge Function `whatsapp-bot` está desplegada **con** verificación JWT. Meta no envía JWT → Supabase devuelve 401 → la función **nunca** se ejecuta → el usuario no recibe respuesta.  
2. **Otras causas posibles:**  
   - `bot_enabled: false` en `whatsapp_bot_config` (business_config).  
   - Fuera de `working_hours` o día no incluido en `bot_active_days` (y en “día inactivo” el bot retorna 200 sin mensaje).  
   - Cliente detectado como `isAppUser` → redirección a la app y borrado de conversación.

### “El flujo se rompe en el archivo X, línea Y”

- **Si el Básico no responde y la petición ni llega al handler:** la “ruptura” está en la **capa de Supabase Edge (auth)**, no en una línea concreta de tu código; se corrige con `verify_jwt = false` y redespliegue de `whatsapp-bot`.  
- **Si el Básico no responde pero la función sí se ejecuta:** revisar en `whatsapp-bot/index.ts` las salidas tempranas:  
  - **Líneas 1218–1221** (bot_enabled).  
  - **Líneas 1224–1230** (horario).  
  - **Líneas 1238–1242** (día activo; aquí se retorna sin mensaje).  
  - **Líneas 1307–1324** (isAppUser).

### “El Bot PRO no funciona porque…”

- Si el **trigger** no está instalado (solo aplicada la migración que hace DROP), `ticket-autopilot` **nunca** se invoca → PRO no puede ejecutarse.  
- Si el trigger sí existe pero `secretary_mode !== 'pro'`, ticket-autopilot hace skip → PRO no hace nada.  
- Si es PRO y el ticket viene de web, `sendWhatsAppSlotProposal` usa `ticket.client_phone`; si la tabla `tickets` no tiene `client_phone` (solo `client_id`), el envío por WhatsApp puede fallar por dato faltante.

### ¿Lógica duplicada compitiendo?

**No.**  
- **Una sola** reacción al INSERT: trigger → ticket-autopilot.  
- **Un solo** punto de entrada para mensajes de WhatsApp: webhook de Meta → whatsapp-bot.  
- No hay dos flujos que “compitan” por el mismo evento; el problema es o bien **acceso** (JWT al webhook) o bien **configuración/horarios/días** dentro de `whatsapp-bot`.

---

## 6. ACCIONES RECOMENDADAS (sin escribir código aún)

1. **Confirmar** que `whatsapp-bot` está desplegada con `verify_jwt = false` (config.toml o flag en deploy) y que Meta llama a la URL correcta.  
2. **Revisar** en Supabase Dashboard → Edge Functions → Logs de `whatsapp-bot`: si no aparece **ninguna** petición al escribir por WhatsApp, el fallo es de entrada (URL/JWT).  
3. **Comprobar** en BD que el trigger `trigger_ticket_autopilot_on_insert` existe en `tickets` y que la extensión `pg_net` está habilitada.  
4. **Revisar** `business_config`: `secretary_mode`, `whatsapp_bot_config.settings.bot_enabled`, `bot_active_days`, horarios.  
5. **Valorar** si en “día inactivo” el bot debe enviar un mensaje tipo “Hoy no atendemos por WhatsApp” en lugar de retornar 200 sin mensaje.

Con esto el flujo queda auditado y los puntos de fallo identificados para decidir los siguientes cambios de código o configuración.
