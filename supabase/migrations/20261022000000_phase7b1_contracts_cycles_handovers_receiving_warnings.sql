-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-22, verified. Kept here as the tracked record. DO NOT RE-RUN.

-- ---------- working days (Mon–Fri, minus public holidays) ----------
create table public.public_holidays (holiday_date date primary key, name text not null);
alter table public.public_holidays enable row level security;
revoke all on public.public_holidays from anon, authenticated;
grant select, insert, update, delete on public.public_holidays to authenticated;
create policy public_holidays_select on public.public_holidays for select to authenticated using (true);
create policy public_holidays_write on public.public_holidays for all to authenticated
  using (has_any_role(array['md','hr_officer'])) with check (has_any_role(array['md','hr_officer']));

create or replace function public.working_days_add(p_from date, p_days int)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := p_from; n int := 0;
begin
  if p_from is null or p_days is null then return null; end if;
  while n < p_days loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from public_holidays where holiday_date = d) then n := n + 1; end if;
  end loop;
  return d;
end $$;
revoke all on function public.working_days_add(date,int) from public, anon;
grant execute on function public.working_days_add(date,int) to authenticated;

-- ---------- contracts ----------
create table public.site_contracts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  client_name text not null,
  contract_ref text,
  contract_model text not null check (contract_model in ('service_fee','full_supply')),
  total_qty_9in int not null default 0 check (total_qty_9in >= 0),
  total_qty_6in int not null default 0 check (total_qty_6in >= 0),
  fee_per_block numeric check (fee_per_block >= 0),
  opening_rate_9in numeric check (opening_rate_9in >= 0),
  opening_rate_6in numeric check (opening_rate_6in >= 0),
  planning_rate_per_day int not null check (planning_rate_per_day > 0),
  advance_notice_days int not null default 7 check (advance_notice_days between 0 and 60),
  material_warning_days int not null default 3 check (material_warning_days between 0 and 60),
  status text not null default 'active' check (status in ('active','completed','suspended','cancelled')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index uq_site_contracts_one_active on public.site_contracts (site_id) where status = 'active';

-- ---------- cycles ----------
create table public.contract_cycles (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.site_contracts(id),
  cycle_no int not null check (cycle_no > 0),
  qty_9in int not null default 0 check (qty_9in >= 0),
  qty_6in int not null default 0 check (qty_6in >= 0),
  qty_total int not null default 0 check (qty_total >= 0),
  rate_9in numeric check (rate_9in >= 0),
  rate_6in numeric check (rate_6in >= 0),
  amount_due numeric check (amount_due >= 0),
  amount_received numeric not null default 0 check (amount_received >= 0),
  payment_ref text,
  paid_on date,
  schedule_received_on date,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','active','completed','closed','cancelled')),
  started_on date,
  advance_notice_sent_on date,
  completed_on date,
  completion_notice_sent_on date,
  remobilisation_deadline date,
  third_party_from date,
  resume_deadline date,
  override_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, cycle_no)
);
create unique index uq_contract_cycles_one_active on public.contract_cycles (contract_id) where status = 'active';

create table public.contract_cycle_audit (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.contract_cycles(id) on delete cascade,
  from_status text, to_status text, note text,
  actor uuid default auth.uid(), actor_role text, at timestamptz not null default now()
);

create or replace function public.fn_contract_cycle_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_model text; v_funded boolean;
begin
  select contract_model into v_model from site_contracts where id = new.contract_id;
  if (new.qty_9in + new.qty_6in) > 0 then new.qty_total := new.qty_9in + new.qty_6in; end if;
  if v_model = 'full_supply' and (new.qty_9in + new.qty_6in) > 0
     and new.rate_9in is not null and new.rate_6in is not null then
    new.amount_due := new.qty_9in * new.rate_9in + new.qty_6in * new.rate_6in;
  end if;
  new.remobilisation_deadline := case when new.completion_notice_sent_on is null then null else new.completion_notice_sent_on + 7 end;
  new.third_party_from := case when new.completion_notice_sent_on is null then null else new.completion_notice_sent_on + 8 end;
  v_funded := new.amount_due is not null and new.amount_received >= new.amount_due
              and (v_model = 'service_fee' or new.schedule_received_on is not null);
  new.resume_deadline := case when new.cycle_no > 1 and v_funded
    then working_days_add(greatest(coalesce(new.paid_on, current_date), coalesce(new.schedule_received_on, new.paid_on, current_date)), 10) end;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not v_funded then
      if coalesce(get_user_role(),'') <> 'md' or coalesce(trim(new.override_reason),'') = '' then
        raise exception 'Cycle % cannot start: it is not fully paid%. Only the MD can start it early, with a written reason.',
          new.cycle_no, case when v_model = 'full_supply' then ' or the production schedule is missing' else '' end;
      end if;
    end if;
    new.started_on := coalesce(new.started_on, current_date);
  end if;
  if new.status = 'completed' then new.completed_on := coalesce(new.completed_on, current_date); end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.fn_contract_cycle_guard() from public, anon, authenticated;
