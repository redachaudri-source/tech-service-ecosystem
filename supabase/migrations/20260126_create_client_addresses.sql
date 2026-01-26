-- ============================================================================
-- MIGRACIÓN: client_addresses
-- Fase 1: Arquitectura de Datos Multi-Dirección
-- Fecha: 2026-01-27
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Crear tabla client_addresses
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relación con el cliente
    client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Etiqueta de dirección
    label VARCHAR(50) NOT NULL DEFAULT 'Vivienda Principal',
    
    -- Datos de dirección
    address_line TEXT NOT NULL,
    floor VARCHAR(20),
    apartment VARCHAR(20),
    postal_code VARCHAR(10),
    city VARCHAR(100),
    
    -- Coordenadas GPS
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    
    -- Bandera de dirección principal
    is_primary BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PASO 2: Índices y Constraints
-- ============================================================================

-- Índice para búsquedas rápidas por cliente
CREATE INDEX IF NOT EXISTS idx_client_addresses_client_id 
    ON client_addresses(client_id);

-- Partial unique index: solo una dirección principal por cliente
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_addresses_primary 
    ON client_addresses(client_id) 
    WHERE is_primary = true;

-- ============================================================================
-- PASO 3: Trigger para updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_client_address_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_client_address ON client_addresses;
CREATE TRIGGER trigger_update_client_address
    BEFORE UPDATE ON client_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_client_address_timestamp();

-- ============================================================================
-- PASO 4: Row Level Security (RLS)
-- ============================================================================

ALTER TABLE client_addresses ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver direcciones de clientes
DROP POLICY IF EXISTS "Authenticated users can view addresses" ON client_addresses;
CREATE POLICY "Authenticated users can view addresses" ON client_addresses
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Política: Los usuarios autenticados pueden insertar direcciones
DROP POLICY IF EXISTS "Authenticated users can insert addresses" ON client_addresses;
CREATE POLICY "Authenticated users can insert addresses" ON client_addresses
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Política: Los usuarios autenticados pueden actualizar direcciones
DROP POLICY IF EXISTS "Authenticated users can update addresses" ON client_addresses;
CREATE POLICY "Authenticated users can update addresses" ON client_addresses
    FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Política: Los usuarios autenticados pueden eliminar direcciones
DROP POLICY IF EXISTS "Authenticated users can delete addresses" ON client_addresses;
CREATE POLICY "Authenticated users can delete addresses" ON client_addresses
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Política: Service role tiene acceso completo
DROP POLICY IF EXISTS "Service role full access" ON client_addresses;
CREATE POLICY "Service role full access" ON client_addresses
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- PASO 5: Migración de datos existentes
-- Solo clientes con address != NULL y no vacío
-- ============================================================================

INSERT INTO client_addresses (
    client_id,
    label,
    address_line,
    floor,
    apartment,
    postal_code,
    city,
    latitude,
    longitude,
    is_primary
)
SELECT 
    id,
    'Vivienda Principal',
    address,
    floor,
    apartment,
    postal_code,
    city,
    latitude,
    longitude,
    true
FROM profiles
WHERE role = 'client'
  AND address IS NOT NULL 
  AND address != '';

-- ============================================================================
-- PASO 6: Comentarios descriptivos
-- ============================================================================

COMMENT ON TABLE client_addresses IS 'Direcciones múltiples para clientes. Fase 1 del sistema multi-dirección.';
COMMENT ON COLUMN client_addresses.label IS 'Etiqueta: Vivienda Principal, Oficina, Segunda Residencia, Otro';
COMMENT ON COLUMN client_addresses.is_primary IS 'Solo una dirección por cliente puede ser principal (constraint único parcial)';

COMMIT;

-- ============================================================================
-- VALIDACIÓN POST-MIGRACIÓN (ejecutar después del COMMIT)
-- ============================================================================

SELECT 
    (SELECT COUNT(*) FROM profiles WHERE role = 'client') as total_clients,
    (SELECT COUNT(*) FROM profiles WHERE role = 'client' AND address IS NOT NULL AND address != '') as clients_with_address,
    (SELECT COUNT(*) FROM client_addresses) as migrated_addresses;

-- Verificar que todas las direcciones migradas son primarias
SELECT 
    COUNT(*) as addresses_marked_primary,
    COUNT(*) FILTER (WHERE is_primary = true) as should_equal_total
FROM client_addresses;
