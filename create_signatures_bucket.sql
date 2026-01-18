-- Create 'signatures' bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', true)
on conflict (id) do nothing;

-- Enable RLS
alter table storage.objects enable row level security;

-- Policy: Allow public read access to signatures (so they can be embedded in PDFs etc)
create policy "Public Access Signatures"
on storage.objects for select
using ( bucket_id = 'signatures' );

-- Policy: Allow authenticated users (techs) to upload
create policy "Tech Upload Signatures"
on storage.objects for insert
with check ( bucket_id = 'signatures' AND auth.role() = 'authenticated' );

-- Policy: Allow authenticated users to update/delete (optional, but good for retries)
create policy "Tech Update Signatures"
on storage.objects for update
using ( bucket_id = 'signatures' AND auth.role() = 'authenticated' );
