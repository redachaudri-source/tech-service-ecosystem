-- ═══════════════════════════════════════════════════════════════════════════════════
-- FIX RLS PROFILES - Arreglar errores 400 en consultas a profiles
-- ═══════════════════════════════════════════════════════════════════════════════════

-- PASO 1: Ver políticas actuales de profiles
SELECT 
    policyname,
    cmd,
    qual::text as condition
FROM pg_policies 
WHERE tablename = 'profiles';

-- ═══════════════════════════════════════════════════════════════════════════════════

-- PASO 2: Permitir que clientes vean técnicos asignados (lectura pública de técnicos)
-- (Descomentar si no existe)

/*
DROP POLICY IF EXISTS "Clientes pueden ver técnicos" ON profiles;

CREATE POLICY "Clientes pueden ver técnicos" ON profiles
    FOR SELECT
    USING (
        role = 'tech' 
        OR id = auth.uid()
        OR role = 'admin'
    );
*/

-- ═══════════════════════════════════════════════════════════════════════════════════

-- PASO 3: Alternativa - Permitir SELECT público en profiles (más permisivo)
-- (Descomentar si el anterior no funciona)

/*
DROP POLICY IF EXISTS "Lectura pública de perfiles" ON profiles;

CREATE POLICY "Lectura pública de perfiles" ON profiles
    FOR SELECT
    USING (true);
*/

-- ═══════════════════════════════════════════════════════════════════════════════════

-- PASO 4: Verificar que RLS está habilitado
SELECT 
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'profiles';

-- ═══════════════════════════════════════════════════════════════════════════════════
