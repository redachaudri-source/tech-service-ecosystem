-- Ensure all material-related columns exist
-- This script is safe to run multiple times (idempotent updates)

DO $$ 
BEGIN 
    -- 1. Ensure 'material_ordered' exists (Boolean)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'material_ordered') THEN
        ALTER TABLE "public"."tickets" ADD COLUMN "material_ordered" boolean DEFAULT false;
    END IF;

    -- 2. Ensure 'material_received' exists (Boolean)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'material_received') THEN
        ALTER TABLE "public"."tickets" ADD COLUMN "material_received" boolean DEFAULT false;
    END IF;

    -- 3. Ensure 'material_supplier' exists (Text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'material_supplier') THEN
        ALTER TABLE "public"."tickets" ADD COLUMN "material_supplier" text;
    END IF;

    -- 4. Ensure 'material_status_at' exists (Timestamp)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'material_status_at') THEN
        ALTER TABLE "public"."tickets" ADD COLUMN "material_status_at" timestamptz;
    END IF;

    -- 5. Ensure 'material_ordered_by' exists (UUID)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'material_ordered_by') THEN
        ALTER TABLE "public"."tickets" ADD COLUMN "material_ordered_by" uuid REFERENCES "auth"."users"("id");
    END IF;

    -- 6. Ensure 'material_received_by' exists (UUID)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'material_received_by') THEN
        ALTER TABLE "public"."tickets" ADD COLUMN "material_received_by" uuid REFERENCES "auth"."users"("id");
    END IF;

END $$;

-- Reload the schema cache for PostgREST (Important for Supabase)
NOTIFY pgrst, 'reload config';
