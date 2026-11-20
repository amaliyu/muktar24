-- MD 2026-11-20: weekly (Friday) physical stock count per active site by the ICO; MD approves; approval posts the
-- variance as stock adjustments and locks earlier stock dates. Plus receipt size limits after Kado dust was typed
-- in kg into the tonnes box (30,440,000 kg recorded for a 30.44 t load).

-- 0. Receipt size limits --------------------------------------------------------------------------------------------------
do $$
declare d text; anchor text := 'if p_qty_delivered is null or p_qty_delivered <= 0 then raise exception ''Delivered quantity must be more than zero.''; end if;';
begin
  d := pg_get_functiondef('public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid,numeric,uuid)'::regprocedure);
  if position(anchor in d) = 0 then raise exception 'record_material_receipt: anchor not found'; end if;
  d := replace(d, anchor, anchor || '
  if v_item.unit = ''kg'' and p_qty_delivered > 100000 then
    raise exception ''That is % tonnes in one delivery. Check that you entered tonnes, not kilograms.'', round(p_qty_delivered / 1000, 1);
  end if;
  if v_item.unit = ''litres'' and p_qty_delivered > 40000 then raise exception ''% litres in one delivery is more than a tanker holds. Check the quantity.'', p_qty_delivered; end if;
  if v_item.unit = ''bags'' and p_qty_delivered > 3000 then raise exception ''% bags in one delivery is more than a trailer holds. Check the quantity.'', p_qty_delivered; end if;');
  execute d;
end $$;

-- 1. Tables ---------------------------------------------------------------------------------------------------------------
create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  count_date date not null,
  is_opening boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  notes text,
  late_reason text,
  counted_by uuid references public.user_profiles(id),
  counted_by_name text,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.user_profiles(id),
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text
);
create unique index if not exists stock_counts_one_live_per_day on public.stock_counts (site_id, count_date) where status <> 'rejected';

create table if not exists public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  counted_qty numeric not null check (counted_qty >= 0),
  system_qty numeric,
  variance_qty numeric,
  variance_pct numeric,
  unit_cost numeric,
  variance_value numeric,
  over_tolerance boolean not null default false,
  adjustment_movement_id uuid references public.stock_movements(id),
  note text,
  constraint stock_count_lines_one_per_item unique (count_id, item_id)
);

alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
drop policy if exists stock_counts_select on public.stock_counts;
create policy stock_counts_select on public.stock_counts for select to authenticated
  using (can_see_site(site_id) and has_any_role(array['md','ico','board_member','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager']));
drop policy if exists stock_count_lines_select on public.stock_count_lines;
create policy stock_count_lines_select on public.stock_count_lines for select to authenticated
  using (exists (select 1 from public.stock_counts c where c.id = count_id and can_see_site(c.site_id)
                 and has_any_role(array['md','ico','board_member','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager'])));
-- Writes only through submit_/review_stock_count.

-- Late-entry rules apply to the count date.
create or replace function public.fn_entry_date(p_table text, p_row jsonb)
returns date language plpgsql stable as $function$
begin
  return case p_table
    when 'production_log'    then (p_row->>'date')::date
    when 'damage_log'        then (p_row->>'date')::date
    when 'waybills'          then (p_row->>'waybill_date')::date
    when 'block_handovers'   then (p_row->>'handover_date')::date
    when 'material_receipts' then (p_row->>'received_on')::date
    when 'daily_roster'      then (p_row->>'roster_date')::date
    when 'downtime_log'      then ((p_row->>'start_time')::timestamptz at time zone 'Africa/Lagos')::date
    when 'site_day_status'   then (p_row->>'on_date')::date
    when 'stock_counts'      then (p_row->>'count_date')::date
  end;
end $function$;
drop trigger if exists trg_late_entry_check on public.stock_counts;
create trigger trg_late_entry_check before insert on public.stock_counts for each row execute function public.fn_late_entry_check();
drop trigger if exists trg_late_entry_log on public.stock_counts;
create trigger trg_late_entry_log after insert on public.stock_counts for each row execute function public.fn_late_entry_log();

