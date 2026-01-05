-- CONFIRMAR EMAILS MANUALMENTE
-- Supabase requiere confirmación por defecto. Como no tenemos servidor de correo,
-- usamos este hack para simular que el usuario pulsó el enlace de confirmación.

UPDATE auth.users
SET email_confirmed_at = now()
WHERE email LIKE '%sofia%' OR email LIKE '%admin%'; 
-- O confirma a todos (solo en desarrollo):
-- WHERE email_confirmed_at IS NULL;
