INSERT INTO business_config (key, value)
VALUES (
    'working_hours', 
    '{
        "monday": {"start": "09:00", "end": "19:00"},
        "tuesday": {"start": "09:00", "end": "19:00"},
        "wednesday": {"start": "09:00", "end": "19:00"},
        "thursday": {"start": "09:00", "end": "19:00"},
        "friday": {"start": "09:00", "end": "15:00"},
        "saturday": null,
        "sunday": null
    }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
