-- MD 2026-11-19: link deliveries to the payment request that paid for them (closes the request automatically),
-- plus two fixes: deactivated staff lose their attendance PIN; rejected/cancelled advances no longer show as owed.

-- 1. Delivery <-> payment request ------------------------------------------------------------------------------------
alter table public.material_receipts add column if not exists payment_request_id uuid references public.payment_requests(id);
create index if not exists material_receipts_payment_request on public.material_receipts (payment_request_id);

drop function if exists public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid,numeric);
create or replace function public.record_material_receipt(
  p_item_id uuid, p_received_on date, p_qty_delivered numeric, p_qty_accepted numeric, p_rejection_reason text,
  p_supplier text, p_ref text, p_photo_path text, p_notes text, p_late_reason text default null,
  p_requisition_id uuid default null, p_unit_cost numeric default null, p_payment_request_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_item inventory_items%rowtype; v_id uuid; v_mov uuid; v_name text; v_role text; v_site text; v_site_type text;
        v_req client_requisitions%rowtype; v_cost numeric; v_pr payment_requests%rowtype; v_cat text; v_mech text;
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
  if p_payment_request_id is not null then
    select * into v_pr from payment_requests where id = p_payment_request_id for update;
    if not found then raise exception 'Payment request not found.'; end if;
    if v_item.owner = 'client' then raise exception 'Client-supplied materials are not linked to APCL payment requests.'; end if;
    if v_pr.site_id is distinct from v_item.site_id then raise exception 'That payment request is for a different site.'; end if;
    if v_pr.status not in ('md_approved','funded','disbursed') then
      raise exception 'Link a delivery only to an approved or paid request (current: %).', v_pr.status;
    end if;
    select name, closure_mechanism into v_cat, v_mech from expense_categories where id = v_pr.expense_category_id;
    if v_mech is distinct from 'stock_movements' then raise exception 'That request is not for materials or fuel (category: %).', coalesce(v_cat, '-'); end if;
    if v_cat = 'Production Fuel' and coalesce(v_item.material, '') <> 'diesel' then raise exception 'A Production Fuel request can only be linked to a diesel delivery.'; end if;
    if v_cat = 'Raw Materials' and coalesce(v_item.material, '') = 'diesel' then raise exception 'Diesel is bought under Production Fuel, not Raw Materials.'; end if;
  end if;

  if v_item.owner = 'client' then
    v_cost := null;
  else
    v_cost := case when p_unit_cost is not null and p_unit_cost > 0 then p_unit_cost end;
    if p_unit_cost is not null and p_unit_cost <= 0 then raise exception 'Price must be more than zero.'; end if;
    if v_cost is null and p_qty_accepted > 0 and v_site_type = 'client_site' and app_flag('site_delivery_price_required') then
      raise exception 'Enter the price per % for this delivery.', case v_item.unit when 'bags' then 'bag' when 'litres' then 'litre' when 'kg' then 'tonne' else v_item.unit end;
    end if;
  end if;

  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  insert into material_receipts (site_id, item_id, received_on, qty_delivered, qty_accepted, rejection_reason,
      supplier_or_source, truck_or_waybill_ref, photo_path, notes, received_by_name, late_reason, requisition_id, unit_cost, payment_request_id)
    values (v_item.site_id, p_item_id, coalesce(p_received_on, lagos_today()), p_qty_delivered, p_qty_accepted,
      nullif(trim(p_rejection_reason),''), p_supplier, p_ref, p_photo_path, p_notes, v_name, nullif(trim(p_late_reason),''),
      p_requisition_id, v_cost, p_payment_request_id)
    returning id into v_id;
  if p_qty_accepted > 0 then
    if v_cost is not null then
      update inventory_items
         set unit_cost = case when coalesce(current_stock, 0) <= 0 or coalesce(unit_cost, 0) <= 0 then v_cost
                              else round((current_stock * unit_cost + p_qty_accepted * v_cost) / (current_stock + p_qty_accepted), 4) end
       where id = p_item_id;
    end if;
    insert into stock_movements (item_id, movement_type, quantity, supplier, reference, staff_name, date, notes, unit_cost, total_cost, payment_request_id)
      values (p_item_id, 'in', p_qty_accepted, p_supplier, 'RCPT-'||left(v_id::text,8), v_name,
              coalesce(p_received_on, lagos_today()), 'Material receipt (accepted quantity)',
              v_cost, case when v_cost is not null then round(p_qty_accepted * v_cost, 2) end, p_payment_request_id)
      returning id into v_mov;
    update inventory_items set current_stock = coalesce(current_stock,0) + p_qty_accepted, updated_at = now() where id = p_item_id;
    update material_receipts set stock_movement_id = v_mov where id = v_id;

    -- A paid request is closed by its delivery (evidence = this stock movement).
    if p_payment_request_id is not null and v_pr.status = 'disbursed' then
      perform set_config('app.payment_request_guard', 'on', true);
      update payment_requests set status = 'closed' where id = p_payment_request_id;
      perform set_config('app.payment_request_guard', 'off', true);
      insert into payment_request_audit (payment_request_id, actor_id, actor_name, actor_role, action, old_status, new_status, reason)
      values (p_payment_request_id, auth.uid(), coalesce(v_name, 'System'), v_role, 'close', 'disbursed', 'closed',
              'Closed by delivery ' || 'RCPT-' || left(v_id::text, 8) || ' (' || p_qty_accepted || ' ' || v_item.unit || ' of ' || v_item.name || ')');
    end if;
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
revoke all on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid,numeric,uuid) from public, anon;
grant execute on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid,numeric,uuid) to authenticated;

