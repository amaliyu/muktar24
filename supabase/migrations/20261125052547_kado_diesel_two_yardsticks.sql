-- MD 2026-11-25: diesel is judged by two yardsticks: 30 L per 8-hour day, AND by blocks produced (30 L should make
-- 2,500-3,000 blocks => 12 L per 1,000 blocks, using the 2,500 low end). Allowed diesel for a day = the lower of the two.
update public.site_block_standards set diesel_l_per_1000 = 12 where site_id = '00000000-0000-4000-8000-000000000002';

create or replace function public.fn_recompute_production_exceptions(p_site uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $function$
declare
  s_row production_sites%rowtype; v_blocks numeric; v_cement numeric; v_diesel numeric; v_bud_cement numeric; v_bud_diesel numeric;
  v_all_bpb boolean; v_all_dsl boolean; v_damaged numeric; v_new text[] := '{}'; s text; v_anchor uuid; v_title text; v_body text;
  v_cem_cost numeric; v_cem_client boolean; v_dsl_cost numeric; v_dsl_client boolean; v_dsl_unit text := 'L per 1,000 blocks';
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

  -- Daily cap: the allowance is the lower of the per-block budget and the daily allowance.
  if s_row.diesel_l_per_day is not null and v_blocks > 0 then
    if not v_all_dsl or v_bud_diesel is null or s_row.diesel_l_per_day < v_bud_diesel then
      v_bud_diesel := s_row.diesel_l_per_day; v_dsl_unit := 'L per day';
    end if;
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
    case when v_all_dsl and v_blocks > 0 then
      case when v_dsl_unit = 'L per day' then round(v_bud_diesel, 1) else round(v_bud_diesel / v_blocks * 1000, 1) end end,
    v_dsl_unit, s_row.variance_tolerance_pct, null, s_row.warn_min_diesel_l, true, v_dsl_cost, coalesce(v_dsl_client, false));
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

-- Diesel wording: say which yardstick set the allowance.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fn_upsert_production_exception_v2(uuid,date,text,numeric,numeric,numeric,text,numeric,numeric,text,numeric,numeric,numeric,boolean,numeric,boolean)'::regprocedure);
  if position($m$when p_param = 'diesel' then format(' Allowed %s L. %s L too much.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))$m$ in def) = 0 then
    raise exception 'diesel wording marker missing';
  end if;
  def := replace(def,
    $m$when p_param = 'diesel' then format(' Allowed %s L. %s L too much.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))$m$,
    $m$when p_param = 'diesel' and p_rate_unit = 'L per day' then format(' Daily allowance %s L. %s L too much.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))
    when p_param = 'diesel' then format(' At %s L per 1,000 blocks that output needs %s L. %s L too much — too few blocks for the diesel used.',
           fn_fmt_qty(p_budget_rate), fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))$m$);
  execute def;
end $$;

-- Re-check Kado: diesel lines that come back keep their earlier status (explained stays explained) and get a note.
do $$
declare r record; v_before jsonb;
begin
  select coalesce(jsonb_object_agg(id::text, status), '{}') into v_before
    from production_exceptions e where e.site_id = '00000000-0000-4000-8000-000000000002' and e.parameter = 'diesel'
     and exists (select 1 from production_exception_comments c where c.exception_id = e.id and c.kind = 'system'
                  and c.body like 'Cleared: Kado diesel is now judged against 30 L a day%');
  perform set_config('app.exceptions_quiet', 'on', true);
  perform set_config('app.exception_rule_change', 'on', true);
  for r in select distinct date from production_log where site_id = '00000000-0000-4000-8000-000000000002' and date >= date '2026-11-01' loop
    perform fn_recompute_production_exceptions('00000000-0000-4000-8000-000000000002', r.date);
  end loop;
  -- Lines cleared earlier today come back as explained (Umar had explained them); add a note.
  update production_exceptions e set status = 'explained'
   where v_before ? e.id::text and e.status = 'open';
  insert into production_exception_comments (exception_id, kind, body)
  select e.id, 'system', 'Re-flagged: diesel is judged by two yardsticks — 30 L a day and 12 L per 1,000 blocks (MD, 25 Nov).'
    from production_exceptions e
   where e.site_id = '00000000-0000-4000-8000-000000000002' and e.parameter = 'diesel' and e.status in ('open','explained')
     and e.updated_at = now();
  update production_exception_comments c set body = 'Cleared: within both diesel yardsticks (30 L a day, 12 L per 1,000 blocks).'
   where c.kind = 'system' and c.created_at = now() and c.body like 'No longer flagged%'
     and exists (select 1 from production_exceptions e where e.id = c.exception_id and e.parameter = 'diesel');
end $$;
