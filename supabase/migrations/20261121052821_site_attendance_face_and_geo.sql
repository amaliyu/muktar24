-- MD 2026-11-21: site crews check in on the SITE MANAGER's phone (not all labourers have smartphones) using face
-- recognition — no daily photos — with the phone's location; site managers clock themselves in on their own phones with
-- a location stamp. Face matching is done on the server against templates enrolled once per worker (with consent).

-- 1. Site location (set on site by the site manager, approved by the MD) ------------------------------------------------
alter table public.production_sites
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision,
  add column if not exists geo_radius_m integer not null default 300,
  add column if not exists geo_status text not null default 'unset',
  add column if not exists geo_set_by_name text,
  add column if not exists geo_set_at timestamptz,
  add column if not exists geo_approved_by_name text,
  add column if not exists geo_approved_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_sites_geo_status_check') then
    alter table public.production_sites add constraint production_sites_geo_status_check check (geo_status in ('unset','pending','approved'));
  end if;
end $$;

create or replace function public.fn_geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function public.propose_site_location(p_site_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m double precision)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; s production_sites%rowtype;
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) or not can_see_site(p_site_id) then
    raise exception 'Only the site manager or MD can set the site location.';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Location not received. Turn on location and try again.'; end if;
  if coalesce(p_accuracy_m, 9999) > 50 then raise exception 'Location is not accurate enough (±% m). Stand in the open on site and try again.', round(coalesce(p_accuracy_m, 9999)); end if;
  select * into s from production_sites where id = p_site_id;
  select full_name into v_name from user_profiles where id = auth.uid();
  update production_sites set geo_lat = p_lat, geo_lng = p_lng,
         geo_status = case when has_any_role(array['md']) then 'approved' else 'pending' end,
         geo_set_by_name = v_name, geo_set_at = now(),
         geo_approved_by_name = case when has_any_role(array['md']) then v_name end,
         geo_approved_at = case when has_any_role(array['md']) then now() end
   where id = p_site_id;
  if not has_any_role(array['md']) then
    perform fn_notify_role('md', 'action_required', 'Approve the site location: ' || s.name,
      v_name || ' set the location from the site (±' || round(p_accuracy_m) || ' m). Check it on the map and approve it.', 'production_sites', p_site_id);
  end if;
end $$;

create or replace function public.approve_site_location(p_site_id uuid, p_approve boolean, p_radius_m integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not has_any_role(array['md']) then raise exception 'Only the MD can approve a site location.'; end if;
  if p_radius_m is not null and (p_radius_m < 50 or p_radius_m > 2000) then raise exception 'The radius must be between 50 and 2,000 metres.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  if p_approve then
    update production_sites set geo_status = 'approved', geo_approved_by_name = v_name, geo_approved_at = now(),
           geo_radius_m = coalesce(p_radius_m, geo_radius_m)
     where id = p_site_id and geo_lat is not null;
    if not found then raise exception 'No location has been set for this site yet.'; end if;
  else
    update production_sites set geo_status = 'unset', geo_lat = null, geo_lng = null, geo_approved_by_name = null, geo_approved_at = null
     where id = p_site_id;
  end if;
end $$;

-- Shared check used by every site clock-in.
create or replace function public.fn_site_geo_check(p_site_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m double precision)
returns double precision language plpgsql stable security definer set search_path = public as $$
declare s production_sites%rowtype; v_d double precision;
begin
  select * into s from production_sites where id = p_site_id;
  if not found then raise exception 'Site not found.'; end if;
  if s.geo_status <> 'approved' then raise exception 'The location of % is not approved yet. Set it from the site and ask the MD to approve it.', s.name; end if;
  if p_lat is null or p_lng is null then raise exception 'Location not received. Turn on location and try again.'; end if;
  if coalesce(p_accuracy_m, 9999) > 150 then raise exception 'Location is not accurate enough (±% m). Step into the open and try again.', round(coalesce(p_accuracy_m, 9999)); end if;
  v_d := fn_geo_distance_m(s.geo_lat, s.geo_lng, p_lat, p_lng);
  if v_d > s.geo_radius_m then raise exception 'You are % m from %. Clock-in only works on site.', round(v_d), s.name; end if;
  return v_d;
end $$;

-- 2. Photo storage (enrolment photos and manual check-in evidence only) ---------------------------------------------------
insert into storage.buckets (id, name, public) values ('site-attendance', 'site-attendance', false) on conflict (id) do nothing;
drop policy if exists site_attendance_insert on storage.objects;
create policy site_attendance_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-attendance'
              and has_any_role(array['md','production_manager','assistant_production_manager'])
              and (my_assigned_site() is null or (storage.foldername(name))[1] = my_assigned_site()::text));
