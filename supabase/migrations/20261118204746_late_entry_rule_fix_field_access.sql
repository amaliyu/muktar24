-- Applied to production 2026-11-18 (recorded here afterwards).
-- Fix: read the damage_log link columns from the jsonb row, so the shared trigger works on every table.
create or replace function public.fn_late_entry_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new jsonb := to_jsonb(new); v_date date; v_old date; v_today date := lagos_today(); v_days int;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'damage_log' and (v_new->>'production_log_id' is not null or v_new->>'waybill_id' is not null) then
    return new;
  end if;
  v_date := fn_entry_date(tg_table_name, v_new);
  if v_date is null then return new; end if;
  if tg_op = 'UPDATE' then
    v_old := fn_entry_date(tg_table_name, to_jsonb(old));
    if v_date is not distinct from v_old then return new; end if;
  end if;
  if v_date > v_today and tg_table_name <> 'waybills' then
    raise exception 'The date % is in the future. Record it on or after that day.', to_char(v_date, 'DD Mon YYYY')
      using errcode = '22007';
  end if;
  v_days := v_today - v_date;
  if v_days > 1 and app_flag('late_entry_reason_required')
     and length(trim(coalesce(v_new->>'late_reason', ''))) < 10 then
    raise exception 'LATE_ENTRY: This record is for %, % days ago. Records must be entered by the next day. Give the reason it was not recorded on time (at least 10 characters).',
      to_char(v_date, 'DD Mon YYYY'), v_days using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.fn_late_entry_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new jsonb := to_jsonb(new); v_date date; v_old date; v_days int; v_name text;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'damage_log' and (v_new->>'production_log_id' is not null or v_new->>'waybill_id' is not null) then
    return null;
  end if;
  v_date := fn_entry_date(tg_table_name, v_new);
  if v_date is null then return null; end if;
  if tg_op = 'UPDATE' then
    v_old := fn_entry_date(tg_table_name, to_jsonb(old));
    if v_date is not distinct from v_old then return null; end if;
  end if;
  v_days := lagos_today() - v_date;
  if v_days <= 1 then return null; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into late_entries (table_name, record_id, site_id, entry_date, days_late, action, reason, entered_by, entered_by_name)
  values (tg_table_name, (v_new->>'id')::uuid, nullif(v_new->>'site_id','')::uuid, v_date, v_days,
          case when tg_op = 'INSERT' then 'insert' else 'date_change' end,
          nullif(trim(coalesce(v_new->>'late_reason','')), ''), auth.uid(), v_name);
  return null;
end $$;

revoke all on function public.fn_late_entry_check() from public, anon;
revoke all on function public.fn_late_entry_log() from public, anon;
