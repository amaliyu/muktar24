-- Applied to production 2026-11-19 by the planning chat (recorded here afterwards). MD approved 2026-11-19 (scorecard step B).
-- Verified with a rolled-back test: a priced delivery while stock was negative took the new price; a second delivery averaged it;
-- with the flag on, a Kado delivery without a price was refused; production was costed at the average; a Bilaad delivery stayed unpriced.
-- Flag site_delivery_price_required stays OFF until the price field ships.

-- Step B (scorecard), part 1 (MD 2026-11-19): prices on deliveries and costed consumption.
-- * material_receipts.unit_cost: price per item unit (bag / kg / litre) on each delivery.
-- * inventory_items.unit_cost becomes a running weighted average, updated on each priced delivery
--   (if stock is zero or negative, the new price replaces the average).
-- * Production consumption movements are stamped with that average (unit_cost, total_cost).
-- * A price is REQUIRED on APCL-owned items at client sites (Kado) only when flag site_delivery_price_required is on
--   (switched on after the screen ships). Client-owned materials (Bilaad) are never priced.

alter table public.material_receipts add column if not exists unit_cost numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'material_receipts_unit_cost_positive') then
    alter table public.material_receipts add constraint material_receipts_unit_cost_positive check (unit_cost is null or unit_cost > 0);
  end if;
end $$;
comment on column public.material_receipts.unit_cost is 'Price per item unit (bag / kg / litre). APCL-owned items only; never for client-owned materials.';

insert into public.app_flags (key, enabled, note)
values ('site_delivery_price_required', false,
        'When on: deliveries of APCL-owned items at client sites (Kado) need a price per unit.')
on conflict (key) do nothing;

drop function if exists public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid);
create or replace function public.record_material_receipt(
  p_item_id uuid, p_received_on date, p_qty_delivered numeric, p_qty_accepted numeric, p_rejection_reason text,
  p_supplier text, p_ref text, p_photo_path text, p_notes text, p_late_reason text default null,
  p_requisition_id uuid default null, p_unit_cost numeric default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_item inventory_items%rowtype; v_id uuid; v_mov uuid; v_name text; v_site text; v_site_type text; v_req client_requisitions%rowtype;
        v_cost numeric;
begin
  if not has_any_role(array['md','store_officer','production_manager','assistant_production_manager']) then
    raise exception 'You do not have permission to record material deliveries.';
  end if;
  select * into v_item from inventory_items where id = p_item_id for update;
  if not found then raise exception 'Stock item not found.'; end if;
  select site_type into v_site_type from production_sites where id = v_item.site_id;
  if p_qty_delivered is null or p_qty_delivered <= 0 then raise exception 'Delivered quantity must be more than zero.'; end if;
  if p_qty_accepted is null or p_qty_accepted < 0 or p_qty_accepted > p_qty_delivered then
    raise exception 'Accepted quantity must be between 0 and the delivered quantity.';
  end if;
  if p_qty_accepted < p_qty_delivered and coalesce(trim(p_rejection_reason),'') = '' then
    raise exception 'Give a reason for the rejected quantity.';
  end if;
  if p_requisition_id is not null then
    select * into v_req from client_requisitions where id = p_requisition_id;
    if not found then raise exception 'Requisition not found.'; end if;
    if v_req.site_id is distinct from v_item.site_id then raise exception 'That requisition is for a different site.'; end if;
    if v_req.status not in ('sent','client_approved') then
      raise exception 'Deliveries can only be recorded against a requisition that has been sent to the client (current: %).', v_req.status;
    end if;
  end if;

  if v_item.owner = 'client' then
    v_cost := null;                                   -- client materials are never priced
  else
    v_cost := case when p_unit_cost is not null and p_unit_cost > 0 then p_unit_cost end;
    if p_unit_cost is not null and p_unit_cost <= 0 then raise exception 'Price must be more than zero.'; end if;
    if v_cost is null and p_qty_accepted > 0 and v_site_type = 'client_site' and app_flag('site_delivery_price_required') then
      raise exception 'Enter the price per % for this delivery.', case v_item.unit when 'bags' then 'bag' when 'litres' then 'litre' when 'kg' then 'tonne' else v_item.unit end;
    end if;
  end if;

  select full_name into v_name from user_profiles where id = auth.uid();
  insert into material_receipts (site_id, item_id, received_on, qty_delivered, qty_accepted, rejection_reason,
      supplier_or_source, truck_or_waybill_ref, photo_path, notes, received_by_name, late_reason, requisition_id, unit_cost)
    values (v_item.site_id, p_item_id, coalesce(p_received_on, lagos_today()), p_qty_delivered, p_qty_accepted,
      nullif(trim(p_rejection_reason),''), p_supplier, p_ref, p_photo_path, p_notes, v_name, nullif(trim(p_late_reason),''),
      p_requisition_id, v_cost)
    returning id into v_id;
  if p_qty_accepted > 0 then
    if v_cost is not null then
      update inventory_items
         set unit_cost = case when coalesce(current_stock, 0) <= 0 or coalesce(unit_cost, 0) <= 0 then v_cost
                              else round((current_stock * unit_cost + p_qty_accepted * v_cost) / (current_stock + p_qty_accepted), 4) end
       where id = p_item_id;
    end if;
    insert into stock_movements (item_id, movement_type, quantity, supplier, reference, staff_name, date, notes, unit_cost, total_cost)
      values (p_item_id, 'in', p_qty_accepted, p_supplier, 'RCPT-'||left(v_id::text,8), v_name,
              coalesce(p_received_on, lagos_today()), 'Material receipt (accepted quantity)',
              v_cost, case when v_cost is not null then round(p_qty_accepted * v_cost, 2) end)
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
revoke all on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid,numeric) from public, anon;
grant execute on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid,numeric) to authenticated;

