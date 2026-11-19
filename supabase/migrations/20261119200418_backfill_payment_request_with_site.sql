-- Backfilled spending must land on the right site (Kado / Life Camp), not default to Dutse.
-- Wrapper keeps backfill_payment_request's signature unchanged; one call, one transaction.
create or replace function public.backfill_payment_request_at_site(
  p_site_id uuid, p_requested_by uuid, p_amount numeric, p_purpose text, p_transaction_date date, p_note text,
  p_payee_name text default null, p_payee_bank_name text default null, p_payee_account_number text default null,
  p_payee_account_name text default null, p_supplier_id uuid default null, p_disbursement_method text default 'bank_transfer',
  p_bank_account_id uuid default null, p_expense_category_id uuid default null)
returns payment_requests language plpgsql security definer set search_path = public as $$
declare v_row payment_requests;
begin
  if p_site_id is null or not exists (select 1 from production_sites where id = p_site_id) then raise exception 'Choose the site this was spent for.'; end if;
  if not can_see_site(p_site_id) then raise exception 'You do not have access to that site.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than zero.'; end if;
  v_row := backfill_payment_request(p_requested_by, p_amount, p_purpose, p_transaction_date, p_note, p_payee_name, p_payee_bank_name,
             p_payee_account_number, p_payee_account_name, p_supplier_id, p_disbursement_method, p_bank_account_id, p_expense_category_id);
  if v_row.site_id is distinct from p_site_id then
    update payment_requests set site_id = p_site_id where id = v_row.id returning * into v_row;
    update expenses set site_id = p_site_id where payment_request_id = v_row.id and site_id is distinct from p_site_id;
  end if;
  return v_row;
end $$;
revoke all on function public.backfill_payment_request_at_site(uuid,uuid,numeric,text,date,text,text,text,text,text,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.backfill_payment_request_at_site(uuid,uuid,numeric,text,date,text,text,text,text,text,uuid,text,uuid,uuid) to authenticated;
