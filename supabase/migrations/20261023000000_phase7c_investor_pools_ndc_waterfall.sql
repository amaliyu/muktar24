-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-23 (MD approved), verified. Kept here as the tracked record. DO NOT RE-RUN.
-- APCL Manager — Phase 7C: investor register, capital contributions, editable terms, site receipts,
-- monthly NDC + waterfall, distributions, SPV ledger. Design approved by MD 2026-10-23 (§11 7C).
-- Pools are per SITE. Shares = capital-days in the month. Capital tied to an asset follows the asset.

-- ---------- investor register ----------
create table public.investors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'external' check (kind in ('external','apcl')),
  phone text, email text, notes text,
  user_id uuid references auth.users(id),          -- optional login for the read-only investor role
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index uq_investors_one_apcl on public.investors (kind) where kind = 'apcl';
create unique index uq_investors_user on public.investors (user_id) where user_id is not null;
insert into public.investors (name, kind, notes) values ('Abuja Precast Concrete Limited (APCL)', 'apcl', 'APCL''s own capital at a site counts in the pool (MD 2026-10-23).');

-- assets: pick the funding investor from the register (replaces free-text investment_pool_ref going forward)
alter table public.assets add column investor_id uuid references public.investors(id);

-- ---------- capital contributions (corrections are offsetting entries) ----------
create table public.capital_contributions (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id),
  site_id uuid not null references public.production_sites(id),
  asset_id uuid references public.assets(id),      -- optional: capital follows this asset between sites
  kind text not null check (kind in ('contribution','bridge','bridge_refund','correction')),
  amount numeric not null check (amount <> 0),
  contributed_on date not null,
  reference text, notes text,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((kind in ('contribution','bridge') and amount > 0) or (kind = 'bridge_refund' and amount < 0) or kind = 'correction'),
  check (kind <> 'correction' or coalesce(trim(notes),'') <> '')
);
create index idx_capital_site on public.capital_contributions (site_id, contributed_on);

-- ---------- editable, versioned terms ----------
create table public.term_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null default 1 check (version > 0),
  tiers jsonb not null,            -- [{"from":0,"to":1,"investor_pct":65}, ..., {"from":2,"to":null,"investor_pct":20}]  multiples of ICA
  term_years int check (term_years > 0),
  management_fee_pct numeric not null default 0 check (management_fee_pct between 0 and 100),
  management_fee_basis text not null default 'gross_receipts' check (management_fee_basis in ('gross_receipts','ndc_before_fee')),
  deductible_category_ids uuid[] not null default '{}',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (name, version)
);

create or replace function public.fn_term_template_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare t jsonb; prev numeric := 0; i int := 0; n int;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from ndc_periods where term_template_id = old.id) or exists (select 1 from site_pool_terms where term_template_id = old.id) then
      raise exception 'These terms are in use. Create a new version instead.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from ndc_periods where term_template_id = old.id and status <> 'draft') then
    raise exception 'These terms were used in an approved month and cannot be changed. Create a new version with a start date instead.';
  end if;
  if jsonb_typeof(new.tiers) <> 'array' or jsonb_array_length(new.tiers) = 0 then raise exception 'Add at least one tier.'; end if;
  n := jsonb_array_length(new.tiers);
  for t in select * from jsonb_array_elements(new.tiers) loop
    i := i + 1;
    if (t->>'from')::numeric is distinct from prev then raise exception 'Tier % must start where the previous one ends (%x).', i, prev; end if;
    if (t->>'investor_pct')::numeric not between 0 and 100 then raise exception 'Tier % investor share must be 0-100%%.', i; end if;
    if i < n then
      if t->>'to' is null or (t->>'to')::numeric <= prev then raise exception 'Tier % needs an end above its start.', i; end if;
      prev := (t->>'to')::numeric;
    elsif t->>'to' is not null then raise exception 'The last tier must be open-ended.';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.fn_term_template_guard() from public, anon, authenticated;

create table public.site_pool_terms (
  site_id uuid not null references public.production_sites(id),
  effective_from date not null,
  term_template_id uuid not null references public.term_templates(id),
  notes text,
  created_at timestamptz not null default now(),
  primary key (site_id, effective_from)
);

