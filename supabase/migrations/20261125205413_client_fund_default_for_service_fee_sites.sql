-- MD 2026-11-25: Life Camp running costs (wages, diesel, plumbing, ...) are Bilaad's; equipment and machine repairs are
-- APCL's (e.g. the solar security light). New payment requests at a service-fee client site get the fund set
-- automatically; MD/accountant/ICO can still change it. A manual choice is never overwritten.

create or replace function public.fn_default_client_fund(p_site_id uuid, p_category_id uuid, p_purpose text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from site_contracts sc where sc.site_id = p_site_id and sc.contract_model = 'service_fee') then null
    when coalesce((select name from expense_categories where id = p_category_id), '') in ('Machine Maintenance','Truck Maintenance','Trading Purchases')
      or coalesce(p_purpose, '') ~* '(solar|soler|equipment|machine|mould|mold|generator (purchase|repair)|repair of (the )?generator)' then null
    when coalesce((select name from expense_categories where id = p_category_id), '') in ('Production Fuel','Delivery Fuel')
      or coalesce(p_purpose, '') ~* '(diesel|fuel|ago\M)' then 'diesel'
    else 'operating'
  end
$$;
revoke all on function public.fn_default_client_fund(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.fn_payment_request_default_client_fund()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.client_fund is null then
      new.client_fund := fn_default_client_fund(new.site_id, new.expense_category_id, new.purpose);
    end if;
  elsif new.client_fund is not distinct from old.client_fund
        and old.client_fund is not distinct from fn_default_client_fund(old.site_id, old.expense_category_id, old.purpose) then
    -- still the automatic value: follow changes to site, category or purpose
    new.client_fund := fn_default_client_fund(new.site_id, new.expense_category_id, new.purpose);
  end if;
  return new;
end $$;
create trigger trg_payment_request_default_client_fund before insert or update of site_id, expense_category_id, purpose on public.payment_requests
  for each row execute function fn_payment_request_default_client_fund();
