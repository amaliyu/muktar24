-- MD 2026-11-25: record when the generator was switched on and off each production day (manual times for now; hour meter
-- readings optional until we know Kado's generator has a working meter). Gives running hours (for servicing later) and
-- three diesel measures: litres per hour (target 30 L / 8 h), blocks per hour (2,500 / 8 h), blocks per litre (2,500 / 30 L).

alter table public.production_sites
  add column if not exists target_blocks_per_day numeric,
  add column if not exists production_hours numeric not null default 8;
update public.production_sites set target_blocks_per_day = 2500 where id = '00000000-0000-4000-8000-000000000002';

create table if not exists public.site_generator_days (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  on_date date not null,
  started_at time not null,
  stopped_at time not null,
  break_minutes int not null default 0,
  hour_meter_start numeric,
  hour_meter_end numeric,
  running_hours numeric generated always as
    (round(((extract(epoch from (stopped_at - started_at)) / 3600.0) - break_minutes / 60.0)::numeric, 2)) stored,
  note text,
  late_reason text,
  recorded_by uuid default auth.uid() references public.user_profiles(id),
  recorded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_generator_days_one_per_day unique (site_id, on_date),
  constraint site_generator_days_times check (stopped_at > started_at and stopped_at - started_at <= interval '16 hours'),
  constraint site_generator_days_break check (break_minutes >= 0 and make_interval(mins => break_minutes) < stopped_at - started_at),
  constraint site_generator_days_meter check (hour_meter_start is null or hour_meter_end is null or hour_meter_end >= hour_meter_start)
);
alter table public.site_generator_days enable row level security;
create policy site_generator_days_read on public.site_generator_days for select to authenticated using (can_see_site(site_id));
revoke insert, update, delete on public.site_generator_days from anon, authenticated;

-- Late-entry rule applies like other site records (more than a day late needs a reason, logged).
create or replace function public.fn_entry_date(p_table text, p_row jsonb)
returns date language plpgsql immutable as $$
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
    when 'site_generator_days' then (p_row->>'on_date')::date
  end;
end $$;
create trigger trg_late_entry_check before insert or update on public.site_generator_days
  for each row execute function fn_late_entry_check();
create trigger trg_late_entry_log after insert or update on public.site_generator_days
  for each row execute function fn_late_entry_log();

-- Measures for one site-day (used by warnings, the daily report and the app).
create or replace function public.site_generator_day(p_site_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s production_sites%rowtype; g site_generator_days%rowtype; v_blocks numeric; v_diesel numeric; v_hours numeric;
        v_meter_hours numeric;
begin
  if not can_see_site(p_site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  select * into s from production_sites where id = p_site_id;
  select * into g from site_generator_days where site_id = p_site_id and on_date = p_date;
  select coalesce(sum(quantity_produced), 0), coalesce(sum(diesel_litres), 0) into v_blocks, v_diesel
    from production_log where site_id = p_site_id and date = p_date;
  v_hours := g.running_hours;
  v_meter_hours := case when g.hour_meter_end is not null and g.hour_meter_start is not null then g.hour_meter_end - g.hour_meter_start end;
  return jsonb_build_object(
    'recorded', g.id is not null,
    'started_at', to_char(g.started_at, 'HH24:MI'), 'stopped_at', to_char(g.stopped_at, 'HH24:MI'),
    'break_minutes', g.break_minutes, 'running_hours', v_hours,
    'hour_meter_start', g.hour_meter_start, 'hour_meter_end', g.hour_meter_end, 'meter_hours', v_meter_hours,
    'note', g.note, 'recorded_by_name', g.recorded_by_name,
    'blocks', v_blocks, 'diesel_l', v_diesel,
    'litres_per_hour', case when v_hours > 0 then round(v_diesel / v_hours, 2) end,
    'blocks_per_hour', case when v_hours > 0 then round(v_blocks / v_hours) end,
    'blocks_per_litre', case when v_diesel > 0 then round(v_blocks / v_diesel, 1) end,
    'target_litres_per_hour', case when s.diesel_l_per_day > 0 and s.production_hours > 0 then round(s.diesel_l_per_day / s.production_hours, 2) end,
    'target_blocks_per_hour', case when s.target_blocks_per_day > 0 and s.production_hours > 0 then round(s.target_blocks_per_day / s.production_hours) end,
    'target_blocks_per_litre', case when s.target_blocks_per_day > 0 and s.diesel_l_per_day > 0 then round(s.target_blocks_per_day / s.diesel_l_per_day, 1) end,
    'target_blocks_per_day', s.target_blocks_per_day, 'diesel_l_per_day', s.diesel_l_per_day, 'production_hours', s.production_hours);
end $$;
revoke all on function public.site_generator_day(uuid, date) from public, anon;
grant execute on function public.site_generator_day(uuid, date) to authenticated;

create or replace function public.record_generator_day(p_site_id uuid, p_on_date date, p_started_at time, p_stopped_at time,
  p_break_minutes int default 0, p_hour_meter_start numeric default null, p_hour_meter_end numeric default null,
  p_note text default null, p_late_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not fn_can_raise_for_site(p_site_id) then raise exception 'Only the site manager or MD can record the generator for this site.' using errcode = '42501'; end if;
  if p_on_date is null or p_started_at is null or p_stopped_at is null then raise exception 'Enter the date, the time the generator went on and the time it went off.'; end if;
  if p_stopped_at <= p_started_at then raise exception 'The off time must be after the on time (same day).'; end if;
  if p_stopped_at - p_started_at > interval '16 hours' then raise exception 'More than 16 hours in one day — check the times.'; end if;
  if coalesce(p_break_minutes, 0) < 0 or make_interval(mins => coalesce(p_break_minutes, 0)) >= p_stopped_at - p_started_at then
    raise exception 'The time switched off during the day must be less than the time between on and off.';
  end if;
  if p_hour_meter_start is not null and p_hour_meter_end is not null and p_hour_meter_end < p_hour_meter_start then
    raise exception 'The closing meter reading cannot be lower than the opening reading.';
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into site_generator_days (site_id, on_date, started_at, stopped_at, break_minutes, hour_meter_start, hour_meter_end,
                                   note, late_reason, recorded_by, recorded_by_name)
  values (p_site_id, p_on_date, p_started_at, p_stopped_at, coalesce(p_break_minutes, 0), p_hour_meter_start, p_hour_meter_end,
          nullif(btrim(p_note), ''), nullif(btrim(p_late_reason), ''), auth.uid(), v_name)
  on conflict (site_id, on_date) do update set started_at = excluded.started_at, stopped_at = excluded.stopped_at,
     break_minutes = excluded.break_minutes, hour_meter_start = excluded.hour_meter_start, hour_meter_end = excluded.hour_meter_end,
     note = excluded.note, late_reason = coalesce(excluded.late_reason, site_generator_days.late_reason),
     recorded_by = excluded.recorded_by, recorded_by_name = excluded.recorded_by_name, updated_at = now()
  returning id into v_id;
  perform fn_recompute_production_exceptions(p_site_id, p_on_date);
  return v_id;
end $$;
revoke all on function public.record_generator_day(uuid, date, time, time, int, numeric, numeric, text, text) from public, anon;
grant execute on function public.record_generator_day(uuid, date, time, time, int, numeric, numeric, text, text) to authenticated;

-- Diesel warning text adds blocks per litre and, when recorded, the generator figures.
create or replace function public.fn_generator_text(p_site_id uuid, p_date date)
returns text language plpgsql stable security definer set search_path = public as $$
declare s production_sites%rowtype; g site_generator_days%rowtype; v_blocks numeric; v_diesel numeric; v_t text := '';
begin
  select * into s from production_sites where id = p_site_id;
  select coalesce(sum(quantity_produced), 0), coalesce(sum(diesel_litres), 0) into v_blocks, v_diesel
    from production_log where site_id = p_site_id and date = p_date;
  if v_diesel > 0 and s.target_blocks_per_day > 0 and s.diesel_l_per_day > 0 then
    v_t := format(' %s blocks per litre (target %s).', fn_fmt_qty(round(v_blocks / v_diesel)), fn_fmt_qty(round(s.target_blocks_per_day / s.diesel_l_per_day)));
  end if;
  select * into g from site_generator_days where site_id = p_site_id and on_date = p_date;
  if not found then
    return v_t || ' Generator on/off times not recorded.';
  end if;
  if g.running_hours > 0 then
    v_t := v_t || format(' Generator ran %s h (%s–%s): %s L an hour%s, %s blocks an hour%s.',
      fn_fmt_qty(g.running_hours), to_char(g.started_at, 'HH24:MI'), to_char(g.stopped_at, 'HH24:MI'),
      fn_fmt_qty(round(v_diesel / g.running_hours, 1)),
      case when s.diesel_l_per_day > 0 then ' (target ' || fn_fmt_qty(round(s.diesel_l_per_day / s.production_hours, 1)) || ')' else '' end,
      fn_fmt_qty(round(v_blocks / g.running_hours)),
      case when s.target_blocks_per_day > 0 then ' (target ' || fn_fmt_qty(round(s.target_blocks_per_day / s.production_hours)) || ')' else '' end);
  end if;
  return v_t;
end $$;
revoke all on function public.fn_generator_text(uuid, date) from public, anon, authenticated;

-- Hook into the recompute: after the diesel line is written, append the generator text to a flagged diesel message.
do $$
declare def text; marker text := $m$  if s is not null then v_new := v_new || s; end if;

  select coalesce(sum(quantity_damaged), 0) into v_damaged$m$;
begin
  def := pg_get_functiondef('public.fn_recompute_production_exceptions(uuid,date)'::regprocedure);
  if position(marker in def) = 0 then raise exception 'recompute marker missing'; end if;
  def := replace(def, marker, $m$  if s is not null then s := s || fn_generator_text(p_site, p_date); v_new := v_new || s; end if;
  update production_exceptions set message = message || fn_generator_text(p_site, p_date)
   where site_id = p_site and date = p_date and parameter = 'diesel' and kind is not null and status <> 'resolved';

  select coalesce(sum(quantity_damaged), 0) into v_damaged$m$);
  execute def;
end $$;

-- Daily checks: a production day with no generator times is incomplete.
create or replace function public.run_site_day_checks()
returns integer language plpgsql security definer set search_path = public as $$
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
    if v_blocks > 0 and not exists (select 1 from site_generator_days where site_id = s.id and on_date = v_day) then
      v_lines := v_lines || 'no generator on/off times recorded'::text;
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

-- Refresh Kado's diesel messages now (quiet).
do $$
declare r record;
begin
  perform set_config('app.exceptions_quiet', 'on', true);
  for r in select distinct date from production_log where site_id = '00000000-0000-4000-8000-000000000002' and date >= date '2026-11-01' loop
    perform fn_recompute_production_exceptions('00000000-0000-4000-8000-000000000002', r.date);
  end loop;
end $$;
