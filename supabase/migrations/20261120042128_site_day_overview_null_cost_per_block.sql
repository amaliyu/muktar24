-- Cost per block is unknown (null), not ₦0, when neither material cost nor labour has been recorded (e.g. Life Camp: client materials, no roster).
do $$
declare d text; a text := 'case when sum(blocks) > 0';
begin
  d := pg_get_functiondef('public.site_day_overview(uuid,date,date)'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 2 then raise exception 'site_day_overview: expected 2 cost-per-block expressions'; end if;
  d := replace(d, a, 'case when sum(blocks) > 0 and (sum(materials) is not null or sum(labour) is not null)');
  execute d;
end $$;
