-- Breakage judged by type (MD 26 Nov): production 2% and stacking 1% of
-- blocks made; loading 0.5% and offloading 0.5% of blocks loaded at handover.
-- Each type has its own warning line and points to its likely cause.
-- Loading/offloading breakage is entered on the handover and kept in
-- damage_log (stages 'loading' / 'delivery') linked by handover_id; it leaves
-- the yard and uses cured stock like the blocks handed over.

-- 1. Allowances per site
alter table public.production_sites
  add column if not exists production_breakage_pct numeric not null default 2
    constraint production_sites_production_breakage_pct_check check (production_breakage_pct >= 0 and production_breakage_pct <= 20),
  add column if not exists stacking_breakage_pct numeric not null default 1
    constraint production_sites_stacking_breakage_pct_check check (stacking_breakage_pct >= 0 and stacking_breakage_pct <= 20),
  add column if not exists loading_breakage_pct numeric not null default 0.5
    constraint production_sites_loading_breakage_pct_check check (loading_breakage_pct >= 0 and loading_breakage_pct <= 20),
  add column if not exists offloading_breakage_pct numeric not null default 0.5
    constraint production_sites_offloading_breakage_pct_check check (offloading_breakage_pct >= 0 and offloading_breakage_pct <= 20);

-- 2. New warning lines ('breakage' stays = production breakage, so existing warnings keep their history)
alter table public.production_exceptions drop constraint production_exceptions_parameter_check;
alter table public.production_exceptions add constraint production_exceptions_parameter_check
  check (parameter = any (array['cement','diesel','breakage','stacking_breakage','loading_breakage','offloading_breakage']));

-- 3. Handover breakage
alter table public.block_handovers
  add column if not exists broken_loading integer not null default 0
    constraint block_handovers_broken_loading_check check (broken_loading >= 0),
  add column if not exists broken_offloading integer not null default 0
    constraint block_handovers_broken_offloading_check check (broken_offloading >= 0);
alter table public.damage_log add column if not exists handover_id uuid references public.block_handovers(id) on delete cascade;
create unique index if not exists damage_log_one_per_handover_stage on public.damage_log (handover_id, stage) where handover_id is not null;

-- Handover-linked breakage carries the handover's own late check.
do $f$
declare v_def text := pg_get_functiondef('public.fn_late_entry_check'::regproc);
        v_old text := $s$v_new->>'waybill_id' is not null)$s$;
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_late_entry_check changed; update by hand';
  end if;
  execute replace(v_def, v_old, $s$v_new->>'waybill_id' is not null or v_new->>'handover_id' is not null)$s$);
end $f$;

create or replace function public.fn_handover_breakage_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare st text; q int;
begin
  foreach st in array array['loading','delivery'] loop
    q := case st when 'loading' then new.broken_loading else new.broken_offloading end;
    if coalesce(q, 0) > 0 then
      update damage_log
         set quantity_damaged = q, date = new.handover_date, block_type = new.block_type, site_id = new.site_id
       where handover_id = new.id and stage = st
         and (quantity_damaged, date, block_type, site_id) is distinct from (q, new.handover_date, new.block_type, new.site_id);
      if not exists (select 1 from damage_log where handover_id = new.id and stage = st) then
        insert into damage_log (date, block_type, stage, quantity_damaged, site_id, handover_id, recorded_by, notes)
        values (new.handover_date, new.block_type, st, q, new.site_id, new.id, auth.uid(),
                case st when 'loading' then 'Broken while loading' else 'Broken while offloading' end
                || ' — handover' || coalesce(' WB ' || new.waybill_no, ''));
      end if;
    else
      delete from damage_log where handover_id = new.id and stage = st;
    end if;
  end loop;
  return null;
end $f$;

create trigger trg_zz_handover_breakage_sync
  after insert or update of broken_loading, broken_offloading, handover_date, block_type, site_id on public.block_handovers
  for each row execute function public.fn_handover_breakage_sync();

-- Handovers change the base for loading/offloading warnings.
create or replace function public.fn_handover_exceptions_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform fn_recompute_production_exceptions(old.site_id, old.handover_date);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and (new.site_id, new.handover_date) is distinct from (old.site_id, old.handover_date)) then
    perform fn_recompute_production_exceptions(new.site_id, new.handover_date);
  end if;
  return null;
