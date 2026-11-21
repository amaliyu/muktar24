-- MD 2026-11-21: Kado and Life Camp crews are temporary and paid every day by one bank transfer per site
-- (Life Camp ₦8,000/day, Kado ₦6,000/day). May move to weekly later, so the pay mode is a site setting.

-- 1. Pay mode per site ----------------------------------------------------------------------------------------------------
alter table public.production_sites add column if not exists labour_pay_mode text not null default 'weekly';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'production_sites_labour_pay_mode_check') then
    alter table public.production_sites add constraint production_sites_labour_pay_mode_check check (labour_pay_mode in ('weekly','daily'));
  end if;
end $$;
update public.production_sites set labour_pay_mode = 'daily'
 where id in ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003');

-- 2. Site jobs and rates ---------------------------------------------------------------------------------------------------
alter table public.labour_roles add column if not exists site_id uuid references public.production_sites(id);
insert into public.labour_roles (role_name, payment_type, base_rate, target_bonus, bonus_type, effective_date, approved_by, site_id)
select v.role_name, 'daily', v.rate, 0, 'none', date '2026-11-21', 'MD (21 Nov 2026)', v.site_id
  from (values ('Site crew — Kado', 6000, '00000000-0000-4000-8000-000000000002'::uuid),
               ('Site crew — Life Camp', 8000, '00000000-0000-4000-8000-000000000003'::uuid)) v(role_name, rate, site_id)
 where not exists (select 1 from public.labour_roles r where r.role_name = v.role_name);

-- A roster entry must use a job for its own site; client sites must use their own site jobs.
create or replace function public.fn_roster_entry_site_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_roster_site uuid; v_site_type text; v_site_name text; v_role_site uuid; v_role_name text;
begin
  if new.role_id is null then return new; end if;
  select r.site_id, s.site_type, s.name into v_roster_site, v_site_type, v_site_name
    from daily_roster r left join production_sites s on s.id = r.site_id where r.id = new.roster_id;
  select site_id, role_name into v_role_site, v_role_name from labour_roles where id = new.role_id;
  if v_role_site is not null and v_role_site is distinct from v_roster_site then
    raise exception 'The job "%" belongs to another site. Pick a job for %.', v_role_name, coalesce(v_site_name, 'this site');
  end if;
  if v_role_site is null and v_site_type = 'client_site' then
    raise exception 'At % use the site''s own job and rate (for example Site crew — Kado), not "%".', v_site_name, v_role_name;
  end if;
  return new;
end $$;
drop trigger if exists trg_roster_entry_site_role on public.daily_roster_entries;
create trigger trg_roster_entry_site_role before insert or update of role_id, roster_id on public.daily_roster_entries
  for each row execute function public.fn_roster_entry_site_role();

-- 3. Daily payment record on the roster -------------------------------------------------------------------------------------
alter table public.daily_roster
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount numeric,
  add column if not exists paid_to text,
  add column if not exists payment_reference text,
  add column if not exists paid_by_name text,
  add column if not exists paid_from_account_id uuid references public.bank_accounts(id);

create or replace function public.pay_daily_roster(p_roster_id uuid, p_amount numeric, p_paid_to text, p_reference text,
  p_bank_account_id uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r daily_roster%rowtype; s production_sites%rowtype; v_name text; v_md boolean;
begin
  if not has_any_role(array['md','accountant']) then raise exception 'Only the MD or accountant can record wage payments.'; end if;
  select * into r from daily_roster where id = p_roster_id for update;
  if not found then raise exception 'Roster not found.'; end if;
  select * into s from production_sites where id = r.site_id;
  if coalesce(s.labour_pay_mode, 'weekly') <> 'daily' then raise exception 'Wages at % are paid through the weekly payroll.', s.name; end if;
  if r.payment_status = 'paid' then raise exception 'Wages for % are already recorded as paid.', to_char(r.roster_date, 'FMDD Mon'); end if;
  if r.payroll_id is not null then raise exception 'This roster is in a weekly payroll. Pay it there.'; end if;
  if coalesce(r.total_daily_cost, 0) <= 0 then raise exception 'This roster has no wages on it.'; end if;
  if p_amount is null or round(p_amount, 2) <> round(r.total_daily_cost, 2) then
    raise exception 'The transfer (₦%) does not match the roster total (₦%). Correct the roster or the amount.',
      to_char(coalesce(p_amount, 0), 'FM999,999,990'), to_char(r.total_daily_cost, 'FM999,999,990');
  end if;
  if coalesce(btrim(p_paid_to), '') = '' then raise exception 'Say who received the transfer.'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'Enter the transfer reference.'; end if;
  v_md := has_any_role(array['md']);
  if not v_md and r.md_status is distinct from 'approved' then raise exception 'The MD must approve this roster before it is paid.'; end if;
  if r.md_status = 'rejected' then raise exception 'This roster was rejected. Correct it first.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  update daily_roster
     set payment_status = 'paid', paid_at = now(), paid_amount = p_amount, paid_to = btrim(p_paid_to),
         payment_reference = btrim(p_reference), paid_by_name = v_name, paid_from_account_id = p_bank_account_id,
         md_status = case when v_md then 'approved' else md_status end,
         md_approved_by = case when v_md and md_status is distinct from 'approved' then v_name else md_approved_by end,
         md_approval_date = case when v_md and md_status is distinct from 'approved' then now() else md_approval_date end,
         notes = case when nullif(btrim(p_note), '') is null then notes else concat_ws(' | ', nullif(notes, ''), 'Payment: ' || btrim(p_note)) end
   where id = p_roster_id;
  perform fn_notify_site_users(r.site_id, 'info', 'Wages paid: ' || s.name || ' ' || to_char(r.roster_date, 'FMDD Mon'),
    '₦' || to_char(p_amount, 'FM999,999,990') || ' for ' || coalesce(r.worker_count, 0) || ' worker(s), sent to ' || btrim(p_paid_to) || '.',
    'daily_roster', p_roster_id);
end $$;

create or replace function public.daily_wages_due()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_any_role(array['md','accountant','ico']) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('roster_id', r.id, 'site_id', r.site_id, 'site_name', s.name, 'roster_date', r.roster_date,
             'workers', r.worker_count, 'total', r.total_daily_cost, 'md_status', r.md_status, 'ico_status', r.ico_status,
             'submitted_by', r.submitted_by, 'days_waiting', lagos_today() - r.roster_date)
           order by r.roster_date, s.name)
      from daily_roster r join production_sites s on s.id = r.site_id
     where s.labour_pay_mode = 'daily' and r.payment_status = 'unpaid' and r.payroll_id is null
       and coalesce(r.total_daily_cost, 0) > 0 and coalesce(r.md_status, 'pending') <> 'rejected'), '[]'::jsonb);
end $$;

revoke all on function public.fn_roster_entry_site_role() from public, anon, authenticated;
revoke all on function public.pay_daily_roster(uuid,numeric,text,text,uuid,text), public.daily_wages_due() from public, anon;
grant execute on function public.pay_daily_roster(uuid,numeric,text,text,uuid,text), public.daily_wages_due() to authenticated;
