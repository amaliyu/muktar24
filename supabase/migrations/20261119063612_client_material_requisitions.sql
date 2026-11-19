-- Applied to production 2026-11-19 by the planning chat (recorded here afterwards). MD approved 2026-11-19.
-- Verified with rolled-back tests as Abubakar (Life Camp), the MD and Umar (Kado): requisition 1 (11,994 9" + 4,255 6")
-- calculated 403 bags cement, 364,572 kg dust+3/8, 329 L diesel; same-day needed-by refused; Abubakar cannot approve;
-- Umar cannot raise or see Life Camp requisitions; delivery against a draft refused; supplied-vs-requested correct;
-- 50% alert -> raise / approve / send / remind steps correct after the follow-up ordering fix (20261119063711).

-- Client material requisitions (Life Camp / Bilaad first; works for any client site).
-- MD decisions 2026-11-19:
--   * Layers: site manager raises -> MD approves -> sent to the client's PM (Bilaad: Abdulkadir) -> client approval recorded.
--     ICO sees every requisition but does not hold it.
--   * Requisition 1 at Life Camp = Bilaad's figures (11,994 9" + 4,255 6"). At 50% of the current approved requisition the app
--     asks for the balance and reminds daily until the client approves it; every reminder is logged (Clause 9 evidence).
--   * Materials at contract planning yields (Award 3a: 40 9" / 43 6" per bag) plus the 1% damage allowance.
--   * 23 kg (9") / 20 kg (6") per block = dust and 3/8 together. 3/8 gets its own optional figure; until set, all posts as dust.
-- Writes only through the functions below; tables are read-only to the app.

-- 1. Standards ---------------------------------------------------------------------------------------------------------
alter table public.site_block_standards
  add column if not exists chippings_kg_per_block numeric,
  add column if not exists blocks_per_bag numeric,
  add column if not exists diesel_l_per_1000 numeric;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'site_block_standards_chippings_within_aggregate') then
    alter table public.site_block_standards
      add constraint site_block_standards_chippings_within_aggregate
      check (chippings_kg_per_block is null or (chippings_kg_per_block >= 0 and chippings_kg_per_block <= dust_kg_per_block));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_block_standards_positive_yields') then
    alter table public.site_block_standards
      add constraint site_block_standards_positive_yields
      check ((blocks_per_bag is null or blocks_per_bag > 0) and (diesel_l_per_1000 is null or diesel_l_per_1000 >= 0));
  end if;
end $$;

comment on column public.site_block_standards.dust_kg_per_block is 'Dust and 3/8 together per block (MD 2026-11-19). Dust posted = this minus chippings_kg_per_block.';
comment on column public.site_block_standards.chippings_kg_per_block is '3/8 part of dust_kg_per_block. Null = not set: everything posts as dust.';
comment on column public.site_block_standards.blocks_per_bag is 'Planning cement yield (blocks per 50 kg bag). Bilaad Award 3a: 40 (9") / 43 (6").';
comment on column public.site_block_standards.diesel_l_per_1000 is 'Planning diesel, litres per 1,000 blocks.';

update public.site_block_standards b
   set blocks_per_bag = case when b.block_type ilike '9%' then 40 when b.block_type ilike '6%' then 43 end,
       diesel_l_per_1000 = 20
  from public.production_sites s
 where s.id = b.site_id and s.code = 'LIFECAMP-BIL' and b.blocks_per_bag is null;

-- Production posting: dust = aggregate minus 3/8; 3/8 computed when its figure is set.
create or replace function public.fn_production_dust_calc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v numeric; vc numeric;
begin
  if not app_flag('production_materials_in_db') then return new; end if;
  select dust_kg_per_block, chippings_kg_per_block into v, vc
    from site_block_standards where site_id = new.site_id and block_type = new.block_type;
  if v is not null then
    new.granite_dust_kg := round(coalesce(new.quantity_produced, 0) * (v - coalesce(vc, 0)), 2);
    if vc is not null then
      new.chippings_kg := round(coalesce(new.quantity_produced, 0) * vc, 2);
    end if;
  end if;
  return new;
