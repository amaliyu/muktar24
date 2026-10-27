-- Proforma rule (MD, binding): a draft invoice is the proforma; only "Issue
-- Invoice" creates money owed; dead quotes are closed (cancelled), not deleted.
-- Before this, the database let a BDM: delete an issued invoice with no payments,
-- change an issued invoice's amount, and set an issued invoice back to draft
-- (removing the debt). Planning chat, 2026-10-27.
--
-- Allowed status moves (anyone else, or any other move, is refused):
--   draft  -> draft / issued / cancelled    md, accountant, bdm
--   issued -> issued (content edit)         md, accountant
--   issued -> paid / cancelled              md, accountant
--   paid   -> issued / paid                 md, accountant   (payment reversal)
--   paid   content stays locked (existing rule)
--   nothing ever goes back to draft; a cancelled invoice is final.
-- Server-side work with no signed-in user (auth.uid() is null) is not restricted.
-- Delete: MD only.

create or replace function public.invoice_content_guard()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_fin boolean;
  v_content_changed boolean;
begin
  if OLD.status = 'paid' and NEW.status = 'paid'
     and (NEW.total_amount   is distinct from OLD.total_amount
       or NEW.delivery_cost  is distinct from OLD.delivery_cost
       or NEW.discount       is distinct from OLD.discount
       or NEW.include_vat    is distinct from OLD.include_vat
       or NEW.invoice_number is distinct from OLD.invoice_number) then
    raise exception 'Invoice % is paid and its content is locked. Cancel and reissue to correct it.',
      OLD.invoice_number;
  end if;

  if auth.uid() is not null then
    v_fin := has_any_role(array['md','accountant']);
    v_content_changed := NEW.total_amount   is distinct from OLD.total_amount
                      or NEW.delivery_cost  is distinct from OLD.delivery_cost
                      or NEW.discount       is distinct from OLD.discount
                      or NEW.include_vat    is distinct from OLD.include_vat
                      or NEW.invoice_number is distinct from OLD.invoice_number
                      or NEW.order_id       is distinct from OLD.order_id;

    if OLD.status = 'cancelled' then
      raise exception 'Invoice % is cancelled and cannot be changed.', OLD.invoice_number;
    end if;
    if NEW.status = 'draft' and OLD.status <> 'draft' then
      raise exception 'Invoice % has been issued and cannot go back to a proforma. Cancel it and raise a new one.', OLD.invoice_number;
    end if;
    if OLD.status in ('issued','paid') and not v_fin
       and (NEW.status is distinct from OLD.status or v_content_changed) then
      raise exception 'Only the MD or Accountant can change or cancel an issued invoice (%).', OLD.invoice_number;
    end if;
  end if;

  if NEW.status = 'issued' and OLD.status = 'draft' then
    NEW.issued_at := now();
  end if;
  return NEW;
end;
$function$;

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices for delete
  using (has_any_role(array['md']));
