-- Applied to production 2026-11-19 by the planning chat (recorded here afterwards). MD approved 2026-11-19.
-- Verified with rolled-back tests as Abubakar / MD / ICO: a day with cement and diesel out sent ONE notification per person
-- listing both; explain / ask / close changed every line of that day; breakage added later sent one more note (breakage only).

-- MD 2026-11-19: one budget warning per site per day. Lines stay per parameter (cement / diesel / breakage) for the
-- numbers, but notifications go out once per site-day and explain / ask / close act on the whole day.

drop function if exists public.fn_upsert_production_exception(uuid,date,text,numeric,numeric,numeric,text,numeric,numeric,text,numeric,boolean);
create function public.fn_upsert_production_exception(
  p_site uuid, p_date date, p_param text, p_blocks numeric, p_actual numeric, p_budget numeric, p_unit text,
  p_actual_rate numeric, p_budget_rate numeric, p_rate_unit text, p_tol numeric, p_over_only boolean)
returns text language plpgsql security definer set search_path = public as $$
-- Returns a one-line summary when the line is newly raised or re-raised (caller notifies once per day), else null.
declare e production_exceptions%rowtype; v_var numeric; v_dir text; v_breach boolean; v_summary text;
begin
  select * into e from production_exceptions where site_id = p_site and date = p_date and parameter = p_param for update;

  if p_budget is null or p_budget <= 0 or coalesce(p_blocks, 0) <= 0 then
    if found and e.status = 'open' then
      update production_exceptions set status = 'resolved', updated_at = now() where id = e.id;
      insert into production_exception_comments (exception_id, kind, body) values (e.id, 'system', 'No longer applies (entry changed or removed).');
    end if;
    return null;
  end if;

  v_var := round((p_actual - p_budget) / p_budget * 100, 1);
  v_dir := case when p_actual > p_budget then 'over' else 'under' end;
  v_breach := case when p_over_only then v_var > 0 and p_actual_rate > p_budget_rate else abs(v_var) > p_tol end;
  v_summary := case p_param
    when 'cement' then format('Cement %s%s%% (%s per bag vs %s)', case when v_var > 0 then '+' else '' end, v_var, p_actual_rate, p_budget_rate)
    when 'diesel' then format('Diesel %s%s%% (%s vs %s L per 1,000)', case when v_var > 0 then '+' else '' end, v_var, p_actual_rate, p_budget_rate)
    else format('Breakage %s%% (%s of %s blocks; %s%% allowed)', p_actual_rate, p_actual, p_blocks, p_budget_rate) end;

  if v_breach then
    if not found then
      insert into production_exceptions (site_id, date, parameter, blocks, actual_qty, budget_qty, unit, actual_rate, budget_rate,
                                         rate_unit, variance_pct, direction, tolerance_pct)
      values (p_site, p_date, p_param, p_blocks, p_actual, p_budget, p_unit, p_actual_rate, p_budget_rate, p_rate_unit, v_var, v_dir, p_tol);
      return v_summary;
    end if;
    update production_exceptions
       set blocks = p_blocks, actual_qty = p_actual, budget_qty = p_budget, unit = p_unit, actual_rate = p_actual_rate,
           budget_rate = p_budget_rate, rate_unit = p_rate_unit, variance_pct = v_var, direction = v_dir, tolerance_pct = p_tol,
           status = case when status = 'resolved' then 'open' else status end, updated_at = now()
     where id = e.id;
    return case when e.status = 'resolved' then v_summary end;
  elsif found then
    update production_exceptions
       set blocks = p_blocks, actual_qty = p_actual, budget_qty = p_budget, actual_rate = p_actual_rate, budget_rate = p_budget_rate,
           variance_pct = v_var, direction = v_dir,
           status = case when status = 'open' then 'resolved' else status end, updated_at = now()
     where id = e.id;
    if e.status = 'open' then
      insert into production_exception_comments (exception_id, kind, body) values (e.id, 'system', 'Back within budget after a correction.');
    end if;
  end if;
  return null;
end $$;
revoke all on function public.fn_upsert_production_exception(uuid,date,text,numeric,numeric,numeric,text,numeric,numeric,text,numeric,boolean) from public, anon, authenticated;

