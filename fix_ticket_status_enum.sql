-- Add missing values to the ticket_status enum
-- We cannot directly ALTER TYPE ... ADD VALUE inside a transaction block in some Postgres versions if inside a function/do block easily without auto-commit, 
-- but Supabase SQL editor handles singular statements well. 
-- However, to be safe and avoid "unsafe" errors if run in a transaction, we often have to run these one by one.

-- But typically in Supabase SQL editor:
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'presupuesto_pendiente';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'presupuesto_aceptado';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'presupuesto_rechazado';