drop policy if exists site_attendance_select on storage.objects;
create policy site_attendance_select on storage.objects for select to authenticated
  using (bucket_id = 'site-attendance'
         and (has_any_role(array['md','ico','hr_officer'])
              or (has_any_role(array['production_manager','assistant_production_manager'])
                  and (my_assigned_site() is null or (storage.foldername(name))[1] = my_assigned_site()::text))));

-- 3. Face matching settings and vector maths ------------------------------------------------------------------------------
create table if not exists public.face_match_settings (
  model text primary key,
  min_similarity double precision not null,
  min_liveness double precision not null default 0.5,
  duplicate_similarity double precision not null default 0.9995
);
insert into public.face_match_settings (model, min_similarity, min_liveness) values ('human-faceres', 0.6, 0.5) on conflict (model) do nothing;
alter table public.face_match_settings enable row level security;
drop policy if exists face_match_settings_read on public.face_match_settings;
create policy face_match_settings_read on public.face_match_settings for select to authenticated using (true);

create or replace function public.fn_vec_cosine(a double precision[], b double precision[])
returns double precision language sql immutable as $$
  select case when a is null or b is null or array_length(a, 1) is distinct from array_length(b, 1) then null
              else sum(x * y) / nullif(sqrt(sum(x * x)) * sqrt(sum(y * y)), 0) end
    from unnest(a, b) as t(x, y)
$$;

-- 4. Enrolled faces (one per worker, with consent) ------------------------------------------------------------------------
create table if not exists public.labour_face_profiles (
  labour_id uuid primary key references public.labour_pool(id),
  site_id uuid not null references public.production_sites(id),
  model text not null references public.face_match_settings(model),
  descriptor double precision[] not null,
  enrolment_photo_path text not null,
  consent_given boolean not null check (consent_given),
  consent_witness_name text,
  enrolled_by uuid references public.user_profiles(id),
  enrolled_by_name text,
  enrolled_at timestamptz not null default now(),
  active boolean not null default true
);
alter table public.labour_face_profiles enable row level security;
drop policy if exists labour_face_profiles_select on public.labour_face_profiles;
create policy labour_face_profiles_select on public.labour_face_profiles for select to authenticated
  using (can_see_site(site_id) and has_any_role(array['md','ico','hr_officer','production_manager','assistant_production_manager']));

create or replace function public.enroll_worker_face(p_labour_id uuid, p_site_id uuid, p_descriptor double precision[], p_model text,
  p_photo_path text, p_consent boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_set face_match_settings%rowtype; v_name text; v_other text; v_worker text;
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) or not can_see_site(p_site_id) then
    raise exception 'Only the site manager or MD can register a worker''s face.';
  end if;
  if not coalesce(p_consent, false) then raise exception 'The worker must agree before their face is registered.'; end if;
  select * into v_set from face_match_settings where model = p_model;
  if not found then raise exception 'Unknown face model.'; end if;
  if coalesce(array_length(p_descriptor, 1), 0) < 64 then raise exception 'No face was captured. Try again in good light.'; end if;
  if coalesce(btrim(p_photo_path), '') = '' then raise exception 'The registration photo is missing.'; end if;
  select full_name into v_worker from labour_pool where id = p_labour_id and coalesce(is_active, true);
  if v_worker is null then raise exception 'Worker not found or inactive.'; end if;
  select lp.full_name into v_other from labour_face_profiles f join labour_pool lp on lp.id = f.labour_id
   where f.active and f.model = p_model and f.labour_id <> p_labour_id and fn_vec_cosine(f.descriptor, p_descriptor) >= v_set.min_similarity
   order by fn_vec_cosine(f.descriptor, p_descriptor) desc limit 1;
  if v_other is not null then raise exception 'This face is already registered as %. One person, one registration.', v_other; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into labour_face_profiles (labour_id, site_id, model, descriptor, enrolment_photo_path, consent_given, consent_witness_name, enrolled_by, enrolled_by_name)
  values (p_labour_id, p_site_id, p_model, p_descriptor, btrim(p_photo_path), true, v_name, auth.uid(), v_name)
  on conflict (labour_id) do update set site_id = excluded.site_id, model = excluded.model, descriptor = excluded.descriptor,
     enrolment_photo_path = excluded.enrolment_photo_path, consent_given = true, consent_witness_name = excluded.consent_witness_name,
     enrolled_by = excluded.enrolled_by, enrolled_by_name = excluded.enrolled_by_name, enrolled_at = now(), active = true;
