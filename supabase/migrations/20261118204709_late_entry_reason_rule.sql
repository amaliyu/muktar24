-- Applied to production 2026-11-18 by the planning chat (recorded here afterwards).
-- Late-entry rule (MD, 2026-11-18): an operational record may be entered up to 1 day after its date.
-- Anything older needs a written reason, and every late entry is logged for ICO review.
-- Logging is ON immediately. The reason becomes compulsory when app_flags.late_entry_reason_required
-- is switched on, after the screens can collect it.
-- Scope: inserts, and edits that move a record's date. Covers production, damage (not the auto rows
-- tied to a production entry or waybill), waybills, handovers, material receipts, roster and downtime.
-- Future dates are refused except on waybills.
-- NOTE: the version first applied read new.production_log_id directly, which fails on tables without
-- that column; it was replaced 37 seconds later by 20261118204746 (no user write was affected —
-- the only logged error was the planning chat's own test). The trigger functions below are the
-- corrected version so this file replays safely; 20261118204746 re-creates them identically.

insert into public.app_flags (key, enabled, note)
values ('late_entry_reason_required', false,
        'When on: records dated more than 1 day before today (Lagos) need late_reason (10+ characters). Logging to late_entries happens regardless.')
on conflict (key) do nothing;

alter table public.production_log    add column if not exists late_reason text;
alter table public.damage_log        add column if not exists late_reason text;
alter table public.waybills          add column if not exists late_reason text;
alter table public.block_handovers   add column if not exists late_reason text;
alter table public.material_receipts add column if not exists late_reason text;
alter table public.daily_roster      add column if not exists late_reason text;
alter table public.downtime_log      add column if not exists late_reason text;

create table if not exists public.late_entries (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  site_id uuid references public.production_sites(id),
  entry_date date not null,
  entered_at timestamptz not null default now(),
  days_late int not null,
  action text not null check (action in ('insert','date_change')),
  reason text,
  entered_by uuid,
  entered_by_name text,
  reviewed_at timestamptz,
  reviewed_by_name text,
  review_note text
);
create index if not exists late_entries_unreviewed on public.late_entries (entered_at desc) where reviewed_at is null;
alter table public.late_entries enable row level security;
revoke all on public.late_entries from anon;
revoke insert, update, delete on public.late_entries from authenticated;
drop policy if exists late_entries_select on public.late_entries;
create policy late_entries_select on public.late_entries for select to authenticated
  using (entered_by = auth.uid() or has_any_role(array['md','ico','accountant','board_member']));

create or replace function public.lagos_today()
returns date language sql stable as $$ select (now() at time zone 'Africa/Lagos')::date $$;

create or replace function public.fn_entry_date(p_table text, p_row jsonb)
returns date language plpgsql stable as $$
begin
  return case p_table
    when 'production_log'    then (p_row->>'date')::date
    when 'damage_log'        then (p_row->>'date')::date
    when 'waybills'          then (p_row->>'waybill_date')::date
    when 'block_handovers'   then (p_row->>'handover_date')::date
    when 'material_receipts' then (p_row->>'received_on')::date
    when 'daily_roster'      then (p_row->>'roster_date')::date
    when 'downtime_log'      then ((p_row->>'start_time')::timestamptz at time zone 'Africa/Lagos')::date
  end;
end $$;

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

do $$
declare t text;
begin
  foreach t in array array['production_log','damage_log','waybills','block_handovers','material_receipts','daily_roster','downtime_log'] loop
    execute format('drop trigger if exists trg_late_entry_check on public.%I', t);
    execute format('create trigger trg_late_entry_check before insert or update on public.%I for each row execute function public.fn_late_entry_check()', t);
    execute format('drop trigger if exists trg_late_entry_log on public.%I', t);
    execute format('create trigger trg_late_entry_log after insert or update on public.%I for each row execute function public.fn_late_entry_log()', t);
  end loop;
end $$;

create or replace function public.review_late_entry(p_id uuid, p_note text)
returns late_entries language plpgsql security definer set search_path = public as $$
declare v_row late_entries; v_name text;
begin
  if not has_any_role(array['md','ico']) then raise exception 'Only the ICO or MD can review late entries.'; end if;
  if length(trim(coalesce(p_note,''))) < 3 then raise exception 'Add a short review note.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  update late_entries set reviewed_at = now(), reviewed_by_name = v_name, review_note = trim(p_note)
   where id = p_id and reviewed_at is null returning * into v_row;
  if v_row.id is null then raise exception 'Late entry not found or already reviewed.'; end if;
  return v_row;
end $$;

drop function if exists public.record_material_receipt(uuid, date, numeric, numeric, text, text, text, text, text);
create or replace function public.record_material_receipt(p_item_id uuid, p_received_on date, p_qty_delivered numeric, p_qty_accepted numeric, p_rejection_reason text, p_supplier text, p_ref text, p_photo_path text, p_notes text, p_late_reason text default null)
 returns uuid language plpgsql security definer set search_path = public as $function$
declare v_item inventory_items%rowtype; v_id uuid; v_mov uuid; v_name text; v_site text;
begin
  if not has_any_role(array['md','store_officer','production_manager','assistant_production_manager']) then
    raise exception 'You do not have permission to record material deliveries.';
  end if;
  select * into v_item from inventory_items where id = p_item_id for update;
  if not found then raise exception 'Stock item not found.'; end if;
  if p_qty_delivered is null or p_qty_delivered <= 0 then raise exception 'Delivered quantity must be more than zero.'; end if;
  if p_qty_accepted is null or p_qty_accepted < 0 or p_qty_accepted > p_qty_delivered then
    raise exception 'Accepted quantity must be between 0 and the delivered quantity.';
  end if;
  if p_qty_accepted < p_qty_delivered and coalesce(trim(p_rejection_reason),'') = '' then
    raise exception 'Give a reason for the rejected quantity.';
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into material_receipts (site_id, item_id, received_on, qty_delivered, qty_accepted, rejection_reason,
      supplier_or_source, truck_or_waybill_ref, photo_path, notes, received_by_name, late_reason)
    values (v_item.site_id, p_item_id, coalesce(p_received_on, lagos_today()), p_qty_delivered, p_qty_accepted,
      nullif(trim(p_rejection_reason),''), p_supplier, p_ref, p_photo_path, p_notes, v_name, nullif(trim(p_late_reason),''))
    returning id into v_id;
  if p_qty_accepted > 0 then
    insert into stock_movements (item_id, movement_type, quantity, supplier, reference, staff_name, date, notes)
      values (p_item_id, 'in', p_qty_accepted, p_supplier, 'RCPT-'||left(v_id::text,8), v_name,
              coalesce(p_received_on, lagos_today()), 'Material receipt (accepted quantity)')
      returning id into v_mov;
    update inventory_items set current_stock = coalesce(current_stock,0) + p_qty_accepted, updated_at = now() where id = p_item_id;
    update material_receipts set stock_movement_id = v_mov where id = v_id;
  end if;
  if p_qty_accepted < p_qty_delivered then
    select name into v_site from production_sites where id = v_item.site_id;
    perform fn_notify_role('md', 'action_required', 'Material rejected at '||v_site,
      (p_qty_delivered - p_qty_accepted)||' '||v_item.unit||' of '||v_item.name||' rejected: '||trim(p_rejection_reason)
      ||case when v_item.owner = 'client' then '. Client-supplied — send the rejection notice to the client.' else '.' end,
      'material_receipts', v_id);
  end if;
  return v_id;
end $function$;

revoke all on function public.record_material_receipt(uuid, date, numeric, numeric, text, text, text, text, text, text) from public, anon;
grant execute on function public.record_material_receipt(uuid, date, numeric, numeric, text, text, text, text, text, text) to authenticated;
revoke all on function public.review_late_entry(uuid, text) from public, anon;
grant execute on function public.review_late_entry(uuid, text) to authenticated;
revoke all on function public.fn_late_entry_check() from public, anon;
revoke all on function public.fn_late_entry_log() from public, anon;
