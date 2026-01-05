-- Add appointment status tracking
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS appointment_status text DEFAULT 'pending' CHECK (appointment_status IN ('pending', 'confirmed', 'rejected', 'completed')),
ADD COLUMN IF NOT EXISTS client_feedback text;

-- Policy to allow clients to update their own ticket's appointment status
CREATE POLICY "Clients can update appointment status"
ON tickets
FOR UPDATE
TO authenticated
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);

-- Ensure techs can read these new fields (Policy "Technicians can view assigned tickets" typically covers SELECT *)
