-- FIX: Permitir que usuarios autenticados eliminen profiles de tipo client
-- El problema es que no existe política DELETE en la tabla profiles
-- Ejecutar en Supabase SQL Editor

-- 1. Eliminar política existente si hay
DROP POLICY IF EXISTS "profiles_delete_clients" ON profiles;

-- 2. Crear nueva política para eliminar clientes
-- Solo permite eliminar perfiles con role = 'client' (no admin, tech, etc)
CREATE POLICY "profiles_delete_clients"
ON profiles FOR DELETE
TO authenticated
USING (role = 'client');

-- Verificar que la política se creó
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'DELETE';