create trigger trg_contract_cycle_guard before insert or update on public.contract_cycles
  for each row execute function public.fn_contract_cycle_guard();

create or replace function public.fn_contract_cycle_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status
     or new.amount_received is distinct from old.amount_received then
    insert into contract_cycle_audit (cycle_id, from_status, to_status, note, actor_role)
    values (new.id, case when tg_op='UPDATE' then old.status end, new.status,
            concat_ws(' | ',
              case when tg_op='UPDATE' and new.amount_received is distinct from old.amount_received
                   then 'received '||coalesce(old.amount_received,0)||' -> '||new.amount_received end,
              nullif(new.override_reason,'')), get_user_role());
  end if;
  return new;
end $$;
revoke all on function public.fn_contract_cycle_audit() from public, anon, authenticated;
create trigger trg_contract_cycle_audit after insert or update on public.contract_cycles
  for each row execute function public.fn_contract_cycle_audit();

-- ---------- block handovers ----------
create table public.block_handovers (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.production_sites(id),
  cycle_id uuid references public.contract_cycles(id),
  handover_date date not null default current_date,
  block_type text not null,
  qty_handed_over int not null check (qty_handed_over > 0),
  qty_accepted int not null default 0 check (qty_accepted >= 0),
  qty_rejected int not null default 0 check (qty_rejected >= 0),
  rejection_reason text,
  client_rep text,
  photo_path text,
  deemed boolean not null default false,
  status text not null default 'pending' check (status in ('pending','accepted','deemed_accepted','partly_rejected','rejected')),
  verdict_on date,
  deemed_accept_due date,
  rectify_due date,
  rectified_on date,
  rectification_notes text,
  notes text,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (qty_accepted + qty_rejected <= qty_handed_over),
  check (qty_rejected = 0 or coalesce(trim(rejection_reason),'') <> '')
);
create index idx_block_handovers_site on public.block_handovers (site_id);
create index idx_block_handovers_cycle on public.block_handovers (cycle_id);
create trigger trg_validate_block_type before insert or update on public.block_handovers
  for each row execute function public.validate_block_type();

create or replace function public.fn_block_handover_fill()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cycle_id is null and new.site_id is not null then
    select cy.id into new.cycle_id from contract_cycles cy join site_contracts sc on sc.id = cy.contract_id
      where sc.site_id = new.site_id and sc.status = 'active' and cy.status = 'active' limit 1;
  end if;
  if new.site_id is null and new.cycle_id is not null then
    select sc.site_id into new.site_id from contract_cycles cy join site_contracts sc on sc.id = cy.contract_id where cy.id = new.cycle_id;
  end if;
  if new.site_id is null then raise exception 'A handover needs a site.'; end if;
  new.deemed_accept_due := working_days_add(new.handover_date, 3);
  if (new.qty_accepted + new.qty_rejected) > 0 and new.verdict_on is null then new.verdict_on := current_date; end if;
  new.status := case
    when new.deemed then 'deemed_accepted'
    when new.qty_accepted + new.qty_rejected = 0 then 'pending'
    when new.qty_rejected = 0 then 'accepted'
    when new.qty_accepted = 0 and new.qty_rejected = new.qty_handed_over then 'rejected'
    else 'partly_rejected' end;
  new.rectify_due := case when new.qty_rejected > 0 then coalesce(new.verdict_on, current_date) + 2 end;
  return new;
