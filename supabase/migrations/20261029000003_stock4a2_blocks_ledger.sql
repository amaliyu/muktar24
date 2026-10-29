-- Audit 4A part 2 — block stock (Dutse yard + batches) owned by the database.
-- Planning chat, 2026-10-29. Fixes A4-1 (Store Officer waybill delete re-adds stock),
-- A4-2 (logistics dispatch doesn't reduce the batch), A4-3 (failed batch delete still
-- moved stock), A4-4/A4-5 (clamping / lost updates on yard and batch balances),
-- A4-8 (batch product change leaves yard under old product), A4-9 (waybill keeps old
-- batch / product on edit), A5-5, A5-8.
--
-- Rule from now on: finished_goods_stock.quantity_in_yard (Dutse yard) and
-- batches.qty_remaining change ONLY as a result of the records that cause them:
--   batch created at the factory   → yard + accepted;  batch remaining = accepted
--   batch accepted qty edited      → yard and remaining move by the difference
--   batch deleted (factory)        → yard − what was still remaining
--   waybill saved/edited/deleted   → yard − loaded (by its block type); its batch − loaded
--   damage logged against a batch  → batch − damaged; yard − damaged if factory batch
-- Each change is applied in the same transaction as the record, as balance + delta
-- (row-locked), never clamped at zero. A negative balance means more left the yard
-- than the system recorded arriving — it shows as a shortage to investigate.
-- Transition: the app still writes these balances itself; those writes are now
-- ignored so nothing is counted twice. Codex PR 4A removes them from the app.

create or replace function public.fn_yard_add(p_block_type text, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_delta, 0) = 0 or p_block_type is null then return; end if;
  perform set_config('app.block_ledger', 'on', true);
  insert into finished_goods_stock (block_type, quantity_in_yard, last_updated)
    values (p_block_type, p_delta, now())
  on conflict (block_type) do update
    set quantity_in_yard = coalesce(finished_goods_stock.quantity_in_yard, 0) + p_delta,
        last_updated = now();
  perform set_config('app.block_ledger', 'off', true);
end $$;

create or replace function public.fn_batch_add(p_batch_id uuid, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_batch_id is null or coalesce(p_delta, 0) = 0 then return; end if;
  perform set_config('app.block_ledger', 'on', true);
  update batches
     set qty_remaining = coalesce(qty_remaining, 0) + p_delta,
         status = case when status in ('active','exhausted')
                       then case when coalesce(qty_remaining, 0) + p_delta <= 0 then 'exhausted' else 'active' end
                       else status end
   where id = p_batch_id;
  perform set_config('app.block_ledger', 'off', true);
end $$;

create or replace function public.fn_is_factory_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from production_sites where id = p_site_id and site_type = 'factory')
$$;

revoke all on function public.fn_yard_add(text, numeric) from public, anon, authenticated;
revoke all on function public.fn_batch_add(uuid, numeric) from public, anon, authenticated;
revoke all on function public.fn_is_factory_site(uuid) from public, anon;

-- ── Direct balance writes from outside the ledger are ignored ───────────────────
create or replace function public.fn_fg_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.block_ledger', true) is distinct from 'on' then
    if TG_OP = 'INSERT' then NEW.quantity_in_yard := 0;
    else NEW.quantity_in_yard := OLD.quantity_in_yard; end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_fg_guard on public.finished_goods_stock;
create trigger trg_fg_guard before insert or update on public.finished_goods_stock
  for each row execute function public.fn_fg_guard();

create or replace function public.fn_batch_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    NEW.qty_remaining := NEW.qty_accepted;
    if NEW.status is null or NEW.status in ('active','exhausted') then
      NEW.status := case when coalesce(NEW.qty_accepted, 0) <= 0 then 'exhausted' else 'active' end;
    end if;
    return NEW;
  end if;
  if current_setting('app.block_ledger', true) is distinct from 'on' then
    if (NEW.block_type is distinct from OLD.block_type or NEW.site_id is distinct from OLD.site_id)
       and coalesce(OLD.qty_remaining, 0) <> coalesce(OLD.qty_accepted, 0) then
      raise exception 'Blocks from batch % have already been dispatched or damaged, so its product or site cannot change. Correct those records first, or create a new batch.', OLD.batch_number;
    end if;
    NEW.qty_remaining := coalesce(OLD.qty_remaining, 0) + (coalesce(NEW.qty_accepted, 0) - coalesce(OLD.qty_accepted, 0));
    if NEW.status in ('active','exhausted') or OLD.status in ('active','exhausted') then
      NEW.status := case when NEW.qty_remaining <= 0 then 'exhausted' else 'active' end;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_batch_guard on public.batches;