end $$;

-- 5. Daily crew register ---------------------------------------------------------------------------------------------------
create table if not exists public.crew_check_ins (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  labour_id uuid not null references public.labour_pool(id),
  check_date date not null,
  checked_at timestamptz not null default now(),
  method text not null check (method in ('face','manual')),
  similarity double precision,
  liveness double precision,
  descriptor double precision[],
  lat double precision, lng double precision, accuracy_m double precision, distance_m double precision,
  device_id text,
  manual_reason text,
  manual_photo_path text,
  recorded_by uuid references public.user_profiles(id),
  recorded_by_name text,
  constraint crew_check_ins_one_per_day unique (labour_id, check_date),
  constraint crew_check_ins_manual_evidence check (method <> 'manual' or (length(btrim(coalesce(manual_reason, ''))) >= 10 and manual_photo_path is not null))
);
create index if not exists crew_check_ins_site_day on public.crew_check_ins (site_id, check_date);
alter table public.crew_check_ins enable row level security;
drop policy if exists crew_check_ins_select on public.crew_check_ins;
create policy crew_check_ins_select on public.crew_check_ins for select to authenticated
  using (can_see_site(site_id) and has_any_role(array['md','ico','hr_officer','accountant','production_manager','assistant_production_manager','logistics_manager']));

create or replace function public.crew_check_in(p_site_id uuid, p_descriptor double precision[], p_model text, p_liveness double precision,
  p_lat double precision, p_lng double precision, p_accuracy_m double precision, p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_set face_match_settings%rowtype; v_d double precision; v_best uuid; v_sim double precision; v_worker text; v_name text;
        v_today date := lagos_today(); v_existing crew_check_ins%rowtype;
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) or not can_see_site(p_site_id) then
    raise exception 'Only the site manager can take the crew register.';
  end if;
  select * into v_set from face_match_settings where model = p_model;
  if not found then raise exception 'Unknown face model.'; end if;
  if coalesce(array_length(p_descriptor, 1), 0) < 64 then raise exception 'No face was captured. Try again in good light.'; end if;
  if coalesce(p_liveness, 0) < v_set.min_liveness then raise exception 'Live check failed. Ask the worker to face the camera and move slightly.'; end if;
  v_d := fn_site_geo_check(p_site_id, p_lat, p_lng, p_accuracy_m);
  -- The same capture replayed is refused: real captures always differ a little.
  if exists (select 1 from crew_check_ins c where c.site_id = p_site_id and c.descriptor is not null
               and c.check_date > v_today - 30 and fn_vec_cosine(c.descriptor, p_descriptor) >= v_set.duplicate_similarity) then
    raise exception 'This capture is identical to an earlier one. Take a fresh capture of the worker.';
  end if;
  select f.labour_id, fn_vec_cosine(f.descriptor, p_descriptor) into v_best, v_sim
    from labour_face_profiles f where f.site_id = p_site_id and f.active and f.model = p_model
   order by fn_vec_cosine(f.descriptor, p_descriptor) desc nulls last limit 1;
  if v_best is null or v_sim < v_set.min_similarity then
    raise exception 'Face not recognised. Register this worker first, or use a manual check-in with a reason.';
  end if;
  select full_name into v_worker from labour_pool where id = v_best;
  select * into v_existing from crew_check_ins where labour_id = v_best and check_date = v_today;
  if found then
    return jsonb_build_object('labour_id', v_best, 'name', v_worker, 'similarity', round(v_sim::numeric, 3), 'already', true, 'checked_at', v_existing.checked_at);
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into crew_check_ins (site_id, labour_id, check_date, method, similarity, liveness, descriptor, lat, lng, accuracy_m, distance_m, device_id, recorded_by, recorded_by_name)
  values (p_site_id, v_best, v_today, 'face', v_sim, p_liveness, p_descriptor, p_lat, p_lng, p_accuracy_m, v_d, p_device_id, auth.uid(), v_name);
  return jsonb_build_object('labour_id', v_best, 'name', v_worker, 'similarity', round(v_sim::numeric, 3), 'already', false, 'checked_at', now());
