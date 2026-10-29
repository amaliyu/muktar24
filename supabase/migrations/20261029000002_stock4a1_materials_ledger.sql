-- Audit 4A part 1 — materials stock owned by the database. Planning chat, 2026-10-29.
-- Fixes for materials (inventory_items / stock_movements): A4-4 (clamping invents
-- stock), A4-5 (simultaneous entries overwrite each other), A4-6 / A5-1 / A5-4
-- (balance changed even when the movement write failed), A4-7 (receipt movements
-- editable outside the receipt), A4-11 (site/unit changed under existing history).
--
-- Rule from now on: a material's current_stock changes ONLY through stock_movements.
-- Every insert/edit/delete of a movement adjusts the balance in the same transaction
-- with current_stock = current_stock + delta (row-locked, so two staff can't
-- overwrite each other). No clamping: if more is used than the system holds, the
-- balance goes negative and shows as a shortage (it means a delivery wasn't recorded),
-- instead of silently resetting to 0 and inventing stock on reversal.
--
-- Transition: the app (and record/void_material_receipt) still write current_stock
-- directly. Those direct writes are now ignored (the balance column keeps its value)
-- so nothing is counted twice; Codex PR 4A removes them from the app.

create or replace function public.fn_stock_ledger_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_linked boolean;
begin
  if TG_OP in ('UPDATE','DELETE') and current_setting('app.receipt_movement', true) is distinct from 'on' then
    select exists (select 1 from material_receipts r
                   where r.stock_movement_id = OLD.id or r.void_movement_id = OLD.id) into v_linked;
    if v_linked and (TG_OP = 'DELETE'
        or NEW.quantity is distinct from OLD.quantity or NEW.item_id is distinct from OLD.item_id
        or NEW.movement_type is distinct from OLD.movement_type) then
      raise exception 'This movement belongs to a material delivery record. Void the delivery in Material Receiving instead.';
    end if;
  end if;

  perform set_config('app.stock_ledger', 'on', true);
  if TG_OP in ('UPDATE','DELETE') then
    update inventory_items
       set current_stock = coalesce(current_stock, 0)
             - case when OLD.movement_type = 'in' then OLD.quantity else -OLD.quantity end,
           updated_at = now()
     where id = OLD.item_id;
  end if;
  if TG_OP in ('INSERT','UPDATE') then
    update inventory_items
       set current_stock = coalesce(current_stock, 0)
             + case when NEW.movement_type = 'in' then NEW.quantity else -NEW.quantity end,
           updated_at = now()
     where id = NEW.item_id;
    if not found then raise exception 'Stock item not found for this movement.'; end if;
  end if;
  perform set_config('app.stock_ledger', 'off', true);
  return coalesce(NEW, OLD);
end $$;
revoke all on function public.fn_stock_ledger_apply() from public, anon, authenticated;

drop trigger if exists trg_stock_ledger_apply on public.stock_movements;
create trigger trg_stock_ledger_apply after insert or update or delete on public.stock_movements
  for each row execute function public.fn_stock_ledger_apply();

-- Quantities must be positive; the direction comes from movement_type.
alter table public.stock_movements drop constraint if exists stock_movements_quantity_positive;
alter table public.stock_movements add constraint stock_movements_quantity_positive check (quantity > 0) not valid;
alter table public.stock_movements drop constraint if exists stock_movements_type_check_4a;
alter table public.stock_movements add constraint stock_movements_type_check_4a check (movement_type in ('in','out')) not valid;

create or replace function public.fn_inventory_item_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('app.stock_ledger', true) is distinct from 'on' then
    -- Balance writes from outside the ledger are ignored (see header).
    NEW.current_stock := OLD.current_stock;
  end if;
  if (NEW.site_id is distinct from OLD.site_id or NEW.unit is distinct from OLD.unit)
     and exists (select 1 from stock_movements m where m.item_id = OLD.id) then
    raise exception 'This item already has stock history. Create a new item for a different site or unit instead of changing this one.';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_inventory_item_guard on public.inventory_items;
create trigger trg_inventory_item_guard before update on public.inventory_items
  for each row execute function public.fn_inventory_item_guard();

-- Receipt functions: keep their logic; their own movement insert now moves the
-- balance (their direct balance update is ignored by the guard above).
-- Void must be allowed to insert its reversal; editing receipt movements stays blocked.
