-- MD 2026-11-25: "The real yardstick is 30 litres for 8hr production as budgeted" (Kado machine capacity 2,500-3,000
-- blocks/day). Diesel is a daily fixed burn, not per block, so a per-1,000-blocks standard flags every slow day.
-- Sites with diesel_l_per_day set are judged against that daily allowance instead.

alter table public.production_sites add column if not exists diesel_l_per_day numeric;
update public.production_sites set diesel_l_per_day = 30 where id = '00000000-0000-4000-8000-000000000002';

create or replace function public.fn_recompute_production_exceptions(p_site uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $function$
declare
  s_row production_sites%rowtype; v_blocks numeric; v_cement numeric; v_diesel numeric; v_bud_cement numeric; v_bud_diesel numeric;
  v_all_bpb boolean; v_all_dsl boolean; v_damaged numeric; v_new text[] := '{}'; s text; v_anchor uuid; v_title text; v_body text;
  v_cem_cost numeric; v_cem_client boolean; v_dsl_cost numeric; v_dsl_client boolean;
begin
  if p_site is null or p_date is null or not app_flag('production_variance_checks') then return; end if;
  select * into s_row from production_sites where id = p_site;

  select coalesce(sum(pl.quantity_produced), 0), coalesce(sum(pl.cement_bags), 0), coalesce(sum(pl.diesel_litres), 0),
         sum(pl.quantity_produced / nullif(sb.blocks_per_bag, 0)), sum(pl.quantity_produced * sb.diesel_l_per_1000 / 1000.0),
         coalesce(bool_and(sb.blocks_per_bag is not null), false), coalesce(bool_and(sb.diesel_l_per_1000 is not null), false)
    into v_blocks, v_cement, v_diesel, v_bud_cement, v_bud_diesel, v_all_bpb, v_all_dsl
    from production_log pl
    left join site_block_standards sb on sb.site_id = pl.site_id and sb.block_type = pl.block_type
   where pl.site_id = p_site and pl.date = p_date;

  if s_row.diesel_l_per_day is not null and v_blocks > 0 then
    v_bud_diesel := s_row.diesel_l_per_day;
    v_all_dsl := true;
  end if;

  select max(unit_cost), bool_or(owner = 'client') into v_cem_cost, v_cem_client from inventory_items where site_id = p_site and material = 'cement';
  select max(unit_cost), bool_or(owner = 'client') into v_dsl_cost, v_dsl_client from inventory_items where site_id = p_site and material = 'diesel';

  s := fn_upsert_production_exception_v2(p_site, p_date, 'cement', v_blocks, v_cement,
    case when v_all_bpb then round(v_bud_cement, 1) end, 'bags',
    case when v_cement > 0 then round(v_blocks / v_cement, 1) end,
    case when v_all_bpb and v_bud_cement > 0 then round(v_blocks / v_bud_cement, 1) end, 'blocks per bag',
    s_row.variance_tolerance_pct, s_row.cement_under_tolerance_pct, s_row.warn_min_cement_bags, false, v_cem_cost, coalesce(v_cem_client, false));
  if s is not null then v_new := v_new || s; end if;

  s := fn_upsert_production_exception_v2(p_site, p_date, 'diesel', v_blocks, v_diesel,
    case when v_all_dsl then round(v_bud_diesel, 1) end, 'litres',
    case when v_blocks > 0 then round(v_diesel / v_blocks * 1000, 1) end,
    case when v_all_dsl and v_blocks > 0 then round(v_bud_diesel / v_blocks * 1000, 1) end, 'L per 1,000 blocks',
    s_row.variance_tolerance_pct, null, s_row.warn_min_diesel_l, true, v_dsl_cost, coalesce(v_dsl_client, false));
  if s is not null then v_new := v_new || s; end if;

  select coalesce(sum(quantity_damaged), 0) into v_damaged
    from damage_log where site_id = p_site and date = p_date and stage in ('production','stacking');
  s := fn_upsert_production_exception_v2(p_site, p_date, 'breakage', v_blocks, v_damaged,
    round(v_blocks * s_row.breakage_budget_pct / 100.0, 2), 'blocks',
    case when v_blocks > 0 then round(v_damaged * 100.0 / v_blocks, 2) end, s_row.breakage_budget_pct, '% of blocks made',
    0, null, s_row.warn_min_breakage_blocks, true, null, false);
  if s is not null then v_new := v_new || s; end if;

  if coalesce(array_length(v_new, 1), 0) > 0 and current_setting('app.exceptions_quiet', true) is distinct from 'on' then
    select id into v_anchor from production_exceptions
     where site_id = p_site and date = p_date and status in ('open','explained')
     order by array_position(array['cement','diesel','breakage'], parameter) limit 1;
    v_title := 'Please explain: ' || s_row.name || ', ' || to_char(p_date, 'FMDD Mon');
    v_body := array_to_string(v_new, ' ') || ' Tap to explain.';
    perform fn_notify_site_users(p_site, 'action_required', v_title, v_body, 'production_exceptions', v_anchor);
    perform fn_notify_role('md', 'info', v_title, v_body, 'production_exceptions', v_anchor);
    perform fn_notify_role('ico', 'info', v_title, v_body, 'production_exceptions', v_anchor);
  end if;
end $function$;

-- Re-check every Kado production day quietly; note why any diesel line clears.
do $$
declare r record;
begin
  perform set_config('app.exceptions_quiet', 'on', true);
  perform set_config('app.exception_rule_change', 'on', true);
  for r in select distinct date from production_log where site_id = '00000000-0000-4000-8000-000000000002' and date >= date '2026-11-01' loop
    perform fn_recompute_production_exceptions('00000000-0000-4000-8000-000000000002', r.date);
  end loop;
  update production_exception_comments c set body = 'Cleared: Kado diesel is now judged against 30 L a day, not per 1,000 blocks (MD, 25 Nov).'
   where c.kind = 'system' and c.created_at = now() and c.body like 'No longer flagged%'
     and exists (select 1 from production_exceptions e where e.id = c.exception_id and e.parameter = 'diesel');
end $$;