end $$;
revoke all on function public.fn_block_handover_fill() from public, anon, authenticated;
create trigger trg_block_handover_fill before insert or update on public.block_handovers
  for each row execute function public.fn_block_handover_fill();

-- ---------- material receiving (RPC-only writes) ----------
create table public.material_receipts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.production_sites(id),
  item_id uuid not null references public.inventory_items(id),
  received_on date not null default current_date,
  qty_delivered numeric not null check (qty_delivered > 0),
  qty_accepted numeric not null check (qty_accepted >= 0),
  qty_rejected numeric generated always as (qty_delivered - qty_accepted) stored,
  rejection_reason text,
  supplier_or_source text,
  truck_or_waybill_ref text,
  photo_path text,
  notes text,
  stock_movement_id uuid references public.stock_movements(id),
  voided boolean not null default false,
  void_reason text,
  void_movement_id uuid references public.stock_movements(id),
  received_by uuid default auth.uid(),
  received_by_name text,
  created_at timestamptz not null default now(),
  check (qty_accepted <= qty_delivered),
  check (qty_accepted = qty_delivered or coalesce(trim(rejection_reason),'') <> '')
);
create index idx_material_receipts_site on public.material_receipts (site_id, received_on);

create or replace function public.record_material_receipt(
  p_item_id uuid, p_received_on date, p_qty_delivered numeric, p_qty_accepted numeric,
  p_rejection_reason text default null, p_supplier text default null, p_ref text default null,
  p_photo_path text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_item inventory_items%rowtype; v_id uuid; v_mov uuid; v_name text; v_site text;
begin
  if not has_any_role(array['md','store_officer','production_manager','assistant_production_manager']) then
    raise exception 'You do not have permission to record material deliveries.';
  end if;
  select * into v_item from inventory_items where id = p_item_id for update;
  if not found then raise exception 'Stock item not found.'; end if;
  if p_qty_delivered is null or p_qty_delivered <= 0 then raise exception 'Delivered quantity must be more than zero.'; end if;
  if p_qty_accepted is null or p_qty_accepted < 0 or p_qty_accepted > p_qty_delivered then
    raise exception 'Accepted quantity must be between 0 and the delivered quantity.';
  end if;
  if p_qty_accepted < p_qty_delivered and coalesce(trim(p_rejection_reason),'') = '' then
    raise exception 'Give a reason for the rejected quantity.';
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into material_receipts (site_id, item_id, received_on, qty_delivered, qty_accepted, rejection_reason,
      supplier_or_source, truck_or_waybill_ref, photo_path, notes, received_by_name)
    values (v_item.site_id, p_item_id, coalesce(p_received_on, current_date), p_qty_delivered, p_qty_accepted,
      nullif(trim(p_rejection_reason),''), p_supplier, p_ref, p_photo_path, p_notes, v_name)
    returning id into v_id;
  if p_qty_accepted > 0 then
    insert into stock_movements (item_id, movement_type, quantity, supplier, reference, staff_name, date, notes)
      values (p_item_id, 'in', p_qty_accepted, p_supplier, 'RCPT-'||left(v_id::text,8), v_name,
              coalesce(p_received_on, current_date), 'Material receipt (accepted quantity)')
      returning id into v_mov;
    update inventory_items set current_stock = coalesce(current_stock,0) + p_qty_accepted, updated_at = now() where id = p_item_id;
    update material_receipts set stock_movement_id = v_mov where id = v_id;
  end if;
  if p_qty_accepted < p_qty_delivered then
    select name into v_site from production_sites where id = v_item.site_id;
    perform fn_notify_role('md', 'action_required', 'Material rejected at '||v_site,
      (p_qty_delivered - p_qty_accepted)||' '||v_item.unit||' of '||v_item.name||' rejected: '||trim(p_rejection_reason)
      ||case when v_item.owner = 'client' then '. Client-supplied — send the rejection notice to the client.' else '.' end,
      'material_receipts', v_id);
  end if;
  return v_id;
end $$;
revoke all on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text) from public, anon;
grant execute on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text) to authenticated;

