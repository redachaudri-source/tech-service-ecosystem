-- DIAGRNOSTICO PRECISO: Valores Válidos para 'role'

-- 1. Ver qué valores acepta EXACTAMENTE la columna 'role' (Si es Enum)
SELECT 
  c.table_name, 
  c.column_name, 
  c.udt_name as nombre_tipo_dato, 
  e.enumlabel as VALOR_ACEPTADO
FROM information_schema.columns c
LEFT JOIN pg_type t ON t.typname = c.udt_name
LEFT JOIN pg_enum e ON t.oid = e.enumtypid
WHERE c.table_name = 'profiles' AND c.column_name = 'role';

-- 2. Ver si es Texto con reglas (Check Constraints)
SELECT substring(check_clause from 'role.*IN.*') as reglas_encontradas
FROM information_schema.check_constraints cc
JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
WHERE ccu.table_name = 'profiles' AND ccu.column_name = 'role';
