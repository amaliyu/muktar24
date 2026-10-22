-- ALREADY APPLIED to the live DB on 2026-10-22 (run by the MD in the Supabase SQL Editor), verified by the planning chat. Kept here as the tracked record. DO NOT RE-RUN.

alter table public.assets drop constraint if exists assets_asset_type_check;
alter table public.assets add constraint assets_asset_type_check check (asset_type in ('machine','vehicle','equipment'));

alter table public.assets
  add column category text check (category in ('machine','generator','mould','pallet','trolley','mixer','tank','pump','storage','tool','vehicle','other')),
  add column quantity int not null default 1 check (quantity > 0),
  add column serial_or_tag text,
  add column acquired_on date,
  add column acquisition_cost numeric check (acquisition_cost >= 0),
  add column funding_source text not null default 'apcl' check (funding_source in ('apcl','investor')),
  add column investment_pool_ref text,
  add column condition text not null default 'good' check (condition in ('good','fair','needs_repair','out_of_service')),
  add column notes text,
  add column parent_asset_id uuid references public.assets(id),
  add column updated_at timestamptz not null default now();

update public.assets set category = case asset_type when 'vehicle' then 'vehicle' else 'machine' end;
update public.assets set funding_source = 'investor' where code in ('QTJ-01','QTJ-02');
alter table public.assets alter column category set not null;

-- accountant needs the register (costs) for the SPV fixed-asset register in 7C
drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select to authenticated
  using (has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','logistics_manager','store_officer']));

create table public.asset_movements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  from_site_id uuid references public.production_sites(id),
  to_site_id uuid references public.production_sites(id),
  moved_on date not null default current_date,
  quantity int not null check (quantity > 0),
  reason text not null,
  split_from_asset_id uuid references public.assets(id),
  moved_by uuid default auth.uid(),
  moved_by_name text,
  created_at timestamptz not null default now(),
  check (from_site_id is distinct from to_site_id)
);
create index idx_asset_movements_asset on public.asset_movements (asset_id, moved_on);
alter table public.asset_movements enable row level security;
revoke all on public.asset_movements from anon, authenticated;
grant select on public.asset_movements to authenticated;
create policy asset_movements_select on public.asset_movements for select to authenticated
  using (has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','logistics_manager','store_officer']));

-- Site changes must go through move_asset so every move is logged (inserts may still set the starting site).
create or replace function public.fn_assets_site_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.site_id is distinct from old.site_id and current_setting('app.asset_move', true) is distinct from 'on'
     and auth.uid() is not null then
    raise exception 'Use "Move asset" to change an asset''s site, so the move is recorded.';
  end if;
  return new;
end $$;
revoke all on function public.fn_assets_site_guard() from public, anon, authenticated;
create trigger trg_assets_site_guard before update on public.assets
  for each row execute function public.fn_assets_site_guard();

-- Move all or part of an asset to another site. A part move splits the record (e.g. 200 of 600 pallets):
-- a new asset row is created at the destination carrying the same details and pro-rata cost.
-- It sets a transaction-local flag so the site guard lets its own update through.
create or replace function public.move_asset(p_asset_id uuid, p_to_site_id uuid, p_quantity int, p_moved_on date, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a assets%rowtype; v_name text; v_target uuid; v_cost numeric;
begin
  if not has_any_role(array['md','production_manager','assistant_production_manager','logistics_manager']) then
    raise exception 'You do not have permission to move assets.';
  end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Give a reason for the move.'; end if;
  select * into a from assets where id = p_asset_id for update;
  if not found then raise exception 'Asset not found.'; end if;
  if a.status = 'retired' then raise exception 'A retired asset cannot be moved.'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > a.quantity then
    raise exception 'Quantity must be between 1 and %.', a.quantity;
  end if;
  if a.site_id is not distinct from p_to_site_id then raise exception 'The asset is already at that site.'; end if;
  perform set_config('app.asset_move', 'on', true);
  select full_name into v_name from user_profiles where id = auth.uid();
  if p_quantity = a.quantity then
    update assets set site_id = p_to_site_id where id = a.id;
    v_target := a.id;
    insert into asset_movements (asset_id, from_site_id, to_site_id, moved_on, quantity, reason, moved_by_name)
      values (a.id, a.site_id, p_to_site_id, coalesce(p_moved_on, current_date), p_quantity, trim(p_reason), v_name);
  else
    v_cost := case when a.acquisition_cost is null then null else round(a.acquisition_cost * p_quantity / a.quantity, 2) end;
    insert into assets (asset_type, name, code, status, metadata, site_id, category, quantity, serial_or_tag, acquired_on,
                        acquisition_cost, funding_source, investment_pool_ref, condition, notes, parent_asset_id)
      values (a.asset_type, a.name, null, a.status, a.metadata, p_to_site_id, a.category, p_quantity, a.serial_or_tag, a.acquired_on,
              v_cost, a.funding_source, a.investment_pool_ref, a.condition, a.notes, a.id)
      returning id into v_target;
    update assets set quantity = a.quantity - p_quantity,
                      acquisition_cost = case when a.acquisition_cost is null then null else a.acquisition_cost - v_cost end
      where id = a.id;
    insert into asset_movements (asset_id, from_site_id, to_site_id, moved_on, quantity, reason, split_from_asset_id, moved_by_name)
      values (v_target, a.site_id, p_to_site_id, coalesce(p_moved_on, current_date), p_quantity, trim(p_reason), a.id, v_name);
  end if;
  perform set_config('app.asset_move', 'off', true);
  return v_target;
end $$;
revoke all on function public.move_asset(uuid,uuid,int,date,text) from public, anon;
grant execute on function public.move_asset(uuid,uuid,int,date,text) to authenticated;

create view public.v_site_asset_register with (security_invoker = true) as
select a.id as asset_id, a.code, a.name, a.asset_type, a.category, a.quantity, a.serial_or_tag, a.acquired_on,
       a.acquisition_cost, a.funding_source, a.investment_pool_ref, a.condition, a.status, a.notes,
       a.site_id, coalesce(s.name, case when a.asset_type = 'vehicle' then 'Fleet (no fixed site)' else 'Unassigned' end) as site_name,
       s.site_type, a.parent_asset_id,
       (select max(m.moved_on) from asset_movements m where m.asset_id = a.id) as last_moved_on
from assets a left join production_sites s on s.id = a.site_id;
revoke all on public.v_site_asset_register from anon;
grant select on public.v_site_asset_register to authenticated;