create or replace function public.void_material_receipt(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r material_receipts%rowtype; v_mov uuid; v_name text;
begin
  if not has_any_role(array['md','store_officer']) then raise exception 'Only the MD or Store Officer can void a delivery record.'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Give a reason for voiding this delivery.'; end if;
  select * into r from material_receipts where id = p_id for update;
  if not found then raise exception 'Delivery record not found.'; end if;
  if r.voided then raise exception 'This delivery record is already void.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  if r.qty_accepted > 0 then
    insert into stock_movements (item_id, movement_type, quantity, reference, staff_name, date, notes)
      values (r.item_id, 'out', r.qty_accepted, 'RCPT-VOID-'||left(r.id::text,8), v_name, current_date,
              'Reversal of voided material receipt: '||trim(p_reason))
      returning id into v_mov;
    update inventory_items set current_stock = coalesce(current_stock,0) - r.qty_accepted, updated_at = now() where id = r.item_id;
  end if;
  update material_receipts set voided = true, void_reason = trim(p_reason), void_movement_id = v_mov where id = p_id;
end $$;
revoke all on function public.void_material_receipt(uuid,text) from public, anon;
grant execute on function public.void_material_receipt(uuid,text) to authenticated;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['site_contracts','contract_cycles','contract_cycle_audit','block_handovers','material_receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager']))$p$, t||'_select', t);
  end loop;
end $$;
grant insert, update on public.site_contracts to authenticated;
create policy site_contracts_insert on public.site_contracts for insert to authenticated with check (has_any_role(array['md']));
create policy site_contracts_update on public.site_contracts for update to authenticated using (has_any_role(array['md'])) with check (has_any_role(array['md']));
grant insert, update on public.contract_cycles to authenticated;
create policy contract_cycles_insert on public.contract_cycles for insert to authenticated with check (has_any_role(array['md','accountant']));
create policy contract_cycles_update on public.contract_cycles for update to authenticated using (has_any_role(array['md','accountant'])) with check (has_any_role(array['md','accountant']));
grant insert, update, delete on public.block_handovers to authenticated;
create policy block_handovers_insert on public.block_handovers for insert to authenticated with check (has_any_role(array['md','production_manager','assistant_production_manager','store_officer']));
create policy block_handovers_update on public.block_handovers for update to authenticated using (has_any_role(array['md','production_manager','assistant_production_manager','store_officer'])) with check (has_any_role(array['md','production_manager','assistant_production_manager','store_officer']));
create policy block_handovers_delete on public.block_handovers for delete to authenticated using (get_user_role() = 'md');

-- ---------- photo storage ----------
insert into storage.buckets (id, name, public) values ('site-records','site-records', false) on conflict (id) do nothing;
create policy site_records_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-records' and public.has_any_role(array['md','store_officer','production_manager','assistant_production_manager']));
create policy site_records_select on storage.objects for select to authenticated
  using (bucket_id = 'site-records' and public.has_any_role(array['md','board_member','ico','accountant','production_manager','assistant_production_manager','store_officer','logistics_manager']));

-- ---------- views (security_invoker so RLS applies) ----------
create view public.v_cycle_forecast with (security_invoker = true) as
select cy.id as cycle_id, cy.contract_id, sc.site_id, s.name as site_name, sc.client_name, sc.contract_model,
       cy.cycle_no, cy.status, cy.qty_total, cy.amount_due, cy.amount_received, cy.started_on,
       d.done, greatest(cy.qty_total - d.done, 0) as remaining,
       r.days_n, round(r.avg_rate) as avg_rate_5day,
       case when r.days_n >= 5 then round(r.avg_rate) else sc.planning_rate_per_day end as rate_used,
       case when r.days_n >= 5 then 'actual' else 'planning' end as rate_basis,
       round(greatest(cy.qty_total - d.done, 0)::numeric / nullif(case when r.days_n >= 5 then r.avg_rate else sc.planning_rate_per_day end, 0), 1) as days_left,
       working_days_add(current_date, ceil(greatest(cy.qty_total - d.done, 0)::numeric / nullif(case when r.days_n >= 5 then r.avg_rate else sc.planning_rate_per_day end, 0))::int) as forecast_completion,
       sc.advance_notice_days, cy.advance_notice_sent_on, cy.completed_on, cy.completion_notice_sent_on,
       cy.remobilisation_deadline, cy.third_party_from, cy.resume_deadline