end $$;

create or replace function public.crew_check_in_manual(p_site_id uuid, p_labour_id uuid, p_reason text, p_photo_path text,
  p_lat double precision, p_lng double precision, p_accuracy_m double precision, p_device_id text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_d double precision; v_worker text; v_name text; v_site text; v_today date := lagos_today();
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) or not can_see_site(p_site_id) then
    raise exception 'Only the site manager can take the crew register.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Say why the face check did not work (at least 10 characters).'; end if;
  if coalesce(btrim(p_photo_path), '') = '' then raise exception 'Take a photo of the worker for a manual check-in.'; end if;
  select full_name into v_worker from labour_pool where id = p_labour_id and coalesce(is_active, true);
  if v_worker is null then raise exception 'Worker not found or inactive.'; end if;
  v_d := fn_site_geo_check(p_site_id, p_lat, p_lng, p_accuracy_m);
  if exists (select 1 from crew_check_ins where labour_id = p_labour_id and check_date = v_today) then
    raise exception '% is already checked in today.', v_worker;
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  select name into v_site from production_sites where id = p_site_id;
  insert into crew_check_ins (site_id, labour_id, check_date, method, lat, lng, accuracy_m, distance_m, device_id, manual_reason, manual_photo_path, recorded_by, recorded_by_name)
  values (p_site_id, p_labour_id, v_today, 'manual', p_lat, p_lng, p_accuracy_m, v_d, p_device_id, btrim(p_reason), btrim(p_photo_path), auth.uid(), v_name);
  perform fn_notify_role('md', 'info', 'Manual check-in at ' || v_site, v_worker || ' — ' || btrim(p_reason) || ' (by ' || coalesce(v_name, '-') || ').', 'crew_check_ins', p_site_id);
end $$;