end $$;

-- 3/8 stock item at Life Camp (Bilaad-owned), so deliveries can be recorded.
insert into public.inventory_items (name, unit, current_stock, site_id, owner, material)
select '3/8 CHIPPINGS - LIFE CAMP (BILAAD-OWNED)', 'kg', 0, s.id, 'client', 'chippings'
  from public.production_sites s
 where s.code = 'LIFECAMP-BIL'
   and not exists (select 1 from public.inventory_items i where i.site_id = s.id and i.material = 'chippings');

-- 2. Tables -------------------------------------------------------------------------------------------------------------
create table if not exists public.client_requisitions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  site_id uuid not null references public.production_sites(id),
  contract_id uuid references public.site_contracts(id),
  cycle_id uuid references public.contract_cycles(id),
  kind text not null default 'initial' check (kind in ('initial','balance','milestone')),
  qty_9in integer not null default 0 check (qty_9in >= 0),
  qty_6in integer not null default 0 check (qty_6in >= 0),
  qty_total integer generated always as (qty_9in + qty_6in) stored,
  covers_from date not null,
  needed_by date,
  status text not null default 'draft'
    check (status in ('draft','submitted','apcl_approved','sent','client_approved','closed','cancelled')),
  raised_by uuid references public.user_profiles(id),
  raised_by_name text,
  submitted_at timestamptz,
  apcl_approved_by_name text,
  apcl_approved_at timestamptz,
  sent_by_name text,
  sent_at timestamptz,
  client_approved_by text,
  client_approved_on date,
  client_approval_note text,
  client_approval_photo_path text,
  client_approval_recorded_by_name text,
  cancelled_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (qty_9in + qty_6in > 0)
);

create table if not exists public.client_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.client_requisitions(id) on delete cascade,
  material text not null check (material in ('cement','dust','chippings','diesel','water','other')),
  description text not null default '',
  unit text not null,
  qty_calculated numeric,
  qty_requested numeric not null default 0 check (qty_requested >= 0),
  basis text,
  updated_at timestamptz not null default now()
);
create unique index if not exists client_requisition_lines_one_per_material
  on public.client_requisition_lines (requisition_id, material, description);

