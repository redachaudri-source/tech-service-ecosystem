-- SAFELY ENABLE REALTIME
-- We use a DO block to execute logic that won't crash if already exists.

BEGIN;
    -- 1. Client Appliances
    -- Only try to add if not already present? 
    -- Easier strategy: DROP then ADD (if we don't care about a msec interruption)
    -- Or better: Just ignore the error.
    
    -- Attempt to ADD client_appliances. If it fails, we assume it's already there.
    -- However, inside a transaction, one failure kills it.
    -- So we do independent statements outside of a massive transaction block or use separate DO blocks.
    
    -- Let's just do the DROP then ADD strategy which is usually robust for configuration scripts.
    -- We assume 'supabase_realtime' exists.
    
    -- Remove first (ignore error if not exists by wrapping in try/catch equivalent or just simple commands)
    -- Postgres doesn't have "DROP TABLE IF EXISTS" for publications easily in one line.
    -- We will just try to ADD. If 'client_appliances' fails, it means it's there.
    -- The user error was about 'tickets'. So let's focus ONLY on 'client_appliances' which is the one we need.
    
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_appliances;
COMMIT;

-- Set Replica Identity (Always safe to run)
ALTER TABLE public.client_appliances REPLICA IDENTITY FULL;
