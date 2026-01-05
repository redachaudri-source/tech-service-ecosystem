-- Add PDF columns to tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

-- Create Storage Bucket for Service Reports
INSERT INTO storage.buckets (id, name, public) 
VALUES ('service-reports', 'service-reports', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for service-reports breakdown
-- Using distinct names to avoid "policy already exists" errors

create policy "Allow authenticated uploads service_reports"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'service-reports' );

create policy "Allow public read access service_reports"
on storage.objects for select
to public
using ( bucket_id = 'service-reports' );

create policy "Allow authenticated updates service_reports"
on storage.objects for update
to authenticated
using ( bucket_id = 'service-reports' );
