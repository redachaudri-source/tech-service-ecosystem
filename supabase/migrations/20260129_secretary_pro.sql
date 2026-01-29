-- Secretaria Virtual PRO - Configuration Migration
-- Features 3.3.9, 3.3.10, 3.3.11, 3.3.12

-- Secretary Mode: 'basic' | 'pro' (only one active at a time)
INSERT INTO business_config (key, value)
VALUES ('secretary_mode', '"basic"')
ON CONFLICT (key) DO NOTHING;

-- Bot Active Days: array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
-- Default: Monday to Friday
INSERT INTO business_config (key, value)
VALUES ('bot_active_days', '[1, 2, 3, 4, 5]')
ON CONFLICT (key) DO NOTHING;

-- PRO Mode Configuration
INSERT INTO business_config (key, value)
VALUES ('pro_config', '{
  "slots_count": 3,
  "timeout_minutes": 3,
  "search_days": 7,
  "channels": {
    "whatsapp": true,
    "app": true
  }
}')
ON CONFLICT (key) DO NOTHING;
