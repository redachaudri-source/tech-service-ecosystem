-- Check columns for V7 logic
SELECT column_name, table_name 
FROM information_schema.columns 
WHERE table_name IN ('client_appliances', 'mortify_brand_scores', 'appliance_category_defaults');
