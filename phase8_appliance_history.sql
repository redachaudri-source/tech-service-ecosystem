-- Phase 8: Client Appliance History & Intelligence
-- Links tickets to specific appliances for history tracking

-- 1. Add appliance_id to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS appliance_id UUID REFERENCES client_appliances(id) ON DELETE SET NULL;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_tickets_appliance_id ON tickets(appliance_id);