-- monthly reserve budget per site (Term Sheet §14: budget-based, reviewed, not a fixed %)
create table public.site_reserve_budgets (
  site_id uuid not null references public.production_sites(id),
  month date not null check (extract(day from month) = 1),
  amount numeric not null check (amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  primary key (site_id, month)
);

-- ---------- client receipts at a site (APCL collects; owed to the SPV until transferred) ----------
create table public.site_receipts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  cycle_id uuid references public.contract_cycles(id),
  received_on date not null,
  amount numeric not null check (amount > 0),
  payer text, reference text,
  bank_account_id uuid references public.bank_accounts(id),
  notes text,
  voided boolean not null default false, void_reason text,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (not voided or coalesce(trim(void_reason),'') <> '')
);
create index idx_site_receipts on public.site_receipts (site_id, received_on);

create or replace function public.fn_site_receipt_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_month date;
begin
  if tg_op = 'DELETE' then raise exception 'Receipts cannot be deleted. Void it with a reason.'; end if;
  if tg_op = 'UPDATE' and (new.amount, new.received_on, new.site_id, new.cycle_id) is distinct from (old.amount, old.received_on, old.site_id, old.cycle_id) then
    raise exception 'A receipt cannot be edited. Void it with a reason and record it again.';
  end if;
  if tg_op = 'UPDATE' and old.voided and not new.voided then raise exception 'A voided receipt cannot be restored.'; end if;
  if new.cycle_id is not null and not exists (select 1 from contract_cycles cc join site_contracts sc on sc.id = cc.contract_id where cc.id = new.cycle_id and sc.site_id = new.site_id) then
    raise exception 'That cycle belongs to a different site.';
  end if;
  v_month := date_trunc('month', new.received_on)::date;
  if exists (select 1 from ndc_periods where site_id = new.site_id and period_month = v_month and status <> 'draft') then
    raise exception 'The month % is already approved for this site. Record the receipt in the current month.', to_char(v_month,'Mon YYYY');
  end if;
  return new;
end $$;
revoke all on function public.fn_site_receipt_guard() from public, anon, authenticated;
create trigger trg_site_receipt_guard before insert or update or delete on public.site_receipts
  for each row execute function public.fn_site_receipt_guard();

-- keep contract_cycles.amount_received / paid_on equal to the receipts recorded against the cycle
create or replace function public.fn_site_receipt_sync_cycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare c uuid := coalesce(new.cycle_id, old.cycle_id);
begin
  if c is not null then
    update contract_cycles cc set
      amount_received = coalesce((select sum(amount) from site_receipts r where r.cycle_id = c and not r.voided), 0),
      paid_on = (select max(received_on) from site_receipts r where r.cycle_id = c and not r.voided)
    where cc.id = c;
  end if;
  return null;
end $$;
revoke all on function public.fn_site_receipt_sync_cycle() from public, anon, authenticated;
create trigger trg_site_receipt_sync_cycle after insert or update on public.site_receipts
  for each row execute function public.fn_site_receipt_sync_cycle();

-- The existing 7B-1 "Payment / scope" form edits contract_cycles.amount_received directly.
-- Keep it working: a direct increase is recorded as a site receipt for the difference (the sync then sets the same total).
-- A direct decrease is refused: void the receipt instead.
create or replace function public.fn_cycle_direct_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_delta numeric := new.amount_received - old.amount_received;
begin
  if pg_trigger_depth() > 1 or v_delta = 0 then return null; end if;
  if v_delta < 0 then raise exception 'To reduce the amount received, void the receipt (Site Contracts -> receipts) instead.'; end if;
  select site_id into v_site from site_contracts where id = new.contract_id;
  insert into site_receipts (site_id, cycle_id, received_on, amount, reference, notes)
  values (v_site, new.id, coalesce(new.paid_on, current_date), v_delta, new.payment_ref, 'Recorded from the cycle payment form');
  return null;
end $$;
revoke all on function public.fn_cycle_direct_payment() from public, anon, authenticated;
create trigger trg_cycle_direct_payment after update of amount_received on public.contract_cycles
  for each row execute function public.fn_cycle_direct_payment();

