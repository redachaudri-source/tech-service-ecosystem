-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Bot PRO Processing Lock System
-- Adds processing_started_at for optimistic locking + improved indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add processing_started_at column for optimistic locking
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN tickets.processing_started_at IS 'Timestamp when bot started processing this ticket (lock mechanism)';

-- 2. Index for finding tickets ready to process (status + no proposal + no lock)
CREATE INDEX IF NOT EXISTS idx_tickets_pending_pro_processing 
ON tickets(status, created_at) 
WHERE status = 'solicitado' 
  AND pro_proposal IS NULL 
  AND processing_started_at IS NULL;

-- 3. Index for finding stale locks
CREATE INDEX IF NOT EXISTS idx_tickets_processing_lock
ON tickets(processing_started_at) 
WHERE processing_started_at IS NOT NULL;

-- 4. Add pro_selection_strategy to business_config if not exists
INSERT INTO business_config (key, value) VALUES
('pro_selection_strategy', '"balanced"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Function to clean stale processing locks (>5 minutes)
CREATE OR REPLACE FUNCTION clean_stale_processing_locks()
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER := 0;
BEGIN
    UPDATE tickets
    SET processing_started_at = NULL
    WHERE processing_started_at IS NOT NULL
      AND processing_started_at < NOW() - INTERVAL '5 minutes'
      AND pro_proposal IS NULL;
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to mark timed-out proposals
CREATE OR REPLACE FUNCTION mark_expired_proposals()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER := 0;
BEGIN
    -- Find proposals where created_at + 3 minutes < NOW()
    UPDATE tickets
    SET 
        status = 'timeout',
        pro_proposal = pro_proposal || jsonb_build_object('status', 'expired', 'expired_at', NOW()::text)
    WHERE 
        status = 'solicitado'
        AND pro_proposal IS NOT NULL
        AND pro_proposal->>'status' = 'waiting_selection'
        AND (pro_proposal->>'created_at')::timestamptz < NOW() - INTERVAL '3 minutes';
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Grant permissions
GRANT EXECUTE ON FUNCTION clean_stale_processing_locks TO authenticated;
GRANT EXECUTE ON FUNCTION clean_stale_processing_locks TO service_role;
GRANT EXECUTE ON FUNCTION mark_expired_proposals TO authenticated;
GRANT EXECUTE ON FUNCTION mark_expired_proposals TO service_role;
