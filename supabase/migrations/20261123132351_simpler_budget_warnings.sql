-- MD 2026-11-23: warnings were hard to understand (percentages, rates) and some made no sense (diesel UNDER budget).
-- New rules: plain words in units; diesel only when over; cement over = cost, cement more than 10% under = quality
-- (weak blocks); breakage only when over; ignore small differences (< 2 bags, < 3 L, < 5 blocks). Naira value for APCL
-- materials; "client can charge" for client materials. Existing warnings re-checked under the new rules.

alter table public.production_sites
  add column if not exists cement_under_tolerance_pct numeric not null default 10,
  add column if not exists warn_min_cement_bags numeric not null default 2,
  add column if not exists warn_min_diesel_l numeric not null default 3,
  add column if not exists warn_min_breakage_blocks numeric not null default 5;

alter table public.production_exceptions
  add column if not exists message text,
  add column if not exists kind text,
  add column if not exists difference numeric,
  add column if not exists value_naira numeric,
  add column if not exists client_owned boolean not null default false;

create or replace function public.fn_fmt_qty(p numeric)
returns text language sql immutable as $$
  select case when p is null then '-' when p = round(p) then to_char(round(p), 'FM999,999,990')
              else to_char(round(p, 1), 'FM999,999,990.0') end
$$;

create or replace function public.fn_upsert_production_exception_v2(p_site uuid, p_date date, p_param text, p_blocks numeric,
  p_actual numeric, p_budget numeric, p_unit text, p_actual_rate numeric, p_budget_rate numeric, p_rate_unit text,
  p_tol numeric, p_under_tol numeric, p_min_abs numeric, p_over_only boolean, p_unit_cost numeric, p_client_owned boolean)
returns text language plpgsql security definer set search_path = public as $$
-- Returns the plain-words message when a line is newly raised or re-raised (the caller notifies once per day), else null.
declare e production_exceptions%rowtype; v_diff numeric; v_var numeric; v_dir text; v_breach boolean; v_kind text;
        v_value numeric; v_msg text; v_found boolean;
