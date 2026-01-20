-- Add columns to track who ordered and received the material
ALTER TABLE "public"."tickets" 
ADD COLUMN "material_ordered_by" uuid REFERENCES "auth"."users"("id"),
ADD COLUMN "material_received_by" uuid REFERENCES "auth"."users"("id");

-- Optional: Add comments
COMMENT ON COLUMN "public"."tickets"."material_ordered_by" IS 'User ID of the person who marked the material as ordered';
COMMENT ON COLUMN "public"."tickets"."material_received_by" IS 'User ID of the person who marked the material as received';
