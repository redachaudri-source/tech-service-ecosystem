-- Add created_by column to tickets to track who created it
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Add comment
COMMENT ON COLUMN tickets.created_by IS 'User ID of the admin/subadmin who created this ticket';
