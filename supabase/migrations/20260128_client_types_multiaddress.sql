-- ============================================================================
-- MIGRACIÓN: 3.3.8 Multi-Address + Client Types
-- Fecha: 2026-01-28
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Añadir client_type a profiles
-- ============================================================================

-- Primero crear el tipo ENUM
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_type_enum') THEN
        CREATE TYPE client_type_enum AS ENUM ('particular', 'professional');
    END IF;
END $$;

-- Añadir columna a profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS client_type client_type_enum DEFAULT 'particular';

-- Migrar clientes existentes a 'particular'
UPDATE profiles 
SET client_type = 'particular' 
WHERE role = 'client' AND client_type IS NULL;

COMMENT ON COLUMN profiles.client_type IS 
'Tipo de cliente: particular (max 3 dirs) o professional (max 15 dirs). Decisión permanente en registro.';

-- ============================================================================
-- PASO 2: Añadir campos a client_addresses
-- ============================================================================

-- last_used_at: para ordenar por más reciente
ALTER TABLE client_addresses 
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NOW();

-- address_order: orden de visualización
ALTER TABLE client_addresses 
ADD COLUMN IF NOT EXISTS address_order INT DEFAULT 1;

-- Actualizar direcciones existentes
UPDATE client_addresses 
SET last_used_at = COALESCE(updated_at, created_at, NOW()),
    address_order = 1
WHERE last_used_at IS NULL OR address_order IS NULL;

-- Índice para ordenar por uso reciente
CREATE INDEX IF NOT EXISTS idx_addresses_last_used 
ON client_addresses(client_id, last_used_at DESC);

-- ============================================================================
-- PASO 3: Crear tabla appliances (si no existe)
-- ============================================================================

CREATE TABLE IF NOT EXISTS appliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relación con cliente
    client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Relación con dirección (OPCIONAL)
    address_id UUID REFERENCES client_addresses(id) ON DELETE SET NULL,
    
    -- Datos del aparato
    type VARCHAR(100) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    purchase_year INT,
    
    -- Fotos (URLs)
    photo_front TEXT,
    photo_label TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Si la tabla ya existe, solo añadir address_id
ALTER TABLE appliances 
ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES client_addresses(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_appliances_client ON appliances(client_id);
CREATE INDEX IF NOT EXISTS idx_appliances_address ON appliances(address_id);
CREATE INDEX IF NOT EXISTS idx_appliances_type ON appliances(type);

-- RLS para appliances
ALTER TABLE appliances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view appliances" ON appliances;
CREATE POLICY "Authenticated users can view appliances" ON appliances
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert appliances" ON appliances;
CREATE POLICY "Authenticated users can insert appliances" ON appliances
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update appliances" ON appliances;
CREATE POLICY "Authenticated users can update appliances" ON appliances
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete appliances" ON appliances;
CREATE POLICY "Authenticated users can delete appliances" ON appliances
    FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================================
-- PASO 4: Función de validación de límite de direcciones
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_address_limit()
RETURNS TRIGGER AS $$
DECLARE
    client_type_val client_type_enum;
    current_count INT;
    max_allowed INT;
BEGIN
    -- Obtener tipo de cliente
    SELECT client_type INTO client_type_val
    FROM profiles
    WHERE id = NEW.client_id;
    
    -- Determinar límite
    IF client_type_val = 'professional' THEN
        max_allowed := 15;
    ELSE
        max_allowed := 3;
    END IF;
    
    -- Contar direcciones actuales (excluyendo la actual si es UPDATE)
    SELECT COUNT(*) INTO current_count
    FROM client_addresses
    WHERE client_id = NEW.client_id
      AND (TG_OP = 'INSERT' OR id != NEW.id);
    
    -- Validar límite
    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'Límite de direcciones alcanzado. Tipo: %, Máximo: %', 
            client_type_val, max_allowed;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para INSERT
DROP TRIGGER IF EXISTS trigger_validate_address_limit ON client_addresses;
CREATE TRIGGER trigger_validate_address_limit
    BEFORE INSERT ON client_addresses
    FOR EACH ROW
    EXECUTE FUNCTION validate_address_limit();

-- ============================================================================
-- PASO 5: Función para auto-asignar address_order
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_assign_address_order()
RETURNS TRIGGER AS $$
DECLARE
    next_order INT;
BEGIN
    -- Obtener siguiente número de orden
    SELECT COALESCE(MAX(address_order), 0) + 1 INTO next_order
    FROM client_addresses
    WHERE client_id = NEW.client_id;
    
    NEW.address_order := next_order;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_address_order ON client_addresses;
CREATE TRIGGER trigger_auto_address_order
    BEFORE INSERT ON client_addresses
    FOR EACH ROW
    WHEN (NEW.address_order IS NULL OR NEW.address_order = 1)
    EXECUTE FUNCTION auto_assign_address_order();

-- ============================================================================
-- PASO 6: Añadir address_id a tickets + Trigger last_used_at
-- ============================================================================

-- Añadir columna address_id a tickets
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES client_addresses(id) ON DELETE SET NULL;

-- Índice para tickets por dirección
CREATE INDEX IF NOT EXISTS idx_tickets_address ON tickets(address_id);

-- Función para actualizar last_used_at
CREATE OR REPLACE FUNCTION update_address_last_used()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE client_addresses
    SET last_used_at = NOW()
    WHERE id = NEW.address_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: al crear ticket, actualizar last_used_at de la dirección
DROP TRIGGER IF EXISTS trigger_update_address_usage ON tickets;
CREATE TRIGGER trigger_update_address_usage
    AFTER INSERT ON tickets
    FOR EACH ROW
    WHEN (NEW.address_id IS NOT NULL)
    EXECUTE FUNCTION update_address_last_used();

COMMIT;

-- ============================================================================
-- VALIDACIÓN POST-MIGRACIÓN
-- ============================================================================

SELECT 'Clientes con tipo' as check_name,
    COUNT(*) FILTER (WHERE client_type = 'particular') as particular,
    COUNT(*) FILTER (WHERE client_type = 'professional') as professional
FROM profiles WHERE role = 'client';

SELECT 'Direcciones con campos nuevos' as check_name,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE last_used_at IS NOT NULL) as with_last_used,
    COUNT(*) FILTER (WHERE address_order IS NOT NULL) as with_order
FROM client_addresses;