-- transfers from APCL to the SPV (monthly) and distributions paid out
create table public.spv_transfers (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  transferred_on date not null,
  amount numeric not null check (amount <> 0),
  reference text, notes text,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- monthly NDC and distributions ----------
create table public.ndc_periods (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  period_month date not null check (extract(day from period_month) = 1),
  term_template_id uuid references public.term_templates(id),
  receipts numeric not null default 0,
  deductible_expenses numeric not null default 0,
  excluded_expenses numeric not null default 0,      -- site expenses in categories not deductible (shown for transparency)
  pending_expenses_count int not null default 0,
  reserve numeric not null default 0,
  management_fee numeric not null default 0,
  ndc_raw numeric not null default 0,
  deficit_brought_forward numeric not null default 0,
  distributable numeric not null default 0,
  deficit_carried_forward numeric not null default 0,
  ica numeric not null default 0,
  investor_receipts_before numeric not null default 0,
  investor_portion numeric not null default 0,
  apcl_operator_share numeric not null default 0,
  tier_breakdown jsonb,
  status text not null default 'draft' check (status in ('draft','approved','voided')),
  computed_at timestamptz, approved_at timestamptz, approved_by uuid,
  void_reason text, notes text,
  created_at timestamptz not null default now()
);
create unique index uq_ndc_period_live on public.ndc_periods (site_id, period_month) where status <> 'voided';

create table public.distributions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.ndc_periods(id),
  site_id uuid not null references public.production_sites(id),
  investor_id uuid references public.investors(id),   -- null = APCL operator share
  share_type text not null check (share_type in ('investor_portion','apcl_operator')),
  capital_share numeric,                               -- fraction of capital-days (investor_portion rows)
  amount numeric not null check (amount >= 0),
  paid_on date, paid_reference text,
  created_at timestamptz not null default now()
);
create index idx_distributions_period on public.distributions (period_id);

create trigger trg_term_template_guard before update or delete on public.term_templates
  for each row execute function public.fn_term_template_guard();
create trigger trg_term_template_validate before insert on public.term_templates
  for each row execute function public.fn_term_template_guard();

-- ---------- capital attribution ----------
-- Weight of each record in an asset family (root + split-off records) at a site on a day, by quantity.
create or replace function public.fn_asset_family_site_weights(p_root uuid, p_day date)
returns table (site_id uuid, weight numeric) language sql stable security definer set search_path = public as $$
  with recursive fam as (
    select a.id from assets a where a.id = p_root
    union all
    select a.id from assets a join fam f on a.parent_asset_id = f.id
  ), members as (
    select a.id, a.quantity, a.site_id as current_site, a.parent_asset_id,
      (select m.moved_on from asset_movements m where m.asset_id = a.id and m.split_from_asset_id is not null order by m.moved_on limit 1) as born_on
    from assets a join fam f on f.id = a.id
  ), on_day as (
    select m.id,
      m.quantity + coalesce((select sum(x.quantity) from asset_movements x where x.split_from_asset_id = m.id and x.moved_on > p_day), 0) as qty,
      coalesce(
        (select x.to_site_id from asset_movements x where x.asset_id = m.id and x.moved_on <= p_day order by x.moved_on desc, x.created_at desc limit 1),
        (select x.from_site_id from asset_movements x where x.asset_id = m.id and x.moved_on > p_day order by x.moved_on, x.created_at limit 1),
        m.current_site) as site_on
    from members m
    where m.id = p_root or (m.born_on is not null and m.born_on <= p_day)
  )
  select site_on, sum(qty)::numeric / nullif((select sum(qty) from on_day), 0)
  from on_day where site_on is not null group by site_on;
$$;
revoke all on function public.fn_asset_family_site_weights(uuid, date) from public, anon;

-- Capital each investor has at a site on a day (contributions tied to an asset follow it).
create or replace function public.fn_site_capital_on(p_site uuid, p_day date)
returns table (investor_id uuid, capital numeric) language sql stable security definer set search_path = public as $$
  select x.investor_id, sum(x.amt)
  from (
    select c.investor_id,
      case when c.asset_id is null then case when c.site_id = p_site then c.amount else 0 end
           else c.amount * coalesce((select fw.weight from fn_asset_family_site_weights(c.asset_id, p_day) fw where fw.site_id = p_site), 0)
      end as amt
    from capital_contributions c
    where c.contributed_on <= p_day
  ) x
  group by x.investor_id
  having sum(x.amt) <> 0;
