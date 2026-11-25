-- MD 2026-11-25: (1) a Bilaad client-funds ledger: asked -> approved -> received -> spent -> balance, per fund
-- (operating, diesel); spending = Life Camp payment requests tagged to a client fund. (2) Link each block handover to
-- the truck, driver and loaders, by simple selection.

-- ---------- 1. Client funds ----------
create table if not exists public.client_fund_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  requisition_id uuid references public.client_requisitions(id),
  fund text not null check (fund in ('operating','diesel')),
  kind text not null check (kind in ('asked','approved','received','adjustment')),
  entry_date date not null,
  amount numeric(14,2) not null,
  bank_account_id uuid references public.bank_accounts(id),
  reference text,
  note text,
  proof_path text,
  voided boolean not null default false,
  void_reason text,
  recorded_by uuid default auth.uid() references public.user_profiles(id),
  recorded_by_name text,
  created_at timestamptz not null default now(),
  constraint client_fund_entries_amount check (kind = 'adjustment' or amount > 0)
);
alter table public.client_fund_entries enable row level security;
create policy client_fund_entries_read on public.client_fund_entries for select to authenticated
  using (can_see_site(site_id) and has_any_role(array['md','accountant','ico','production_manager','assistant_production_manager']));
revoke insert, update, delete on public.client_fund_entries from anon, authenticated;

alter table public.payment_requests add column if not exists client_fund text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_requests_client_fund_check') then
    alter table public.payment_requests add constraint payment_requests_client_fund_check check (client_fund is null or client_fund in ('operating','diesel'));
  end if;
end $$;

