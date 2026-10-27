-- Audit 2 (money totals), 2026-10-27 — planning chat.
-- 1) Atomic order-line replacement. The app's old edit deleted order_items then
--    inserted the new lines; for BDM/accountant/marketer the delete is blocked by
--    RLS (MD-only) and silently removed 0 rows, so every edit ADDED a second copy
--    of the order. 7 orders were affected before this fix.
-- 2) v_delivered_revenue: one waybill joined every order line of the same block
--    type, so duplicated lines counted the same delivery twice. Price is now the
--    weighted average of that order's lines for the block type (one row per
--    waybill). security_invoker so the caller's RLS applies; write grants removed.
-- 3) order_trading_margin: one row per invoice repeated the full order's sales and
--    costs. Now one row per order; orders whose invoices are all draft/cancelled
--    (quotations or voided) are excluded.

create or replace function public.replace_order_items(p_order_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid;
  v_marketer uuid;
  v_n integer;
  v_deleted integer;
begin
  if not has_any_role(array['md','accountant','bdm','marketer']) then
    raise exception 'Not permitted to edit orders';
  end if;

  select marketer_id into v_marketer from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  -- A marketer may only edit their own orders (same rule as orders_select).
  if not has_any_role(array['md','accountant','bdm']) then
    select staff_id into v_staff from user_profiles where id = auth.uid();
    if v_marketer is distinct from v_staff then
      raise exception 'You can only edit your own orders';
    end if;
  end if;

  -- Lines must not change once money is owed: the issued invoice would no
  -- longer match the order. Close/cancel the invoice first, then edit.
  if exists (select 1 from invoices where order_id = p_order_id and status in ('issued','paid')) then
    raise exception 'This order has an issued invoice. Cancel that invoice before changing the order lines.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order needs at least one line';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where coalesce(e->>'block_type','') = ''
       or (e->>'quantity') is null or (e->>'quantity')::integer <= 0
       or (e->>'unit_price') is null or (e->>'unit_price')::numeric < 0
       or coalesce(e->>'source_type','manufactured') not in ('manufactured','resale')
  ) then
    raise exception 'Every line needs a block type, a quantity above 0 and a unit price';
  end if;

  delete from order_items where order_id = p_order_id;
  get diagnostics v_deleted = row_count;

  insert into order_items (order_id, block_type, quantity, unit_price, source_type, cost_basis)
  select p_order_id,
         e->>'block_type',
         (e->>'quantity')::integer,
         (e->>'unit_price')::numeric,
         coalesce(e->>'source_type','manufactured'),
         nullif(e->>'cost_basis','')::numeric
  from jsonb_array_elements(p_items) e;
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

revoke all on function public.replace_order_items(uuid, jsonb) from public, anon;
grant execute on function public.replace_order_items(uuid, jsonb) to authenticated;

create or replace view public.v_delivered_revenue with (security_invoker = on) as
with px as (
  select order_id, block_type,
         round(sum(subtotal) / nullif(sum(quantity), 0), 2)::numeric(10,2) as unit_price
  from order_items
  group by order_id, block_type
)
select w.id as waybill_id,
       w.waybill_date,
       w.order_id,
       w.block_type,
       w.quantity_received,
       px.unit_price,
       w.quantity_received::numeric * px.unit_price as line_value,
       px.unit_price is null as unvalued
from waybills w
left join px on px.order_id = w.order_id and px.block_type = w.block_type
where w.quantity_received > 0;

revoke all on public.v_delivered_revenue from anon, authenticated;
grant select on public.v_delivered_revenue to authenticated;

create or replace view public.order_trading_margin as
select o.id as order_id,
       (select string_agg(i.invoice_number, ', ' order by i.created_at)
          from invoices i where i.order_id = o.id and i.status <> 'cancelled') as invoice_number,
       c.name as customer_name,
       o.created_at as order_date,
       sum(oi.subtotal) filter (where oi.source_type = 'resale') as resale_sale_amount,
       sum(oi.cost_basis) filter (where oi.source_type = 'resale') as purchase_cost,
       coalesce((select sum(vfl.total_cost) from vehicle_fuel_log vfl join waybills w on w.id = vfl.waybill_id where w.order_id = o.id), 0::numeric) as attributed_fuel_cost,
       coalesce((select sum(tll.total_amount) from truck_loading_log tll join waybills w on w.id = tll.waybill_id where w.order_id = o.id), 0::numeric) as attributed_loading_cost,
       coalesce((select sum(ehl.amount) from external_haulage_log ehl where ehl.order_id = o.id), 0::numeric) as attributed_haulage_cost
from orders o
join order_items oi on oi.order_id = o.id
left join customers c on c.id = o.customer_id
where oi.source_type = 'resale'
  and not (
    exists (select 1 from invoices i where i.order_id = o.id)
    and not exists (select 1 from invoices i where i.order_id = o.id and i.status in ('issued','paid'))
  )
group by o.id, c.name, o.created_at;