create or replace function public.site_crew_register(p_site_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_roster uuid;
begin
  if not can_see_site(p_site_id) or not has_any_role(array['md','ico','hr_officer','accountant','production_manager','assistant_production_manager','logistics_manager']) then
    raise exception 'Not allowed for this site.' using errcode = '42501';
  end if;
  select id into v_roster from daily_roster where site_id = p_site_id and roster_date = p_date;
  return jsonb_build_object(
    'site_id', p_site_id, 'date', p_date, 'roster_id', v_roster,
    'check_ins', coalesce((select jsonb_agg(jsonb_build_object('labour_id', c.labour_id, 'name', lp.full_name, 'checked_at', c.checked_at,
          'method', c.method, 'similarity', round(c.similarity::numeric, 3), 'distance_m', round(c.distance_m::numeric),
          'manual_reason', c.manual_reason, 'manual_photo_path', c.manual_photo_path, 'recorded_by_name', c.recorded_by_name,
          'on_roster', exists (select 1 from daily_roster_entries e where e.roster_id = v_roster and e.labour_id = c.labour_id)) order by c.checked_at)
        from crew_check_ins c join labour_pool lp on lp.id = c.labour_id where c.site_id = p_site_id and c.check_date = p_date), '[]'::jsonb),
    'on_roster_not_checked_in', coalesce((select jsonb_agg(jsonb_build_object('labour_id', e.labour_id, 'name', lp.full_name))
        from daily_roster_entries e join labour_pool lp on lp.id = e.labour_id
       where e.roster_id = v_roster and not exists (select 1 from crew_check_ins c where c.labour_id = e.labour_id and c.check_date = p_date)), '[]'::jsonb),
    'registered_faces', (select count(*) from labour_face_profiles f where f.site_id = p_site_id and f.active));
end $$;

-- Face templates from check-ins are kept 30 days (replay check), then cleared.
create or replace function public.purge_old_check_in_descriptors()
returns int language sql security definer set search_path = public as $$
  with u as (update crew_check_ins set descriptor = null where descriptor is not null and check_date < lagos_today() - 30 returning 1)
  select count(*)::int from u
$$;
select cron.schedule('purge-check-in-descriptors', '40 2 * * *', 'select public.purge_old_check_in_descriptors()');

-- 6. Daily wages need a check-in for every worker on the roster -----------------------------------------------------------
do $$
declare d text; anchor text := 'v_md := has_any_role(array[''md'']);';
begin
  d := pg_get_functiondef('public.pay_daily_roster(uuid,numeric,text,text,uuid,text)'::regprocedure);
  if position(anchor in d) = 0 then raise exception 'pay_daily_roster: anchor not found'; end if;
  d := replace(d, anchor, anchor || '
  if exists (select 1 from daily_roster_entries e where e.roster_id = r.id
               and not exists (select 1 from crew_check_ins c where c.labour_id = e.labour_id and c.check_date = r.roster_date)) then
    raise exception ''Not everyone on this roster checked in on %: %. Remove them from the roster or check them in first.'',
      to_char(r.roster_date, ''FMDD Mon''),
      (select string_agg(lp.full_name, '', '') from daily_roster_entries e join labour_pool lp on lp.id = e.labour_id
        where e.roster_id = r.id and not exists (select 1 from crew_check_ins c where c.labour_id = e.labour_id and c.check_date = r.roster_date));
  end if;');
  execute d;
end $$;

-- 7. Site managers clock themselves in on their own phones ---------------------------------------------------------------
alter table public.attendance_punches
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists accuracy_m double precision,
  add column if not exists distance_m double precision,
  add column if not exists site_id uuid references public.production_sites(id);

create or replace function public.site_manager_clock(p_punch_type text, p_lat double precision, p_lng double precision,
  p_accuracy_m double precision, p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_staff uuid; v_site uuid; v_d double precision; v_last attendance_punches%rowtype; v_id uuid;
begin
  if p_punch_type not in ('IN','OUT') then raise exception 'Choose clock in or clock out.'; end if;
  select staff_id, assigned_site_id into v_staff, v_site from user_profiles where id = auth.uid();
  if v_staff is null then raise exception 'Your login is not linked to a staff record. Ask HR.'; end if;
  if v_site is null then raise exception 'Clock-in from your phone is only for site staff.'; end if;
  v_d := fn_site_geo_check(v_site, p_lat, p_lng, p_accuracy_m);
  select * into v_last from attendance_punches where staff_id = v_staff order by punch_time desc limit 1;
  if found and v_last.punch_type = p_punch_type and v_last.punch_time > now() - interval '5 minutes' then
    raise exception 'Already recorded a minute ago.';
  end if;
  insert into attendance_punches (staff_id, punch_time, punch_type, verification_method, device_source, recorded_by_user, lat, lng, accuracy_m, distance_m, site_id)
  values (v_staff, now(), p_punch_type, 'geo_mobile', 'SITE_PHONE' || coalesce(':' || left(p_device_id, 40), ''), auth.uid(), p_lat, p_lng, p_accuracy_m, v_d, v_site)
  returning id into v_id;
  return jsonb_build_object('punch_id', v_id, 'punch_type', p_punch_type, 'distance_m', round(v_d::numeric), 'at', now());
end $$;

revoke all on function public.fn_geo_distance_m(double precision,double precision,double precision,double precision),
  public.fn_site_geo_check(uuid,double precision,double precision,double precision), public.fn_vec_cosine(double precision[],double precision[]),
  public.purge_old_check_in_descriptors() from public, anon, authenticated;
revoke all on function public.propose_site_location(uuid,double precision,double precision,double precision), public.approve_site_location(uuid,boolean,integer),
  public.enroll_worker_face(uuid,uuid,double precision[],text,text,boolean),
  public.crew_check_in(uuid,double precision[],text,double precision,double precision,double precision,double precision,text),
  public.crew_check_in_manual(uuid,uuid,text,text,double precision,double precision,double precision,text),
  public.site_crew_register(uuid,date), public.site_manager_clock(text,double precision,double precision,double precision,text) from public, anon;
grant execute on function public.propose_site_location(uuid,double precision,double precision,double precision), public.approve_site_location(uuid,boolean,integer),
  public.enroll_worker_face(uuid,uuid,double precision[],text,text,boolean),
  public.crew_check_in(uuid,double precision[],text,double precision,double precision,double precision,double precision,text),
  public.crew_check_in_manual(uuid,uuid,text,text,double precision,double precision,double precision,text),
  public.site_crew_register(uuid,date), public.site_manager_clock(text,double precision,double precision,double precision,text) to authenticated;
