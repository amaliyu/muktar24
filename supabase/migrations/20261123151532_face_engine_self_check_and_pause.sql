-- 23 Nov: two different workers were refused as "matches Ransom Osang (0.91 / 0.92)". Ransom's phone-made face pattern is
-- out of distribution (cosine 0.11-0.23 against correctly computed faceres patterns of any face, below the 0.39 median
-- between strangers), so the phone's WebGL engine is producing wrong numbers (same model in WebAssembly matches reference
-- 0.999). Fix: the app must self-check its face engine on a reference image before use and fall back to WebAssembly.
-- Until that app update (b18), face registration and face check-in are paused; manual check-in keeps working.

alter table public.face_match_settings
  add column if not exists retired boolean not null default false,
  add column if not exists engine_min_check double precision not null default 0.98;

insert into public.face_match_settings (model, min_similarity, min_liveness, duplicate_similarity, min_margin)
values ('human-faceres-v2', 0.85, 0.5, 0.9995, 0.03)
on conflict (model) do nothing;
update public.face_match_settings set retired = true where model = 'human-faceres';

-- Patterns made by the unchecked engine are not trusted: switch them off (kept for the record; the worker re-registers).
update public.labour_face_profiles set active = false where model = 'human-faceres' and active;

create table if not exists public.face_engine_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  user_name text,
  site_id uuid references public.production_sites(id),
  model text not null,
  backend text not null,
  score double precision,
  passed boolean not null,
  device_id text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.face_engine_checks enable row level security;
create policy face_engine_checks_read on public.face_engine_checks for select to authenticated
  using (has_any_role(array['md','ico']) or user_id = auth.uid());
revoke insert, update, delete on public.face_engine_checks from anon, authenticated;