create trigger trg_batch_guard before insert or update on public.batches
  for each row execute function public.fn_batch_guard();

-- ── Batches move the Dutse yard ────────────────────────────────────────────────
create or replace function public.fn_batch_yard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if fn_is_factory_site(NEW.site_id) then perform fn_yard_add(NEW.block_type, NEW.qty_accepted); end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.block_type is distinct from OLD.block_type or NEW.site_id is distinct from OLD.site_id then
      if fn_is_factory_site(OLD.site_id) then perform fn_yard_add(OLD.block_type, -coalesce(OLD.qty_remaining, 0)); end if;
      if fn_is_factory_site(NEW.site_id) then perform fn_yard_add(NEW.block_type, coalesce(NEW.qty_remaining, 0)); end if;
    elsif NEW.qty_accepted is distinct from OLD.qty_accepted and fn_is_factory_site(NEW.site_id) then
      perform fn_yard_add(NEW.block_type, coalesce(NEW.qty_accepted, 0) - coalesce(OLD.qty_accepted, 0));
    end if;
  elsif TG_OP = 'DELETE' then
    if fn_is_factory_site(OLD.site_id) then perform fn_yard_add(OLD.block_type, -coalesce(OLD.qty_remaining, 0)); end if;
  end if;
  return coalesce(NEW, OLD);
end $$;
revoke all on function public.fn_batch_yard() from public, anon, authenticated;
drop trigger if exists trg_batch_yard on public.batches;
create trigger trg_batch_yard after insert or update or delete on public.batches
  for each row execute function public.fn_batch_yard();

-- ── Waybills take blocks out of the yard and their batch ───────────────────────
create or replace function public.fn_waybill_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP in ('UPDATE','DELETE') then
    perform fn_yard_add(OLD.block_type, coalesce(OLD.quantity_loaded, 0));
    perform fn_batch_add(OLD.batch_id, coalesce(OLD.quantity_loaded, 0));
  end if;
  if TG_OP in ('INSERT','UPDATE') then
    perform fn_yard_add(NEW.block_type, -coalesce(NEW.quantity_loaded, 0));
    perform fn_batch_add(NEW.batch_id, -coalesce(NEW.quantity_loaded, 0));
  end if;
  return coalesce(NEW, OLD);
end $$;
revoke all on function public.fn_waybill_stock() from public, anon, authenticated;
drop trigger if exists trg_waybill_stock on public.waybills;
create trigger trg_waybill_stock after insert or delete or update of block_type, quantity_loaded, batch_id
  on public.waybills for each row execute function public.fn_waybill_stock();

-- ── Damage logged against a batch ─────────────────────────────────────────────
create or replace function public.fn_batch_damage_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_type text;
begin
  if TG_OP in ('UPDATE','DELETE') and OLD.batch_id is not null then
    select site_id, block_type into v_site, v_type from batches where id = OLD.batch_id;
    perform fn_batch_add(OLD.batch_id, coalesce(OLD.quantity_damaged, 0));
    if fn_is_factory_site(v_site) then perform fn_yard_add(v_type, coalesce(OLD.quantity_damaged, 0)); end if;
  end if;
  if TG_OP in ('INSERT','UPDATE') and NEW.batch_id is not null then
    select site_id, block_type into v_site, v_type from batches where id = NEW.batch_id;
    perform fn_batch_add(NEW.batch_id, -coalesce(NEW.quantity_damaged, 0));
    if fn_is_factory_site(v_site) then perform fn_yard_add(v_type, -coalesce(NEW.quantity_damaged, 0)); end if;
  end if;
  return coalesce(NEW, OLD);
end $$;
revoke all on function public.fn_batch_damage_stock() from public, anon, authenticated;
drop trigger if exists trg_batch_damage_stock on public.damage_log;
create trigger trg_batch_damage_stock after insert or delete or update of batch_id, quantity_damaged
  on public.damage_log for each row execute function public.fn_batch_damage_stock();

-- A5-1: deleting a production entry returns its auto-deducted materials in the
-- same transaction (the materials ledger then restores the balance).
create or replace function public.fn_production_delete_materials()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from stock_movements
   where reference = 'PROD-' || left(OLD.id::text, 8)
     and movement_type = 'out' and issued_to = 'Production';
  return OLD;
end $$;
revoke all on function public.fn_production_delete_materials() from public, anon, authenticated;
drop trigger if exists trg_production_delete_materials on public.production_log;
create trigger trg_production_delete_materials before delete on public.production_log
  for each row execute function public.fn_production_delete_materials();
