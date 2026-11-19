-- A breakdown day joins an open downtime record only if that downtime started on or before the day.
do $$
declare d text; old_s text := 'select id into v_dt from downtime_log where asset_id = v_asset and end_time is null order by start_time desc limit 1;';
begin
  d := pg_get_functiondef('public.record_site_day_status(uuid,date,text,text,boolean,text[],text,text)'::regprocedure);
  if position(old_s in d) = 0 then raise exception 'record_site_day_status: expected line not found'; end if;
  d := replace(d, old_s, 'select id into v_dt from downtime_log where asset_id = v_asset and end_time is null and (start_time at time zone ''Africa/Lagos'')::date <= p_on_date order by start_time desc limit 1;');
  execute d;
end $$;
