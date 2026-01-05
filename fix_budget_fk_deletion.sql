-- Fix Foreign Key on budgets table to allow ticket deletion
-- If a ticket is deleted, the budget should remain but the converted_ticket_id should be NULL

ALTER TABLE budgets
DROP CONSTRAINT IF EXISTS budgets_converted_ticket_id_fkey;

ALTER TABLE budgets
ADD CONSTRAINT budgets_converted_ticket_id_fkey
FOREIGN KEY (converted_ticket_id)
REFERENCES tickets(id)
ON DELETE SET NULL;