end $f$;

create trigger trg_zz_handover_exceptions
  after insert or update of qty_handed_over, handover_date, site_id or delete on public.block_handovers
  for each row execute function public.fn_handover_exceptions_trigger();

-- damage_log: loading/offloading lines also recompute.
create or replace function public.fn_production_exceptions_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare v_new jsonb; v_old jsonb; v_rel_new boolean; v_rel_old boolean;
begin
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  v_rel_new := v_new is not null and (tg_table_name <> 'damage_log' or v_new->>'stage' in ('production','stacking','loading','delivery'));
  v_rel_old := v_old is not null and (tg_table_name <> 'damage_log' or v_old->>'stage' in ('production','stacking','loading','delivery'));
  if v_rel_new then
    perform fn_recompute_production_exceptions((v_new->>'site_id')::uuid, (v_new->>'date')::date);
  end if;
  if v_rel_old and (v_new is null
                    or (v_old->>'site_id', v_old->>'date') is distinct from (v_new->>'site_id', v_new->>'date')
                    or not v_rel_new) then
    perform fn_recompute_production_exceptions((v_old->>'site_id')::uuid, (v_old->>'date')::date);
  end if;
  return null;
end $f$;

-- 4. Warning text per breakage type
create or replace function public.fn_upsert_production_exception_v2(p_site uuid, p_date date, p_param text, p_blocks numeric, p_actual numeric, p_budget numeric, p_unit text, p_actual_rate numeric, p_budget_rate numeric, p_rate_unit text, p_tol numeric, p_under_tol numeric, p_min_abs numeric, p_over_only boolean, p_unit_cost numeric, p_client_owned boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare e production_exceptions%rowtype; v_allowed numeric; v_diff numeric; v_var numeric; v_dir text; v_breach boolean;
        v_kind text; v_value numeric; v_msg text; v_head text; v_u text; v_found boolean;
        v_brk boolean := p_param like '%breakage';
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

  v_allowed := case when v_brk then floor(p_budget) else p_budget end;
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
    when 'breakage' then format('Broken in production: %s of %s blocks made.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks))
    when 'stacking_breakage' then format('Broken while stacking: %s of %s blocks made.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks))
    when 'loading_breakage' then format('Broken while loading: %s of %s blocks loaded.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks))
    when 'offloading_breakage' then format('Broken while offloading: %s of %s blocks loaded.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks))
    else format('Broken blocks: %s of %s.', fn_fmt_qty(p_actual), fn_fmt_qty(p_blocks)) end;
  v_msg := v_head || case
    when not v_breach and v_diff > 0 then format(' Allowed %s%s. Only %s%s over — too small to flag.',
           fn_fmt_qty(v_allowed), case when p_param = 'diesel' then ' L' else '' end, fn_fmt_qty(v_diff), v_u)
    when not v_breach then format(' Allowed %s%s. Within limits.', fn_fmt_qty(v_allowed), case when p_param = 'diesel' then ' L' else '' end)
    when p_param = 'cement' and v_diff > 0 then format(' Allowed %s. %s bags too many.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))
    when p_param = 'cement' then format(' The mix needs %s. %s bags too few — check the blocks are strong.', fn_fmt_qty(v_allowed), fn_fmt_qty(-v_diff))
    when p_param = 'diesel' and p_rate_unit = 'L per day' then format(' Daily allowance %s L. %s L too much.', fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))
    when p_param = 'diesel' then format(' At %s L per 1,000 blocks that output needs %s L. %s L too much — too few blocks for the diesel used.',
           fn_fmt_qty(p_budget_rate), fn_fmt_qty(v_allowed), fn_fmt_qty(v_diff))
    else format(' Allowed %s (%s%%). %s too many.', fn_fmt_qty(v_allowed), fn_fmt_qty(p_budget_rate), fn_fmt_qty(v_diff))
         || case p_param
              when 'breakage' then ' Check the machine, the mix and the operator. These can be recycled straight away.'
              when 'stacking_breakage' then ' Check handling, pallets and the stacking ground.'
              when 'loading_breakage' then ' Check the loaders and how the truck is packed.'
              when 'offloading_breakage' then ' Check offloading and the ground at the client''s site.'
              else '' end end
    || case when v_value is not null then ' (₦' || to_char(v_value, 'FM999,999,990') || ')'
            when v_breach and p_client_owned and v_diff > 0 and not v_brk then ' The client''s material — they can charge for it.'
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
      values (e.id, 'system', coalesce(nullif(current_setting('app.exception_rule_note', true), ''),
                                       case when current_setting('app.exception_rule_change', true) = 'on'
                                            then 'No longer flagged under the simpler warning rules of 23 Nov.'
                                            else 'Back within budget after a correction.' end));
    end if;
  end if;
  return null;
end $function$;

-- 5. Recompute: four breakage lines
create or replace function public.fn_recompute_production_exceptions(p_site uuid, p_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s_row production_sites%rowtype; v_blocks numeric; v_cement numeric; v_diesel numeric; v_bud_cement numeric; v_bud_diesel numeric;
  v_all_bpb boolean; v_all_dsl boolean; v_new text[] := '{}'; s text; v_anchor uuid; v_title text; v_body text;
  v_cem_cost numeric; v_cem_client boolean; v_dsl_cost numeric; v_dsl_client boolean; v_dsl_unit text := 'L per 1,000 blocks';
  v_prod numeric; v_stack numeric; v_load numeric; v_off numeric; v_handed numeric; v_loaded numeric;
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
  if s is not null then s := s || fn_generator_text(p_site, p_date); v_new := v_new || s; end if;
  update production_exceptions set message = message || fn_generator_text(p_site, p_date)
   where site_id = p_site and date = p_date and parameter = 'diesel' and kind is not null and status <> 'resolved';

  -- Breakage by type. Stacking breakage is entered on the production day's entry.
  select coalesce(sum(quantity_damaged) filter (where stage = 'production'), 0),
         coalesce(sum(quantity_damaged) filter (where stage = 'stacking'), 0),
         coalesce(sum(quantity_damaged) filter (where stage = 'loading' and handover_id is not null), 0),
         coalesce(sum(quantity_damaged) filter (where stage = 'delivery' and handover_id is not null), 0)
    into v_prod, v_stack, v_load, v_off
    from damage_log where site_id = p_site and date = p_date;
  select coalesce(sum(qty_handed_over), 0) into v_handed from block_handovers where site_id = p_site and handover_date = p_date;
  v_loaded := v_handed + v_load + v_off;

  s := fn_upsert_production_exception_v2(p_site, p_date, 'breakage', v_blocks, v_prod,
    round(v_blocks * s_row.production_breakage_pct / 100.0, 2), 'blocks',
    case when v_blocks > 0 then round(v_prod * 100.0 / v_blocks, 2) end, s_row.production_breakage_pct, '% of blocks made',
    0, null, s_row.warn_min_breakage_blocks, true, null, false);
  if s is not null then v_new := v_new || s; end if;

  s := fn_upsert_production_exception_v2(p_site, p_date, 'stacking_breakage', v_blocks, v_stack,
    round(v_blocks * s_row.stacking_breakage_pct / 100.0, 2), 'blocks',
    case when v_blocks > 0 then round(v_stack * 100.0 / v_blocks, 2) end, s_row.stacking_breakage_pct, '% of blocks made',
    0, null, s_row.warn_min_breakage_blocks, true, null, false);
  if s is not null then v_new := v_new || s; end if;

  s := fn_upsert_production_exception_v2(p_site, p_date, 'loading_breakage', v_loaded, v_load,
    round(v_loaded * s_row.loading_breakage_pct / 100.0, 2), 'blocks',
    case when v_loaded > 0 then round(v_load * 100.0 / v_loaded, 2) end, s_row.loading_breakage_pct, '% of blocks loaded',
    0, null, s_row.warn_min_breakage_blocks, true, null, false);
  if s is not null then v_new := v_new || s; end if;

  s := fn_upsert_production_exception_v2(p_site, p_date, 'offloading_breakage', v_loaded, v_off,
    round(v_loaded * s_row.offloading_breakage_pct / 100.0, 2), 'blocks',
    case when v_loaded > 0 then round(v_off * 100.0 / v_loaded, 2) end, s_row.offloading_breakage_pct, '% of blocks loaded',
    0, null, s_row.warn_min_breakage_blocks, true, null, false);
  if s is not null then v_new := v_new || s; end if;

  if coalesce(array_length(v_new, 1), 0) > 0 and current_setting('app.exceptions_quiet', true) is distinct from 'on' then
    select id into v_anchor from production_exceptions
     where site_id = p_site and date = p_date and status in ('open','explained')
     order by array_position(array['cement','diesel','breakage','stacking_breakage','loading_breakage','offloading_breakage'], parameter) limit 1;
    v_title := 'Please explain: ' || s_row.name || ', ' || to_char(p_date, 'FMDD Mon');
    v_body := array_to_string(v_new, ' ') || ' Tap to explain.';
    perform fn_notify_site_users(p_site, 'action_required', v_title, v_body, 'production_exceptions', v_anchor);
    perform fn_notify_role('md', 'info', v_title, v_body, 'production_exceptions', v_anchor);
    perform fn_notify_role('ico', 'info', v_title, v_body, 'production_exceptions', v_anchor);
  end if;
end $function$;

-- 6. Yard and cured stock count handover breakage as blocks gone from the yard
create or replace view public.v_site_yard as
 SELECT s.id AS site_id,
    s.name AS site_name,
    bt.block_type,
    COALESCE(b.accepted, (0)::bigint) AS batched,
    COALESCE(dm.damaged, (0)::bigint) AS damaged_after_batch,
    COALESCE(h.handed, (0)::bigint) AS handed_over,
    ((COALESCE(b.accepted, (0)::bigint) - COALESCE(dm.damaged, (0)::bigint)) - COALESCE(h.handed, (0)::bigint)) AS in_yard
   FROM ((((production_sites s
     CROSS JOIN LATERAL ( SELECT DISTINCT batches.block_type
           FROM batches
          WHERE (batches.site_id = s.id)
        UNION
         SELECT DISTINCT block_handovers.block_type
           FROM block_handovers
          WHERE (block_handovers.site_id = s.id)) bt)
     LEFT JOIN LATERAL ( SELECT sum(batches.qty_accepted) AS accepted
           FROM batches
          WHERE ((batches.site_id = s.id) AND (batches.block_type = bt.block_type))) b ON (true))
     LEFT JOIN LATERAL ( SELECT sum(damage_log.quantity_damaged) AS damaged
           FROM damage_log
          WHERE ((damage_log.site_id = s.id) AND (damage_log.block_type = bt.block_type)
                 AND (damage_log.batch_id IS NOT NULL OR damage_log.handover_id IS NOT NULL))) dm ON (true))
     LEFT JOIN LATERAL ( SELECT sum(block_handovers.qty_handed_over) AS handed
           FROM block_handovers
          WHERE ((block_handovers.site_id = s.id) AND (block_handovers.block_type = bt.block_type))) h ON (true))
  WHERE (s.site_type = 'client_site'::text);

create or replace function public.site_cured_stock(p_site_id uuid, p_block_type text, p_date date, p_exclude_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $f$
declare
  v_days int; v_cutoff date; v_cured bigint; v_dmg bigint; v_handed bigint;
  v_next_on date; v_next_qty int;
begin
  if p_site_id is null or p_block_type is null or p_date is null
     or not exists (select 1 from production_sites where id = p_site_id and site_type = 'client_site') then
    return jsonb_build_object('applies', false);
  end if;
  select min_cure_days into v_days from products where name = p_block_type and min_cure_days is not null limit 1;
  if v_days is null then return jsonb_build_object('applies', false); end if;
  v_cutoff := p_date - v_days;

  select coalesce(sum(qty_accepted), 0) into v_cured
    from batches where site_id = p_site_id and block_type = p_block_type and date_cured <= v_cutoff;
  select coalesce(sum(d.quantity_damaged), 0) into v_dmg
    from damage_log d
   where d.date <= p_date
     and ((d.batch_id is not null and exists (select 1 from batches b where b.id = d.batch_id and b.site_id = p_site_id and b.block_type = p_block_type))
          or (d.handover_id is not null and d.site_id = p_site_id and d.block_type = p_block_type
              and (p_exclude_id is null or d.handover_id <> p_exclude_id)));
  select coalesce(sum(qty_handed_over), 0) into v_handed
    from block_handovers
   where site_id = p_site_id and block_type = p_block_type and handover_date <= p_date
     and (p_exclude_id is null or id <> p_exclude_id);
  select date_cured + v_days, qty_accepted into v_next_on, v_next_qty
    from batches where site_id = p_site_id and block_type = p_block_type and date_cured > v_cutoff and qty_accepted > 0
   order by date_cured limit 1;

  return jsonb_build_object(
    'applies', true, 'min_cure_days', v_days, 'cutoff', v_cutoff,
    'cured_batched', v_cured, 'damaged_after_batch', v_dmg, 'handed_over', v_handed,
    'available', greatest(v_cured - v_dmg - v_handed, 0),
    'next_ready_on', v_next_on, 'next_ready_qty', v_next_qty);
end $f$;

create or replace function public.fn_handover_cure_check()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare s jsonb; v_avail int; v_under int; v_total int;
begin
  new.early_reason := nullif(btrim(new.early_reason), '');
  if tg_op = 'UPDATE' and (new.qty_handed_over, new.handover_date, new.block_type, new.site_id, new.broken_loading, new.broken_offloading)
                          is not distinct from (old.qty_handed_over, old.handover_date, old.block_type, old.site_id, old.broken_loading, old.broken_offloading) then
    return new;
  end if;
  s := site_cured_stock(new.site_id, new.block_type, new.handover_date, case when tg_op = 'UPDATE' then old.id end);
  if not coalesce((s->>'applies')::boolean, false) then
    new.under_cure_qty := null;
    return new;
  end if;
  v_avail := (s->>'available')::int;
  v_total := coalesce(new.qty_handed_over, 0) + coalesce(new.broken_loading, 0) + coalesce(new.broken_offloading, 0);
  v_under := greatest(v_total - v_avail, 0);
  new.under_cure_qty := nullif(least(v_under, coalesce(new.qty_handed_over, 0)), 0);
  if v_under > 0 and new.early_reason is null then
    raise exception 'Only % blocks of % here are % days old (made on or before %). % of these % would be younger. Give a reason for handing over early.',
      v_avail, new.block_type, s->>'min_cure_days', to_char((s->>'cutoff')::date, 'FMDD Mon'), v_under, v_total;
  end if;
  return new;
end $f$;

-- 7. Scorecard: combined production + stacking allowance
do $f$
declare v_def text := pg_get_functiondef('public.site_daily_scorecard'::regproc);
begin
  if (length(v_def) - length(replace(v_def, 's.breakage_budget_pct', ''))) / length('s.breakage_budget_pct') <> 1 then
    raise exception 'site_daily_scorecard changed; update by hand';
  end if;
  execute replace(v_def, 's.breakage_budget_pct', '(s.production_breakage_pct + s.stacking_breakage_pct)');
end $f$;

-- 8. Re-judge client-site days since 1 Nov on the new rules, without notifications.
do $f$
declare r record;
begin
  perform set_config('app.exceptions_quiet', 'on', true);
  perform set_config('app.exception_rule_note', 'No longer flagged: breakage is now judged by type — production 2%, stacking 1%, loading 0.5%, offloading 0.5% of blocks (MD, 26 Nov).', true);
  for r in select distinct site_id, d from (
             select site_id, date d from production_log where date >= '2026-11-01'
             union select site_id, handover_date from block_handovers where handover_date >= '2026-11-01') x
           join production_sites s on s.id = x.site_id and s.site_type = 'client_site' order by d loop
    perform fn_recompute_production_exceptions(r.site_id, r.d);
  end loop;
  perform set_config('app.exception_rule_note', '', true);
  perform set_config('app.exceptions_quiet', 'off', true);
end $f$;
