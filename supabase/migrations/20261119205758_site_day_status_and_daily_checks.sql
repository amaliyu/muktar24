-- MD 2026-11-19: every site day must be accounted for. A day without production gets a day status (reason, whether
-- staff worked and what they did). A breakdown opens the downtime log. A 06:05 check flags yesterday's missing
-- production/day status and missing labour roster. Idle-day labour shows in the scorecard and period totals.

-- 1. Which sites must account for every day (from when) ----------------------------------------------------------------
alter table public.production_sites add column if not exists day_status_from date;
update public.production_sites set day_status_from = date '2026-11-10' where id = '00000000-0000-4000-8000-000000000002' and day_status_from is null; -- Kado: first production 10 Nov
update public.production_sites set day_status_from = date '2026-11-17' where id = '00000000-0000-4000-8000-000000000003' and day_status_from is null; -- Life Camp: first production 17 Nov
-- Dutse left null while production is on hold.

-- 2. Day status ----------------------------------------------------------------------------------------------------------
create table if not exists public.site_day_status (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  on_date date not null,
  reason text not null check (reason in ('rest_day','breakdown','no_materials','no_diesel_power','rain','client_hold','other')),
  note text,
  staff_worked boolean not null default false,
  work_done text[] not null default '{}' check (work_done <@ array['stacking','offloading','maintenance','cleaning','other']::text[]),
  work_note text,
  downtime_id uuid references public.downtime_log(id),
  late_reason text,
  recorded_by uuid references public.user_profiles(id),
  recorded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_day_status_one_per_day unique (site_id, on_date),
  constraint site_day_status_other_note check (reason <> 'other' or length(btrim(coalesce(note, ''))) >= 3),
  constraint site_day_status_work check (not staff_worked or cardinality(work_done) > 0)
);
alter table public.site_day_status enable row level security;
drop policy if exists site_day_status_select on public.site_day_status;
create policy site_day_status_select on public.site_day_status for select to authenticated
  using (can_see_site(site_id) and has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager']));
-- No write policies: writes only through record_/clear_site_day_status.

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
  end;
end $function$;

drop trigger if exists trg_late_entry_check on public.site_day_status;
create trigger trg_late_entry_check before insert or update on public.site_day_status for each row execute function public.fn_late_entry_check();
drop trigger if exists trg_late_entry_log on public.site_day_status;
create trigger trg_late_entry_log after insert or update on public.site_day_status for each row execute function public.fn_late_entry_log();
drop trigger if exists trg_zz_assigned_site_check on public.site_day_status;
create trigger trg_zz_assigned_site_check before insert or update or delete on public.site_day_status for each row execute function public.fn_assigned_site_check();

create or replace function public.record_site_day_status(p_site_id uuid, p_on_date date, p_reason text, p_note text default null,
  p_staff_worked boolean default false, p_work_done text[] default null, p_work_note text default null, p_late_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dt uuid; v_asset uuid; v_name text; v_work text[];
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) then
    raise exception 'You do not have permission to record the site day.';
  end if;
  if not can_see_site(p_site_id) then raise exception 'You do not have access to that site.'; end if;
  if p_on_date is null then raise exception 'Choose the date.'; end if;
  if p_reason is null or p_reason not in ('rest_day','breakdown','no_materials','no_diesel_power','rain','client_hold','other') then
    raise exception 'Choose why there was no production.';
  end if;
  if p_reason = 'other' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say why there was no production.'; end if;
  v_work := case when coalesce(p_staff_worked, false) then coalesce(p_work_done, '{}') else '{}' end;
  if exists (select 1 from unnest(v_work) w where w not in ('stacking','offloading','maintenance','cleaning','other')) then
    raise exception 'Unknown work type.';
  end if;
  if coalesce(p_staff_worked, false) and cardinality(v_work) = 0 then raise exception 'Tick what the staff did.'; end if;
  if 'other' = any(v_work) and length(btrim(coalesce(p_work_note, ''))) < 3 then raise exception 'Say what other work the staff did.'; end if;
  if exists (select 1 from production_log where site_id = p_site_id and date = p_on_date) then
    raise exception 'Production is already recorded for % — use the downtime log for stoppages on a production day.', to_char(p_on_date, 'FMDD Mon');
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();

  select id, downtime_id into v_id, v_dt from site_day_status where site_id = p_site_id and on_date = p_on_date for update;
  if v_id is not null then
    update site_day_status set reason = p_reason, note = nullif(btrim(p_note), ''), staff_worked = coalesce(p_staff_worked, false),
           work_done = v_work, work_note = nullif(btrim(p_work_note), ''), recorded_by = auth.uid(), recorded_by_name = v_name, updated_at = now()
     where id = v_id;
  else
    insert into site_day_status (site_id, on_date, reason, note, staff_worked, work_done, work_note, late_reason, recorded_by, recorded_by_name)
    values (p_site_id, p_on_date, p_reason, nullif(btrim(p_note), ''), coalesce(p_staff_worked, false), v_work, nullif(btrim(p_work_note), ''),
            nullif(btrim(p_late_reason), ''), auth.uid(), v_name)
    returning id into v_id;
  end if;

  -- A breakdown day opens (or joins) the machine's downtime record.
  if p_reason = 'breakdown' and v_dt is null then
    select id into v_asset from assets where site_id = p_site_id and asset_type = 'machine' and status = 'active' order by code limit 1;
    if v_asset is not null then
      select id into v_dt from downtime_log where asset_id = v_asset and end_time is null order by start_time desc limit 1;
      if v_dt is null then
        insert into downtime_log (asset_id, start_time, reason_category, reason_detail, recorded_by_user, site_id, late_reason, resolved)
        values (v_asset, (p_on_date + time '07:00') at time zone 'Africa/Lagos', 'breakdown',
                coalesce(nullif(btrim(p_note), ''), 'Breakdown — no production'), auth.uid(), p_site_id, nullif(btrim(p_late_reason), ''), false)
        returning id into v_dt;
      end if;
      update site_day_status set downtime_id = v_dt where id = v_id;
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.clear_site_day_status(p_site_id uuid, p_on_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager']) then
    raise exception 'You do not have permission to change the site day.';
  end if;
  if not can_see_site(p_site_id) then raise exception 'You do not have access to that site.'; end if;
  delete from site_day_status where site_id = p_site_id and on_date = p_on_date;
  if not found then raise exception 'There is no day status to remove for that day.'; end if;
end $$;

-- 3. Production cannot be recorded on a day marked as no production --------------------------------------------------
create or replace function public.fn_production_day_status_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.date is distinct from old.date or new.site_id is distinct from old.site_id)
     and exists (select 1 from site_day_status where site_id = new.site_id and on_date = new.date) then
    raise exception 'DAY_MARKED: % is marked as a no-production day at this site. Remove that day status first, then record production.',
      to_char(new.date, 'FMDD Mon YYYY');
  end if;
  return new;
end $$;
drop trigger if exists trg_y_production_day_status on public.production_log;
create trigger trg_y_production_day_status before insert or update on public.production_log
  for each row execute function public.fn_production_day_status_check();

-- 4. Scorecard shows the day status and idle labour ------------------------------------------------------------------------
do $$
declare d text; anchor text := '''open_warnings'', (select count(*)';
begin
  d := pg_get_functiondef('public.site_daily_scorecard(uuid,date)'::regprocedure);
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then raise exception 'site_daily_scorecard: anchor not found exactly once'; end if;
  d := replace(d, anchor,
    '''day_status'', (select jsonb_build_object(''reason'', ds.reason, ''note'', ds.note, ''staff_worked'', ds.staff_worked, ''work_done'', ds.work_done,
         ''work_note'', ds.work_note, ''recorded_by_name'', ds.recorded_by_name, ''downtime_id'', ds.downtime_id)
       from site_day_status ds where ds.site_id = p_site_id and ds.on_date = p_date),
    ''idle_labour'', case when bt = 0 then lab_cost end,
    ' || anchor);
  execute d;
end $$;

-- 5. Period view: every day, what is missing, costs including idle days ----------------------------------------------------
create or replace function public.site_day_overview(p_site_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s production_sites%rowtype; v_today date := lagos_today(); v_days jsonb; v_tot jsonb;
begin
  if not has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager'])
     or not can_see_site(p_site_id) then
    raise exception 'Not allowed for this site.' using errcode = '42501';
  end if;
  select * into s from production_sites where id = p_site_id;
  if not found then raise exception 'Site not found.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'Choose a date range of up to 3 months.'; end if;

  with d as (select g::date as on_day from generate_series(p_from, p_to, interval '1 day') g),
  x as (
    select d.on_day,
      coalesce((select sum(pl.quantity_produced) from production_log pl where pl.site_id = p_site_id and pl.date = d.on_day), 0) as blocks,
      exists (select 1 from production_log pl where pl.site_id = p_site_id and pl.date = d.on_day) as has_production,
      (select jsonb_build_object('reason', ds.reason, 'note', ds.note, 'staff_worked', ds.staff_worked, 'work_done', ds.work_done,
              'work_note', ds.work_note, 'recorded_by_name', ds.recorded_by_name, 'downtime_id', ds.downtime_id)
         from site_day_status ds where ds.site_id = p_site_id and ds.on_date = d.on_day) as status,
      (select sum(r.total_daily_cost) from daily_roster r where r.site_id = p_site_id and r.roster_date = d.on_day) as labour,
      exists (select 1 from daily_roster r where r.site_id = p_site_id and r.roster_date = d.on_day) as has_roster,
      (select sum(sm.total_cost) from stock_movements sm where sm.site_id = p_site_id and sm.date = d.on_day
          and sm.movement_type = 'out' and sm.issued_to = 'Production') as materials
    from d),
  y as (
    select x.*,
      (s.day_status_from is not null and on_day >= s.day_status_from and on_day < v_today and not has_production and status is null) as missing_record,
      (s.day_status_from is not null and on_day >= s.day_status_from and on_day < v_today and not has_roster
         and (blocks > 0 or coalesce((status->>'staff_worked')::boolean, false))) as missing_roster
    from x)
  select jsonb_agg(jsonb_build_object('date', on_day, 'blocks', blocks, 'has_production', has_production, 'status', status,
            'roster_recorded', has_roster, 'labour_cost', labour, 'material_cost', materials,
            'missing_record', missing_record, 'missing_roster', missing_roster) order by on_day desc),
         jsonb_build_object(
            'blocks', sum(blocks),
            'production_days', count(*) filter (where blocks > 0),
            'no_production_days', count(*) filter (where status is not null),
            'idle_staff_days', count(*) filter (where coalesce((status->>'staff_worked')::boolean, false)),
            'material_cost', sum(materials),
            'labour_cost', sum(labour),
            'idle_labour_cost', sum(labour) filter (where blocks = 0),
            'cost_per_block', case when sum(blocks) > 0 then round((coalesce(sum(materials), 0) + coalesce(sum(labour), 0)) / sum(blocks), 2) end,
            'cost_per_block_excl_idle', case when sum(blocks) > 0
                 then round((coalesce(sum(materials), 0) + coalesce(sum(labour) filter (where blocks > 0), 0)) / sum(blocks), 2) end,
            'missing_records', count(*) filter (where missing_record),
            'missing_rosters', count(*) filter (where missing_roster))
    into v_days, v_tot
    from y;
  return jsonb_build_object('site_id', s.id, 'site_name', s.name, 'day_status_from', s.day_status_from,
                            'from', p_from, 'to', p_to, 'days', coalesce(v_days, '[]'::jsonb), 'totals', v_tot);
end $$;

-- 6. Morning check (06:05 Lagos) for yesterday ----------------------------------------------------------------------------
create or replace function public.run_site_day_checks()
returns int language plpgsql security definer set search_path = public as $$
declare s production_sites%rowtype; v_day date := lagos_today() - 1; v_lines text[]; v_prod boolean; v_blocks numeric;
        v_worked boolean; v_has_status boolean; v_n int := 0; v_title text;
begin
  for s in select * from production_sites where day_status_from is not null and day_status_from <= v_day loop
    v_lines := '{}';
    select count(*) > 0, coalesce(sum(quantity_produced), 0) into v_prod, v_blocks from production_log where site_id = s.id and date = v_day;
    select count(*) > 0, coalesce(bool_or(staff_worked), false) into v_has_status, v_worked from site_day_status where site_id = s.id and on_date = v_day;
    if not v_prod and not v_has_status then v_lines := v_lines || 'no production and no day status recorded'::text; end if;
    if (v_blocks > 0 or v_worked) and not exists (select 1 from daily_roster where site_id = s.id and roster_date = v_day) then
      v_lines := v_lines || 'no labour roster recorded'::text;
    end if;
    if cardinality(v_lines) > 0 then
      v_title := s.name || ': ' || to_char(v_day, 'FMDD Mon') || ' is incomplete';
      perform fn_notify_site_users(s.id, 'action_required', v_title, 'Yesterday: ' || array_to_string(v_lines, '; ') || '.', 'site_day_status', s.id);
      perform fn_notify_role('md', 'action_required', v_title, initcap(left(array_to_string(v_lines, '; '), 1)) || substr(array_to_string(v_lines, '; '), 2) || '.', 'site_day_status', s.id);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

revoke all on function public.record_site_day_status(uuid,date,text,text,boolean,text[],text,text), public.clear_site_day_status(uuid,date),
  public.site_day_overview(uuid,date,date) from public, anon;
grant execute on function public.record_site_day_status(uuid,date,text,text,boolean,text[],text,text), public.clear_site_day_status(uuid,date),
  public.site_day_overview(uuid,date,date) to authenticated;
revoke all on function public.run_site_day_checks(), public.fn_production_day_status_check() from public, anon, authenticated;

select cron.schedule('site-day-checks-daily', '5 5 * * *', 'select public.run_site_day_checks()');
