---
description: Fix WhatsApp bot when it stops responding after deploy
---

# Arreglar WhatsApp Bot

El bot de WhatsApp puede dejar de responder después de un deploy si no se usa el flag `--no-verify-jwt`.

## Problema
Las Edge Functions por defecto requieren JWT. Los webhooks de Meta NO envían JWT, por lo que la función rechaza las peticiones.

## Solución
// turbo
```powershell
npx supabase functions deploy whatsapp-bot --project-ref zapjbtgnmxkhpfykxmnh --no-verify-jwt
```

## Verificar que funciona
Envía "hola" por WhatsApp al número de FIXARR.

## Funciones que necesitan --no-verify-jwt
- `whatsapp-bot` (webhook de Meta)
- `notify-departure` (llamado desde frontend con anon key)
- `send-whatsapp` (llamado desde frontend)
- `send-reminders` (cron job)
