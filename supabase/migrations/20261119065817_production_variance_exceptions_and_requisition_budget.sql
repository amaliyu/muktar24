-- Applied to production 2026-11-19 by the planning chat (recorded here afterwards). MD requested 2026-11-19.
-- INERT until app_flags.production_variance_checks is switched on (after the screens ship); then run
-- backfill_production_exceptions('2026-11-10').
-- Verified with a rolled-back test (flag on): backfill raised Life Camp 17/18 Nov cement (25.6 / 28.6 per bag vs 40),
-- diesel and breakage exceptions; explain -> MD ask -> explain -> ICO close; site manager cannot close; Umar cannot act on
-- Life Camp; a correction back within 5% resolves; breakage 1.2% raised; requisition budget split correct.

-- Production variance exceptions + requisition budget comparison (MD 2026-11-19).
-- MD: "we need a warning whenever production parameters fall below or over budget ... notification for explanation
--      must be provided; the MD and the ICO must also comment / ask questions. Each requisition should be compared to budget."
-- Decisions (planning chat, stated to MD):
--   * Checked per site per day against the site's standards (site_block_standards): cement (blocks per bag) and diesel
--     (litres per 1,000 blocks) in BOTH directions outside the site's tolerance (default 5%); breakage (production +
--     stacking damage) only when OVER the site's breakage budget (default 1%, Award 3a) — zero breakage is normal.
--   * Dust is not checked daily (it is calculated from the standard); it is checked by the Friday stock count.
--   * Each exception: site manager explains -> MD/ICO comment, ask (sends it back) or close. Every step notifies.
--   * Inert until flag production_variance_checks is switched on (after the screens ship); then backfill.

-- 1. Settings ------------------------------------------------------------------------------------------------------------
alter table public.production_sites
  add column if not exists variance_tolerance_pct numeric not null default 5,
  add column if not exists breakage_budget_pct numeric not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_sites_variance_settings_range') then
    alter table public.production_sites add constraint production_sites_variance_settings_range
      check (variance_tolerance_pct > 0 and variance_tolerance_pct <= 50 and breakage_budget_pct >= 0 and breakage_budget_pct <= 20);
  end if;
end $$;
comment on column public.production_sites.variance_tolerance_pct is 'Daily cement/diesel variance allowed either way before an exception is raised (MD-editable).';
comment on column public.production_sites.breakage_budget_pct is 'Production + stacking breakage allowed as % of blocks made (Bilaad Award 3a: 1%).';

insert into public.app_flags (key, enabled, note)
values ('production_variance_checks', false,
        'When on: each production day is checked against the site standards; exceptions need a site-manager explanation and MD/ICO review.')
on conflict (key) do nothing;

-- 2. Tables --------------------------------------------------------------------------------------------------------------
create table if not exists public.production_exceptions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  date date not null,
  parameter text not null check (parameter in ('cement','diesel','breakage')),
  blocks numeric not null,
  actual_qty numeric not null,
  budget_qty numeric not null,
  unit text not null,
  actual_rate numeric,
  budget_rate numeric,
  rate_unit text,
  variance_pct numeric not null,
  direction text not null check (direction in ('over','under')),
  tolerance_pct numeric not null,
  status text not null default 'open' check (status in ('open','explained','closed','resolved')),
  explanation text,
  explained_by_name text,
  explained_at timestamptz,
  closed_by_name text,
  closed_at timestamptz,
  close_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, date, parameter)
);
comment on column public.production_exceptions.status is 'open = waiting for the site manager; explained = waiting for MD/ICO; closed = accepted by MD/ICO; resolved = back within budget after a correction (no explanation needed).';

create table if not exists public.production_exception_comments (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.production_exceptions(id) on delete cascade,
  kind text not null check (kind in ('explanation','comment','question','closed','system')),
  body text not null,
  author_id uuid,
  author_name text,
  author_role text,
  created_at timestamptz not null default now()
);
create index if not exists production_exception_comments_exc on public.production_exception_comments (exception_id, created_at);

alter table public.production_exceptions enable row level security;
alter table public.production_exception_comments enable row level security;
drop policy if exists production_exceptions_select on public.production_exceptions;
create policy production_exceptions_select on public.production_exceptions
  for select to authenticated using (public.can_see_site(site_id));
