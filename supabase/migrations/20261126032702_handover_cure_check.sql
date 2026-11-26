-- Handovers at client sites: only blocks that have cured the product's
-- min_cure_days (14 for 9" and 4" 3-hole) count as available. A handover of
-- more than that needs a reason; the under-cured count is stored and the ICO
-- gets a follow-up item.

alter table public.block_handovers add column if not exists under_cure_qty integer;
alter table public.block_handovers add column if not exists early_reason text;

create or replace function public.site_cured_stock(p_site_id uuid, p_block_type text, p_date date, p_exclude_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $f$
declare
  v_days int; v_cutoff date; v_cured bigint; v_dmg bigint; v_handed bigint;
  v_next_on date; v_next_qty int;
begin
  if p_site_id is null or p_block_type is null or p_date is null
     or not exists (select 1 from production_sites where id = p_site_id and site_type = 'client_site') then
    return jsonb_build_object('applies', false);
  end if;
  select min_cure_days into v_days from products where name = p_block_type and min_cure_days is not null limit 1;
  if v_days is null then return jsonb_build_object('applies', false); end if;
  v_cutoff := p_date - v_days;

  select coalesce(sum(qty_accepted), 0) into v_cured
    from batches where site_id = p_site_id and block_type = p_block_type and date_cured <= v_cutoff;
  select coalesce(sum(d.quantity_damaged), 0) into v_dmg
    from damage_log d join batches b on b.id = d.batch_id
   where b.site_id = p_site_id and b.block_type = p_block_type and d.date <= p_date;
  select coalesce(sum(qty_handed_over), 0) into v_handed
    from block_handovers
   where site_id = p_site_id and block_type = p_block_type and handover_date <= p_date
     and (p_exclude_id is null or id <> p_exclude_id);
  select date_cured + v_days, qty_accepted into v_next_on, v_next_qty
    from batches where site_id = p_site_id and block_type = p_block_type and date_cured > v_cutoff and qty_accepted > 0
   order by date_cured limit 1;

  return jsonb_build_object(
    'applies', true, 'min_cure_days', v_days, 'cutoff', v_cutoff,
    'cured_batched', v_cured, 'damaged_after_batch', v_dmg, 'handed_over', v_handed,
    'available', greatest(v_cured - v_dmg - v_handed, 0),
    'next_ready_on', v_next_on, 'next_ready_qty', v_next_qty);
end $f$;

grant execute on function public.site_cured_stock(uuid, text, date, uuid) to authenticated;

create or replace function public.fn_handover_cure_check()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare s jsonb; v_avail int; v_under int;
begin
  new.early_reason := nullif(btrim(new.early_reason), '');
  if tg_op = 'UPDATE' and (new.qty_handed_over, new.handover_date, new.block_type, new.site_id)
                          is not distinct from (old.qty_handed_over, old.handover_date, old.block_type, old.site_id) then
    return new;
  end if;
  s := site_cured_stock(new.site_id, new.block_type, new.handover_date, case when tg_op = 'UPDATE' then old.id end);
  if not coalesce((s->>'applies')::boolean, false) then
    new.under_cure_qty := null;
    return new;
  end if;
  v_avail := (s->>'available')::int;
  v_under := greatest(coalesce(new.qty_handed_over, 0) - v_avail, 0);
  new.under_cure_qty := nullif(v_under, 0);
  if v_under > 0 and new.early_reason is null then
    raise exception 'Only % blocks of % here are % days old (made on or before %). % of these % would be younger. Give a reason for handing over early.',
      v_avail, new.block_type, s->>'min_cure_days', to_char((s->>'cutoff')::date, 'FMDD Mon'), v_under, new.qty_handed_over;
  end if;
  return new;
end $f$;

create or replace function public.fn_handover_cure_follow_up()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
declare v_site text;
begin
  if coalesce(new.under_cure_qty, 0) > 0
     and (tg_op = 'INSERT' or coalesce(old.under_cure_qty, 0) is distinct from new.under_cure_qty
          or old.early_reason is distinct from new.early_reason) then
    select name into v_site from production_sites where id = new.site_id;
    perform fn_ico_follow_up_add(
      'early-handover:' || new.id,
      coalesce(v_site, 'Site') || ' ' || to_char(new.handover_date, 'FMDD Mon') || ': ' || new.under_cure_qty || ' of '
        || new.qty_handed_over || ' ' || new.block_type || ' handed over before 14 days of curing. Reason given: '
        || coalesce(new.early_reason, 'none') || '. Confirm with the site manager and the client''s receiver, and report.',
      'block_handovers', new.id);
  end if;
  return null;
end $f$;

create trigger trg_handover_cure_check
  before insert or update on public.block_handovers
  for each row execute function public.fn_handover_cure_check();

create trigger trg_zz_handover_cure_follow_up
  after insert or update of under_cure_qty, early_reason on public.block_handovers
  for each row execute function public.fn_handover_cure_follow_up();

-- Kado 25 Nov: blocks made on or before 11 Nov (14 days old) were 1,057 after
-- breakage; 1,200 went out, so the last 400 had 143 under-cured. Recorded
-- without a reason (the check did not exist yet); the ICO gets a follow-up.
with h as (
  select h.id, h.qty_handed_over,
         sum(h.qty_handed_over) over (partition by h.site_id, h.block_type order by h.handover_date, h.created_at) as running,
         (site_cured_stock(h.site_id, h.block_type, h.handover_date, h.id)->>'cured_batched')::int
         - (site_cured_stock(h.site_id, h.block_type, h.handover_date, h.id)->>'damaged_after_batch')::int as cured
    from block_handovers h join production_sites s on s.id = h.site_id and s.site_type = 'client_site'
)
update block_handovers b
   set under_cure_qty = nullif(least(h.qty_handed_over, greatest(h.running - h.cured, 0)), 0)
  from h where b.id = h.id;
