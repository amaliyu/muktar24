-- A correctly computed faceres pattern has 504-718 components >= 0.02 and a largest value of 1.4-2.9 (102 test captures,
-- 17 faces, light/angle/blur variations). Ransom's phone-made pattern had 322 and 4.5. Refuse implausible patterns so a
-- broken phone engine can never store or match one again.
create or replace function public.fn_face_pattern_check(p_descriptor double precision[])
returns void language plpgsql immutable set search_path = public as $$
declare v_active int; v_max double precision;
begin
  select count(*) filter (where v >= 0.02), max(v) into v_active, v_max from unnest(p_descriptor) v;
  if coalesce(array_length(p_descriptor, 1), 0) <> 1024 or v_active < 380 or v_max > 4.0 then
    raise exception 'The face pattern from this phone looks wrong (% / %). Use "Check in without face" and tell the MD.',
      coalesce(v_active, 0), coalesce(round(v_max::numeric, 1), 0);
  end if;
end $$;

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

create or replace function public.fn_face_capture_ok(p_model text, p_descriptor double precision[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform fn_face_engine_ready(p_model);
  if coalesce(array_length(p_descriptor, 1), 0) < 64 then raise exception 'No face was captured. Try again in good light.'; end if;
  perform fn_face_pattern_check(p_descriptor);
end $$;
revoke all on function public.fn_face_capture_ok(text, double precision[]) from public, anon, authenticated;
revoke all on function public.fn_face_pattern_check(double precision[]) from public, anon, authenticated;

-- Swap the readiness call in both RPCs for the combined readiness + plausibility check (same signatures, bodies otherwise unchanged).
do $$
declare f text; def text;
begin
  foreach f in array array['enroll_worker_face(uuid,uuid,double precision[],text,text,boolean)',
                           'crew_check_in(uuid,double precision[],text,double precision,double precision,double precision,double precision,text)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('perform fn_face_engine_ready(p_model);' in def) = 0 then raise exception 'marker missing in %', f; end if;
    def := replace(def, 'perform fn_face_engine_ready(p_model);', 'perform fn_face_capture_ok(p_model, p_descriptor);');
    execute def;
  end loop;
end $$;
