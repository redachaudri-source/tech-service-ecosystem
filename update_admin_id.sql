-- 🔐 ACTUALIZACIÓN DE CREDENCIALES SUPER ADMIN 🔐

-- 1. Actualizar tabla de autenticación (auth.users)
UPDATE auth.users
SET 
    email = 'sadmin@fixarr.es',
    encrypted_password = crypt('RedaYNayke1427', gen_salt('bf')),
    email_confirmed_at = now(), -- Asegurar que está confirmado
    updated_at = now()
WHERE email = 'admin@techservice.com';

-- 2. Actualizar perfiles públicos (public.profiles)
-- Intentamos actualizarlo si existe el registro con ese ID (basado en la antigua FK si se mantiene)
-- O más simple: Actualizar por coincidencia de ID con el usuario recien editado.

DO $$
DECLARE
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'sadmin@fixarr.es';
    
    IF v_user_id IS NOT NULL THEN
        -- Si profiles tiene columna email, actualizarla (comentar si da error)
        -- UPDATE public.profiles SET email = 'sadmin@fixarr.es' WHERE id = v_user_id;
        
        RAISE NOTICE '✅ Credenciales actualizadas correctamente para ID: %', v_user_id;
    ELSE
        RAISE NOTICE '⚠️ No se encontró al usuario antiguo admin@techservice.com';
    END IF;
END $$;
