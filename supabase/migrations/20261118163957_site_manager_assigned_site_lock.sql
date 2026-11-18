-- Applied to production 2026-11-18 by the planning chat (recorded here afterwards).
-- Step A of the site recording plan (master plan §13, MD approved 2026-11-18).
-- A user with an assigned site can only record, see and change records for that site.
-- Users without an assigned site are unaffected.
-- Verified before keeping (rolled-back tests as Kado APM, Life Camp manager, MD and ICO):
--   site stamped automatically; other sites refused; only own site visible; waybills refused at client sites;
--   material receipt of 10 changes stock by exactly 10; MD/ICO behaviour unchanged.

alter table public.user_profiles
  add column if not exists assigned_site_id uuid references public.production_sites(id);

create or replace function public.my_assigned_site()
returns uuid language sql stable security definer set search_path = public as $$
  select assigned_site_id from user_profiles where id = auth.uid() and is_active
$$;
revoke all on function public.my_assigned_site() from public, anon;
grant execute on function public.my_assigned_site() to authenticated;

-- Only the MD may set or change a user's assigned site (same guard as role / active / staff link).
create or replace function public.guard_user_profile_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.get_user_role() is not distinct from 'md' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role             := 'staff';
    new.is_active        := true;
    new.staff_id         := null;
    new.assigned_site_id := null;
    return new;
  end if;

  if new.role             is distinct from old.role
  or new.is_active        is distinct from old.is_active
  or new.staff_id         is distinct from old.staff_id
  or new.assigned_site_id is distinct from old.assigned_site_id then
    raise exception 'Only the MD can change role, active status, staff link or assigned site'
      using errcode = '42501';
  end if;
  return new;
end
$$;

-- Fill the site for a site-assigned user before any other trigger can default it to Dutse.
create or replace function public.fn_assigned_site_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then return new; end if;
  v := my_assigned_site();
  if v is null then return new; end if;
  if new.site_id is null then new.site_id := v; end if;
  return new;
end $$;

-- Final check after every other trigger: a site-assigned user can only touch their own site's rows.
create or replace function public.fn_assigned_site_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid; v_name text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  v := my_assigned_site();
  if v is null then return coalesce(new, old); end if;
  select name into v_name from production_sites where id = v;
  if tg_op in ('UPDATE','DELETE') and old.site_id is distinct from v then
    raise exception 'You are assigned to %, so you can only change records for that site.', v_name
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.site_id is distinct from v then
    raise exception 'You are assigned to %, so you can only record for that site.', v_name
      using errcode = '42501';
  end if;
  return new;
end $$;

-- Attach to every site-recorded table. Trigger names sort so the stamp fires first and the check last.
do $$
declare t text;
begin
  foreach t in array array['production_log','damage_log','batches','block_handovers','material_receipts',
                           'daily_roster','downtime_log','stock_movements','payment_requests','inventory_items'] loop
    execute format('drop trigger if exists trg_0_assigned_site_stamp on public.%I', t);
    execute format('create trigger trg_0_assigned_site_stamp before insert on public.%I for each row execute function public.fn_assigned_site_stamp()', t);
    execute format('drop trigger if exists trg_zz_assigned_site_check on public.%I', t);
    execute format('create trigger trg_zz_assigned_site_check before insert or update or delete on public.%I for each row execute function public.fn_assigned_site_check()', t);
    execute format('drop policy if exists %I on public.%I', t || '_assigned_site', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.my_assigned_site() is null or site_id = public.my_assigned_site()) with check (public.my_assigned_site() is null or site_id = public.my_assigned_site())', t || '_assigned_site', t);
  end loop;
end $$;

-- Site-assigned users may raise payment requests for their own site (site is stamped by the trigger above).
drop policy if exists payment_requests_insert_assigned_site on public.payment_requests;
create policy payment_requests_insert_assigned_site on public.payment_requests
  for insert to authenticated
  with check (requested_by = auth.uid() and public.my_assigned_site() is not null);

-- Blocks leave a client site by handover, never by waybill (MD, 2026-11-18).
create or replace function public.fn_waybill_client_site_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (
       select 1 from production_sites s where s.id = my_assigned_site() and s.site_type = 'client_site') then
    raise exception 'You are assigned to a client site. Blocks leave a client site by handover, not by waybill.'
      using errcode = '42501';
  end if;
  if new.batch_id is not null and exists (
       select 1 from batches b join production_sites s on s.id = b.site_id
        where b.id = new.batch_id and s.site_type = 'client_site') then
    raise exception 'Blocks from a client site are delivered by handover, not by waybill.';
  end if;
  return new;
end $$;
drop trigger if exists trg_0_waybill_client_site_block on public.waybills;
create trigger trg_0_waybill_client_site_block before insert or update on public.waybills
  for each row execute function public.fn_waybill_client_site_block();

revoke all on function public.fn_assigned_site_stamp() from public, anon;
revoke all on function public.fn_assigned_site_check() from public, anon;
revoke all on function public.fn_waybill_client_site_block() from public, anon;

-- Data applied the same day (not part of the schema change, recorded for history):
--   Umar Mohammed Idris (assistant_production_manager) assigned to Kado Site (Sequoia).
--   Abubakar Suleman Aliyu (logistics_manager) assigned to Life Camp Site (Bilaad), plus an
--   assistant_production_manager grant until 31 Dec 2026 (interim, until the Site Manager screens ship).
