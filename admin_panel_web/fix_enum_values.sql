-- Add 'asignado' status if it doesn't exist
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'asignado';

-- Add other statuses used by the Technician App
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'en_camino';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'en_diagnostico';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'en_reparacion';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'en_espera';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'cancelado';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'pagado';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'finalizado';

-- Note: 'solicitado' likely already exists, but for completeness:
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'solicitado';

-- Verify the new values
SELECT enum_range(NULL::ticket_status);
