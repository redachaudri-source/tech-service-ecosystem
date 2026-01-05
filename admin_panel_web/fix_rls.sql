-- FIX RLS POLICIES FOR ADMIN
-- Run this in Supabase SQL Editor

-- 1. Ensure get_my_role works for everyone (checking auth.uid)
create or replace function public.get_my_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$ language sql security definer;

-- 2. Drop existing restrictive policies to avoid conflicts
drop policy if exists "Admins allow all profiles" on public.profiles;
drop policy if exists "Admins manage tickets" on public.tickets;
drop policy if exists "Admins manage inventory" on public.inventory;

-- 3. Re-create Admin policies with checking role OR simple overwrite for now
-- PROFILES
create policy "Admins full access profiles" on public.profiles
  for all using ( (select role from public.profiles where id = auth.uid() limit 1) = 'admin' );

-- TICKETS
create policy "Admins full access tickets" on public.tickets
  for all using ( (select role from public.profiles where id = auth.uid() limit 1) = 'admin' );

-- INVENTORY
create policy "Admins full access inventory" on public.inventory
  for all using ( (select role from public.profiles where id = auth.uid() limit 1) = 'admin' );

-- SERVICE PARTS
create policy "Admins full access service_parts" on public.service_parts
  for all using ( (select role from public.profiles where id = auth.uid() limit 1) = 'admin' );

-- WARRANTIES
create policy "Admins full access warranties" on public.warranties
  for all using ( (select role from public.profiles where id = auth.uid() limit 1) = 'admin' );

-- 4. Grant usage just in case
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