create or replace function public.fn_recompute_production_exceptions(p_site uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tol numeric; v_brk numeric; v_blocks numeric; v_cement numeric; v_diesel numeric; v_bud_cement numeric; v_bud_diesel numeric;
  v_all_bpb boolean; v_all_dsl boolean; v_damaged numeric; v_new text[] := '{}'; s text; v_anchor uuid; v_site text; v_title text; v_body text;
begin
  if p_site is null or p_date is null or not app_flag('production_variance_checks') then return; end if;
  select variance_tolerance_pct, breakage_budget_pct, name into v_tol, v_brk, v_site from production_sites where id = p_site;

  select coalesce(sum(pl.quantity_produced), 0), coalesce(sum(pl.cement_bags), 0), coalesce(sum(pl.diesel_litres), 0),
         sum(pl.quantity_produced / nullif(sb.blocks_per_bag, 0)), sum(pl.quantity_produced * sb.diesel_l_per_1000 / 1000.0),
         coalesce(bool_and(sb.blocks_per_bag is not null), false), coalesce(bool_and(sb.diesel_l_per_1000 is not null), false)
    into v_blocks, v_cement, v_diesel, v_bud_cement, v_bud_diesel, v_all_bpb, v_all_dsl
    from production_log pl
    left join site_block_standards sb on sb.site_id = pl.site_id and sb.block_type = pl.block_type
   where pl.site_id = p_site and pl.date = p_date;

  s := fn_upsert_production_exception(p_site, p_date, 'cement', v_blocks, v_cement,
    case when v_all_bpb then round(v_bud_cement, 2) end, 'bags',
    case when v_cement > 0 then round(v_blocks / v_cement, 1) end,
    case when v_all_bpb and v_bud_cement > 0 then round(v_blocks / v_bud_cement, 1) end, 'blocks per bag', v_tol, false);
  if s is not null then v_new := v_new || s; end if;

  s := fn_upsert_production_exception(p_site, p_date, 'diesel', v_blocks, v_diesel,
    case when v_all_dsl then round(v_bud_diesel, 2) end, 'litres',
    case when v_blocks > 0 then round(v_diesel / v_blocks * 1000, 1) end,
    case when v_all_dsl and v_blocks > 0 then round(v_bud_diesel / v_blocks * 1000, 1) end, 'L per 1,000 blocks', v_tol, false);
  if s is not null then v_new := v_new || s; end if;

  select coalesce(sum(quantity_damaged), 0) into v_damaged
    from damage_log where site_id = p_site and date = p_date and stage in ('production','stacking');
  s := fn_upsert_production_exception(p_site, p_date, 'breakage', v_blocks, v_damaged,
    round(v_blocks * v_brk / 100.0, 2), 'blocks',
    case when v_blocks > 0 then round(v_damaged * 100.0 / v_blocks, 2) end, v_brk, '% of blocks made', v_tol, true);
  if s is not null then v_new := v_new || s; end if;

  if coalesce(array_length(v_new, 1), 0) > 0 then
    select id into v_anchor from production_exceptions
     where site_id = p_site and date = p_date and status in ('open','explained')
     order by array_position(array['cement','diesel','breakage'], parameter) limit 1;
    v_title := 'Explain: ' || v_site || ', ' || to_char(p_date, 'DD Mon') || ' — over/under budget';
    v_body := array_to_string(v_new, '; ') || '. ' || v_blocks || ' blocks made. Explain in the app.';
    perform fn_notify_site_users(p_site, 'action_required', v_title, v_body, 'production_exceptions', v_anchor);
    perform fn_notify_role('md', 'info', v_title, v_body, 'production_exceptions', v_anchor);
    perform fn_notify_role('ico', 'info', v_title, v_body, 'production_exceptions', v_anchor);
  end if;
end $$;
revoke all on function public.fn_recompute_production_exceptions(uuid,date) from public, anon, authenticated;

-- Explain / ask / close act on every line of the same site-day. The comment is stored once, on the line acted on;
-- screens show one thread per day by reading the comments of all that day's lines.
create or replace function public.respond_production_exception(p_id uuid, p_action text, p_text text default null)
returns public.production_exceptions
language plpgsql security definer set search_path = public as $$
declare e production_exceptions%rowtype; v_name text; v_role text; v_reviewer boolean; v_site_user boolean; v_site text; v_title text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into e from production_exceptions where id = p_id for update;
  if not found then raise exception 'Warning not found.'; end if;
  if not can_see_site(e.site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  perform 1 from production_exceptions where site_id = e.site_id and date = e.date for update;
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  v_reviewer := has_any_role(array['md','ico']);
  v_site_user := fn_can_raise_for_site(e.site_id);
  select name into v_site from production_sites where id = e.site_id;
  v_title := 'Budget warning — ' || v_site || ', ' || to_char(e.date, 'DD Mon');

  if p_action = 'explain' then
    if not v_site_user then raise exception 'Only the site manager (or the MD) can explain this.' using errcode = '42501'; end if;
    if not exists (select 1 from production_exceptions where site_id = e.site_id and date = e.date and status in ('open','explained')) then
      raise exception 'This day''s warning is already closed.';
    end if;
    if length(trim(coalesce(p_text,''))) < 10 then raise exception 'Give a proper explanation (at least 10 characters).'; end if;
    update production_exceptions set status = 'explained', explanation = trim(p_text), explained_by_name = v_name,
           explained_at = now(), updated_at = now()
     where site_id = e.site_id and date = e.date and status in ('open','explained');
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, 'explanation', trim(p_text), auth.uid(), v_name, v_role);
    perform fn_notify_role('md', 'action_required', 'Explained: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    perform fn_notify_role('ico', 'action_required', 'Explained: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);

  elsif p_action in ('comment','ask') then
    if not (v_reviewer or v_site_user) then raise exception 'Not allowed to comment here.' using errcode = '42501'; end if;
    if length(trim(coalesce(p_text,''))) < 2 then raise exception 'Write the comment.'; end if;
    if p_action = 'ask' and not v_reviewer then raise exception 'Only the MD or ICO can send a question back.' using errcode = '42501'; end if;
    if p_action = 'ask' and not exists (select 1 from production_exceptions where site_id = e.site_id and date = e.date and status <> 'resolved') then
      raise exception 'This day''s warning was resolved by a correction.';
    end if;
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, case when p_action = 'ask' then 'question' else 'comment' end, trim(p_text), auth.uid(), v_name, v_role);
    if p_action = 'ask' then
      update production_exceptions set status = 'open', closed_by_name = null, closed_at = null, close_note = null, updated_at = now()
       where site_id = e.site_id and date = e.date and status <> 'resolved';
      perform fn_notify_site_users(e.site_id, 'action_required', 'Question: ' || v_title, v_name || ' asks: ' || trim(p_text), 'production_exceptions', p_id);
    elsif v_reviewer then
      perform fn_notify_site_users(e.site_id, 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    else
      perform fn_notify_role('md', 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
      perform fn_notify_role('ico', 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    end if;
    update production_exceptions set updated_at = now() where site_id = e.site_id and date = e.date;

  elsif p_action = 'close' then
    if not v_reviewer then raise exception 'Only the MD or ICO can close a warning.' using errcode = '42501'; end if;
    if not exists (select 1 from production_exceptions where site_id = e.site_id and date = e.date and status in ('open','explained')) then
      raise exception 'This day''s warning is already closed.';
    end if;
    update production_exceptions set status = 'closed', closed_by_name = v_name, closed_at = now(),
           close_note = nullif(trim(p_text), ''), updated_at = now()
     where site_id = e.site_id and date = e.date and status in ('open','explained');
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, 'closed', coalesce(nullif(trim(p_text), ''), 'Closed.'), auth.uid(), v_name, v_role);
    perform fn_notify_site_users(e.site_id, 'approved', 'Closed: ' || v_title, v_name || coalesce(': ' || nullif(trim(p_text), ''), ' closed it.'), 'production_exceptions', p_id);

  else
    raise exception 'Unknown action: %', p_action;
  end if;

  select * into e from production_exceptions where id = p_id;
  return e;
end $$;
revoke all on function public.respond_production_exception(uuid,text,text) from public, anon;
grant execute on function public.respond_production_exception(uuid,text,text) to authenticated;
