-- FIX ADMIN VISIBILITY FOR MORTIFY
-- Ensures Admins can see ALL assessments and ALL appliances.1

-- 1. Grant Full Access to Admins on MORTIFY_ASSESSMENTS
CREATE POLICY "Admins can do everything on mortify_assessments" ON public.mortify_assessments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- 2. Grant Full Access to Admins on APPLIANCE_CATEGORY_DEFAULTS (for the new settings panel)
CREATE POLICY "Admins can edit category defaults" ON public.appliance_category_defaults
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- 3. Verify Client Appliances (Admin should already have access, but reinforcing)
-- If this policy already exists, valid. If not, this ensures safety.
CREATE POLICY "Admins can view all appliances" ON public.client_appliances
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