begin
  select * into e from production_exceptions where site_id = p_site and date = p_date and parameter = p_param for update;
  v_found := found;
  if p_budget is null or p_budget <= 0 or coalesce(p_blocks, 0) <= 0 then
    if v_found and e.status in ('open','explained') then
      update production_exceptions set status = 'resolved', updated_at = now() where id = e.id;
      insert into production_exception_comments (exception_id, kind, body) values (e.id, 'system', 'No longer applies (entry changed or removed).');
    end if;
    return null;
  end if;

  v_diff := round(p_actual - p_budget, 1);
  v_var := round((p_actual - p_budget) / p_budget * 100, 1);
  v_dir := case when p_actual > p_budget then 'over' else 'under' end;
  v_breach := case when v_diff > 0 then v_diff >= p_min_abs and v_var > p_tol
                   when v_diff < 0 and not p_over_only then (-v_diff) >= p_min_abs and abs(v_var) > p_under_tol
                   else false end;
  v_kind := case when v_diff < 0 then 'quality' else 'cost' end;
  v_value := case when v_diff > 0 and coalesce(p_unit_cost, 0) > 0 and not p_client_owned then round(v_diff * p_unit_cost) end;
  v_msg := case
    when p_param = 'cement' and v_diff > 0 then format('Cement: used %s bags for %s blocks. Allowed %s. %s bags too many.',
           fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks), fn_fmt_qty(p_budget), fn_fmt_qty(v_diff))
    when p_param = 'cement' then format('Cement: used %s bags for %s blocks. The mix needs %s. %s bags too few — check the blocks are strong.',
           fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks), fn_fmt_qty(p_budget), fn_fmt_qty(-v_diff))
    when p_param = 'diesel' then format('Diesel: used %s L for %s blocks. Allowed %s L. %s L too much.',
           fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks), fn_fmt_qty(p_budget), fn_fmt_qty(v_diff))
    else format('Broken blocks: %s of %s. Allowed %s. %s too many.',
           fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks), fn_fmt_qty(floor(p_budget)), fn_fmt_qty(p_actual - floor(p_budget))) end
    || case when v_value is not null then ' (₦' || to_char(v_value, 'FM999,999,990') || ')'
            when p_client_owned and v_diff > 0 and p_param <> 'breakage' then ' The client''s material — they can charge for it.'
            else '' end;

  if v_breach then
    if not v_found then
      insert into production_exceptions (site_id, date, parameter, blocks, actual_qty, budget_qty, unit, actual_rate, budget_rate,
                                         rate_unit, variance_pct, direction, tolerance_pct, message, kind, difference, value_naira, client_owned)
      values (p_site, p_date, p_param, p_blocks, p_actual, p_budget, p_unit, p_actual_rate, p_budget_rate, p_rate_unit, v_var, v_dir,
              case when v_diff < 0 then p_under_tol else p_tol end, v_msg, v_kind, v_diff, v_value, coalesce(p_client_owned, false));
      return v_msg;
    end if;
    update production_exceptions
       set blocks = p_blocks, actual_qty = p_actual, budget_qty = p_budget, unit = p_unit, actual_rate = p_actual_rate,
           budget_rate = p_budget_rate, rate_unit = p_rate_unit, variance_pct = v_var, direction = v_dir,
           tolerance_pct = case when v_diff < 0 then p_under_tol else p_tol end, message = v_msg, kind = v_kind, difference = v_diff,
           value_naira = v_value, client_owned = coalesce(p_client_owned, false),
           status = case when status = 'resolved' then 'open' else status end, updated_at = now()
     where id = e.id;
    return case when e.status = 'resolved' then v_msg end;
  elsif v_found then
    update production_exceptions
       set blocks = p_blocks, actual_qty = p_actual, budget_qty = p_budget, actual_rate = p_actual_rate, budget_rate = p_budget_rate,
           variance_pct = v_var, direction = v_dir, message = v_msg, kind = v_kind, difference = v_diff, value_naira = v_value,
           client_owned = coalesce(p_client_owned, false),
           status = case when status in ('open','explained') then 'resolved' else status end, updated_at = now()
     where id = e.id;
    if e.status in ('open','explained') then
      insert into production_exception_comments (exception_id, kind, body)
      values (e.id, 'system', case when current_setting('app.exception_rule_change', true) = 'on'
                                   then 'No longer flagged under the simpler warning rules of 23 Nov.'
                                   else 'Back within budget after a correction.' end);
    end if;
  end if;
  return null;
end $$;
revoke all on function public.fn_upsert_production_exception_v2(uuid,date,text,numeric,numeric,numeric,text,numeric,numeric,text,numeric,numeric,numeric,boolean,numeric,boolean) from public, anon, authenticated;

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

-- MD/ICO: close every explained warning (optionally one site) in one go.
create or replace function public.close_explained_exceptions(p_site_id uuid default null, p_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_name text; v_role text; v_n int;
begin
  if not has_any_role(array['md','ico']) then raise exception 'Only the MD or ICO can close warnings.'; end if;
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  with c as (
    update production_exceptions e set status = 'closed', closed_by_name = v_name, closed_at = now(),
           close_note = coalesce(nullif(btrim(p_note), ''), 'Closed with the other explained warnings.'), updated_at = now()
     where e.status = 'explained' and (p_site_id is null or e.site_id = p_site_id) and can_see_site(e.site_id)
    returning e.id)
  insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
  select id, 'closed', coalesce(nullif(btrim(p_note), ''), 'Closed with the other explained warnings.'), auth.uid(), v_name, v_role from c;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.close_explained_exceptions(uuid,text) from public, anon;
grant execute on function public.close_explained_exceptions(uuid,text) to authenticated;

-- Re-check every production day since 1 Nov at the client sites under the new rules, quietly.
do $$
declare r record;
begin
  perform set_config('app.exceptions_quiet', 'on', true);
  perform set_config('app.exception_rule_change', 'on', true);
  for r in select distinct pl.site_id, pl.date from production_log pl join production_sites s on s.id = pl.site_id
            where s.site_type = 'client_site' and pl.date >= date '2026-11-01' loop
    perform fn_recompute_production_exceptions(r.site_id, r.date);
  end loop;
  perform set_config('app.exceptions_quiet', 'off', true);
  perform set_config('app.exception_rule_change', 'off', true);
end $$;
