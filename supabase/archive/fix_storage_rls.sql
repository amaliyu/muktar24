-- Create all storage buckets (public) if they don't exist
insert into storage.buckets (id, name, public)
values
  ('vehicle-documents',  'vehicle-documents',  true),
  ('lpo-documents',      'lpo-documents',      true),
  ('receipts',           'receipts',           true),
  ('supplier-documents', 'supplier-documents', true),
  ('staff-documents',    'staff-documents',    true)
on conflict (id) do update set public = true;

-- Drop any existing policies on storage.objects for these buckets
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'public_%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end$$;

-- Allow full public access (select / insert / update / delete) on all buckets
create policy "public_select"  on storage.objects for select  using (true);
create policy "public_insert"  on storage.objects for insert  with check (true);
create policy "public_update"  on storage.objects for update  using (true) with check (true);
create policy "public_delete"  on storage.objects for delete  using (true);
