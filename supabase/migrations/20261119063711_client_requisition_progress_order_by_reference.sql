-- Applied to production 2026-11-19 by the planning chat (recorded here afterwards).
-- Fix found in testing: two requisitions raised in the same second sorted wrongly by created_at.
-- Order by the per-site reference number (REQ-<site>-NNN) instead. Re-tested: raise -> approve -> send -> remind -> client approved.
create or replace function public.client_requisition_progress(p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date; v_p9 numeric := 0; v_p6 numeric := 0; v_prod numeric := 0;
  v_list jsonb := '[]'::jsonb; v_cum numeric := 0; v_cur jsonb; v_cur_pct numeric; v_cur_id uuid; v_cur_ref text;
  v_approved numeric := 0; v_a9 numeric := 0; v_a6 numeric := 0; i int := 0; rec record;
  v_next record; v_last_reminder timestamptz; v_needs boolean := false;
begin
  if not can_see_site(p_site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;

  select min(covers_from) into v_from from client_requisitions where site_id = p_site_id and status <> 'cancelled';
  if v_from is not null then
    select coalesce(sum(quantity_produced) filter (where block_type ilike '9%'), 0),
           coalesce(sum(quantity_produced) filter (where block_type ilike '6%'), 0),
           coalesce(sum(quantity_produced), 0)
      into v_p9, v_p6, v_prod
      from production_log where site_id = p_site_id and date >= v_from;
  end if;

  for rec in select * from client_requisitions
              where site_id = p_site_id and status in ('client_approved','closed')
              order by client_approved_on, reference loop
    i := i + 1;
    v_approved := v_approved + rec.qty_total; v_a9 := v_a9 + rec.qty_9in; v_a6 := v_a6 + rec.qty_6in;
    v_list := v_list || jsonb_build_object(
      'id', rec.id, 'reference', rec.reference, 'status', rec.status, 'qty_total', rec.qty_total,
      'qty_9in', rec.qty_9in, 'qty_6in', rec.qty_6in, 'client_approved_on', rec.client_approved_on,
      'cum_from', v_cum, 'cum_to', v_cum + rec.qty_total,
      'produced_against', greatest(least(v_prod - v_cum, rec.qty_total), 0),
      'pct', round(greatest(least(v_prod - v_cum, rec.qty_total), 0) * 100.0 / rec.qty_total, 1));
    if v_cur is null and (v_prod < v_cum + rec.qty_total) then
      v_cur := v_list -> (i - 1); v_cur_id := rec.id; v_cur_ref := rec.reference;
    end if;
    v_cum := v_cum + rec.qty_total;
  end loop;
  if v_cur is null and i > 0 then
    v_cur := v_list -> (i - 1); v_cur_id := (v_cur->>'id')::uuid; v_cur_ref := v_cur->>'reference';
  end if;
  v_cur_pct := (v_cur->>'pct')::numeric;

  select r.* into v_next from client_requisitions r
   where r.site_id = p_site_id and r.status in ('draft','submitted','apcl_approved','sent','client_approved')
     and (v_cur_id is null or (r.id <> v_cur_id and r.reference > v_cur_ref))
   order by (r.status = 'client_approved') desc, r.reference desc limit 1;

  v_needs := v_cur is not null and coalesce(v_cur_pct, 0) >= 50 and (v_next.id is null or v_next.status <> 'client_approved');

  select max(e.at) into v_last_reminder from client_requisition_events e
    join client_requisitions r on r.id = e.requisition_id
   where r.site_id = p_site_id and e.action = 'reminder_sent';

  return jsonb_build_object(
    'site_id', p_site_id, 'counting_from', v_from,
    'produced_total', v_prod, 'produced_9in', v_p9, 'produced_6in', v_p6,
    'approved_total', v_approved, 'approved_9in', v_a9, 'approved_6in', v_a6,
    'unapproved_production', greatest(v_prod - v_approved, 0),
    'requisitions', v_list,
    'current', v_cur,
    'needs_next_approval', v_needs,
    'next_requisition', case when v_next.id is null then null else jsonb_build_object(
        'id', v_next.id, 'reference', v_next.reference, 'status', v_next.status,
        'qty_9in', v_next.qty_9in, 'qty_6in', v_next.qty_6in) end,
    'action', case when not v_needs then null
                   when v_next.id is null then 'raise_next'
                   when v_next.status in ('draft','submitted') then 'approve_next'
                   when v_next.status = 'apcl_approved' then 'send_next'
                   else 'remind_client' end,
    'reminded_today', v_last_reminder is not null and (v_last_reminder at time zone 'Africa/Lagos')::date = lagos_today(),
    'last_reminder_at', v_last_reminder);
end $$;
