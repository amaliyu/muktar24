-- attendance_punches.punch_type and verification_method are enums; add the phone-with-location method and cast properly.
alter type public.attendance_verification_method add value if not exists 'geo_mobile';

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
  if found and v_last.punch_type::text = p_punch_type and v_last.punch_time > now() - interval '5 minutes' then
    raise exception 'Already recorded a minute ago.';
  end if;
  insert into attendance_punches (staff_id, punch_time, punch_type, verification_method, device_source, recorded_by_user, lat, lng, accuracy_m, distance_m, site_id)
  values (v_staff, now(), p_punch_type::punch_direction, 'geo_mobile'::attendance_verification_method,
          'SITE_PHONE' || coalesce(':' || left(p_device_id, 40), ''), auth.uid(), p_lat, p_lng, p_accuracy_m, v_d, v_site)
  returning id into v_id;
  return jsonb_build_object('punch_id', v_id, 'punch_type', p_punch_type, 'distance_m', round(v_d::numeric), 'at', now());
end $$;
revoke all on function public.site_manager_clock(text,double precision,double precision,double precision,text) from public, anon;
grant execute on function public.site_manager_clock(text,double precision,double precision,double precision,text) to authenticated;
