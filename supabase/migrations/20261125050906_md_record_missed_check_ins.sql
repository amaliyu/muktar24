-- MD 2026-11-25: Kado's 23 Nov roster (7 workers) cannot be paid: nobody was checked in that day (face registration was
-- failing, then paused), and check-ins cannot be dated in the past. MD-only action to record missed check-ins for a past
-- roster (last 7 days, unpaid), with a reason, flagged as entered by the MD.

alter table public.crew_check_ins drop constraint crew_check_ins_method_check,
  add constraint crew_check_ins_method_check check (method = any (array['face', 'manual', 'md_backfill']));

create or replace function public.record_missed_check_ins(p_roster_id uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare r daily_roster%rowtype; v_name text; v_n int; v_today date := lagos_today();
begin
  if not has_any_role(array['md']) then raise exception 'Only the MD can record missed check-ins.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Give a reason (at least 10 characters).'; end if;
  select * into r from daily_roster where id = p_roster_id;
  if not found then raise exception 'Roster not found.'; end if;
  if r.site_id is null then raise exception 'This roster is not for a site.'; end if;
  if r.roster_date >= v_today then raise exception 'For today, use the normal register.'; end if;
  if r.roster_date < v_today - 7 then raise exception 'Only the last 7 days can be filled in.'; end if;
  if r.payment_status = 'paid' then raise exception 'This roster is already paid.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  insert into crew_check_ins (site_id, labour_id, check_date, method, manual_reason, recorded_by, recorded_by_name)
  select r.site_id, e.labour_id, r.roster_date, 'md_backfill', 'Entered by MD: ' || btrim(p_reason), auth.uid(), v_name
    from daily_roster_entries e
   where e.roster_id = r.id
     and not exists (select 1 from crew_check_ins c where c.labour_id = e.labour_id and c.check_date = r.roster_date)
  on conflict (labour_id, check_date) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.record_missed_check_ins(uuid, text) from public, anon;
grant execute on function public.record_missed_check_ins(uuid, text) to authenticated;
