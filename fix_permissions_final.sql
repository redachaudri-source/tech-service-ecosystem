-- NUCLEAR FIX FOR PERMISSIONS
-- Run this to guarantee the Admin Panel can see EVERYTHING.

BEGIN;

-- 1. APPLIANCES
ALTER TABLE public.client_appliances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can select all" ON public.client_appliances;
DROP POLICY IF EXISTS "Users can read own appliances" ON public.client_appliances;
CREATE POLICY "Admin View All Appliances" ON public.client_appliances FOR SELECT TO authenticated USING (true);

-- 2. BRANDS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read brands" ON public.brands;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT TO authenticated USING (true);

-- 3. TICKETS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin view all tickets" ON public.tickets;
CREATE POLICY "Admin view all tickets" ON public.tickets FOR SELECT TO authenticated USING (true);

-- 4. PROFILES (Clients)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin view all profiles" ON public.profiles;
CREATE POLICY "Admin view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);

COMMIT;
