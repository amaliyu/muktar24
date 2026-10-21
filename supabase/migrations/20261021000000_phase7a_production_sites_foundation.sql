-- APCL Manager — Phase 7A: production sites (Dutse factory + mobile client sites) and site tagging
-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-21 (migrations phase7a_production_sites_foundation
-- + phase7a_inventory_material_key), before/after verified. Kept here as the tracked record. DO NOT RE-RUN.
begin;

create table public.production_sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  site_type text not null check (site_type in ('factory','client_site')),
  contract_model text not null check (contract_model in ('own_sales','service_fee','full_supply')),
  client_name text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.production_sites (id, code, name, site_type, contract_model, client_name, address) values
 ('00000000-0000-4000-8000-000000000001','DUTSE','Dutse Factory','factory','own_sales',null,'No 1 Bmoko Village Road, off Tipper Garage, beside Istanbul Quarry, Dutse, Bwari Expressway, Abuja'),
 ('00000000-0000-4000-8000-000000000002','KADO-SEQ','Kado Site (Sequoia)','client_site','full_supply','Sequoia Projects Limited','Plot 498 Celina Ayom Crescent, Kado, Abuja'),
 ('00000000-0000-4000-8000-000000000003','LIFECAMP-BIL','Life Camp Site (Bilaad)','client_site','service_fee','Bilaad Realty Nigeria Limited','Bali Grove, Plot 135 Kafe, Life Camp, Abuja');

alter table public.production_sites enable row level security;
revoke all on public.production_sites from anon;
revoke all on public.production_sites from authenticated;
grant select, insert, update on public.production_sites to authenticated;
create policy production_sites_select on public.production_sites for select to authenticated
  using (has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager','hr_officer','operations','bdm']));
create policy production_sites_insert on public.production_sites for insert to authenticated
  with check (has_any_role(array['md']));
create policy production_sites_update on public.production_sites for update to authenticated
  using (has_any_role(array['md'])) with check (has_any_role(array['md']));

alter table public.assets add column site_id uuid references public.production_sites(id);
update public.assets set site_id = '00000000-0000-4000-8000-000000000001' where asset_type = 'machine';
insert into public.assets (asset_type, name, code, status, site_id, metadata) values
 ('machine','QTJ Mobile Plant 1','QTJ-01','active','00000000-0000-4000-8000-000000000003','{"model":"QTJ4-26B","funding":"investor"}'),
 ('machine','QTJ Mobile Plant 2','QTJ-02','active','00000000-0000-4000-8000-000000000002','{"model":"QTJ4-26B","funding":"investor"}');

do $$
declare t text;
begin
  foreach t in array array['production_log','batches','damage_log','daily_roster','stock_movements','inventory_items','downtime_log','expenses','payment_requests'] loop
    -- constant default backfills existing rows WITHOUT firing update triggers (payroll/roster/payment guards)
    execute format('alter table public.%I add column site_id uuid not null default %L references public.production_sites(id)', t, '00000000-0000-4000-8000-000000000001');
    execute format('alter table public.%I alter column site_id drop default', t);
    execute format('create index %I on public.%I (site_id)', 'idx_'||t||'_site', t);
  end loop;
end $$;

alter table public.production_log add column asset_id uuid default '44cfc4f3-57a7-4b42-baad-754ea5aa4dfe' references public.assets(id);
alter table public.production_log alter column asset_id drop default;

alter table public.inventory_items add column owner text not null default 'apcl' check (owner in ('apcl','client'));
-- Site stock items are NOT seeded here (Rule 10.6): they are created only after the frontend
-- deducts production stock by site + item id instead of by keyword.

alter table public.daily_roster drop constraint daily_roster_roster_date_key;
alter table public.daily_roster add constraint daily_roster_site_date_key unique (site_id, roster_date);

create or replace function public.fn_fill_site_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if tg_table_name = 'stock_movements' then
    select site_id into v from inventory_items where id = new.item_id;
    if v is not null then new.site_id := v; end if;
  elsif tg_table_name = 'expenses' then
    if new.daily_roster_id is not null then
      select site_id into v from daily_roster where id = new.daily_roster_id;
    elsif new.payment_request_id is not null then
      select site_id into v from payment_requests where id = new.payment_request_id;
    end if;
    if v is not null then new.site_id := v; end if;
  elsif tg_table_name = 'damage_log' then
    if new.production_log_id is not null then
      select site_id into v from production_log where id = new.production_log_id;
      if v is not null then new.site_id := v; end if;
    end if;
  elsif tg_table_name = 'downtime_log' then
    if new.site_id is null and new.asset_id is not null then
      select site_id into new.site_id from assets where id = new.asset_id;
    end if;
  elsif tg_table_name = 'production_log' then
    if new.site_id is null then new.site_id := '00000000-0000-4000-8000-000000000001'; end if;
    if new.asset_id is null then
      select id into new.asset_id from assets where asset_type = 'machine' and site_id = new.site_id and status = 'active' order by code limit 1;
    end if;
  end if;
  if new.site_id is null then new.site_id := '00000000-0000-4000-8000-000000000001'; end if;
  return new;
end $$;
revoke all on function public.fn_fill_site_id() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['production_log','batches','damage_log','daily_roster','stock_movements','inventory_items','downtime_log','expenses','payment_requests'] loop
    execute format('create trigger trg_fill_site_id before insert or update on public.%I for each row execute function public.fn_fill_site_id()', t);
  end loop;
end $$;

create or replace function public.fn_resync_roster_expense_site()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update expenses set site_id = new.site_id where daily_roster_id = new.id and site_id is distinct from new.site_id;
  return new;
end $$;
revoke all on function public.fn_resync_roster_expense_site() from public, anon, authenticated;
create trigger trg_resync_roster_expense_site after update of site_id on public.daily_roster
  for each row execute function public.fn_resync_roster_expense_site();

create or replace function public.fn_resync_pr_expense_site()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update expenses set site_id = new.site_id where payment_request_id = new.id and site_id is distinct from new.site_id;
  return new;
end $$;
revoke all on function public.fn_resync_pr_expense_site() from public, anon, authenticated;
create trigger trg_resync_pr_expense_site after update of site_id on public.payment_requests
  for each row execute function public.fn_resync_pr_expense_site();

-- Second migration (phase7a_inventory_material_key): fixed material key so production deducts by site + material, never by name
alter table public.inventory_items add column material text check (material in ('cement','dust','chippings','diesel'));
update public.inventory_items set material = case name when 'CEMENT' then 'cement' when 'DUST' then 'dust' when 'CHIPPINGS 3/8' then 'chippings' when 'DIESEL' then 'diesel' end
  where site_id = '00000000-0000-4000-8000-000000000001';
create unique index uq_inventory_site_material on public.inventory_items (site_id, material) where material is not null;

commit;
