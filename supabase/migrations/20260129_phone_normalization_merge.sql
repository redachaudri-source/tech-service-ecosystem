-- ============================================================================
-- MIGRACIÓN: Phone Normalization + Client Merge System
-- Fecha: 2026-01-29
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Función de normalización de teléfono
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
DECLARE
    clean TEXT;
BEGIN
    IF phone IS NULL OR phone = '' THEN
        RETURN NULL;
    END IF;
    
    -- Quitar todo excepto dígitos
    clean := regexp_replace(phone, '\D', '', 'g');
    
    -- Quitar prefijo 34 si tiene más de 9 dígitos
    IF length(clean) > 9 AND clean LIKE '34%' THEN
        clean := substring(clean from 3);
    END IF;
    
    -- Validar que tenga 9 dígitos (España)
    IF length(clean) != 9 THEN
        RETURN clean; -- Devolver sin modificar si no es válido
    END IF;
    
    RETURN clean;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_phone IS 
'Normaliza teléfono a formato estándar de 9 dígitos (España). Quita espacios, guiones y prefijo +34.';

-- ============================================================================
-- PASO 2: Trigger para normalizar teléfonos al insertar/actualizar
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_phone_before_save()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_phone(NEW.phone);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a profiles
DROP TRIGGER IF EXISTS trigger_normalize_phone_profiles ON profiles;
CREATE TRIGGER trigger_normalize_phone_profiles
    BEFORE INSERT OR UPDATE OF phone ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION normalize_phone_before_save();

-- ============================================================================
-- PASO 3: Normalizar teléfonos existentes
-- ============================================================================

UPDATE profiles 
SET phone = normalize_phone(phone) 
WHERE phone IS NOT NULL 
  AND phone != normalize_phone(phone);

-- ============================================================================
-- PASO 4: Función para fusionar clientes duplicados
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_clients(
    source_id UUID,
    target_id UUID
) RETURNS JSONB AS $$
DECLARE
    tickets_moved INT := 0;
    appliances_moved INT := 0;
    addresses_moved INT := 0;
    source_name TEXT;
    target_name TEXT;
BEGIN
    -- Validar que ambos IDs existen
    SELECT full_name INTO source_name FROM profiles WHERE id = source_id;
    SELECT full_name INTO target_name FROM profiles WHERE id = target_id;
    
    IF source_name IS NULL THEN
        RAISE EXCEPTION 'Cliente origen (%) no existe', source_id;
    END IF;
    
    IF target_name IS NULL THEN
        RAISE EXCEPTION 'Cliente destino (%) no existe', target_id;
    END IF;
    
    IF source_id = target_id THEN
        RAISE EXCEPTION 'No se puede fusionar un cliente consigo mismo';
    END IF;

    -- 1. Mover tickets del origen al destino
    UPDATE tickets 
    SET client_id = target_id 
    WHERE client_id = source_id;
    GET DIAGNOSTICS tickets_moved = ROW_COUNT;
    
    -- 2. Mover appliances
    UPDATE appliances 
    SET client_id = target_id 
    WHERE client_id = source_id;
    GET DIAGNOSTICS appliances_moved = ROW_COUNT;
    
    -- 3. Mover direcciones (evitar duplicados por label)
    UPDATE client_addresses ca_source
    SET client_id = target_id
    WHERE ca_source.client_id = source_id
      AND NOT EXISTS (
          SELECT 1 FROM client_addresses ca_target
          WHERE ca_target.client_id = target_id
            AND ca_target.address_line = ca_source.address_line
      );
    GET DIAGNOSTICS addresses_moved = ROW_COUNT;
    
    -- 4. Eliminar direcciones duplicadas que quedaron
    DELETE FROM client_addresses WHERE client_id = source_id;
    
    -- 5. Eliminar perfil origen
    DELETE FROM profiles WHERE id = source_id;
    
    -- Retornar resumen
    RETURN jsonb_build_object(
        'success', true,
        'merged', jsonb_build_object(
            'source_id', source_id,
            'source_name', source_name,
            'target_id', target_id,
            'target_name', target_name
        ),
        'moved', jsonb_build_object(
            'tickets', tickets_moved,
            'appliances', appliances_moved,
            'addresses', addresses_moved
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION merge_clients IS 
'Fusiona cliente origen en destino: mueve tickets, appliances y addresses, luego elimina origen.';

-- ============================================================================
-- PASO 5: Vista para detectar duplicados
-- ============================================================================

CREATE OR REPLACE VIEW v_duplicate_phones AS
SELECT 
    normalize_phone(phone) as normalized_phone,
    COUNT(*) as count,
    array_agg(id) as profile_ids,
    array_agg(full_name) as names,
    array_agg(created_at ORDER BY created_at) as created_dates
FROM profiles 
WHERE role = 'client' 
  AND phone IS NOT NULL
GROUP BY normalize_phone(phone)
HAVING COUNT(*) > 1
ORDER BY count DESC, normalized_phone;

COMMENT ON VIEW v_duplicate_phones IS 
'Muestra teléfonos duplicados para revisión manual.';

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

SELECT 'Duplicados encontrados:' as check_name, COUNT(*) as total 
FROM v_duplicate_phones;

SELECT * FROM v_duplicate_phones LIMIT 10;
