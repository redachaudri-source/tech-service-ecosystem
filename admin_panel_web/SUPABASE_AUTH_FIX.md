# Solución: Error de Email Inválido en Registro de Usuarios

## Problema
Al intentar crear usuarios (técnicos/admins), Supabase rechaza los emails con error "Invalid Email Address".

## Causa Raíz
Supabase Auth tiene validación estricta de emails que puede rechazar:
- Dominios no existentes (como `@adminsatialia.com`)
- Dominios sin registros MX
- Formatos personalizados

## Solución A: Desactivar Confirmación de Email (RECOMENDADO)

1. Ve a tu dashboard de Supabase: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Ve a **Authentication** → **Settings**
4. Busca la sección **Email Auth**
5. **Desactiva** la opción **"Enable email confirmations"**
6. Guarda los cambios

Esto permite que los emails internos (como `usuario@example.com`) funcionen sin validación de dominio real.

## Solución B: Usar Emails Reales Temporalmente

Si prefieres mantener la confirmación de email activa, modifica el código para usar emails reales:

```javascript
// En TeamManager.jsx, línea ~213
const loginEmail = `${cleanUsername}@gmail.com`;  // Usar dominio real
```

**IMPORTANTE**: Esto puede causar colisiones si alguien ya tiene ese email en Gmail.

## Solución C: Configurar Dominio Personalizado (Avanzado)

1. En Supabase → **Authentication** → **Settings** → **Email Auth**
2. Configura un dominio personalizado o SMTP
3. Añade tu dominio real a la lista de dominios permitidos

## Recomendación
Usa **Solución A** para desarrollo. Es la más simple y permite crear usuarios de prueba sin complicaciones.
