-- Applied to production 2026-11-18 by the planning chat (recorded here afterwards).
-- Verified with rolled-back tests as the Kado site manager, flag ON: 100 x 9in -> 2,300 kg dust on the row,
-- dust stock -2,300 and cement -3 posted once; edit to 200 re-posts (4,600, no double); delete restores stock.
-- Flag OFF: typed value kept, nothing posted by the database (today's behaviour).
-- Dust used is calculated, not typed: blocks produced (incl. breakage) x dust kg per block,
-- per site and block type (MD, 2026-11-18: 9" = 23 kg, 6" = 20 kg at Kado and Life Camp).
-- Production materials are posted to stock by the database, so the figure on the production
-- row and the stock deduction can never disagree.
-- Everything here is inert until app_flags.production_materials_in_db is switched on,
-- which happens when the matching app change (screen stops deducting) is live.

create table if not exists public.app_flags (
  key text primary key,
  enabled boolean not null default false,
  changed_at timestamptz not null default now(),
  note text
);
alter table public.app_flags enable row level security;
revoke all on public.app_flags from anon;
drop policy if exists app_flags_select on public.app_flags;
create policy app_flags_select on public.app_flags for select to authenticated using (true);
insert into public.app_flags (key, enabled, note)
values ('production_materials_in_db', false, 'When on: production materials are posted by the database and dust is calculated from site_block_standards; the app must not deduct production materials itself.')
on conflict (key) do nothing;

create or replace function public.app_flag(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from app_flags where key = p_key), false)
$$;
revoke all on function public.app_flag(text) from public, anon;
grant execute on function public.app_flag(text) to authenticated;

create table if not exists public.site_block_standards (
  site_id uuid not null references public.production_sites(id),
  block_type text not null,
  dust_kg_per_block numeric not null check (dust_kg_per_block > 0),
  set_by_name text,
  set_at timestamptz not null default now(),
  notes text,
  primary key (site_id, block_type)
);
alter table public.site_block_standards enable row level security;
revoke all on public.site_block_standards from anon;
drop policy if exists site_block_standards_select on public.site_block_standards;
create policy site_block_standards_select on public.site_block_standards for select to authenticated using (true);
drop policy if exists site_block_standards_md_write on public.site_block_standards;
create policy site_block_standards_md_write on public.site_block_standards for all to authenticated
  using (get_user_role() = 'md') with check (get_user_role() = 'md');

insert into public.site_block_standards (site_id, block_type, dust_kg_per_block, set_by_name, notes) values
  ('00000000-0000-4000-8000-000000000002', '9 Inch 3 Hole Block', 23, 'Muktar Aliyu Abdullahi', 'MD 2026-11-18; calibrate in week one against the Friday dust-heap check'),
  ('00000000-0000-4000-8000-000000000002', '6 Inch 3 Hole Closed', 20, 'Muktar Aliyu Abdullahi', 'MD 2026-11-18; calibrate in week one against the Friday dust-heap check'),
  ('00000000-0000-4000-8000-000000000003', '9 Inch 3 Hole Block', 23, 'Muktar Aliyu Abdullahi', 'MD 2026-11-18; calibrate in week one against the Friday dust-heap check'),
  ('00000000-0000-4000-8000-000000000003', '6 Inch 3 Hole Closed', 20, 'Muktar Aliyu Abdullahi', 'MD 2026-11-18; calibrate in week one against the Friday dust-heap check')
on conflict (site_id, block_type) do nothing;

-- Dust = quantity_produced (gross, includes breakage) x standard, where a standard exists.
create or replace function public.fn_production_dust_calc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if not app_flag('production_materials_in_db') then return new; end if;
  select dust_kg_per_block into v from site_block_standards
   where site_id = new.site_id and block_type = new.block_type;
  if v is not null then
    new.granite_dust_kg := round(coalesce(new.quantity_produced, 0) * v, 2);
  end if;
  return new;
end $$;
drop trigger if exists trg_p_production_dust_calc on public.production_log;
create trigger trg_p_production_dust_calc before insert or update on public.production_log
  for each row execute function public.fn_production_dust_calc();

-- Post (or re-post) the production's materials to stock at its own site.
create or replace function public.fn_production_post_materials()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ref text := 'PROD-' || left(new.id::text, 8); m record; v_item uuid;
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
    select id into v_item from inventory_items where site_id = new.site_id and material = m.material order by created_at limit 1;
    if v_item is not null then
      insert into stock_movements (item_id, site_id, movement_type, quantity, issued_to, staff_name, reference, date, notes)
      values (v_item, new.site_id, 'out', m.qty, 'Production', 'Auto', v_ref, new.date, 'Auto-deducted from production log');
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists trg_production_post_materials on public.production_log;
create trigger trg_production_post_materials after insert or update on public.production_log
  for each row execute function public.fn_production_post_materials();

revoke all on function public.fn_production_dust_calc() from public, anon;
revoke all on function public.fn_production_post_materials() from public, anon;

-- To switch on (planning chat, right after the matching app change is live):
--   update app_flags set enabled = true, changed_at = now() where key = 'production_materials_in_db';
--   update production_log set granite_dust_kg = granite_dust_kg
--    where site_id in ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');
--   (recalculates Kado's earlier entries, which were typed in tonnes, and re-posts their stock)