$$;
revoke all on function public.fn_site_capital_on(uuid, date) from public, anon;

-- Terms in force for a site in a month (latest effective_from on or before month end).
create or replace function public.fn_site_terms(p_site uuid, p_month date)
returns uuid language sql stable security definer set search_path = public as $$
  select term_template_id from site_pool_terms
  where site_id = p_site and effective_from <= (p_month + interval '1 month' - interval '1 day')::date
  order by effective_from desc limit 1;
$$;
revoke all on function public.fn_site_terms(uuid, date) from public, anon;

-- ---------- compute a month (draft) ----------
create or replace function public.compute_ndc_period(p_site_id uuid, p_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_end date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
  v_id uuid; v_terms uuid; t term_templates%rowtype;
  v_rec numeric; v_ded numeric; v_exc numeric; v_pend int; v_res numeric; v_fee numeric := 0;
  v_raw numeric; v_bf numeric; v_dist numeric; v_cf numeric; v_ica numeric; v_before numeric;
  v_inv numeric := 0; v_remaining numeric; v_c numeric; tier jsonb; v_pct numeric; v_top numeric; v_need numeric; v_room numeric;
  v_breakdown jsonb := '[]'::jsonb; v_status text;
begin
  if not has_any_role(array['md','accountant']) then raise exception 'Only the MD or accountant can compute a month.'; end if;
  if m_end >= current_date then raise exception 'A month can only be computed after it ends.'; end if;
  select id, status into v_id, v_status from ndc_periods where site_id = p_site_id and period_month = m and status <> 'voided';
  if v_status = 'approved' then raise exception '% is already approved for this site.', to_char(m,'Mon YYYY'); end if;
  v_terms := fn_site_terms(p_site_id, m);
  if v_terms is null then raise exception 'No terms are set for this site. Choose the terms for the site first.'; end if;
  if exists (select 1 from ndc_periods where site_id = p_site_id and period_month < m and status = 'draft') then
    raise exception 'Approve the earlier draft month(s) for this site first.';
  end if;
  select * into t from term_templates where id = v_terms;

  select coalesce(sum(amount),0) into v_rec from site_receipts where site_id = p_site_id and not voided and received_on between m and m_end;
  select coalesce(sum(amount) filter (where category_id = any(t.deductible_category_ids)),0),
         coalesce(sum(amount) filter (where category_id is null or not (category_id = any(t.deductible_category_ids))),0)
    into v_ded, v_exc
    from expenses where site_id = p_site_id and status = 'approved' and expense_date between m and m_end;
  select count(*) into v_pend from expenses where site_id = p_site_id and status = 'pending' and expense_date between m and m_end;
  select coalesce(amount,0) into v_res from site_reserve_budgets where site_id = p_site_id and month = m;
  v_res := coalesce(v_res,0);

  v_raw := v_rec - v_ded - v_res;
  if t.management_fee_pct > 0 then
    v_fee := round(case when t.management_fee_basis = 'gross_receipts' then v_rec else greatest(v_raw,0) end * t.management_fee_pct / 100, 2);
    v_raw := v_raw - v_fee;
  end if;
  select coalesce(deficit_carried_forward,0) into v_bf from ndc_periods
    where site_id = p_site_id and status = 'approved' and period_month < m order by period_month desc limit 1;
  v_bf := coalesce(v_bf,0);
  v_dist := greatest(v_raw - v_bf, 0);
  v_cf := greatest(v_bf - v_raw, 0);

  select coalesce(sum(capital),0) into v_ica from fn_site_capital_on(p_site_id, m_end);
  -- §12: only distributions actually paid count toward thresholds
  select coalesce(sum(d.amount),0) into v_before from distributions d join ndc_periods p on p.id = d.period_id
    where d.site_id = p_site_id and d.share_type = 'investor_portion' and d.paid_on is not null and p.status = 'approved';

  -- §11 waterfall: only the amount needed to reach a threshold uses the earlier tier
  v_remaining := v_dist; v_c := v_before;
  if v_ica > 0 then
    for tier in select * from jsonb_array_elements(t.tiers) loop
      exit when v_remaining <= 0;
      v_pct := (tier->>'investor_pct')::numeric / 100;
      v_top := case when tier->>'to' is null then null else (tier->>'to')::numeric * v_ica end;
      continue when v_top is not null and v_c >= v_top;
      if v_top is null or v_pct = 0 then v_need := v_remaining;
      else v_room := v_top - v_c; v_need := least(v_remaining, v_room / v_pct); end if;
      v_inv := v_inv + round(v_need * v_pct, 2); v_c := v_c + v_need * v_pct; v_remaining := v_remaining - v_need;
      v_breakdown := v_breakdown || jsonb_build_object('from', tier->'from', 'to', tier->'to', 'investor_pct', tier->'investor_pct',
                       'ndc_in_tier', round(v_need,2), 'investor', round(v_need * v_pct,2), 'apcl', round(v_need - v_need * v_pct,2));
    end loop;
  end if;

  if v_id is null then
    insert into ndc_periods (site_id, period_month) values (p_site_id, m) returning id into v_id;
  end if;
  update ndc_periods set term_template_id = v_terms, receipts = v_rec, deductible_expenses = v_ded, excluded_expenses = v_exc,
    pending_expenses_count = v_pend, reserve = v_res, management_fee = v_fee, ndc_raw = v_raw,
    deficit_brought_forward = v_bf, distributable = v_dist, deficit_carried_forward = v_cf, ica = v_ica,
    investor_receipts_before = v_before, investor_portion = v_inv, apcl_operator_share = v_dist - v_inv,
    tier_breakdown = v_breakdown, computed_at = now()
  where id = v_id;

  -- per-investor split of the investor portion by capital-days in the month (draft rows, replaced on recompute)
  delete from distributions where period_id = v_id;
  insert into distributions (period_id, site_id, investor_id, share_type, capital_share, amount)
  select v_id, p_site_id, cd.investor_id, 'investor_portion', cd.days / nullif(tot.days,0), round(v_inv * cd.days / nullif(tot.days,0), 2)
  from (select c.investor_id, sum(c.capital) as days
          from generate_series(m, m_end, interval '1 day') g(d), lateral fn_site_capital_on(p_site_id, g.d::date) c
          group by c.investor_id having sum(c.capital) > 0) cd,
       (select sum(c.capital) as days from generate_series(m, m_end, interval '1 day') g(d), lateral fn_site_capital_on(p_site_id, g.d::date) c) tot
  where v_inv > 0;
  if v_dist - v_inv > 0 then
    insert into distributions (period_id, site_id, investor_id, share_type, amount) values (v_id, p_site_id, null, 'apcl_operator', v_dist - v_inv);
  end if;
  return v_id;
end $$;
revoke all on function public.compute_ndc_period(uuid, date) from public, anon;
grant execute on function public.compute_ndc_period(uuid, date) to authenticated;

-- ---------- approve (MD) / void (MD) / mark paid ----------
create or replace function public.approve_ndc_period(p_period_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p ndc_periods%rowtype;
begin
  if coalesce(get_user_role(),'') <> 'md' then raise exception 'Only the MD can approve a month.'; end if;
  select * into p from ndc_periods where id = p_period_id for update;
  if not found or p.status <> 'draft' then raise exception 'Only a draft month can be approved.'; end if;
  if p.pending_expenses_count > 0 or exists (select 1 from expenses where site_id = p.site_id and status = 'pending'
       and expense_date between p.period_month and (p.period_month + interval '1 month' - interval '1 day')::date) then
    raise exception 'This month still has pending site expenses. Approve or reject them, then recompute.';
  end if;
  if p.computed_at is null then raise exception 'Compute the month first.'; end if;
  update ndc_periods set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_period_id;
end $$;
revoke all on function public.approve_ndc_period(uuid) from public, anon;
grant execute on function public.approve_ndc_period(uuid) to authenticated;

create or replace function public.void_ndc_period(p_period_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p ndc_periods%rowtype;
begin
  if coalesce(get_user_role(),'') <> 'md' then raise exception 'Only the MD can void a month.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Give a reason.'; end if;
  select * into p from ndc_periods where id = p_period_id for update;
  if not found or p.status = 'voided' then raise exception 'Month not found or already voided.'; end if;
  if exists (select 1 from distributions where period_id = p_period_id and paid_on is not null) then
    raise exception 'Payments were already made for this month. Record a correction in the next month instead.';
  end if;
  if exists (select 1 from ndc_periods where site_id = p.site_id and period_month > p.period_month and status = 'approved') then
    raise exception 'A later month is approved. Void the later month first.';
  end if;
  update ndc_periods set status = 'voided', void_reason = trim(p_reason) where id = p_period_id;
end $$;
revoke all on function public.void_ndc_period(uuid, text) from public, anon;
grant execute on function public.void_ndc_period(uuid, text) to authenticated;

create or replace function public.mark_distribution_paid(p_distribution_id uuid, p_paid_on date, p_reference text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_any_role(array['md','accountant']) then raise exception 'Only the MD or accountant can record a payment.'; end if;
  if p_paid_on is null then raise exception 'Enter the payment date.'; end if;
  update distributions d set paid_on = p_paid_on, paid_reference = nullif(trim(p_reference),'')
    from ndc_periods p where p.id = d.period_id and d.id = p_distribution_id and p.status = 'approved' and d.paid_on is null;
  if not found then raise exception 'Only an unpaid line in an approved month can be marked paid.'; end if;
end $$;
revoke all on function public.mark_distribution_paid(uuid, date, text) from public, anon;
grant execute on function public.mark_distribution_paid(uuid, date, text) to authenticated;

-- ndc_periods and distributions have no insert/update/delete grants: written only by the SECURITY DEFINER functions above.

-- ---------- SPV ledger view (per site) ----------
create view public.v_spv_ledger with (security_invoker = true) as
select site_id, received_on as entry_date, 'receipt' as entry_type, amount as owed_to_spv, 0::numeric as paid_out, reference, id as source_id
  from site_receipts where not voided
union all
select site_id, transferred_on, 'transfer_to_spv', -amount, 0, reference, id from spv_transfers
union all
select d.site_id, d.paid_on, case when d.share_type = 'apcl_operator' then 'apcl_share_paid' else 'investor_distribution_paid' end, 0, d.amount, d.paid_reference, d.id
  from distributions d join ndc_periods p on p.id = d.period_id where d.paid_on is not null and p.status = 'approved';

-- ---------- per-investor summary view ----------
create view public.v_investor_position with (security_invoker = true) as
select i.id as investor_id, i.name, c.site_id,
  sum(c.amount) as capital_net,
  coalesce((select sum(d.amount) from distributions d join ndc_periods p on p.id = d.period_id
            where d.investor_id = i.id and d.site_id = c.site_id and p.status = 'approved' and d.paid_on is not null), 0) as distributions_paid,
  coalesce((select sum(d.amount) from distributions d join ndc_periods p on p.id = d.period_id
            where d.investor_id = i.id and d.site_id = c.site_id and p.status = 'approved' and d.paid_on is null), 0) as distributions_due
from investors i join capital_contributions c on c.investor_id = i.id
group by i.id, i.name, c.site_id;

-- ---------- seed Term Sheet V2 ----------
insert into public.term_templates (name, version, tiers, term_years, management_fee_pct, deductible_category_ids, notes)
select 'Term Sheet V2', 1,
  '[{"from":0,"to":1,"investor_pct":65},{"from":1,"to":1.5,"investor_pct":35},{"from":1.5,"to":2,"investor_pct":25},{"from":2,"to":null,"investor_pct":20}]'::jsonb,
  5, 0,
  coalesce(array(select id from expense_categories where name in ('Raw Materials','Production Fuel','Machine Maintenance','Labour','Salaries','Loading and Offloading','Utilities','Bank Charge')), '{}'),
  'Seeded from Term Sheet V2.';

-- ---------- RLS ----------
alter table public.investors enable row level security;
alter table public.capital_contributions enable row level security;
alter table public.term_templates enable row level security;
alter table public.site_pool_terms enable row level security;
alter table public.site_reserve_budgets enable row level security;
alter table public.site_receipts enable row level security;
alter table public.spv_transfers enable row level security;
alter table public.ndc_periods enable row level security;
alter table public.distributions enable row level security;
revoke all on public.investors, public.capital_contributions, public.term_templates, public.site_pool_terms, public.site_reserve_budgets,
  public.site_receipts, public.spv_transfers, public.ndc_periods, public.distributions from anon, authenticated;
grant select on public.investors, public.capital_contributions, public.term_templates, public.site_pool_terms, public.site_reserve_budgets,
  public.site_receipts, public.spv_transfers, public.ndc_periods, public.distributions to authenticated;
grant insert, update on public.investors, public.capital_contributions, public.term_templates, public.site_pool_terms, public.site_reserve_budgets,
  public.site_receipts, public.spv_transfers to authenticated;
grant delete on public.site_pool_terms, public.site_reserve_budgets to authenticated;
revoke all on public.v_spv_ledger, public.v_investor_position from anon;
grant select on public.v_spv_ledger, public.v_investor_position to authenticated;
create or replace function public.fn_my_investor_sites()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct c.site_id from capital_contributions c join investors i on i.id = c.investor_id where i.user_id = auth.uid();
$$;
revoke all on function public.fn_my_investor_sites() from public, anon;
grant execute on function public.fn_my_investor_sites() to authenticated;
create policy investors_select on public.investors for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member']) or user_id = auth.uid());
create policy investors_insert on public.investors for insert to authenticated with check (has_any_role(array['md']));
create policy investors_update on public.investors for update to authenticated using (has_any_role(array['md'])) with check (has_any_role(array['md']));
create policy capital_select on public.capital_contributions for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member']) or investor_id in (select id from investors where user_id = auth.uid()));
create policy capital_insert on public.capital_contributions for insert to authenticated with check (has_any_role(array['md']));
create policy terms_select on public.term_templates for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member'])
         or id in (select term_template_id from site_pool_terms where site_id in (select fn_my_investor_sites())));
create policy terms_insert on public.term_templates for insert to authenticated with check (has_any_role(array['md']));
create policy terms_update on public.term_templates for update to authenticated using (has_any_role(array['md'])) with check (has_any_role(array['md']));
create policy pool_terms_select on public.site_pool_terms for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member']) or site_id in (select fn_my_investor_sites()));
create policy pool_terms_insert on public.site_pool_terms for insert to authenticated with check (has_any_role(array['md']));
create policy pool_terms_update on public.site_pool_terms for update to authenticated
  using (has_any_role(array['md']) and not exists (select 1 from ndc_periods p where p.site_id = site_pool_terms.site_id and p.status = 'approved' and p.period_month >= date_trunc('month', site_pool_terms.effective_from)))
  with check (has_any_role(array['md']));
create policy pool_terms_delete on public.site_pool_terms for delete to authenticated
  using (has_any_role(array['md']) and not exists (select 1 from ndc_periods p where p.site_id = site_pool_terms.site_id and p.status = 'approved' and p.period_month >= date_trunc('month', site_pool_terms.effective_from)));
create policy reserve_select on public.site_reserve_budgets for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member']) or site_id in (select fn_my_investor_sites()));
create policy reserve_insert on public.site_reserve_budgets for insert to authenticated with check (has_any_role(array['md']));
create policy reserve_update on public.site_reserve_budgets for update to authenticated
  using (has_any_role(array['md']) and not exists (select 1 from ndc_periods p where p.site_id = site_reserve_budgets.site_id and p.period_month = site_reserve_budgets.month and p.status = 'approved'))
  with check (has_any_role(array['md']));
create policy reserve_delete on public.site_reserve_budgets for delete to authenticated
  using (has_any_role(array['md']) and not exists (select 1 from ndc_periods p where p.site_id = site_reserve_budgets.site_id and p.period_month = site_reserve_budgets.month and p.status = 'approved'));
create policy receipts_select on public.site_receipts for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member']) or site_id in (select fn_my_investor_sites()));
create policy receipts_insert on public.site_receipts for insert to authenticated with check (has_any_role(array['md','accountant']));
create policy receipts_update on public.site_receipts for update to authenticated using (has_any_role(array['md','accountant'])) with check (has_any_role(array['md','accountant']));
create policy transfers_select on public.spv_transfers for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member']) or site_id in (select fn_my_investor_sites()));
create policy transfers_insert on public.spv_transfers for insert to authenticated with check (has_any_role(array['md','accountant']));
create policy ndc_select on public.ndc_periods for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member']) or (site_id in (select fn_my_investor_sites()) and status = 'approved'));
create policy dist_select on public.distributions for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member'])
         or (investor_id in (select id from investors where user_id = auth.uid())
             and exists (select 1 from ndc_periods p where p.id = distributions.period_id and p.status = 'approved')));