create or replace function public.log_face_engine(p_site_id uuid, p_model text, p_backend text, p_score double precision,
  p_device_id text default null, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_set face_match_settings%rowtype; v_pass boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_set from face_match_settings where model = p_model;
  if not found then raise exception 'Unknown face model.'; end if;
  if coalesce(btrim(p_backend), '') = '' then raise exception 'Engine type missing.'; end if;
  v_pass := not v_set.retired and coalesce(p_score, 0) >= v_set.engine_min_check;
  insert into face_engine_checks (user_id, user_name, site_id, model, backend, score, passed, device_id, user_agent)
  values (auth.uid(), (select full_name from user_profiles where id = auth.uid()), p_site_id, p_model, btrim(p_backend),
          p_score, v_pass, left(p_device_id, 200), left(p_user_agent, 400));
  return jsonb_build_object('passed', v_pass, 'min', v_set.engine_min_check);
end $$;
revoke all on function public.log_face_engine(uuid,text,text,double precision,text,text) from public, anon;
grant execute on function public.log_face_engine(uuid,text,text,double precision,text,text) to authenticated;

create or replace function public.fn_face_engine_ready(p_model text)
returns void language plpgsql security definer set search_path = public as $$
declare v_set face_match_settings%rowtype;
begin
  select * into v_set from face_match_settings where model = p_model;
  if not found then raise exception 'Unknown face model.'; end if;
  if v_set.retired then
    raise exception 'Face check is paused until the app updates (a phone problem was found). Use "Check in without face" for now.';
  end if;
  if not exists (select 1 from face_engine_checks c where c.user_id = auth.uid() and c.model = p_model and c.passed
                  and c.created_at > now() - interval '12 hours') then
    raise exception 'The face engine on this phone has not passed its check. Close the register and open it again.';
  end if;
end $$;
revoke all on function public.fn_face_engine_ready(text) from public, anon, authenticated;

create or replace function public.enroll_worker_face(p_labour_id uuid, p_site_id uuid, p_descriptor double precision[], p_model text, p_photo_path text, p_consent boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_set face_match_settings%rowtype; v_name text; v_other text; v_sim double precision; v_worker text;
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) or not can_see_site(p_site_id) then
    raise exception 'Only the site manager or MD can register a worker''s face.';
  end if;
  if not coalesce(p_consent, false) then raise exception 'The worker must agree before their face is registered.'; end if;
  perform fn_face_engine_ready(p_model);
  select * into v_set from face_match_settings where model = p_model;
  if coalesce(array_length(p_descriptor, 1), 0) < 64 then raise exception 'No face was captured. Try again in good light.'; end if;
  if coalesce(btrim(p_photo_path), '') = '' then raise exception 'The registration photo is missing.'; end if;
  select full_name into v_worker from labour_pool where id = p_labour_id and coalesce(is_active, true);
  if v_worker is null then raise exception 'Worker not found or inactive.'; end if;
  select lp.full_name, fn_vec_cosine(f.descriptor, p_descriptor) into v_other, v_sim
    from labour_face_profiles f join labour_pool lp on lp.id = f.labour_id
   where f.active and f.model = p_model and f.labour_id <> p_labour_id
   order by fn_vec_cosine(f.descriptor, p_descriptor) desc nulls last limit 1;
  if v_other is not null and v_sim >= v_set.min_similarity then
    raise exception 'This face matches % (score %). One person, one registration — if this is a different person, retake in better light.',
      v_other, round(v_sim::numeric, 2);
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into labour_face_profiles (labour_id, site_id, model, descriptor, enrolment_photo_path, consent_given, consent_witness_name,
                                    enrolled_by, enrolled_by_name, nearest_other_similarity)
  values (p_labour_id, p_site_id, p_model, p_descriptor, btrim(p_photo_path), true, v_name, auth.uid(), v_name, v_sim)
  on conflict (labour_id) do update set site_id = excluded.site_id, model = excluded.model, descriptor = excluded.descriptor,
     enrolment_photo_path = excluded.enrolment_photo_path, consent_given = true, consent_witness_name = excluded.consent_witness_name,
     enrolled_by = excluded.enrolled_by, enrolled_by_name = excluded.enrolled_by_name, enrolled_at = now(), active = true,
     nearest_other_similarity = excluded.nearest_other_similarity;
end $function$;

create or replace function public.crew_check_in(p_site_id uuid, p_descriptor double precision[], p_model text, p_liveness double precision, p_lat double precision, p_lng double precision, p_accuracy_m double precision, p_device_id text default null::text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_set face_match_settings%rowtype; v_d double precision; v_best uuid; v_sim double precision; v_second double precision;
        v_second_name text; v_worker text; v_name text; v_today date := lagos_today(); v_existing crew_check_ins%rowtype;
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) or not can_see_site(p_site_id) then
    raise exception 'Only the site manager can take the crew register.';
  end if;
  perform fn_face_engine_ready(p_model);
  select * into v_set from face_match_settings where model = p_model;
  if coalesce(array_length(p_descriptor, 1), 0) < 64 then raise exception 'No face was captured. Try again in good light.'; end if;
  if coalesce(p_liveness, 0) < v_set.min_liveness then
    raise exception 'Live check failed (score %). Ask the worker to face the camera and move slightly.', round(coalesce(p_liveness, 0)::numeric, 2);
  end if;
  v_d := fn_site_geo_check(p_site_id, p_lat, p_lng, p_accuracy_m);
  if exists (select 1 from crew_check_ins c where c.site_id = p_site_id and c.descriptor is not null
               and c.check_date > v_today - 30 and fn_vec_cosine(c.descriptor, p_descriptor) >= v_set.duplicate_similarity) then
    raise exception 'This capture is identical to an earlier one. Take a fresh capture of the worker.';
  end if;
  with ranked as (
    select f.labour_id, fn_vec_cosine(f.descriptor, p_descriptor) sim,
           row_number() over (order by fn_vec_cosine(f.descriptor, p_descriptor) desc nulls last) rn
      from labour_face_profiles f where f.site_id = p_site_id and f.active and f.model = p_model)
  select (select labour_id from ranked where rn = 1), (select sim from ranked where rn = 1),
         (select sim from ranked where rn = 2), (select lp.full_name from ranked r join labour_pool lp on lp.id = r.labour_id where r.rn = 2)
    into v_best, v_sim, v_second, v_second_name;
  if v_best is null or v_sim < v_set.min_similarity then
    raise exception 'Face not recognised (closest score %). Register this worker first, or use a manual check-in with a reason.',
      coalesce(round(v_sim::numeric, 2)::text, '-');
  end if;
  select full_name into v_worker from labour_pool where id = v_best;
  if v_second is not null and v_second >= v_set.min_similarity and v_sim - v_second < v_set.min_margin then
    raise exception 'Too close to call between % and % (scores % / %). Retake facing the camera, or use a manual check-in.',
      v_worker, v_second_name, round(v_sim::numeric, 2), round(v_second::numeric, 2);
  end if;
  select * into v_existing from crew_check_ins where labour_id = v_best and check_date = v_today;
  if found then
    return jsonb_build_object('labour_id', v_best, 'name', v_worker, 'similarity', round(v_sim::numeric, 3), 'already', true, 'checked_at', v_existing.checked_at);
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into crew_check_ins (site_id, labour_id, check_date, method, similarity, liveness, descriptor, lat, lng, accuracy_m, distance_m, device_id, recorded_by, recorded_by_name)
  values (p_site_id, v_best, v_today, 'face', v_sim, p_liveness, p_descriptor, p_lat, p_lng, p_accuracy_m, v_d, p_device_id, auth.uid(), v_name);
  return jsonb_build_object('labour_id', v_best, 'name', v_worker, 'similarity', round(v_sim::numeric, 3), 'already', false, 'checked_at', now());
end $function$;