from contract_cycles cy
join site_contracts sc on sc.id = cy.contract_id
join production_sites s on s.id = sc.site_id
cross join lateral (
  select case
    when cy.started_on is null then 0
    when sc.contract_model = 'service_fee' then
      coalesce((select sum(h.qty_accepted) from block_handovers h where h.cycle_id = cy.id), 0)
    else
      coalesce((select sum(p.quantity_produced) from production_log p where p.site_id = sc.site_id
                 and p.date between cy.started_on and coalesce(cy.completed_on, current_date)), 0)
      - coalesce((select sum(dm.quantity_damaged) from damage_log dm where dm.site_id = sc.site_id
                 and dm.stage in ('production','stacking','curing')
                 and dm.date between cy.started_on and coalesce(cy.completed_on, current_date)), 0)
  end::int as done
) d
cross join lateral (
  select count(*) as days_n, avg(q) as avg_rate from (
    select p.date, sum(p.quantity_produced) as q from production_log p
    where p.site_id = sc.site_id and p.quantity_produced > 0
    group by p.date order by p.date desc limit 5) x
) r;

create view public.v_site_material_runway with (security_invoker = true) as
select i.id as item_id, i.site_id, s.name as site_name, s.site_type, i.name as item_name, i.material, i.owner, i.unit,
       i.current_stock, u.days_n, round(u.avg_use, 2) as avg_daily_use,
       round(i.current_stock / nullif(u.avg_use, 0), 1) as days_left,
       coalesce(sc.material_warning_days, 3) as warning_days
from inventory_items i
join production_sites s on s.id = i.site_id
left join site_contracts sc on sc.site_id = i.site_id and sc.status = 'active'
cross join lateral (
  select count(*) as days_n, avg(q) as avg_use from (
    select p.date, sum(case i.material when 'cement' then p.cement_bags when 'dust' then p.granite_dust_kg
                                       when 'chippings' then p.chippings_kg when 'diesel' then p.diesel_litres end) as q
    from production_log p where p.site_id = i.site_id group by p.date
    having sum(case i.material when 'cement' then p.cement_bags when 'dust' then p.granite_dust_kg
                               when 'chippings' then p.chippings_kg when 'diesel' then p.diesel_litres end) > 0
    order by p.date desc limit 5) x
) u
where i.material is not null;

create view public.v_site_yard with (security_invoker = true) as
select s.id as site_id, s.name as site_name, bt.block_type,
       coalesce(b.accepted,0) as batched, coalesce(dm.damaged,0) as damaged_after_batch,
       coalesce(h.handed,0) as handed_over,
       coalesce(b.accepted,0) - coalesce(dm.damaged,0) - coalesce(h.handed,0) as in_yard
from production_sites s
cross join lateral (select distinct block_type from batches where site_id = s.id
                    union select distinct block_type from block_handovers where site_id = s.id) bt
left join lateral (select sum(qty_accepted) accepted from batches where site_id = s.id and block_type = bt.block_type) b on true
left join lateral (select sum(quantity_damaged) damaged from damage_log where site_id = s.id and block_type = bt.block_type and batch_id is not null) dm on true
left join lateral (select sum(qty_handed_over) handed from block_handovers where site_id = s.id and block_type = bt.block_type) h on true
where s.site_type = 'client_site';

revoke all on public.v_cycle_forecast, public.v_site_material_runway, public.v_site_yard from anon;
grant select on public.v_cycle_forecast, public.v_site_material_runway, public.v_site_yard to authenticated;

-- ---------- warnings ----------
create table public.site_warning_log (key text primary key, title text, warned_at timestamptz not null default now());
alter table public.site_warning_log enable row level security;
revoke all on public.site_warning_log from anon, authenticated;
grant select on public.site_warning_log to authenticated;
create policy site_warning_log_select on public.site_warning_log for select to authenticated using (has_any_role(array['md','production_manager']));

