-- Life Camp gets its own diesel yardsticks (MD 26 Nov, weekly standards review):
-- 12 L per production day (smaller generator; 20-24 Nov ran 6-12 L, 13 L on 17 Nov)
-- and 17 L per 1,000 blocks (its 19-25 Nov average). Replaces the 20 L per 1,000
-- borrowed from Kado, which never fired. The per-block figure is interim until
-- Life Camp's machine capacity is known (proper figure = daily litres / capacity).
update public.production_sites set diesel_l_per_day = 12
 where id = '00000000-0000-4000-8000-000000000003';
update public.site_block_standards set diesel_l_per_1000 = 17
 where site_id = '00000000-0000-4000-8000-000000000003';

do $f$
declare r record;
begin
  perform set_config('app.exceptions_quiet', 'on', true);
  perform set_config('app.exception_rule_note', 'No longer flagged: Life Camp diesel is now judged by 12 L a day and 17 L per 1,000 blocks (MD, 26 Nov).', true);
  for r in select distinct date from production_log where site_id = '00000000-0000-4000-8000-000000000003' order by date loop
    perform fn_recompute_production_exceptions('00000000-0000-4000-8000-000000000003', r.date);
  end loop;
  perform set_config('app.exception_rule_note', '', true);
  perform set_config('app.exceptions_quiet', 'off', true);
end $f$;