drop policy if exists production_exception_comments_select on public.production_exception_comments;
create policy production_exception_comments_select on public.production_exception_comments
  for select to authenticated using (exists (select 1 from public.production_exceptions e
                                             where e.id = exception_id and public.can_see_site(e.site_id)));
revoke all on public.production_exceptions, public.production_exception_comments from anon, authenticated;
grant select on public.production_exceptions, public.production_exception_comments to authenticated;

-- 3. Notify the site's assigned users ------------------------------------------------------------------------------------
create or replace function public.fn_notify_site_users(p_site uuid, p_type text, p_title text, p_body text, p_table text, p_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into notifications (recipient_id, type, title, body, related_table, related_id)
  select u.id, p_type, p_title, p_body, p_table, p_id
    from user_profiles u where u.assigned_site_id = p_site and u.is_active
$$;
revoke all on function public.fn_notify_site_users(uuid,text,text,text,text,uuid) from public, anon, authenticated;

-- 4. Recompute one site-day ----------------------------------------------------------------------------------------------
create or replace function public.fn_upsert_production_exception(
  p_site uuid, p_date date, p_param text, p_blocks numeric, p_actual numeric, p_budget numeric, p_unit text,
  p_actual_rate numeric, p_budget_rate numeric, p_rate_unit text, p_tol numeric, p_over_only boolean)
returns void language plpgsql security definer set search_path = public as $$
declare e production_exceptions%rowtype; v_var numeric; v_dir text; v_breach boolean; v_site text; v_title text; v_body text;
begin
  select * into e from production_exceptions where site_id = p_site and date = p_date and parameter = p_param for update;

  if p_budget is null or p_budget <= 0 or coalesce(p_blocks, 0) <= 0 then
    if found and e.status = 'open' then
      update production_exceptions set status = 'resolved', updated_at = now() where id = e.id;
      insert into production_exception_comments (exception_id, kind, body) values (e.id, 'system', 'No longer applies (entry changed or removed).');
    end if;
    return;
  end if;

  v_var := round((p_actual - p_budget) / p_budget * 100, 1);
  v_dir := case when p_actual > p_budget then 'over' else 'under' end;
  v_breach := case when p_over_only then v_var > 0 and p_actual_rate > p_budget_rate else abs(v_var) > p_tol end;

  if v_breach then
    if not found then
      insert into production_exceptions (site_id, date, parameter, blocks, actual_qty, budget_qty, unit, actual_rate, budget_rate,
                                         rate_unit, variance_pct, direction, tolerance_pct)
      values (p_site, p_date, p_param, p_blocks, p_actual, p_budget, p_unit, p_actual_rate, p_budget_rate, p_rate_unit, v_var, v_dir, p_tol)
      returning * into e;
    else
      update production_exceptions
         set blocks = p_blocks, actual_qty = p_actual, budget_qty = p_budget, unit = p_unit, actual_rate = p_actual_rate,
             budget_rate = p_budget_rate, rate_unit = p_rate_unit, variance_pct = v_var, direction = v_dir, tolerance_pct = p_tol,
             status = case when status = 'resolved' then 'open' else status end, updated_at = now()
       where id = e.id;
      if e.status <> 'resolved' then return; end if;   -- already raised: numbers refreshed, no new alert
    end if;
    select name into v_site from production_sites where id = p_site;
    v_title := 'Explain: ' || case p_param when 'cement' then 'cement' when 'diesel' then 'diesel' else 'breakage' end
               || ' ' || v_dir || ' budget — ' || v_site || ', ' || to_char(p_date, 'DD Mon');
    v_body := case p_param
      when 'cement' then format('%s bags for %s blocks (%s per bag) against %s bags budget (%s per bag): %s%s%%.',
                                trim(to_char(p_actual,'FM999G990D0')), p_blocks, p_actual_rate, trim(to_char(p_budget,'FM999G990D0')), p_budget_rate,
                                case when v_var > 0 then '+' else '' end, v_var)
      when 'diesel' then format('%s L for %s blocks (%s L per 1,000) against %s L budget (%s L per 1,000): %s%s%%.',
                                trim(to_char(p_actual,'FM999G990D0')), p_blocks, p_actual_rate, trim(to_char(p_budget,'FM999G990D0')), p_budget_rate,
                                case when v_var > 0 then '+' else '' end, v_var)
      else format('%s blocks broken of %s made (%s%%) against %s%% allowed.', p_actual, p_blocks, p_actual_rate, p_budget_rate) end
      || ' Explain in the app.';
    perform fn_notify_site_users(p_site, 'action_required', v_title, v_body, 'production_exceptions', e.id);
    perform fn_notify_role('md', 'info', v_title, v_body, 'production_exceptions', e.id);
    perform fn_notify_role('ico', 'info', v_title, v_body, 'production_exceptions', e.id);
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
end $$;
revoke all on function public.fn_upsert_production_exception(uuid,date,text,numeric,numeric,numeric,text,numeric,numeric,text,numeric,boolean) from public, anon, authenticated;

create or replace function public.fn_recompute_production_exceptions(p_site uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tol numeric; v_brk numeric; v_blocks numeric; v_cement numeric; v_diesel numeric; v_bud_cement numeric; v_bud_diesel numeric;
  v_all_bpb boolean; v_all_dsl boolean; v_damaged numeric;
begin
  if p_site is null or p_date is null or not app_flag('production_variance_checks') then return; end if;
  select variance_tolerance_pct, breakage_budget_pct into v_tol, v_brk from production_sites where id = p_site;

  select coalesce(sum(pl.quantity_produced), 0), coalesce(sum(pl.cement_bags), 0), coalesce(sum(pl.diesel_litres), 0),
         sum(pl.quantity_produced / nullif(s.blocks_per_bag, 0)), sum(pl.quantity_produced * s.diesel_l_per_1000 / 1000.0),
         coalesce(bool_and(s.blocks_per_bag is not null), false), coalesce(bool_and(s.diesel_l_per_1000 is not null), false)
    into v_blocks, v_cement, v_diesel, v_bud_cement, v_bud_diesel, v_all_bpb, v_all_dsl
    from production_log pl
    left join site_block_standards s on s.site_id = pl.site_id and s.block_type = pl.block_type
   where pl.site_id = p_site and pl.date = p_date;

  perform fn_upsert_production_exception(p_site, p_date, 'cement', v_blocks, v_cement,
    case when v_all_bpb then round(v_bud_cement, 2) end, 'bags',
    case when v_cement > 0 then round(v_blocks / v_cement, 1) end,
    case when v_all_bpb and v_bud_cement > 0 then round(v_blocks / v_bud_cement, 1) end, 'blocks per bag', v_tol, false);

  perform fn_upsert_production_exception(p_site, p_date, 'diesel', v_blocks, v_diesel,
    case when v_all_dsl then round(v_bud_diesel, 2) end, 'litres',
    case when v_blocks > 0 then round(v_diesel / v_blocks * 1000, 1) end,
    case when v_all_dsl and v_blocks > 0 then round(v_bud_diesel / v_blocks * 1000, 1) end, 'L per 1,000 blocks', v_tol, false);

  select coalesce(sum(quantity_damaged), 0) into v_damaged
    from damage_log where site_id = p_site and date = p_date and stage in ('production','stacking');
  perform fn_upsert_production_exception(p_site, p_date, 'breakage', v_blocks, v_damaged,
    round(v_blocks * v_brk / 100.0, 2), 'blocks',
    case when v_blocks > 0 then round(v_damaged * 100.0 / v_blocks, 2) end, v_brk, '% of blocks made', v_tol, true);
end $$;
revoke all on function public.fn_recompute_production_exceptions(uuid,date) from public, anon, authenticated;

create or replace function public.fn_production_exceptions_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new jsonb; v_old jsonb; v_rel_new boolean; v_rel_old boolean;
begin
  -- jsonb access so the same function serves production_log (no stage column) and damage_log.
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  v_rel_new := v_new is not null and (tg_table_name <> 'damage_log' or v_new->>'stage' in ('production','stacking'));
  v_rel_old := v_old is not null and (tg_table_name <> 'damage_log' or v_old->>'stage' in ('production','stacking'));
  if v_rel_new then
    perform fn_recompute_production_exceptions((v_new->>'site_id')::uuid, (v_new->>'date')::date);
  end if;
  if v_rel_old and (v_new is null
                    or (v_old->>'site_id', v_old->>'date') is distinct from (v_new->>'site_id', v_new->>'date')
                    or not v_rel_new) then
    perform fn_recompute_production_exceptions((v_old->>'site_id')::uuid, (v_old->>'date')::date);
  end if;
  return null;
end $$;
revoke all on function public.fn_production_exceptions_trigger() from public, anon;

drop trigger if exists trg_zz_production_exceptions on public.production_log;
create trigger trg_zz_production_exceptions after insert or update or delete on public.production_log
  for each row execute function public.fn_production_exceptions_trigger();
drop trigger if exists trg_zz_production_exceptions on public.damage_log;
create trigger trg_zz_production_exceptions after insert or update or delete on public.damage_log
  for each row execute function public.fn_production_exceptions_trigger();

-- 5. Explain / comment / ask / close --------------------------------------------------------------------------------------
create or replace function public.respond_production_exception(p_id uuid, p_action text, p_text text default null)
returns public.production_exceptions
language plpgsql security definer set search_path = public as $$
declare e production_exceptions%rowtype; v_name text; v_role text; v_reviewer boolean; v_site_user boolean; v_site text; v_title text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into e from production_exceptions where id = p_id for update;
  if not found then raise exception 'Exception not found.'; end if;
  if not can_see_site(e.site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  v_reviewer := has_any_role(array['md','ico']);
  v_site_user := fn_can_raise_for_site(e.site_id);
  select name into v_site from production_sites where id = e.site_id;
  v_title := initcap(e.parameter) || ' ' || e.direction || ' budget — ' || v_site || ', ' || to_char(e.date, 'DD Mon');

  if p_action = 'explain' then
    if not v_site_user then raise exception 'Only the site manager (or the MD) can explain this.' using errcode = '42501'; end if;
    if e.status in ('closed','resolved') then raise exception 'This exception is already %.', e.status; end if;
    if length(trim(coalesce(p_text,''))) < 10 then raise exception 'Give a proper explanation (at least 10 characters).'; end if;
    update production_exceptions set status = 'explained', explanation = trim(p_text), explained_by_name = v_name,
           explained_at = now(), updated_at = now() where id = p_id;
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, 'explanation', trim(p_text), auth.uid(), v_name, v_role);
    perform fn_notify_role('md', 'action_required', 'Explained: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    perform fn_notify_role('ico', 'action_required', 'Explained: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);

  elsif p_action in ('comment','ask') then
    if not (v_reviewer or v_site_user) then raise exception 'Not allowed to comment here.' using errcode = '42501'; end if;
    if length(trim(coalesce(p_text,''))) < 2 then raise exception 'Write the comment.'; end if;
    if p_action = 'ask' and not v_reviewer then raise exception 'Only the MD or ICO can send a question back.' using errcode = '42501'; end if;
    if p_action = 'ask' and e.status = 'resolved' then raise exception 'This exception was resolved by a correction.'; end if;
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, case when p_action = 'ask' then 'question' else 'comment' end, trim(p_text), auth.uid(), v_name, v_role);
    if p_action = 'ask' then
      update production_exceptions set status = 'open', closed_by_name = null, closed_at = null, close_note = null, updated_at = now() where id = p_id;
      perform fn_notify_site_users(e.site_id, 'action_required', 'Question: ' || v_title, v_name || ' asks: ' || trim(p_text), 'production_exceptions', p_id);
    elsif v_reviewer then
      perform fn_notify_site_users(e.site_id, 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    else
      perform fn_notify_role('md', 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
      perform fn_notify_role('ico', 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    end if;
    update production_exceptions set updated_at = now() where id = p_id;

  elsif p_action = 'close' then
    if not v_reviewer then raise exception 'Only the MD or ICO can close an exception.' using errcode = '42501'; end if;
    if e.status in ('closed','resolved') then raise exception 'This exception is already %.', e.status; end if;
    update production_exceptions set status = 'closed', closed_by_name = v_name, closed_at = now(),
           close_note = nullif(trim(p_text), ''), updated_at = now() where id = p_id;
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

-- Backfill (MD) — run when the flag is switched on.
create or replace function public.backfill_production_exceptions(p_from date)
returns integer language plpgsql security definer set search_path = public as $$
declare d record; n int := 0;
begin
  if auth.uid() is not null and get_user_role() <> 'md' then raise exception 'MD only.' using errcode = '42501'; end if;
  for d in select distinct site_id, date from production_log where date >= p_from and site_id is not null loop
    perform fn_recompute_production_exceptions(d.site_id, d.date); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.backfill_production_exceptions(date) from public, anon;
grant execute on function public.backfill_production_exceptions(date) to authenticated;

-- 6. Requisition against budget ------------------------------------------------------------------------------------------
-- Production at the site is laid end to end from the first requisition's covers_from (date, entry time) and shared out
-- to client-approved requisitions in approval order (same order as client_requisition_progress). For each material:
-- budget for the whole requisition (calculated), requested, received (accepted against it), budget for the blocks made
-- so far, actually used for those blocks, and the variance.
create or replace function public.client_requisition_budget(p_requisition_id uuid)
returns table (material text, unit text, budget_full numeric, requested numeric, received numeric,
               blocks_made numeric, budget_for_made numeric, used_for_made numeric, variance_pct numeric)
language plpgsql stable security definer set search_path = public as $$
declare r client_requisitions%rowtype; v_from date; v_cum_from numeric := 0; v_cum_to numeric; rec record;
begin
  select * into r from client_requisitions where id = p_requisition_id;
  if not found then raise exception 'Requisition not found.'; end if;
  if not can_see_site(r.site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  select min(covers_from) into v_from from client_requisitions where site_id = r.site_id and status <> 'cancelled';

  if r.status in ('client_approved','closed') then
    for rec in select id, qty_total from client_requisitions
                where site_id = r.site_id and status in ('client_approved','closed')
                order by client_approved_on, reference loop
      exit when rec.id = r.id;
      v_cum_from := v_cum_from + rec.qty_total;
    end loop;
  end if;
  v_cum_to := v_cum_from + r.qty_total;

  return query
  with prod as (
    select pl.*, s.blocks_per_bag, s.diesel_l_per_1000, s.dust_kg_per_block, s.chippings_kg_per_block,
           sum(pl.quantity_produced) over (order by pl.date, pl.created_at, pl.id) as cum_end
      from production_log pl
      left join site_block_standards s on s.site_id = pl.site_id and s.block_type = pl.block_type
     where pl.site_id = r.site_id and pl.date >= v_from and r.status in ('client_approved','closed')
  ), share as (
    select p.*, greatest(0, least(p.cum_end, v_cum_to) - greatest(p.cum_end - p.quantity_produced, v_cum_from)) as overlap
      from prod p
  ), agg as (
    select sum(overlap) as blocks,
           sum(overlap / nullif(blocks_per_bag, 0)) as b_cement,
           sum(overlap * (dust_kg_per_block - coalesce(chippings_kg_per_block, 0))) as b_dust,
           sum(overlap * coalesce(chippings_kg_per_block, 0)) as b_chip,
           sum(overlap * diesel_l_per_1000 / 1000.0) as b_diesel,
           sum(coalesce(cement_bags, 0) * overlap / nullif(quantity_produced, 0)) as u_cement,
           sum(coalesce(granite_dust_kg, 0) * overlap / nullif(quantity_produced, 0)) as u_dust,
           sum(coalesce(chippings_kg, 0) * overlap / nullif(quantity_produced, 0)) as u_chip,
           sum(coalesce(diesel_litres, 0) * overlap / nullif(quantity_produced, 0)) as u_diesel
      from share where overlap > 0
  ), sup as (
    select * from client_requisition_supplied(p_requisition_id)
  )
  select l.material, l.unit, l.qty_calculated, l.qty_requested, coalesce(sup.qty_accepted, 0),
         coalesce(a.blocks, 0),
         round(case l.material when 'cement' then a.b_cement when 'dust' then a.b_dust when 'chippings' then a.b_chip when 'diesel' then a.b_diesel end, 2),
         round(case l.material when 'cement' then a.u_cement when 'dust' then a.u_dust when 'chippings' then a.u_chip when 'diesel' then a.u_diesel end, 2),
         round(case l.material
                 when 'cement' then (a.u_cement - a.b_cement) / nullif(a.b_cement, 0)
                 when 'dust' then (a.u_dust - a.b_dust) / nullif(a.b_dust, 0)
                 when 'chippings' then (a.u_chip - a.b_chip) / nullif(a.b_chip, 0)
                 when 'diesel' then (a.u_diesel - a.b_diesel) / nullif(a.b_diesel, 0) end * 100, 1)
    from client_requisition_lines l
    cross join agg a
    left join sup on sup.material = l.material
   where l.requisition_id = p_requisition_id
   order by array_position(array['cement','dust','chippings','diesel','water','other'], l.material), l.description;
end $$;
revoke all on function public.client_requisition_budget(uuid) from public, anon;
grant execute on function public.client_requisition_budget(uuid) to authenticated;
