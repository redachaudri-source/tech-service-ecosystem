-- Actualizar contraseña del Super Admin
-- Usuario: admin@techservice.com

-- Cambia 'TuNuevaContraseñaFuerte_2026!' por la contraseña que desees
-- Debe tener mayúsculas, minúsculas, números y símbolos para que Google no se queje.

UPDATE auth.users
SET encrypted_password = crypt('SuperAdmin_2026_Secure!', gen_salt('bf'))
WHERE email = 'admin@techservice.com';

-- Verificar cambio (opcional, no muestra la pass por seguridad)
-- SELECT email, encrypted_password FROM auth.users WHERE email = 'admin@techservice.com';