create or replace function public.record_client_fund(p_site_id uuid, p_fund text, p_kind text, p_date date, p_amount numeric,
  p_bank_account_id uuid default null, p_reference text default null, p_note text default null, p_requisition_id uuid default null,
  p_proof_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_site production_sites%rowtype;
begin
  if not has_any_role(array['md','accountant']) then raise exception 'Only the MD or accountant can record client funds.'; end if;
  select * into v_site from production_sites where id = p_site_id;
  if not found or v_site.site_type <> 'client_site' then raise exception 'Client funds are only for client sites.'; end if;
  if p_fund not in ('operating','diesel') then raise exception 'Choose the fund: operating or diesel.'; end if;
  if p_kind not in ('asked','approved','received','adjustment') then raise exception 'Unknown entry type.'; end if;
  if p_kind = 'adjustment' and not has_any_role(array['md']) then raise exception 'Only the MD can record an adjustment.'; end if;
  if p_date is null or p_date > lagos_today() then raise exception 'Enter a date that is not in the future.'; end if;
  if p_amount is null or (p_kind <> 'adjustment' and p_amount <= 0) or p_amount = 0 then raise exception 'Enter the amount.'; end if;
  if p_kind = 'received' and coalesce(btrim(p_reference), '') = '' then raise exception 'Enter the transfer reference (or "cash" with who received it).'; end if;
  if p_kind = 'adjustment' and length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Say why (at least 10 characters).'; end if;
  insert into client_fund_entries (site_id, requisition_id, fund, kind, entry_date, amount, bank_account_id, reference, note, proof_path, recorded_by_name)
  values (p_site_id, p_requisition_id, p_fund, p_kind, p_date, round(p_amount, 2), p_bank_account_id, nullif(btrim(p_reference), ''),
          nullif(btrim(p_note), ''), nullif(btrim(p_proof_path), ''), (select full_name from user_profiles where id = auth.uid()))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_client_fund(uuid,text,text,date,numeric,uuid,text,text,uuid,text) from public, anon;
grant execute on function public.record_client_fund(uuid,text,text,date,numeric,uuid,text,text,uuid,text) to authenticated;

create or replace function public.void_client_fund_entry(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_any_role(array['md']) then raise exception 'Only the MD can void a client-fund entry.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Say why (at least 10 characters).'; end if;
  update client_fund_entries set voided = true, void_reason = btrim(p_reason) where id = p_id and not voided;
  if not found then raise exception 'Entry not found or already voided.'; end if;
end $$;
revoke all on function public.void_client_fund_entry(uuid, text) from public, anon;
grant execute on function public.void_client_fund_entry(uuid, text) to authenticated;

create or replace function public.set_payment_request_client_fund(p_payment_request_id uuid, p_fund text)
returns void language plpgsql security definer set search_path = public as $$
declare v_site text;
begin
  if not has_any_role(array['md','accountant','ico']) then raise exception 'Only the MD, accountant or ICO can set the fund.'; end if;
  if p_fund is not null and p_fund not in ('operating','diesel') then raise exception 'Choose the fund: operating or diesel.'; end if;
  select s.site_type into v_site from payment_requests pr join production_sites s on s.id = pr.site_id where pr.id = p_payment_request_id;
  if v_site is distinct from 'client_site' then raise exception 'Only payment requests for a client site can be paid from a client fund.'; end if;
  update payment_requests set client_fund = p_fund where id = p_payment_request_id;
end $$;
revoke all on function public.set_payment_request_client_fund(uuid, text) from public, anon;
grant execute on function public.set_payment_request_client_fund(uuid, text) to authenticated;

create or replace function public.client_fund_summary(p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb; f text; a numeric; ap numeric; r numeric; adj numeric; sp numeric; cm numeric; v_untagged numeric; v_untagged_n int;
begin
  if not (can_see_site(p_site_id) and has_any_role(array['md','accountant','ico','production_manager','assistant_production_manager'])) then
    raise exception 'Not allowed for this site.' using errcode = '42501';
  end if;
  foreach f in array array['operating','diesel'] loop
    select coalesce(sum(amount) filter (where kind = 'asked'), 0), coalesce(sum(amount) filter (where kind = 'approved'), 0),
           coalesce(sum(amount) filter (where kind = 'received'), 0), coalesce(sum(amount) filter (where kind = 'adjustment'), 0)
      into a, ap, r, adj from client_fund_entries where site_id = p_site_id and fund = f and not voided;
    select coalesce(sum(amount) filter (where status = 'disbursed'), 0), coalesce(sum(amount) filter (where status in ('draft','submitted','ico_approved','approved')), 0)
      into sp, cm from payment_requests where site_id = p_site_id and client_fund = f;
    v := v || jsonb_build_object('fund', f, 'asked', a, 'approved', ap, 'received', r, 'adjustments', adj, 'spent', sp, 'pending', cm,
      'balance', r + adj - sp, 'client_owes', greatest(sp - r - adj, 0));
  end loop;
  select coalesce(sum(amount), 0), count(*) into v_untagged, v_untagged_n from payment_requests
   where site_id = p_site_id and client_fund is null and status = 'disbursed';
  return jsonb_build_object('funds', v, 'untagged_spent', v_untagged, 'untagged_count', v_untagged_n);
end $$;
revoke all on function public.client_fund_summary(uuid) from public, anon;
grant execute on function public.client_fund_summary(uuid) to authenticated;

create or replace function public.client_fund_statement(p_site_id uuid, p_fund text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (can_see_site(p_site_id) and has_any_role(array['md','accountant','ico','production_manager','assistant_production_manager'])) then
    raise exception 'Not allowed for this site.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by x->>'date', x->>'created_at') from (
    select jsonb_build_object('source', 'entry', 'id', e.id, 'date', e.entry_date, 'kind', e.kind, 'amount', e.amount,
             'reference', e.reference, 'note', e.note, 'voided', e.voided, 'void_reason', e.void_reason,
             'recorded_by_name', e.recorded_by_name, 'created_at', e.created_at) x
      from client_fund_entries e where e.site_id = p_site_id and e.fund = p_fund
    union all
    select jsonb_build_object('source', 'payment_request', 'id', pr.id, 'date', coalesce(pr.transaction_date, pr.created_at::date),
             'kind', case when pr.status = 'disbursed' then 'spent' else 'pending' end, 'amount', pr.amount,
             'reference', pr.reference, 'note', pr.purpose, 'status', pr.status, 'created_at', pr.created_at)
      from payment_requests pr where pr.site_id = p_site_id and pr.client_fund = p_fund and pr.status not in ('rejected','cancelled')) y), '[]'::jsonb);
end $$;
revoke all on function public.client_fund_statement(uuid, text) from public, anon;
grant execute on function public.client_fund_statement(uuid, text) to authenticated;

insert into public.client_fund_entries (site_id, requisition_id, fund, kind, entry_date, amount, reference, note, recorded_by, recorded_by_name)
select r.site_id, r.id, x.fund, 'asked', date '2026-11-20', x.amount, r.reference, x.note, null, 'Planning (from the requisition)'
  from client_requisitions r
  cross join (values ('operating', 725909.44, 'Site operating allocation'), ('diesel', 658000.00, '329 L production diesel at ₦2,000/L')) x(fund, amount, note)
 where r.reference = 'REQ-LIFECAMP-BIL-001'
   and not exists (select 1 from client_fund_entries e where e.requisition_id = r.id and e.kind = 'asked' and e.fund = x.fund);

-- ---------- 2. Handover transport ----------
alter table public.block_handovers
  add column if not exists vehicle_id uuid references public.vehicles(id),
  add column if not exists vehicle_plate text,
  add column if not exists driver_staff_id uuid references public.staff(id),
  add column if not exists driver_name text,
  add column if not exists loader_ids uuid[] not null default '{}';

create or replace function public.fn_block_handover_transport_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bad int;
begin
  new.vehicle_plate := nullif(upper(btrim(new.vehicle_plate)), '');
  new.driver_name := nullif(btrim(new.driver_name), '');
  if new.vehicle_id is not null then new.vehicle_plate := null; end if;
  if new.driver_staff_id is not null then
    select full_name into new.driver_name from staff where id = new.driver_staff_id;
  end if;
  new.loader_ids := coalesce(array(select distinct unnest(new.loader_ids)), '{}');
  select count(*) into v_bad from unnest(new.loader_ids) l where not exists (select 1 from labour_pool lp where lp.id = l);
  if v_bad > 0 then raise exception 'A selected loader is not in the labour list.'; end if;
  return new;
end $$;
drop trigger if exists trg_block_handover_transport on public.block_handovers;
create trigger trg_block_handover_transport before insert or update on public.block_handovers
  for each row execute function fn_block_handover_transport_check();

create or replace function public.handover_transport_options(p_site_id uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not can_see_site(p_site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'vehicles', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'label', btrim(v.vehicle_number) || ' · ' || btrim(coalesce(v.vehicle_name, v.vehicle_type, '')),
                                   'driver_id', v.assigned_driver_id) order by v.vehicle_number)
                           from vehicles v where v.status = 'active' and coalesce(v.vehicle_type, '') ilike any (array['%truck%','%flatbed%','%tipper%','%lorry%'])), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name) order by s.full_name)
                          from staff s where coalesce(s.is_active, true) and (s.role ilike '%driver%' or s.job_title ilike '%driver%')), '[]'::jsonb),
    'loaders', coalesce((select jsonb_agg(jsonb_build_object('id', lp.id, 'name', lp.full_name) order by lp.full_name) from (
                          select distinct lp.id, lp.full_name from labour_pool lp
                           where lp.id in (select e.labour_id from daily_roster r join daily_roster_entries e on e.roster_id = r.id
                                            where r.site_id = p_site_id and r.roster_date = p_date
                                           union select c.labour_id from crew_check_ins c where c.site_id = p_site_id and c.check_date = p_date)) lp), '[]'::jsonb));
end $$;
revoke all on function public.handover_transport_options(uuid, date) from public, anon;
grant execute on function public.handover_transport_options(uuid, date) to authenticated;
