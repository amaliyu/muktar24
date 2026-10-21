-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-21, verified. Kept here as the tracked record. DO NOT RE-RUN.
-- MD confirmed 2026-10-21: QTJ4-26B at Kado, QTJ4-40 at Life Camp
update public.assets set name = 'QTJ4-40 Mobile Plant',
  metadata = '{"model":"QTJ4-40","funding":"investor","rated_output_per_day":"2880-3000","generator":"25-30 kVA"}'
  where code = 'QTJ-01';
update public.assets set name = 'QTJ4-26B Mobile Plant',
  metadata = '{"model":"QTJ4-26B","funding":"investor","rated_output_per_day":"4430-5000","generator":"30-40 kVA"}'
  where code = 'QTJ-02';

-- A worker may be on only ONE roster per day across all sites (prevents double pay)
create or replace function public.fn_one_roster_per_worker_day()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_date date; v_site text; v_name text;
begin
  select roster_date into v_date from daily_roster where id = new.roster_id;
  select s.name into v_site
    from daily_roster_entries e join daily_roster r on r.id = e.roster_id join production_sites s on s.id = r.site_id
    where e.labour_id = new.labour_id and r.roster_date = v_date and e.roster_id <> new.roster_id
    limit 1;
  if v_site is not null then
    select full_name into v_name from labour_pool where id = new.labour_id;
    raise exception 'Worker % is already on the % roster for %. A worker can only be on one roster per day.',
      coalesce(v_name, 'this worker'), v_site, v_date;
  end if;
  return new;
end $$;
revoke all on function public.fn_one_roster_per_worker_day() from public, anon, authenticated;
create trigger trg_one_roster_per_worker_day before insert or update of labour_id, roster_id on public.daily_roster_entries
  for each row execute function public.fn_one_roster_per_worker_day();

-- Moving a roster to another date must not create a clash either
create or replace function public.fn_roster_date_change_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_site text;
begin
  select lp.full_name, s.name into v_name, v_site
    from daily_roster_entries e
    join daily_roster_entries e2 on e2.labour_id = e.labour_id and e2.roster_id <> e.roster_id
    join daily_roster r2 on r2.id = e2.roster_id and r2.roster_date = new.roster_date
    join production_sites s on s.id = r2.site_id
    left join labour_pool lp on lp.id = e.labour_id
    where e.roster_id = new.id
    limit 1;
  if v_site is not null then
    raise exception 'Worker % is already on the % roster for %. A worker can only be on one roster per day.',
      coalesce(v_name, 'a worker'), v_site, new.roster_date;
  end if;
  return new;
end $$;
revoke all on function public.fn_roster_date_change_check() from public, anon, authenticated;
create trigger trg_roster_date_change_check before update of roster_date on public.daily_roster
  for each row when (old.roster_date is distinct from new.roster_date)
  execute function public.fn_roster_date_change_check();