-- A request linked to a delivery before it was paid closes the moment it is marked disbursed
-- (runs after the expense trigger, so the expense is still created).
create or replace function public.fn_pr_close_when_delivered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disbursed' and old.status is distinct from 'disbursed'
     and exists (select 1 from stock_movements where payment_request_id = new.id and movement_type = 'in')
     and exists (select 1 from expense_categories c where c.id = new.expense_category_id and c.closure_mechanism = 'stock_movements') then
    perform set_config('app.payment_request_guard', 'on', true);
    update payment_requests set status = 'closed' where id = new.id;
    perform set_config('app.payment_request_guard', 'off', true);
    insert into payment_request_audit (payment_request_id, actor_id, actor_name, actor_role, action, old_status, new_status, reason)
    values (new.id, auth.uid(), 'System', null, 'close', 'disbursed', 'closed', 'Closed on payment: delivery already recorded against it.');
  end if;
  return null;
end $$;
revoke all on function public.fn_pr_close_when_delivered() from public, anon;
drop trigger if exists trg_zz_pr_close_when_delivered on public.payment_requests;
create trigger trg_zz_pr_close_when_delivered after update of status on public.payment_requests
  for each row execute function public.fn_pr_close_when_delivered();

-- 2. Deactivated staff lose their attendance PIN ------------------------------------------------------------------------
create or replace function public.fn_staff_pin_off_when_inactive()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.employment_status in ('terminated','suspended') and old.employment_status is distinct from new.employment_status then
    update staff_pin_cache set is_active = false, updated_at = now() where staff_id = new.id and is_active;
  end if;
  return null;
end $$;
revoke all on function public.fn_staff_pin_off_when_inactive() from public, anon;
drop trigger if exists trg_zz_staff_pin_off_when_inactive on public.staff;
create trigger trg_zz_staff_pin_off_when_inactive after update of employment_status on public.staff
  for each row execute function public.fn_staff_pin_off_when_inactive();

-- 3. Rejected / cancelled advances no longer show a balance owed (from now on; existing rows left as the MD decided) -----
do $$
declare d text; old_line text := 'outstanding_balance = case when v_new = ''disbursed'' then v_amt else outstanding_balance end';
begin
  d := pg_get_functiondef('public.advance_salary_advance'::regproc);
  if position(old_line in d) = 0 then raise exception 'advance_salary_advance: expected line not found — not patched'; end if;
  d := replace(d, old_line,
    'outstanding_balance = case when v_new = ''disbursed'' then v_amt when v_new in (''rejected'',''cancelled'') then 0 else outstanding_balance end');
  execute d;
end $$;
