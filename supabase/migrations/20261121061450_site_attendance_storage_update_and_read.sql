-- Re-registering a worker replaces the enrolment photo (upsert = update); register readers (accountant, logistics
-- manager) can open manual check-in photos for their sites.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'site_attendance_update') then
    create policy site_attendance_update on storage.objects for update to authenticated
      using (bucket_id = 'site-attendance'
             and has_any_role(array['md','production_manager','assistant_production_manager'])
             and (my_assigned_site() is null or (storage.foldername(name))[1] = my_assigned_site()::text))
      with check (bucket_id = 'site-attendance'
             and has_any_role(array['md','production_manager','assistant_production_manager'])
             and (my_assigned_site() is null or (storage.foldername(name))[1] = my_assigned_site()::text));
  end if;
end $$;

alter policy site_attendance_select on storage.objects
  using (bucket_id = 'site-attendance'
         and (has_any_role(array['md','ico','hr_officer'])
              or (has_any_role(array['production_manager','assistant_production_manager','logistics_manager','accountant'])
                  and (my_assigned_site() is null or (storage.foldername(name))[1] = my_assigned_site()::text))));
