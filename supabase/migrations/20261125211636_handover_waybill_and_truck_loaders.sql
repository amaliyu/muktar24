-- MD 2026-11-25: use what the app already knows — each truck's assigned driver and loaders (truck_loader_assignments)
-- — and record the paper waybill number on each handover. Short client names for labels ("Bilaad", "Sequoia").

alter table public.site_contracts add column if not exists client_short_name text;
update public.site_contracts set client_short_name = 'Bilaad' where site_id = '00000000-0000-4000-8000-000000000003' and client_short_name is null;
update public.site_contracts set client_short_name = 'Sequoia' where site_id = '00000000-0000-4000-8000-000000000002' and client_short_name is null;

alter table public.block_handovers add column if not exists waybill_no text;

create or replace function public.handover_transport_options(p_site_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not can_see_site(p_site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'vehicles', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', v.id, 'label', btrim(v.vehicle_number) || ' · ' || btrim(coalesce(v.vehicle_name, v.vehicle_type, '')),
                    'driver_id', v.assigned_driver_id,
                    'loader_ids', coalesce((select jsonb_agg(a.labour_id) from truck_loader_assignments a
                                              join labour_pool lp on lp.id = a.labour_id
                                             where a.vehicle_id = v.id and a.is_active and coalesce(lp.is_active, true)), '[]'::jsonb))
                    order by v.vehicle_number)
                  from vehicles v where v.status = 'active' and coalesce(v.vehicle_type, '') ilike any (array['%truck%','%flatbed%','%tipper%','%lorry%'])), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name) order by s.full_name)
                          from staff s where coalesce(s.is_active, true) and (s.role ilike '%driver%' or s.job_title ilike '%driver%')), '[]'::jsonb),
    -- loaders: that day's site crew (roster or check-in) plus every truck's assigned loaders
    'loaders', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.full_name, 'truck', x.truck) order by x.truck nulls first, x.full_name) from (
                  select lp.id, lp.full_name,
                         (select string_agg(btrim(v.vehicle_number), ', ') from truck_loader_assignments a join vehicles v on v.id = a.vehicle_id
                           where a.labour_id = lp.id and a.is_active) truck
                    from labour_pool lp
                   where lp.id in (select e.labour_id from daily_roster r join daily_roster_entries e on e.roster_id = r.id
                                    where r.site_id = p_site_id and r.roster_date = p_date
                                   union select c.labour_id from crew_check_ins c where c.site_id = p_site_id and c.check_date = p_date
                                   union select a.labour_id from truck_loader_assignments a where a.is_active)) x), '[]'::jsonb));
end $$;
