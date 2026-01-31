-- ============================================================================
-- UPGRADE: Duraciones de Servicio Configurables
-- Permite personalizar duraciones por tipo de servicio + electrodoméstico
-- ============================================================================

-- 1. ACTUALIZAR service_types con valores base correctos
UPDATE service_types SET estimated_duration_min = 30 WHERE name ILIKE '%diagnos%' OR name ILIKE '%revis%';
UPDATE service_types SET estimated_duration_min = 60 WHERE name ILIKE '%reparac%' AND name ILIKE '%estándar%';
UPDATE service_types SET estimated_duration_min = 240 WHERE name ILIKE '%instalac%' AND name ILIKE '%aire%';
UPDATE service_types SET estimated_duration_min = 120 WHERE name ILIKE '%instalac%' AND (name ILIKE '%caldera%' OR name ILIKE '%calentador%');
UPDATE service_types SET estimated_duration_min = 90 WHERE name ILIKE '%mantenim%';

-- 2. CREAR configuración de reglas de duración por electrodoméstico
-- Esto permite personalizar duraciones específicas sin hardcodear
INSERT INTO business_config (key, value) VALUES (
    'service_duration_rules',
    '{
        "default_duration": 60,
        "rules": [
            {
                "service_pattern": "diagnos|revision",
                "appliance_pattern": "*",
                "duration_min": 30,
                "label": "Diagnóstico (cualquier equipo)"
            },
            {
                "service_pattern": "reparac",
                "appliance_pattern": "frigo|nevera|refrigerador",
                "duration_min": 90,
                "label": "Reparación Frigorífico"
            },
            {
                "service_pattern": "reparac",
                "appliance_pattern": "calentador|termo|boiler",
                "duration_min": 90,
                "label": "Reparación Calentador/Termo"
            },
            {
                "service_pattern": "reparac",
                "appliance_pattern": "aire|acondicionado|split",
                "duration_min": 90,
                "label": "Reparación Aire Acondicionado"
            },
            {
                "service_pattern": "reparac",
                "appliance_pattern": "lavadora",
                "duration_min": 60,
                "label": "Reparación Lavadora"
            },
            {
                "service_pattern": "reparac",
                "appliance_pattern": "lavavajillas",
                "duration_min": 60,
                "label": "Reparación Lavavajillas"
            },
            {
                "service_pattern": "reparac",
                "appliance_pattern": "*",
                "duration_min": 60,
                "label": "Reparación Otros"
            },
            {
                "service_pattern": "instalac",
                "appliance_pattern": "aire|acondicionado|split",
                "duration_min": 240,
                "label": "Instalación Aire Acondicionado"
            },
            {
                "service_pattern": "instalac",
                "appliance_pattern": "calentador|termo|caldera",
                "duration_min": 120,
                "label": "Instalación Calentador/Caldera"
            },
            {
                "service_pattern": "instalac",
                "appliance_pattern": "*",
                "duration_min": 90,
                "label": "Instalación Otros"
            },
            {
                "service_pattern": "mantenim",
                "appliance_pattern": "*",
                "duration_min": 90,
                "label": "Mantenimiento"
            }
        ]
    }'::jsonb
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. NUEVA FUNCIÓN: Obtener duración desde configuración (NO hardcodeada)
CREATE OR REPLACE FUNCTION get_dynamic_service_duration(
    p_service_type TEXT,
    p_appliance_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
    config_json JSONB;
    rule JSONB;
    service_lower TEXT;
    appliance_lower TEXT;
BEGIN
    -- Normalizar inputs
    service_lower := LOWER(COALESCE(p_service_type, ''));
    appliance_lower := LOWER(COALESCE(p_appliance_type, ''));
    
    -- Obtener configuración
    SELECT value INTO config_json 
    FROM business_config 
    WHERE key = 'service_duration_rules';
    
    -- Si no hay config, usar default
    IF config_json IS NULL THEN
        RETURN 60;
    END IF;
    
    -- Buscar regla que coincida (orden importa: más específicas primero)
    FOR rule IN SELECT * FROM jsonb_array_elements(config_json->'rules')
    LOOP
        -- Verificar si el patrón de servicio coincide
        IF service_lower ~ (rule->>'service_pattern') THEN
            -- Verificar si el patrón de electrodoméstico coincide o es wildcard
            IF (rule->>'appliance_pattern') = '*' OR 
               appliance_lower ~ (rule->>'appliance_pattern') THEN
                RETURN (rule->>'duration_min')::INTEGER;
            END IF;
        END IF;
    END LOOP;
    
    -- Fallback al default
    RETURN COALESCE((config_json->>'default_duration')::INTEGER, 60);
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION get_dynamic_service_duration(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dynamic_service_duration(TEXT, TEXT) TO anon;

-- 5. VERIFICACIÓN
DO $$
BEGIN
    RAISE NOTICE '✅ service_types actualizado con valores base';
    RAISE NOTICE '✅ service_duration_rules configurado en business_config';
    RAISE NOTICE '✅ get_dynamic_service_duration() creada';
    RAISE NOTICE '';
    RAISE NOTICE '📊 TEST get_dynamic_service_duration:';
    RAISE NOTICE '  Diagnóstico + Lavadora = % min', get_dynamic_service_duration('Diagnóstico', 'Lavadora');
    RAISE NOTICE '  Reparación + Frigorífico = % min', get_dynamic_service_duration('Reparación', 'Frigorífico');
    RAISE NOTICE '  Reparación + Lavadora = % min', get_dynamic_service_duration('Reparación', 'Lavadora');
    RAISE NOTICE '  Reparación + Horno = % min', get_dynamic_service_duration('Reparación', 'Horno');
    RAISE NOTICE '  Instalación + Aire Acondicionado = % min', get_dynamic_service_duration('Instalación', 'Aire Acondicionado');
    RAISE NOTICE '  Instalación + Calentador = % min', get_dynamic_service_duration('Instalación', 'Calentador');
    RAISE NOTICE '  Mantenimiento + Cualquiera = % min', get_dynamic_service_duration('Mantenimiento', 'Otros');
END $$;

-- 6. MOSTRAR REGLAS CONFIGURADAS
SELECT 
    rule->>'label' as "Regla",
    rule->>'service_pattern' as "Patrón Servicio",
    rule->>'appliance_pattern' as "Patrón Electrodoméstico",
    (rule->>'duration_min')::int as "Duración (min)"
FROM business_config, jsonb_array_elements(value->'rules') as rule
WHERE key = 'service_duration_rules';