create table if not exists public.client_requisition_events (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.client_requisitions(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  note text,
  actor_id uuid,
  actor_name text,
  actor_role text,
  at timestamptz not null default now()
);
create index if not exists client_requisition_events_req on public.client_requisition_events (requisition_id, at);

alter table public.material_receipts
  add column if not exists requisition_id uuid references public.client_requisitions(id);

-- 3. Access: read for MD / ICO / accountant / board / production manager, and the site's own assigned users.
alter table public.client_requisitions enable row level security;
alter table public.client_requisition_lines enable row level security;
alter table public.client_requisition_events enable row level security;

create or replace function public.can_see_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_any_role(array['md','ico','accountant','board_member','production_manager'])
      or (my_assigned_site() is not null and my_assigned_site() = p_site_id)
$$;
revoke all on function public.can_see_site(uuid) from public, anon;
grant execute on function public.can_see_site(uuid) to authenticated;

drop policy if exists client_requisitions_select on public.client_requisitions;
create policy client_requisitions_select on public.client_requisitions
  for select to authenticated using (public.can_see_site(site_id));

drop policy if exists client_requisition_lines_select on public.client_requisition_lines;
create policy client_requisition_lines_select on public.client_requisition_lines
  for select to authenticated using (exists (select 1 from public.client_requisitions r
                                             where r.id = requisition_id and public.can_see_site(r.site_id)));

drop policy if exists client_requisition_events_select on public.client_requisition_events;
create policy client_requisition_events_select on public.client_requisition_events
  for select to authenticated using (exists (select 1 from public.client_requisitions r
                                             where r.id = requisition_id and public.can_see_site(r.site_id)));

revoke all on public.client_requisitions, public.client_requisition_lines, public.client_requisition_events from anon, authenticated;
grant select on public.client_requisitions, public.client_requisition_lines, public.client_requisition_events to authenticated;

-- 4. Functions ---------------------------------------------------------------------------------------------------------
create or replace function public.fn_client_requisition_event(p_req uuid, p_action text, p_from text, p_to text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_role text;
begin
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  insert into client_requisition_events (requisition_id, action, from_status, to_status, note, actor_id, actor_name, actor_role)
  values (p_req, p_action, p_from, p_to, nullif(trim(p_note), ''), auth.uid(), v_name, v_role);
end $$;
revoke all on function public.fn_client_requisition_event(uuid,text,text,text,text) from public, anon, authenticated;

-- Raiser may act for their own site; MD always; production_manager for any site.
create or replace function public.fn_can_raise_for_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select get_user_role() = 'md'
      or has_any_role(array['production_manager'])
      or (my_assigned_site() is not null and my_assigned_site() = p_site_id)
$$;
revoke all on function public.fn_can_raise_for_site(uuid) from public, anon, authenticated;

create or replace function public.create_client_requisition(
  p_site_id uuid, p_qty_9in integer, p_qty_6in integer, p_needed_by date,
  p_kind text default 'initial', p_notes text default null)
returns public.client_requisitions
language plpgsql security definer set search_path = public as $$
declare
  v_site production_sites%rowtype; v_contract uuid; v_cycle uuid; v_cycle_start date; v_ref text; v_n int;
  v_row client_requisitions; v_name text;
  s9 site_block_standards%rowtype; s6 site_block_standards%rowtype;
  v_cement numeric; v_agg numeric; v_chip numeric; v_diesel numeric;
  c_allow constant numeric := 1.01;  -- Award 3a: 1% production damage allowance for procurement
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_site from production_sites where id = p_site_id;
  if not found then raise exception 'Site not found.'; end if;
  if v_site.site_type <> 'client_site' then raise exception 'Requisitions are for client sites only.'; end if;
  if not fn_can_raise_for_site(p_site_id) then raise exception 'You can only raise requisitions for your own site.' using errcode = '42501'; end if;
  if coalesce(p_qty_9in,0) < 0 or coalesce(p_qty_6in,0) < 0 or coalesce(p_qty_9in,0) + coalesce(p_qty_6in,0) = 0 then
    raise exception 'Enter the number of blocks to produce.';
  end if;
  if p_needed_by is null or p_needed_by < lagos_today() + 1 then
    raise exception 'Needed-by date must be at least tomorrow (24 hours notice to the client).';
  end if;
  if p_kind not in ('initial','balance','milestone') then raise exception 'Unknown requisition kind.'; end if;

  select c.id into v_contract from site_contracts c where c.site_id = p_site_id order by c.created_at desc limit 1;
  select cc.id, cc.started_on into v_cycle, v_cycle_start from contract_cycles cc
   where cc.contract_id = v_contract and cc.status = 'active' order by cc.cycle_no desc limit 1;

  select coalesce(max(substring(reference from '([0-9]+)$')::int), 0) + 1 into v_n
    from client_requisitions where site_id = p_site_id;
  v_ref := 'REQ-' || v_site.code || '-' || lpad(v_n::text, 3, '0');
  select full_name into v_name from user_profiles where id = auth.uid();

  insert into client_requisitions (reference, site_id, contract_id, cycle_id, kind, qty_9in, qty_6in, covers_from,
                                   needed_by, raised_by, raised_by_name, notes)
  values (v_ref, p_site_id, v_contract, v_cycle, p_kind, coalesce(p_qty_9in,0), coalesce(p_qty_6in,0),
          coalesce((select min(r.covers_from) from client_requisitions r where r.site_id = p_site_id and r.status <> 'cancelled'),
                   v_cycle_start, lagos_today()),
          p_needed_by, auth.uid(), v_name, nullif(trim(p_notes), ''))
  returning * into v_row;

  select * into s9 from site_block_standards where site_id = p_site_id and block_type ilike '9%' limit 1;
  select * into s6 from site_block_standards where site_id = p_site_id and block_type ilike '6%' limit 1;

  -- Cement (bags)
  if (v_row.qty_9in = 0 or s9.blocks_per_bag is not null) and (v_row.qty_6in = 0 or s6.blocks_per_bag is not null) then
    v_cement := ceil((coalesce(v_row.qty_9in / s9.blocks_per_bag, 0) + coalesce(v_row.qty_6in / s6.blocks_per_bag, 0)) * c_allow);
  end if;
  insert into client_requisition_lines (requisition_id, material, unit, qty_calculated, qty_requested, basis)
  values (v_row.id, 'cement', 'bags', v_cement, coalesce(v_cement, 0),
          case when v_cement is null then 'Blocks per bag not set for this site — enter the quantity.'
               else format('%s per bag (9") / %s per bag (6") + 1%%', coalesce(s9.blocks_per_bag::text,'-'), coalesce(s6.blocks_per_bag::text,'-')) end);

  -- Dust and 3/8 (kg)
  if (v_row.qty_9in = 0 or s9.dust_kg_per_block is not null) and (v_row.qty_6in = 0 or s6.dust_kg_per_block is not null) then
    v_agg  := (v_row.qty_9in * coalesce(s9.dust_kg_per_block, 0) + v_row.qty_6in * coalesce(s6.dust_kg_per_block, 0)) * c_allow;
    v_chip := (v_row.qty_9in * coalesce(s9.chippings_kg_per_block, 0) + v_row.qty_6in * coalesce(s6.chippings_kg_per_block, 0)) * c_allow;
  end if;
  insert into client_requisition_lines (requisition_id, material, unit, qty_calculated, qty_requested, basis)
  values (v_row.id, 'dust', 'kg', round(v_agg - coalesce(v_chip,0)), coalesce(round(v_agg - coalesce(v_chip,0)), 0),
          case when v_agg is null then 'Dust standard not set for this site — enter the quantity.'
               when s9.chippings_kg_per_block is null and s6.chippings_kg_per_block is null
                 then format('%s kg (9") / %s kg (6") per block, dust and 3/8 together + 1%% — split with the 3/8 line', coalesce(s9.dust_kg_per_block::text,'-'), coalesce(s6.dust_kg_per_block::text,'-'))
               else 'Dust part of the per-block standard + 1%' end);
  insert into client_requisition_lines (requisition_id, material, unit, qty_calculated, qty_requested, basis)
  values (v_row.id, 'chippings', 'kg',
          case when s9.chippings_kg_per_block is null and s6.chippings_kg_per_block is null then null else round(v_chip) end,
          case when s9.chippings_kg_per_block is null and s6.chippings_kg_per_block is null then 0 else coalesce(round(v_chip),0) end,
          case when s9.chippings_kg_per_block is null and s6.chippings_kg_per_block is null
               then '3/8 figure not set — included in the dust line; move part of it here if needed'
               else '3/8 part of the per-block standard + 1%' end);

  -- Diesel (litres)
  if (v_row.qty_9in = 0 or s9.diesel_l_per_1000 is not null) and (v_row.qty_6in = 0 or s6.diesel_l_per_1000 is not null) then
    v_diesel := ceil((v_row.qty_9in * coalesce(s9.diesel_l_per_1000,0) + v_row.qty_6in * coalesce(s6.diesel_l_per_1000,0)) / 1000.0 * c_allow);
  end if;
  insert into client_requisition_lines (requisition_id, material, unit, qty_calculated, qty_requested, basis)
  values (v_row.id, 'diesel', 'litres', v_diesel, coalesce(v_diesel, 0),
          case when v_diesel is null then 'Diesel standard not set for this site — enter the quantity.'
               else format('%s L per 1,000 blocks + 1%%', coalesce(s9.diesel_l_per_1000, s6.diesel_l_per_1000)::text) end);

  perform fn_client_requisition_event(v_row.id, 'created', null, 'draft', null);
  return v_row;
end $$;

create or replace function public.set_client_requisition_line(
  p_requisition_id uuid, p_material text, p_qty_requested numeric,
  p_unit text default null, p_description text default '')
returns public.client_requisition_lines
language plpgsql security definer set search_path = public as $$
declare r client_requisitions%rowtype; v_line client_requisition_lines; v_old numeric;
begin
  select * into r from client_requisitions where id = p_requisition_id for update;
  if not found then raise exception 'Requisition not found.'; end if;
  if r.status = 'draft' then
    if not (get_user_role() = 'md' or r.raised_by = auth.uid()) then raise exception 'Only the person who raised it or the MD can change a draft.' using errcode = '42501'; end if;
  elsif r.status = 'submitted' then
    if get_user_role() <> 'md' then raise exception 'Only the MD can change a submitted requisition.' using errcode = '42501'; end if;
  else
    raise exception 'This requisition is % and can no longer be changed.', r.status;
  end if;
  if p_qty_requested is null or p_qty_requested < 0 then raise exception 'Quantity cannot be negative.'; end if;
  if p_material not in ('cement','dust','chippings','diesel','water','other') then raise exception 'Unknown material.'; end if;
  if p_material = 'other' and coalesce(trim(p_description),'') = '' then raise exception 'Describe the item.'; end if;

  select qty_requested into v_old from client_requisition_lines
   where requisition_id = r.id and material = p_material and description = coalesce(trim(p_description),'');
  insert into client_requisition_lines (requisition_id, material, description, unit, qty_requested, basis)
  values (r.id, p_material, coalesce(trim(p_description),''),
          coalesce(p_unit, case p_material when 'cement' then 'bags' when 'diesel' then 'litres' when 'water' then 'litres' else 'kg' end),
          p_qty_requested, 'Entered by hand')
  on conflict (requisition_id, material, description)
  do update set qty_requested = excluded.qty_requested, unit = coalesce(p_unit, client_requisition_lines.unit), updated_at = now()
  returning * into v_line;
  perform fn_client_requisition_event(r.id, 'line_changed', r.status, r.status,
    format('%s%s: %s -> %s %s', p_material, case when coalesce(trim(p_description),'') <> '' then ' ('||trim(p_description)||')' else '' end,
           coalesce(v_old::text, 'new'), p_qty_requested, v_line.unit));
  update client_requisitions set updated_at = now() where id = r.id;
  return v_line;
end $$;

create or replace function public.advance_client_requisition(
  p_id uuid, p_action text, p_note text default null,
  p_client_approved_by text default null, p_client_approved_on date default null, p_photo_path text default null)
returns public.client_requisitions
language plpgsql security definer set search_path = public as $$
declare r client_requisitions%rowtype; v_new text; v_name text; v_role text; v_is_md boolean; v_site_user boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into r from client_requisitions where id = p_id for update;
  if not found then raise exception 'Requisition not found.'; end if;
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  v_is_md := (v_role = 'md');
  v_site_user := fn_can_raise_for_site(r.site_id);

  if p_action = 'submit' then
    if r.status <> 'draft' then raise exception 'Only a draft can be submitted (current: %).', r.status; end if;
    if not (v_is_md or r.raised_by = auth.uid()) then raise exception 'Only the person who raised it or the MD can submit it.' using errcode = '42501'; end if;
    if r.needed_by < lagos_today() + 1 then raise exception 'Needed-by date has passed the 24-hour notice. Cancel and raise it again with a later date.'; end if;
    v_new := 'submitted';
    update client_requisitions set status = v_new, submitted_at = now(), updated_at = now() where id = p_id;
    perform fn_notify_role('md', 'action_required', 'Requisition '||r.reference||' to approve',
      r.qty_9in||' 9" + '||r.qty_6in||' 6" blocks, needed by '||to_char(r.needed_by,'DD Mon')||'. Raised by '||coalesce(r.raised_by_name,'-')||'.',
      'client_requisitions', p_id);
    perform fn_notify_role('ico', 'info', 'Requisition '||r.reference||' submitted',
      r.qty_9in||' 9" + '||r.qty_6in||' 6" blocks.', 'client_requisitions', p_id);

  elsif p_action = 'return' then
    if r.status <> 'submitted' then raise exception 'Only a submitted requisition can be returned (current: %).', r.status; end if;
    if not v_is_md then raise exception 'Only the MD can return a requisition.' using errcode = '42501'; end if;
    if coalesce(trim(p_note),'') = '' then raise exception 'Say what needs changing.'; end if;
    v_new := 'draft';
    update client_requisitions set status = v_new, updated_at = now() where id = p_id;
    if r.raised_by is not null then
      insert into notifications (recipient_id, type, title, body, related_table, related_id)
      values (r.raised_by, 'rejected', 'Requisition '||r.reference||' returned', trim(p_note), 'client_requisitions', p_id);
    end if;

  elsif p_action = 'approve' then
    if r.status <> 'submitted' then raise exception 'Only a submitted requisition can be approved (current: %).', r.status; end if;
    if not v_is_md then raise exception 'Only the MD can approve a requisition.' using errcode = '42501'; end if;
    v_new := 'apcl_approved';
    update client_requisitions set status = v_new, apcl_approved_by_name = v_name, apcl_approved_at = now(), updated_at = now() where id = p_id;
    if r.raised_by is not null then
      insert into notifications (recipient_id, type, title, body, related_table, related_id)
      values (r.raised_by, 'approved', 'Requisition '||r.reference||' approved', 'Send it to the client and record when it is sent.', 'client_requisitions', p_id);
    end if;

  elsif p_action = 'mark_sent' then
    if r.status <> 'apcl_approved' then raise exception 'Only an approved requisition can be marked sent (current: %).', r.status; end if;
    if not (v_is_md or v_site_user) then raise exception 'Only the MD or the site manager can mark it sent.' using errcode = '42501'; end if;
    v_new := 'sent';
    update client_requisitions set status = v_new, sent_by_name = v_name, sent_at = now(), updated_at = now() where id = p_id;

  elsif p_action = 'record_client_approval' then
    if r.status <> 'sent' then raise exception 'Record the client''s approval after the requisition is sent (current: %).', r.status; end if;
    if not (v_is_md or v_site_user) then raise exception 'Only the MD or the site manager can record the client''s approval.' using errcode = '42501'; end if;
    if coalesce(trim(p_client_approved_by),'') = '' then raise exception 'Enter who approved it for the client.'; end if;
    if p_client_approved_on is null or p_client_approved_on > lagos_today() then raise exception 'Enter the date the client approved it (not in the future).'; end if;
    v_new := 'client_approved';
    update client_requisitions
       set status = v_new, client_approved_by = trim(p_client_approved_by), client_approved_on = p_client_approved_on,
           client_approval_note = nullif(trim(p_note),''), client_approval_photo_path = p_photo_path,
           client_approval_recorded_by_name = v_name, updated_at = now()
     where id = p_id;
    perform fn_notify_role('md', 'info', 'Client approved '||r.reference, trim(p_client_approved_by)||' approved on '||to_char(p_client_approved_on,'DD Mon YYYY')||'.', 'client_requisitions', p_id);

  elsif p_action = 'close' then
    if r.status <> 'client_approved' then raise exception 'Only a client-approved requisition can be closed (current: %).', r.status; end if;
    if not v_is_md then raise exception 'Only the MD can close a requisition.' using errcode = '42501'; end if;
    v_new := 'closed';
    update client_requisitions set status = v_new, updated_at = now() where id = p_id;

  elsif p_action = 'cancel' then
    if r.status in ('closed','cancelled') then raise exception 'This requisition is already %.', r.status; end if;
    if not (v_is_md or (r.status = 'draft' and r.raised_by = auth.uid())) then
      raise exception 'Only the MD can cancel a requisition once it is submitted.' using errcode = '42501';
    end if;
    if coalesce(trim(p_note),'') = '' then raise exception 'Give the reason for cancelling.'; end if;
    v_new := 'cancelled';
    update client_requisitions set status = v_new, cancelled_reason = trim(p_note), updated_at = now() where id = p_id;

  elsif p_action = 'log_reminder' then
    if r.status not in ('sent','client_approved') then raise exception 'Reminders are logged on a requisition that has been sent (current: %).', r.status; end if;
    if not (v_is_md or v_site_user) then raise exception 'Only the MD or the site manager can log a reminder.' using errcode = '42501'; end if;
    perform fn_client_requisition_event(p_id, 'reminder_sent', r.status, r.status, p_note);
    select * into r from client_requisitions where id = p_id;
    return r;

  else
    raise exception 'Unknown action: %', p_action;
  end if;

  perform fn_client_requisition_event(p_id, p_action, r.status, v_new, p_note);
  select * into r from client_requisitions where id = p_id;
  return r;
end $$;

-- Progress: production at the site (from the first requisition's covers_from) is counted against client-approved
-- requisitions in approval order. needs_next = the current requisition is at least 50% used and no later one is approved.
create or replace function public.client_requisition_progress(p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from date; v_p9 numeric := 0; v_p6 numeric := 0; v_prod numeric := 0;
  v_list jsonb := '[]'::jsonb; v_cum numeric := 0; v_cur jsonb; v_cur_pct numeric; v_cur_id uuid; v_cur_order int;
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
              order by client_approved_on, created_at loop
    i := i + 1;
    v_approved := v_approved + rec.qty_total; v_a9 := v_a9 + rec.qty_9in; v_a6 := v_a6 + rec.qty_6in;
    v_list := v_list || jsonb_build_object(
      'id', rec.id, 'reference', rec.reference, 'status', rec.status, 'qty_total', rec.qty_total,
      'qty_9in', rec.qty_9in, 'qty_6in', rec.qty_6in, 'client_approved_on', rec.client_approved_on,
      'cum_from', v_cum, 'cum_to', v_cum + rec.qty_total,
      'produced_against', greatest(least(v_prod - v_cum, rec.qty_total), 0),
      'pct', round(greatest(least(v_prod - v_cum, rec.qty_total), 0) * 100.0 / rec.qty_total, 1));
    if v_cur is null and (v_prod < v_cum + rec.qty_total) then
      v_cur := v_list -> (i - 1); v_cur_id := rec.id; v_cur_order := i;
    end if;
    v_cum := v_cum + rec.qty_total;
  end loop;
  if v_cur is null and i > 0 then v_cur := v_list -> (i - 1); v_cur_id := (v_cur->>'id')::uuid; v_cur_order := i; end if;
  v_cur_pct := (v_cur->>'pct')::numeric;

  -- The next requisition after the current one (raised later): an approved one first, else the newest still in progress.
  select r.* into v_next from client_requisitions r
   where r.site_id = p_site_id and r.status in ('draft','submitted','apcl_approved','sent','client_approved')
     and (v_cur_id is null
          or (r.id <> v_cur_id and r.created_at > (select c.created_at from client_requisitions c where c.id = v_cur_id)))
   order by (r.status = 'client_approved') desc, r.created_at desc limit 1;

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

-- Material receipts can name the requisition being delivered (same site, sent or client-approved).
drop function if exists public.record_material_receipt(uuid, date, numeric, numeric, text, text, text, text, text, text);
create or replace function public.record_material_receipt(
  p_item_id uuid, p_received_on date, p_qty_delivered numeric, p_qty_accepted numeric, p_rejection_reason text,
  p_supplier text, p_ref text, p_photo_path text, p_notes text, p_late_reason text default null,
  p_requisition_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $function$
declare v_item inventory_items%rowtype; v_id uuid; v_mov uuid; v_name text; v_site text; v_req client_requisitions%rowtype;
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
  if p_requisition_id is not null then
    select * into v_req from client_requisitions where id = p_requisition_id;
    if not found then raise exception 'Requisition not found.'; end if;
    if v_req.site_id is distinct from v_item.site_id then raise exception 'That requisition is for a different site.'; end if;
    if v_req.status not in ('sent','client_approved') then
      raise exception 'Deliveries can only be recorded against a requisition that has been sent to the client (current: %).', v_req.status;
    end if;
  end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into material_receipts (site_id, item_id, received_on, qty_delivered, qty_accepted, rejection_reason,
      supplier_or_source, truck_or_waybill_ref, photo_path, notes, received_by_name, late_reason, requisition_id)
    values (v_item.site_id, p_item_id, coalesce(p_received_on, lagos_today()), p_qty_delivered, p_qty_accepted,
      nullif(trim(p_rejection_reason),''), p_supplier, p_ref, p_photo_path, p_notes, v_name, nullif(trim(p_late_reason),''),
      p_requisition_id)
    returning id into v_id;
  if p_qty_accepted > 0 then
    insert into stock_movements (item_id, movement_type, quantity, supplier, reference, staff_name, date, notes)
      values (p_item_id, 'in', p_qty_accepted, p_supplier, 'RCPT-'||left(v_id::text,8), v_name,
              coalesce(p_received_on, lagos_today()), 'Material receipt (accepted quantity)')
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
end $function$;

-- Supplied against each requisition line (accepted quantities, by material).
create or replace function public.client_requisition_supplied(p_requisition_id uuid)
returns table (material text, unit text, qty_requested numeric, qty_accepted numeric, qty_rejected numeric)
language sql stable security definer set search_path = public as $$
  select l.material, l.unit, l.qty_requested,
         coalesce((select sum(mr.qty_accepted) from material_receipts mr join inventory_items i on i.id = mr.item_id
                    where mr.requisition_id = l.requisition_id and i.material = l.material and not coalesce(mr.voided,false)), 0),
         coalesce((select sum(mr.qty_rejected) from material_receipts mr join inventory_items i on i.id = mr.item_id
                    where mr.requisition_id = l.requisition_id and i.material = l.material and not coalesce(mr.voided,false)), 0)
    from client_requisition_lines l
    join client_requisitions r on r.id = l.requisition_id
   where l.requisition_id = p_requisition_id and can_see_site(r.site_id)
   order by array_position(array['cement','dust','chippings','diesel','water','other'], l.material), l.description
$$;

revoke all on function public.create_client_requisition(uuid,integer,integer,date,text,text) from public, anon;
revoke all on function public.set_client_requisition_line(uuid,text,numeric,text,text) from public, anon;
revoke all on function public.advance_client_requisition(uuid,text,text,text,date,text) from public, anon;
revoke all on function public.client_requisition_progress(uuid) from public, anon;
revoke all on function public.client_requisition_supplied(uuid) from public, anon;
revoke all on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.create_client_requisition(uuid,integer,integer,date,text,text) to authenticated;
grant execute on function public.set_client_requisition_line(uuid,text,numeric,text,text) to authenticated;
grant execute on function public.advance_client_requisition(uuid,text,text,text,date,text) to authenticated;
grant execute on function public.client_requisition_progress(uuid) to authenticated;
grant execute on function public.client_requisition_supplied(uuid) to authenticated;
grant execute on function public.record_material_receipt(uuid,date,numeric,numeric,text,text,text,text,text,text,uuid) to authenticated;