create or replace function public.fn_site_warn(p_key text, p_title text, p_body text, p_table text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into site_warning_log (key, title) values (p_key, p_title) on conflict (key) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    perform fn_notify_role('md', 'action_required', p_title, p_body, p_table, p_id);
    perform fn_notify_role('production_manager', 'action_required', p_title, p_body, p_table, p_id);
  end if;
end $$;
revoke all on function public.fn_site_warn(text,text,text,text,uuid) from public, anon, authenticated;

create or replace function public.run_site_warnings()
returns int language plpgsql security definer set search_path = public as $$
declare f record; m record; h record; c record; n int := 0; v_next boolean;
begin
  if auth.uid() is not null and not has_any_role(array['md']) then raise exception 'Only the MD can run site warnings manually.'; end if;

  -- Sequoia §7: deemed acceptance after 3 working days with no written verdict
  update block_handovers bh set deemed = true, qty_accepted = bh.qty_handed_over - bh.qty_rejected
  from contract_cycles cy join site_contracts sc on sc.id = cy.contract_id
  where bh.cycle_id = cy.id and sc.contract_model = 'full_supply'
    and bh.status = 'pending' and current_date > bh.deemed_accept_due;

  for f in select * from v_cycle_forecast where status = 'active' loop
    if f.remaining <= 0 then
      perform fn_site_warn('cycle_done:'||f.cycle_id,
        f.client_name||' cycle '||f.cycle_no||' complete',
        case when f.contract_model = 'full_supply'
          then 'All '||f.qty_total||' blocks of cycle '||f.cycle_no||' are produced. Send Sequoia the written completion notice (Proposal §3) and record the date on the cycle.'
          else 'The prepaid quantity for cycle '||f.cycle_no||' ('||f.qty_total||' accepted blocks) is used up. Further production is unfunded until the next payment.' end,
        'contract_cycles', f.cycle_id); n := n + 1;
    elsif f.days_left <= f.advance_notice_days and f.advance_notice_sent_on is null then
      perform fn_site_warn('cycle_notice:'||f.cycle_id,
        case when f.contract_model = 'full_supply' then 'Send Sequoia the 7-day notice (cycle '||f.cycle_no||')'
             else 'Request next payment from '||f.client_name end,
        f.remaining||' blocks left in cycle '||f.cycle_no||', about '||f.days_left||' production days at '||f.rate_used||'/day ('
          ||f.rate_basis||' rate). Forecast finish '||to_char(f.forecast_completion,'DD Mon YYYY')||'.',
        'contract_cycles', f.cycle_id); n := n + 1;
    end if;
  end loop;

  -- Sequoia §6: remobilisation window and third-party right; §6 10-working-day resume
  for c in select cy.*, sc.client_name from contract_cycles cy join site_contracts sc on sc.id = cy.contract_id
           where sc.contract_model = 'full_supply' and cy.completion_notice_sent_on is not null loop
    select exists (select 1 from contract_cycles x where x.contract_id = c.contract_id and x.cycle_no > c.cycle_no
                   and x.amount_due is not null and x.amount_received >= x.amount_due and x.schedule_received_on is not null) into v_next;
    if not v_next and current_date >= c.third_party_from then
      perform fn_site_warn('third_party:'||c.id, 'Third-party production now allowed at Kado',
        'Sequoia did not remobilise within 7 days of the cycle '||c.cycle_no||' completion notice. From '||to_char(c.third_party_from,'DD Mon YYYY')||' APCL may use the site capacity for other customers (Proposal §6).',
        'contract_cycles', c.id); n := n + 1;
    elsif not v_next and current_date >= c.remobilisation_deadline - 2 then
      perform fn_site_warn('remob_2d:'||c.id, 'Sequoia remobilisation deadline in 2 days',
        'Sequoia must send the schedule, agree the rate and fully pay cycle '||(c.cycle_no+1)||' by '||to_char(c.remobilisation_deadline,'DD Mon YYYY')||'.',
        'contract_cycles', c.id); n := n + 1;
    end if;
  end loop;
  for c in select cy.*, sc.client_name from contract_cycles cy join site_contracts sc on sc.id = cy.contract_id
           where cy.resume_deadline is not null and cy.status = 'awaiting_payment' and current_date >= cy.resume_deadline - 2 loop
    perform fn_site_warn('resume:'||c.id, 'Restart '||c.client_name||' production by '||to_char(c.resume_deadline,'DD Mon'),
      'Cycle '||c.cycle_no||' is fully mobilised. Production must resume within 10 working days of remobilisation (Proposal §6).',
      'contract_cycles', c.id); n := n + 1;
  end loop;

  -- materials running low (client sites only)
  for m in select * from v_site_material_runway where site_type = 'client_site' and days_left is not null and days_left <= warning_days loop
    perform fn_site_warn('material:'||m.item_id||':'||current_date, m.site_name||': '||m.material||' running low',
      'About '||m.days_left||' days of '||m.material||' left ('||m.current_stock||' '||m.unit||' at '||m.avg_daily_use||' '||m.unit||'/day).'
        ||case when m.owner = 'client' then ' Ask the client to supply more.' else ' Arrange a purchase.' end,
      'inventory_items', m.item_id); n := n + 1;
  end loop;

  -- handovers: Sequoia acceptance due tomorrow; open rectifications past 2 days
  for h in select bh.*, s.name site_name from block_handovers bh join production_sites s on s.id = bh.site_id
           join contract_cycles cy on cy.id = bh.cycle_id join site_contracts sc on sc.id = cy.contract_id
           where sc.contract_model = 'full_supply' and bh.status = 'pending' and current_date >= working_days_add(bh.handover_date, 2) loop
    perform fn_site_warn('handover_due:'||h.id, 'Chase written acceptance at '||h.site_name,
      h.qty_handed_over||' '||h.block_type||' handed over '||to_char(h.handover_date,'DD Mon')||'. Deemed accepted after '||to_char(h.deemed_accept_due,'DD Mon')||' if no written rejection (Proposal §7).',
      'block_handovers', h.id); n := n + 1;
  end loop;
  for h in select bh.*, s.name site_name from block_handovers bh join production_sites s on s.id = bh.site_id
           where bh.qty_rejected > 0 and bh.rectified_on is null and current_date > bh.rectify_due loop
    perform fn_site_warn('rectify:'||h.id, 'Rejected blocks not yet rectified at '||h.site_name,
      h.qty_rejected||' '||h.block_type||' rejected on '||to_char(h.verdict_on,'DD Mon')||': '||h.rejection_reason||'. The 2-day rectification period has passed.',
      'block_handovers', h.id); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.run_site_warnings() from public, anon;
grant execute on function public.run_site_warnings() to authenticated;

select cron.schedule('site-warnings-daily', '0 5 * * *', 'select public.run_site_warnings()');

-- ---------- seeds ----------
insert into public.site_contracts (id, site_id, client_name, contract_ref, contract_model, total_qty_9in, total_qty_6in,
  fee_per_block, planning_rate_per_day, advance_notice_days, notes) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000003', 'Bilaad Realty Nigeria Limited',
  'BR/PMO/BALI GROVE/APCL/2026/001', 'service_fee', 120650, 54332, 241, 2777, 7,
  'Award 13 Oct 2026 (NEC4 ECSC). Fee per ACCEPTED block. Planning rate = 174,982 blocks / 63 days.');
insert into public.site_contracts (id, site_id, client_name, contract_ref, contract_model, total_qty_9in, total_qty_6in,
  opening_rate_9in, opening_rate_6in, planning_rate_per_day, advance_notice_days, notes) values
 ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000002', 'Sequoia Projects Limited',
  'Phase 1 Block Production - Kado, Abuja (Proposal 19 Oct 2026)', 'full_supply', 125000, 25000, 1000, 960, 2880, 7,
  'Rolling 25,000-block cycles, each fully prepaid. Rates re-agreed per cycle (§5). Planning rate is conservative; forecasts switch to actual after 5 production days.');
insert into public.contract_cycles (contract_id, cycle_no, qty_total, amount_due, rate_9in, rate_6in, notes) values
 ('00000000-0000-4000-8000-0000000000b1', 1, 43745, 10542665.50, 241, 241, '25% mobilisation advance per award.'),
 ('00000000-0000-4000-8000-0000000000a1', 1, 25000, null, 1000, 960, 'Opening rates. Enter the 9"/6" mix from Sequoia''s written schedule; amount due is then calculated.');
