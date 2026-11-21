-- Field test 21 Nov: every new worker was refused as "already registered as Ransom Osang". faceres embeddings are
-- non-negative, so cosine between different people is high: emulated-phone test with 13 synthetic faces gave
-- 0.28–0.73 for different people and ~0.97 for the same person on another "day". Threshold 0.6 → 0.85, plus a margin
-- rule (refuse to guess between two close workers), and scores shown in the messages for tuning.
alter table public.labour_face_profiles add column if not exists nearest_other_similarity double precision;
alter table public.face_match_settings add column if not exists min_margin double precision not null default 0.03;
update public.face_match_settings set min_similarity = 0.85 where model = 'human-faceres';

create or replace function public.enroll_worker_face(p_labour_id uuid, p_site_id uuid, p_descriptor double precision[], p_model text,
  p_photo_path text, p_consent boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_set face_match_settings%rowtype; v_name text; v_other text; v_sim double precision; v_worker text;
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
end $$;

create or replace function public.crew_check_in(p_site_id uuid, p_descriptor double precision[], p_model text, p_liveness double precision,
  p_lat double precision, p_lng double precision, p_accuracy_m double precision, p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_set face_match_settings%rowtype; v_d double precision; v_best uuid; v_sim double precision; v_second double precision;
        v_second_name text; v_worker text; v_name text; v_today date := lagos_today(); v_existing crew_check_ins%rowtype;
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) or not can_see_site(p_site_id) then
    raise exception 'Only the site manager can take the crew register.';
  end if;
  select * into v_set from face_match_settings where model = p_model;
  if not found then raise exception 'Unknown face model.'; end if;
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
end $$;
