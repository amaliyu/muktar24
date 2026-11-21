-- At daily-pay sites, a roster can only become 'paid' through pay_daily_roster (reference, amount, check-ins), never by a
-- direct update (site managers, HR and ICO can update rosters for other fields).
create or replace function public.fn_daily_roster_paid_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid'
     and current_setting('app.daily_wage_pay', true) is distinct from 'on'
     and exists (select 1 from production_sites s where s.id = new.site_id and s.labour_pay_mode = 'daily') then
    raise exception 'Daily wages are marked paid by recording the transfer (Wages to pay), not directly.';
  end if;
  return new;
end $$;
revoke all on function public.fn_daily_roster_paid_guard() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_daily_roster_paid_guard' and tgrelid = 'public.daily_roster'::regclass) then
    create trigger trg_daily_roster_paid_guard before update of payment_status on public.daily_roster
      for each row execute function public.fn_daily_roster_paid_guard();
  end if;
end $$;

do $$
declare d text; anchor text := 'update daily_roster
     set payment_status = ''paid'',';
begin
  d := pg_get_functiondef('public.pay_daily_roster(uuid,numeric,text,text,uuid,text)'::regprocedure);
  if position(anchor in d) = 0 then raise exception 'pay_daily_roster: anchor not found'; end if;
  d := replace(d, anchor, 'perform set_config(''app.daily_wage_pay'', ''on'', true);
  ' || anchor);
  d := replace(d, '  perform fn_notify_site_users(r.site_id, ''info'', ''Wages paid: ''',
                  '  perform set_config(''app.daily_wage_pay'', ''off'', true);
  perform fn_notify_site_users(r.site_id, ''info'', ''Wages paid: ''');
  if position('app.daily_wage_pay'', ''off''' in d) = 0 then raise exception 'pay_daily_roster: off anchor not found'; end if;
  execute d;
end $$;