-- 2. Book stock as at the end of a day --------------------------------------------------------------------------------------
create or replace function public.fn_stock_as_of(p_item_id uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(i.current_stock, 0)
         - coalesce((select sum(case when m.movement_type = 'in' then m.quantity else -m.quantity end)
                       from stock_movements m where m.item_id = i.id and m.date > p_date), 0)
    from inventory_items i where i.id = p_item_id
$$;

-- 3. Count sheet (blind: no book figures for the counter) -----------------------------------------------------------------
create or replace function public.stock_count_sheet(p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_any_role(array['md','ico']) or not can_see_site(p_site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'site_id', p_site_id,
    'site_name', (select name from production_sites where id = p_site_id),
    'has_approved_count', exists (select 1 from stock_counts where site_id = p_site_id and status = 'approved'),
    'last_approved_date', (select max(count_date) from stock_counts where site_id = p_site_id and status = 'approved'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('item_id', i.id, 'name', i.name, 'unit', i.unit, 'material', i.material, 'owner', i.owner)
                        order by i.material, i.name) from inventory_items i where i.site_id = p_site_id), '[]'::jsonb));
end $$;

-- 4. Submit ---------------------------------------------------------------------------------------------------------------
create or replace function public.submit_stock_count(p_site_id uuid, p_count_date date, p_lines jsonb, p_notes text default null,
  p_is_opening boolean default false, p_late_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; s production_sites%rowtype; i record; v_line jsonb; v_qty numeric; v_sys numeric; v_var numeric;
        v_pct numeric; v_cost numeric; v_summary text := ''; v_total numeric := 0; v_flag boolean;
begin
  if not has_any_role(array['md','ico']) then raise exception 'Only the ICO or MD can record a stock count.'; end if;
  if not can_see_site(p_site_id) then raise exception 'You do not have access to that site.'; end if;
  select * into s from production_sites where id = p_site_id;
  if not found then raise exception 'Site not found.'; end if;
  if p_count_date is null then raise exception 'Choose the count date.'; end if;
  if exists (select 1 from stock_counts where site_id = p_site_id and count_date = p_count_date and status <> 'rejected') then
    raise exception 'A count for % already exists at this site. Ask the MD to reject it first if it is wrong.', to_char(p_count_date, 'FMDD Mon');
  end if;
  if exists (select 1 from stock_counts where site_id = p_site_id and status = 'approved' and count_date >= p_count_date) then
    raise exception 'A count on or after this date is already approved for this site. Count on a later date.';
  end if;
  if jsonb_typeof(coalesce(p_lines, 'null'::jsonb)) <> 'array' then raise exception 'Enter the counted quantities.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();

  insert into stock_counts (site_id, count_date, is_opening, notes, late_reason, counted_by, counted_by_name)
  values (p_site_id, p_count_date, coalesce(p_is_opening, false), nullif(btrim(p_notes), ''), nullif(btrim(p_late_reason), ''), auth.uid(), v_name)
  returning id into v_id;

  for i in select * from inventory_items where site_id = p_site_id order by material, name loop
    select x into v_line from jsonb_array_elements(p_lines) x where x->>'item_id' = i.id::text limit 1;
    if v_line is null or nullif(v_line->>'counted_qty', '') is null then raise exception 'Enter a count for %.', i.name; end if;
    v_qty := (v_line->>'counted_qty')::numeric;
    if v_qty < 0 then raise exception 'The count for % cannot be negative.', i.name; end if;
    v_sys := fn_stock_as_of(i.id, p_count_date);
    v_var := v_qty - v_sys;
    v_pct := case when abs(v_sys) > 0 then round(v_var / abs(v_sys) * 100, 1) end;
    v_cost := case when i.owner = 'client' then null else nullif(i.unit_cost, 0) end;
    v_flag := not coalesce(p_is_opening, false) and v_var <> 0 and (v_pct is null or abs(v_pct) > coalesce(s.variance_tolerance_pct, 5));
    insert into stock_count_lines (count_id, item_id, counted_qty, system_qty, variance_qty, variance_pct, unit_cost, variance_value, over_tolerance, note)
    values (v_id, i.id, v_qty, v_sys, v_var, v_pct, v_cost, case when v_cost is not null then round(v_var * v_cost, 2) end, v_flag,
            nullif(btrim(v_line->>'note'), ''));
    if v_var <> 0 then
      v_summary := v_summary || case when v_summary = '' then '' else '; ' end || initcap(coalesce(i.material, i.name)) || ' '
        || case when v_var > 0 then '+' else '' end
        || case when i.unit = 'kg' then round(v_var / 1000, 2) || ' t' else round(v_var, 1) || ' ' || i.unit end;
      v_total := v_total + coalesce(round(v_var * v_cost, 2), 0);
    end if;
  end loop;

  perform fn_notify_role('md', 'action_required', 'Stock count to approve: ' || s.name || ' ' || to_char(p_count_date, 'FMDD Mon'),
    case when coalesce(p_is_opening, false) then 'Opening count. ' else '' end
    || case when v_summary = '' then 'No difference from the app.' else v_summary || '. Value ₦' || to_char(v_total, 'FM999,999,999,990') || '.' end,
    'stock_counts', v_id);
  return v_id;
end $$;

-- 5. Approve / reject -----------------------------------------------------------------------------------------------------
create or replace function public.review_stock_count(p_count_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c stock_counts%rowtype; s production_sites%rowtype; l record; v_name text; v_sys numeric; v_var numeric; v_pct numeric;
        v_mov uuid; v_flags int := 0; v_total numeric := 0;
begin
  if not has_any_role(array['md']) then raise exception 'Only the MD can approve or reject a stock count.'; end if;
  select * into c from stock_counts where id = p_count_id for update;
  if not found then raise exception 'Stock count not found.'; end if;
  if c.status <> 'submitted' then raise exception 'This count is already %.', c.status; end if;
  select * into s from production_sites where id = c.site_id;
  select full_name into v_name from user_profiles where id = auth.uid();

  if p_action = 'reject' then
    if coalesce(btrim(p_note), '') = '' then raise exception 'Say why the count is rejected.'; end if;
    update stock_counts set status = 'rejected', reviewed_by = auth.uid(), reviewed_by_name = v_name, reviewed_at = now(), review_note = btrim(p_note) where id = p_count_id;
    if c.counted_by is not null then
      perform fn_create_notification(c.counted_by, 'rejected', 'Stock count rejected: ' || s.name || ' ' || to_char(c.count_date, 'FMDD Mon'), btrim(p_note), 'stock_counts', p_count_id);
    end if;
    return;
  elsif p_action <> 'approve' then
    raise exception 'Unknown action.';
  end if;

  if exists (select 1 from stock_counts where site_id = c.site_id and status = 'approved' and count_date >= c.count_date) then
    raise exception 'A later count is already approved for this site. Reject this one.';
  end if;
  if s.day_status_from is not null and c.count_date >= s.day_status_from
     and not exists (select 1 from production_log where site_id = c.site_id and date = c.count_date)
     and not exists (select 1 from site_day_status where site_id = c.site_id and on_date = c.count_date) then
    raise exception 'Production (or a no-production day) for % is not recorded yet at %. Approve after it is, so the app''s stock is complete.',
      to_char(c.count_date, 'FMDD Mon'), s.name;
  end if;

  -- Recompute against the book stock as it stands now, then post the differences dated on the count day.
  perform set_config('app.stock_count_post', 'on', true);
  for l in select scl.*, i.name, i.unit, i.owner from stock_count_lines scl join inventory_items i on i.id = scl.item_id where scl.count_id = p_count_id loop
    v_sys := fn_stock_as_of(l.item_id, c.count_date);
    v_var := l.counted_qty - v_sys;
    v_pct := case when abs(v_sys) > 0 then round(v_var / abs(v_sys) * 100, 1) end;
    v_mov := null;
    if v_var <> 0 then
      insert into stock_movements (item_id, movement_type, quantity, unit_cost, total_cost, supplier, issued_to, reference, staff_name, date, notes)
      values (l.item_id, case when v_var > 0 then 'in' else 'out' end, abs(v_var), l.unit_cost,
              case when l.unit_cost is not null then round(abs(v_var) * l.unit_cost, 2) end,
              case when v_var > 0 then 'Stock count' end, case when v_var < 0 then 'Stock count' end,
              'COUNT-' || left(p_count_id::text, 8), v_name, c.count_date,
              case when c.is_opening then 'Opening stock count adjustment' else 'Stock count adjustment' end
                || ' (counted ' || l.counted_qty || ', app ' || v_sys || ')')
      returning id into v_mov;
    end if;
    update stock_count_lines
       set system_qty = v_sys, variance_qty = v_var, variance_pct = v_pct,
           variance_value = case when unit_cost is not null then round(v_var * unit_cost, 2) end,
           over_tolerance = not c.is_opening and v_var <> 0 and (v_pct is null or abs(v_pct) > coalesce(s.variance_tolerance_pct, 5)),
           adjustment_movement_id = v_mov
     where id = l.id;
  end loop;
  perform set_config('app.stock_count_post', 'off', true);

  update stock_counts set status = 'approved', reviewed_by = auth.uid(), reviewed_by_name = v_name, reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_count_id;
  select count(*) filter (where over_tolerance), coalesce(sum(variance_value), 0) into v_flags, v_total from stock_count_lines where count_id = p_count_id;
  perform fn_notify_site_users(c.site_id, 'info', 'Stock count approved: ' || s.name || ' ' || to_char(c.count_date, 'FMDD Mon'),
    'The app''s stock now matches the count.' || case when v_flags > 0 then ' ' || v_flags || ' line(s) outside the ' || coalesce(s.variance_tolerance_pct, 5) || '% tolerance.' else '' end,
    'stock_counts', p_count_id);
  if c.counted_by is not null then
    perform fn_create_notification(c.counted_by, 'approved', 'Stock count approved: ' || s.name || ' ' || to_char(c.count_date, 'FMDD Mon'),
      'Difference value ₦' || to_char(v_total, 'FM999,999,999,990') || '.', 'stock_counts', p_count_id);
  end if;
end $$;

-- 6. After an approved count, stock entries dated on or before the count day are locked for that site --------------------
create or replace function public.fn_stock_count_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item uuid := coalesce(new.item_id, old.item_id); v_min date; v_lock date; v_site text;
begin
  if current_setting('app.stock_count_post', true) = 'on' then return coalesce(new, old); end if;
  v_min := case tg_op when 'INSERT' then new.date when 'DELETE' then old.date else least(new.date, old.date) end;
  select max(c.count_date), max(ps.name) into v_lock, v_site
    from stock_counts c join inventory_items i on i.site_id = c.site_id join production_sites ps on ps.id = c.site_id
   where i.id = v_item and c.status = 'approved';
  if v_lock is not null and v_min <= v_lock then
    raise exception 'STOCK_LOCKED: Stock at % was counted on %. Entries dated on or before that day can no longer change stock — use a later date and explain in the notes.',
      v_site, to_char(v_lock, 'FMDD Mon YYYY');
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_0_stock_count_lock on public.stock_movements;
create trigger trg_0_stock_count_lock before insert or update or delete on public.stock_movements
  for each row execute function public.fn_stock_count_lock();

-- 7. Weekly rhythm: Friday reminder to the ICO; Saturday check for sites not counted this week ----------------------------
create or replace function public.run_stock_count_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare v_today date := lagos_today(); v_dow int := extract(isodow from lagos_today()); v_week_start date; v_sites text; s production_sites%rowtype; v_n int := 0;
begin
  v_week_start := v_today - (v_dow - 1);
  if v_dow = 5 then
    select string_agg(name, ', ' order by name) into v_sites from production_sites ps
     where day_status_from is not null
       and not exists (select 1 from stock_counts c where c.site_id = ps.id and c.status <> 'rejected' and c.count_date between v_week_start and v_today);
    if v_sites is not null then
      perform fn_notify_role('ico', 'action_required', 'Friday stock count due', 'Count cement, dust, chippings and diesel today at: ' || v_sites || '.', 'stock_counts', null);
      v_n := 1;
    end if;
  elsif v_dow = 6 then
    for s in select * from production_sites ps where day_status_from is not null
               and not exists (select 1 from stock_counts c where c.site_id = ps.id and c.status <> 'rejected' and c.count_date between v_week_start and v_today) loop
      perform fn_notify_role('md', 'action_required', 'No stock count this week: ' || s.name, 'No physical count was recorded between ' || to_char(v_week_start, 'FMDD Mon') || ' and today.', 'stock_counts', null);
      perform fn_notify_role('ico', 'action_required', 'Stock count missed: ' || s.name, 'Count it today and enter it with today''s date.', 'stock_counts', null);
      v_n := v_n + 1;
    end loop;
  end if;
  return v_n;
end $$;

revoke all on function public.fn_stock_as_of(uuid,date), public.fn_stock_count_lock(), public.run_stock_count_reminders() from public, anon, authenticated;
revoke all on function public.stock_count_sheet(uuid), public.submit_stock_count(uuid,date,jsonb,text,boolean,text), public.review_stock_count(uuid,text,text) from public, anon;
grant execute on function public.stock_count_sheet(uuid), public.submit_stock_count(uuid,date,jsonb,text,boolean,text), public.review_stock_count(uuid,text,text) to authenticated;

-- Daily 08:20 Lagos; the function acts on Fridays and Saturdays only.
select cron.schedule('stock-count-reminders-daily', '20 7 * * *', 'select public.run_stock_count_reminders()');
