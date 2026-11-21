-- The "every worker on the roster checked in" rule starts at a site only once its location is approved (attendance set up).
-- Until then wages can be recorded without check-ins, so daily pay is not blocked while the attendance screens roll out.
do $$
declare d text; old_s text := 'if exists (select 1 from daily_roster_entries e where e.roster_id = r.id
               and not exists';
begin
  d := pg_get_functiondef('public.pay_daily_roster(uuid,numeric,text,text,uuid,text)'::regprocedure);
  if position(old_s in d) = 0 then raise exception 'pay_daily_roster: check-in rule not found'; end if;
  d := replace(d, old_s, 'if s.geo_status = ''approved'' and exists (select 1 from daily_roster_entries e where e.roster_id = r.id
               and not exists');
  execute d;
end $$;
