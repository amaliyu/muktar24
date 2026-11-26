-- Client sites: one batch per production day, made automatically.
-- Batch = blocks made minus production and stacking breakage for that
-- site/day/block type, dated the production day (Dutse practice: batch date =
-- production date), so the existing 14-day curing clock and "Mark Cured" work.
-- The count follows the production entry and its breakage as they are entered
-- or corrected. Manual batches at client sites are refused (no double count).

alter table public.batches add column if not exists auto_from_production boolean not null default false;

create or replace function public.fn_site_auto_batch(p_site uuid, p_date date, p_type text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $f$
declare
  v_rows int; v_made bigint; v_broken bigint; v_qty int;
  v_batch batches%rowtype; v_has boolean; v_no int; v_product uuid; v_try int := 0;
begin
  if p_site is null or p_date is null or p_type is null then return null; end if;
  if not exists (select 1 from production_sites where id = p_site and site_type = 'client_site') then return null; end if;
  perform set_config('app.site_auto_batch', 'on', true);

  select count(*), coalesce(sum(quantity_produced), 0) into v_rows, v_made
    from production_log where site_id = p_site and date = p_date and block_type = p_type;
  select coalesce(sum(quantity_damaged), 0) into v_broken
    from damage_log where site_id = p_site and date = p_date and block_type = p_type and stage in ('production','stacking');
  v_qty := greatest(v_made - v_broken, 0);

  select * into v_batch from batches
   where auto_from_production and site_id = p_site and date_cured = p_date and block_type = p_type
   order by created_at limit 1 for update;
  v_has := found;

  if v_rows = 0 then
    if v_has then
      begin
        delete from batches where id = v_batch.id;
      exception when foreign_key_violation then
        update batches set qty_accepted = 0, notes = 'Production entry removed; kept because breakage is recorded against this batch.' where id = v_batch.id;
      end;
    end if;
    perform set_config('app.site_auto_batch', 'off', true);
    return null;
  end if;

  if v_has then
    if v_batch.qty_accepted is distinct from v_qty then
      update batches set qty_accepted = v_qty where id = v_batch.id;
    end if;
  else
    select id into v_product from products where name = p_type limit 1;
    loop
      v_try := v_try + 1;
      select coalesce(max((regexp_match(batch_number, '^APC-BATCH-(\d+)$'))[1]::int), 0) + 1 into v_no from batches;
      begin
        insert into batches (batch_number, block_type, date_cured, qty_accepted, site_id, product_id, created_by, notes, auto_from_production)
        values ('APC-BATCH-' || lpad(v_no::text, greatest(3, length(v_no::text)), '0'), p_type, p_date, v_qty, p_site, v_product,
                'Auto — production entry',
                'Made automatically from the production entry: blocks made minus production and stacking breakage.', true)
        returning * into v_batch;
        exit;
      exception when unique_violation then
        if v_try >= 5 then raise; end if;
      end;
    end loop;
  end if;

  delete from batch_production_links l
   where l.batch_id = v_batch.id
     and not exists (select 1 from production_log p where p.id = l.production_log_id
                      and p.site_id = p_site and p.date = p_date and p.block_type = p_type);
  insert into batch_production_links (batch_id, production_log_id)
  select v_batch.id, id from production_log where site_id = p_site and date = p_date and block_type = p_type
  on conflict (production_log_id) do update set batch_id = excluded.batch_id;

  perform set_config('app.site_auto_batch', 'off', true);
  return v_batch.id;
end $f$;

revoke execute on function public.fn_site_auto_batch(uuid, date, text) from public, anon, authenticated;

create or replace function public.fn_site_auto_batch_production()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
begin
  if tg_op = 'DELETE' then
    perform fn_site_auto_batch(old.site_id, old.date, old.block_type);
  elsif tg_op = 'INSERT' then
    perform fn_site_auto_batch(new.site_id, new.date, new.block_type);
  elsif (new.site_id, new.date, new.block_type) is distinct from (old.site_id, old.date, old.block_type) then
    perform fn_site_auto_batch(old.site_id, old.date, old.block_type);
    perform fn_site_auto_batch(new.site_id, new.date, new.block_type);
  elsif new.quantity_produced is distinct from old.quantity_produced then
    perform fn_site_auto_batch(new.site_id, new.date, new.block_type);
  end if;
  return null;
end $f$;

create or replace function public.fn_site_auto_batch_damage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $f$
begin
  if tg_op in ('UPDATE','DELETE') and old.stage in ('production','stacking') then
    perform fn_site_auto_batch(old.site_id, old.date, old.block_type);
  end if;
  if tg_op in ('INSERT','UPDATE') and new.stage in ('production','stacking')
     and (tg_op = 'INSERT' or (new.site_id, new.date, new.block_type, new.stage, new.quantity_damaged)
                              is distinct from (old.site_id, old.date, old.block_type, old.stage, old.quantity_damaged)) then
    perform fn_site_auto_batch(new.site_id, new.date, new.block_type);
  end if;
  return null;
end $f$;

create or replace function public.fn_site_batch_auto_only()
returns trigger
language plpgsql
set search_path to 'public'
as $f$
begin
  if current_setting('app.site_auto_batch', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if new.auto_from_production
       or exists (select 1 from production_sites where id = new.site_id and site_type = 'client_site') then
      raise exception 'Batches at client sites are made automatically from each day''s production entry. Record or correct the production entry and its breakage instead.';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.auto_from_production
       and (new.qty_accepted, new.date_cured, new.block_type, new.site_id, new.auto_from_production)
           is distinct from (old.qty_accepted, old.date_cured, old.block_type, old.site_id, old.auto_from_production) then
      raise exception 'Batch % follows its production entry. Correct the production entry or its breakage instead.', old.batch_number;
    end if;
    if not old.auto_from_production and new.site_id is distinct from old.site_id
       and exists (select 1 from production_sites where id = new.site_id and site_type = 'client_site') then
      raise exception 'Batches at client sites are made automatically from each day''s production entry.';
    end if;
    if new.auto_from_production and not old.auto_from_production then
      raise exception 'Only the system can mark a batch as automatic.';
    end if;
    return new;
  else
    if old.auto_from_production then
      raise exception 'Batch % follows its production entry. Delete or correct the production entry instead.', old.batch_number;
    end if;
    return old;
  end if;
end $f$;

create trigger trg_site_batch_auto_only
  before insert or update or delete on public.batches
  for each row execute function public.fn_site_batch_auto_only();

create trigger trg_zz_site_auto_batch
  after insert or update or delete on public.production_log
  for each row execute function public.fn_site_auto_batch_production();

create trigger trg_zz_site_auto_batch
  after insert or update or delete on public.damage_log
  for each row execute function public.fn_site_auto_batch_damage();

-- Backfill: one batch per recorded production day at every client site.
do $f$
declare r record;
begin
  for r in select distinct p.site_id, p.date, p.block_type
             from production_log p join production_sites s on s.id = p.site_id and s.site_type = 'client_site'
            order by p.date, p.site_id, p.block_type loop
    perform fn_site_auto_batch(r.site_id, r.date, r.block_type);
  end loop;
end $f$;
