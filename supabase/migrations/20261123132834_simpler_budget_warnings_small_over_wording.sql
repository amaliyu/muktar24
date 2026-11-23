-- A small over that is ignored says so ("Only 2 over — too small to flag.") instead of "Within limits.".
create or replace function public.fn_upsert_production_exception_v2(p_site uuid, p_date date, p_param text, p_blocks numeric,
  p_actual numeric, p_budget numeric, p_unit text, p_actual_rate numeric, p_budget_rate numeric, p_rate_unit text,
  p_tol numeric, p_under_tol numeric, p_min_abs numeric, p_over_only boolean, p_unit_cost numeric, p_client_owned boolean)
returns text language plpgsql security definer set search_path = public as $$
declare e production_exceptions%rowtype; v_allowed numeric; v_diff numeric; v_var numeric; v_dir text; v_breach boolean;
        v_kind text; v_value numeric; v_msg text; v_head text; v_u text; v_found boolean;
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

  v_allowed := case when p_param = 'breakage' then floor(p_budget) else p_budget end;
  v_diff := round(p_actual - v_allowed, 1);
  v_var := round((p_actual - p_budget) / p_budget * 100, 1);
  v_dir := case when p_actual > p_budget then 'over' else 'under' end;
  v_breach := case when v_diff > 0 then v_diff >= p_min_abs and v_var > p_tol
                   when v_diff < 0 and not p_over_only then (-v_diff) >= p_min_abs and abs(v_var) > p_under_tol
                   else false end;
  v_kind := case when not v_breach then null when v_diff > 0 then 'cost' else 'quality' end;
  v_value := case when v_breach and v_diff > 0 and coalesce(p_unit_cost, 0) > 0 and not p_client_owned then round(v_diff * p_unit_cost) end;
  v_u := case p_param when 'cement' then ' bags' when 'diesel' then ' L' else '' end;

  v_head := case p_param
    when 'cement' then format('Cement: used %s bags for %s blocks.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks))
    when 'diesel' then format('Diesel: used %s L for %s blocks.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks))
    else format('Broken blocks: %s of %s.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks)) end;
  v_msg := v_head || case
    when not v_breach and v_diff > 0 then format(' Allowed %s%s. Only %s%s over — too small to flag.',
           fn_fmt_qty(v_allowed), case when p_param = 'diesel' then ' L' else '' end, fn_fmt_qty(v_diff), v_u)
    when not v_breach then format(' Allowed %s%s. Within limits.', fn_fmt_qty(v_allowed), case when p_param = 'diesel' then ' L' else '' end)
    when p_param = 'cement' and v_diff > 0 then format(' Allowed %s. %s bags too many.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))
    when p_param = 'cement' then format(' The mix needs %s. %s bags too few — check the blocks are strong.', fn_fmt_qty(v_allowed), fn_fmt_qty(-v_diff))
    when p_param = 'diesel' then format(' Allowed %s L. %s L too much.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))
    else format(' Allowed %s. %s too many.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff)) end
    || case when v_value is not null then ' (₦' || to_char(v_value, 'FM999,999,990') || ')'
            when v_breach and p_client_owned and v_diff > 0 and p_param <> 'breakage' then ' The client''s material — they can charge for it.'
            else '' end;

  if v_breach then
    if not v_found then
      insert into production_exceptions (site_id, date, parameter, blocks, actual_qty, budget_qty, unit, actual_rate, budget_rate,
                                         rate_unit, variance_pct, direction, tolerance_pct, message, kind, difference, value_naira, client_owned)
      values (p_site, p_date, p_param, p_blocks, p_actual, v_allowed, p_unit, p_actual_rate, p_budget_rate, p_rate_unit, v_var, v_dir,
              case when v_diff < 0 then p_under_tol else p_tol end, v_msg, v_kind, v_diff, v_value, coalesce(p_client_owned, false));
      return v_msg;
    end if;
    update production_exceptions
       set blocks = p_blocks, actual_qty = p_actual, budget_qty = v_allowed, unit = p_unit, actual_rate = p_actual_rate,
           budget_rate = p_budget_rate, rate_unit = p_rate_unit, variance_pct = v_var, direction = v_dir,
           tolerance_pct = case when v_diff < 0 then p_under_tol else p_tol end, message = v_msg, kind = v_kind, difference = v_diff,
           value_naira = v_value, client_owned = coalesce(p_client_owned, false),
           status = case when status = 'resolved' then 'open' else status end, updated_at = now()
     where id = e.id;
    return case when e.status = 'resolved' then v_msg end;
  elsif v_found then
    update production_exceptions
       set blocks = p_blocks, actual_qty = p_actual, budget_qty = v_allowed, actual_rate = p_actual_rate, budget_rate = p_budget_rate,
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

do $$
declare r record;
begin
  perform set_config('app.exceptions_quiet', 'on', true);
  perform set_config('app.exception_rule_change', 'on', true);
  for r in select distinct pl.site_id, pl.date from production_log pl join production_sites s on s.id = pl.site_id
            where s.site_type = 'client_site' and pl.date >= date '2026-11-01' loop
    perform fn_recompute_production_exceptions(r.site_id, r.date);
  end loop;
end $$;
