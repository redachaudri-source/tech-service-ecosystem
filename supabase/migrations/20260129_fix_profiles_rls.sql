-- ============================================================================
-- FIX CRÍTICO: RLS Policy para permitir a Super Admins editar perfiles
-- Fecha: 2026-01-29
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Ver políticas actuales (diagnóstico)
-- ============================================================================
-- SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- ============================================================================
-- PASO 2: Eliminar políticas restrictivas de UPDATE
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can update profiles" ON profiles;

-- ============================================================================
-- PASO 3: Crear política permisiva para Super Admins y Admins
-- ============================================================================

-- Política 1: Usuarios pueden actualizar SU PROPIO perfil
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Política 2: Super Admins pueden actualizar CUALQUIER perfil
CREATE POLICY "Super admins can update any profile" ON profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND is_super_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND is_super_admin = true
        )
    );

-- Política 3: Admins con permiso can_manage_team pueden actualizar técnicos
CREATE POLICY "Admins can update technicians" ON profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
            AND (permissions->>'can_manage_team')::boolean = true
        )
        AND role = 'tech'  -- Solo pueden editar técnicos
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
            AND (permissions->>'can_manage_team')::boolean = true
        )
        AND role = 'tech'
    );

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

SELECT 
    policyname,
    cmd,
    qual::text as using_clause,
    with_check::text as with_check_clause
FROM pg_policies 
WHERE tablename = 'profiles' AND cmd = 'UPDATE';
