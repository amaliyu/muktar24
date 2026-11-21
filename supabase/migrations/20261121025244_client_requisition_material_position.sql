-- MD 2026-11-21: one view per material for a client site — requested from the client (all sent requisitions),
-- received against them, used in production, on site now and still to come. Replaces the interim Excel log.
create or replace function public.client_requisition_material_position(p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from date; v_reqs jsonb; v_mats jsonb;
begin
  if not has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager'])
     or not can_see_site(p_site_id) then
    raise exception 'Not allowed for this site.' using errcode = '42501';
  end if;
  select min(covers_from) into v_from from client_requisitions
   where site_id = p_site_id and status in ('sent','client_approved','closed');

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status, 'qty_9in', r.qty_9in, 'qty_6in', r.qty_6in,
           'sent_at', r.sent_at, 'client_approved_on', r.client_approved_on) order by r.reference), '[]'::jsonb)
    into v_reqs
    from client_requisitions r where r.site_id = p_site_id and r.status in ('sent','client_approved','closed');

  with m(material, unit, ord) as (values ('cement','bags',1), ('dust','kg',2), ('chippings','kg',3), ('diesel','litres',4)),
  req as (
    select l.material, sum(l.qty_requested) requested
      from client_requisition_lines l join client_requisitions r on r.id = l.requisition_id
     where r.site_id = p_site_id and r.status in ('sent','client_approved','closed') group by l.material),
  rcv as (
    select i.material, sum(mr.qty_accepted) received, sum(mr.qty_rejected) rejected, count(*) deliveries
      from material_receipts mr join inventory_items i on i.id = mr.item_id
      join client_requisitions r on r.id = mr.requisition_id
     where mr.site_id = p_site_id and not coalesce(mr.voided, false) and r.status in ('sent','client_approved','closed')
     group by i.material),
  unlinked as (
    select i.material, sum(mr.qty_accepted) received, count(*) deliveries
      from material_receipts mr join inventory_items i on i.id = mr.item_id
     where mr.site_id = p_site_id and not coalesce(mr.voided, false) and mr.requisition_id is null and i.owner = 'client'
     group by i.material),
  used as (
    select i.material, sum(sm.quantity) used
      from stock_movements sm join inventory_items i on i.id = sm.item_id
     where i.site_id = p_site_id and sm.movement_type = 'out' and sm.issued_to = 'Production'
       and (v_from is null or sm.date >= v_from)
     group by i.material),
  stock as (
    select i.material, sum(i.current_stock) on_site, bool_or(i.owner = 'client') client_owned
      from inventory_items i where i.site_id = p_site_id group by i.material)
  select coalesce(jsonb_agg(jsonb_build_object(
           'material', m.material, 'unit', m.unit,
           'requested', coalesce(req.requested, 0),
           'received', coalesce(rcv.received, 0),
           'rejected', coalesce(rcv.rejected, 0),
           'deliveries', coalesce(rcv.deliveries, 0),
           'outstanding', greatest(coalesce(req.requested, 0) - coalesce(rcv.received, 0), 0),
           'over_supplied', greatest(coalesce(rcv.received, 0) - coalesce(req.requested, 0), 0),
           'received_unlinked', coalesce(unlinked.received, 0),
           'deliveries_unlinked', coalesce(unlinked.deliveries, 0),
           'used', coalesce(used.used, 0),
           'on_site', coalesce(stock.on_site, 0),
           'client_owned', coalesce(stock.client_owned, false)) order by m.ord), '[]'::jsonb)
    into v_mats
    from m left join req using (material) left join rcv using (material) left join unlinked using (material)
           left join used using (material) left join stock using (material)
   where req.material is not null or rcv.material is not null or stock.material is not null;

  return jsonb_build_object('site_id', p_site_id, 'site_name', (select name from production_sites where id = p_site_id),
    'covers_from', v_from, 'requisitions', v_reqs, 'materials', v_mats);
end $$;
revoke all on function public.client_requisition_material_position(uuid) from public, anon;
grant execute on function public.client_requisition_material_position(uuid) to authenticated;
