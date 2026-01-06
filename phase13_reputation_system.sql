-- PHASE 13: REPUTATION & REVIEWS SYSTEM
-- -----------------------------------------------------------------------------
-- 1. Create Reviews Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES public.profiles(id),
    client_id UUID REFERENCES public.profiles(id), -- Optional: if client is a registered user
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    badges TEXT[] DEFAULT '{}', -- Array of tags: ['Puntual', 'Limpio', ...]
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Constraint: One review per ticket
    UNIQUE(ticket_id)
);

-- 2. Add Stats Columns to Profiles (for fast reading)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_services INTEGER DEFAULT 0; -- Count of successfully completed tickets

-- 3. RLS Policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Everyone can read reviews (Public transparency for assigned clients)
CREATE POLICY "Reviews are public read" ON public.reviews
    FOR SELECT USING (true);

-- Only creating a review is allowed if the Ticket is FINALIZED
-- (This logic handles via API usually, but good to have RLS if possible. 
--  However, easier to manage insert via standard authenticated users)
CREATE POLICY "Clients can create reviews" ON public.reviews
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon'); 
    -- 'anon' allowed for now since Client App might use anon key with RLS checks on ticket ownership

-- 4. Auto-Calculate Stats Trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_technician_stats()
RETURNS TRIGGER AS $$
DECLARE
    new_avg NUMERIC(3, 2);
    new_count INTEGER;
BEGIN
    -- Calculate new average and count for the technician
    SELECT 
        COALESCE(AVG(rating), 0), 
        COUNT(id)
    INTO 
        new_avg, 
        new_count
    FROM public.reviews
    WHERE technician_id = NEW.technician_id;

    -- Update the profile
    UPDATE public.profiles
    SET 
        avg_rating = new_avg,
        total_reviews = new_count
    WHERE id = NEW.technician_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_created
    AFTER INSERT ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_technician_stats();

-- 5. Helper Function to increment 'completed_services' on Ticket Completion
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_completed_services()
RETURNS TRIGGER AS $$
BEGIN
    -- If status changed to 'finalizado'
    IF NEW.status = 'finalizado' AND OLD.status != 'finalizado' THEN
        UPDATE public.profiles
        SET completed_services = completed_services + 1
        WHERE id = NEW.technician_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_ticket_completed
    AFTER UPDATE ON public.tickets
    FOR EACH ROW
    WHEN (NEW.status = 'finalizado' AND OLD.status != 'finalizado')
    EXECUTE FUNCTION public.increment_completed_services();
