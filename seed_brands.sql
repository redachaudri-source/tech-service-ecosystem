-- SEED COMMON BRANDS
-- Populates the dropdown with common market brands (Default Score 2 - Standard)

INSERT INTO mortify_brand_scores (brand_name, score_points, created_at, updated_at)
VALUES 
('AEG', 3, NOW(), NOW()),
('BALAY', 3, NOW(), NOW()),
('BEKO', 2, NOW(), NOW()),
('BOSCH', 3, NOW(), NOW()),
('CANDY', 1, NOW(), NOW()),
('DAEWOO', 2, NOW(), NOW()),
('EDESA', 2, NOW(), NOW()),
('ELECTROLUX', 3, NOW(), NOW()),
('FAGOR', 2, NOW(), NOW()),
('HAIER', 2, NOW(), NOW()),
('HISENSE', 2, NOW(), NOW()),
('HOOVER', 2, NOW(), NOW()),
('HOTPOINT', 2, NOW(), NOW()),
('INDESIT', 1, NOW(), NOW()),
('LG', 3, NOW(), NOW()),
('LIEBHERR', 4, NOW(), NOW()), -- Premium
('MIELE', 4, NOW(), NOW()),    -- Premium
('OTSEIN', 2, NOW(), NOW()),
('PANASONIC', 3, NOW(), NOW()),
('SAMSUNG', 3, NOW(), NOW()),
('SIEMENS', 3, NOW(), NOW()),
('SMEG', 4, NOW(), NOW()),     -- Premium
('TEKA', 2, NOW(), NOW()),
('WHIRLPOOL', 2, NOW(), NOW()),
('ZANUSSI', 2, NOW(), NOW())
ON CONFLICT (brand_name) DO NOTHING;