-- Production consumption is costed at the item's running average.
create or replace function public.fn_production_post_materials()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_ref text := 'PROD-' || left(new.id::text, 8); m record; v_item uuid; v_cost numeric; v_owner text;
begin
  if not app_flag('production_materials_in_db') then return null; end if;
  if tg_op = 'UPDATE' then
    if (new.site_id, new.date, new.cement_bags, new.granite_dust_kg, new.chippings_kg, new.diesel_litres)
       is not distinct from (old.site_id, old.date, old.cement_bags, old.granite_dust_kg, old.chippings_kg, old.diesel_litres) then
      return null;
    end if;
    delete from stock_movements where reference = v_ref and movement_type = 'out' and issued_to = 'Production';
  end if;
  for m in select * from (values ('cement', new.cement_bags), ('dust', new.granite_dust_kg),
                                 ('chippings', new.chippings_kg), ('diesel', new.diesel_litres)) x(material, qty)
           where coalesce(x.qty, 0) > 0 loop
    select id, unit_cost, owner into v_item, v_cost, v_owner from inventory_items
     where site_id = new.site_id and material = m.material order by created_at limit 1;
    if v_item is not null then
      if v_owner = 'client' or coalesce(v_cost, 0) <= 0 then v_cost := null; end if;
      insert into stock_movements (item_id, site_id, movement_type, quantity, issued_to, staff_name, reference, date, notes, unit_cost, total_cost)
      values (v_item, new.site_id, 'out', m.qty, 'Production', 'Auto', v_ref, new.date, 'Auto-deducted from production log',
              v_cost, case when v_cost is not null then round(m.qty * v_cost, 2) end);
    end if;
  end loop;
  return null;
end $function$;

-- Kado opening prices (MD 2026-11-19: from Umar's site report of 18 Nov) and costing of Kado consumption so far.
update public.inventory_items i
   set unit_cost = case i.material when 'cement' then 11600 when 'dust' then 17 when 'diesel' then 1970 end
  from public.production_sites s
 where s.id = i.site_id and s.code = 'KADO-SEQ' and i.owner = 'apcl' and i.material in ('cement','dust','diesel')
   and coalesce(i.unit_cost, 0) = 0;

update public.stock_movements sm
   set unit_cost = i.unit_cost, total_cost = round(sm.quantity * i.unit_cost, 2)
  from public.inventory_items i join public.production_sites s on s.id = i.site_id
 where sm.item_id = i.id and s.code = 'KADO-SEQ' and i.owner = 'apcl'
   and sm.movement_type = 'out' and sm.issued_to = 'Production' and sm.unit_cost is null and coalesce(i.unit_cost,0) > 0;
