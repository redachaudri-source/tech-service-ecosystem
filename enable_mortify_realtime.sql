-- FORCE ENABLE REALTIME FOR MORTIFY ASSESSMENTS

-- 1. Ensure the table is part of the realtime publication
-- (Supabase uses 'supabase_realtime' publication by default for the API)
BEGIN;
  -- Remove if exists to avoid duplication errors (although usually safe)
  -- ALTER PUBLICATION supabase_realtime DROP TABLE public.mortify_assessments;           

  -- Add it properly
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mortify_assessments;
COMMIT;

-- 2. Set Replica Identity to FULL to ensure updates trigger with full data
-- This is critical for UPDATE events to send the full 'new' and 'video' payload
ALTER TABLE public.mortify_assessments REPLICA IDENTITY FULL;

-- 3. Verify RLS allows it (just a fallback permissive policy for reading)
-- Sometimes strict RLS blocks the realtime subscription for non-owners if policies aren't perfect.
-- We add a policy that allows Authenticated users to just VIEW everything for now to rule out RLS blocking.
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.mortify_assessments;

CREATE POLICY "Enable read access for all authenticated users" ON public.mortify_assessments
FOR SELECT
TO authenticated
USING (true);

-- 4. Enable RLS (if not enabled)
ALTER TABLE public.mortify_assessments ENABLE ROW LEVEL SECURITY;
