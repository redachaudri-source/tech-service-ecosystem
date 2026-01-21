-- FIX: Ensure Technicians can update their tickets (including material status)
-- This fixes the issue where "Mark as Ordered" resets on refresh because the DB update was silently blocked.

-- 1. Create/Replace Policy for Technicians to UPDATE their assigned tickets
DROP POLICY IF EXISTS "Technicians can update assigned tickets" ON tickets;

CREATE POLICY "Technicians can update assigned tickets"
ON tickets FOR UPDATE
TO authenticated
USING ( 
  -- Tech can update if they are assigned to it
  technician_id = auth.uid() 
  -- OR if they are an admin (optional, usually covered by other policies, but good for safety)
  OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
)
WITH CHECK ( 
  -- Can only leave if they refer to themselves or don't change the tech
  technician_id = auth.uid()
  OR 
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- 2. Ensure columns exist (just in case)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS material_ordered boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS material_supplier text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS material_ordered_by uuid REFERENCES auth.users(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS material_status_at timestamptz;
