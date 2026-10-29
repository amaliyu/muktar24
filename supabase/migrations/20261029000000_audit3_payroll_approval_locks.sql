-- ChatGPT audit 3 (payroll, roster, loading, advances, leave) — database highs.
-- Planning chat, 2026-10-29. Approved by MD: "fix critical and important in the background".
-- Every guard honours the existing "app.*_guard = on" setting that the approval
-- functions (advance_*, realize_advance_repayments) use for their own writes.

-- #1 Payroll could be INSERTED already approved/paid (guards only ran on UPDATE).
drop policy if exists payroll_runs_insert on public.payroll_runs;
create policy payroll_runs_insert on public.payroll_runs for insert to authenticated
  with check (has_any_role(array['md','hr_officer']) and status = 'draft' and approved_by is null);

drop policy if exists weekly_labour_payroll_insert on public.weekly_labour_payroll;
create policy weekly_labour_payroll_insert on public.weekly_labour_payroll for insert to authenticated
  with check (has_any_role(array['md','production_manager','assistant_production_manager','hr_officer','logistics_manager','ico'])
              and status = 'draft');

-- #2 Approval did not freeze the lines/workers under it.
-- Salary lines: frozen once the run is ICO-approved. While MD-approved, only the
-- payment fields (amount_paid, payment_date, payment_method, notes) may change.
create or replace function public.fn_payroll_lines_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old text; v_new text;
begin
  if current_setting('app.staff_payroll_guard', true) = 'on' or auth.uid() is null then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP in ('UPDATE','DELETE') then
    select status into v_old from payroll_runs where id = OLD.payroll_run_id;
  end if;
  if TG_OP in ('INSERT','UPDATE') then
    select status into v_new from payroll_runs where id = NEW.payroll_run_id;
  end if;
  if TG_OP = 'INSERT' and v_new in ('ico_approved','md_approved','paid') then
    raise exception 'Payroll run is % — lines cannot be added. Recall it to draft first.', v_new;
  end if;
  if TG_OP = 'DELETE' and v_old in ('ico_approved','md_approved','paid') then
    raise exception 'Payroll run is % — lines cannot be removed. Recall it to draft first.', v_old;
  end if;
  if TG_OP = 'UPDATE' then
    if v_new in ('ico_approved','md_approved','paid') and NEW.payroll_run_id is distinct from OLD.payroll_run_id then
      raise exception 'Cannot move a line into a % payroll run.', v_new;
    end if;
    if v_old = 'paid' or v_old = 'ico_approved' then
      raise exception 'Payroll run is % — its lines are locked.', v_old;
    end if;
    if v_old = 'md_approved' and (
         NEW.payroll_run_id   is distinct from OLD.payroll_run_id
      or NEW.staff_id         is distinct from OLD.staff_id
      or NEW.staff_type       is distinct from OLD.staff_type
      or NEW.days_present     is distinct from OLD.days_present
      or NEW.daily_rate       is distinct from OLD.daily_rate
      or NEW.monthly_salary   is distinct from OLD.monthly_salary
      or NEW.amount_due       is distinct from OLD.amount_due
      or NEW.deductions       is distinct from OLD.deductions
      or NEW.advance_deduction is distinct from OLD.advance_deduction) then
      raise exception 'Payroll run is MD-approved — only payment details can be recorded. Recall it to change amounts or staff.';
    end if;
  end if;
  return coalesce(NEW, OLD);
end $$;
revoke all on function public.fn_payroll_lines_lock() from public, anon, authenticated;
drop trigger if exists trg_payroll_lines_lock on public.payroll_lines;
create trigger trg_payroll_lines_lock before insert or update or delete on public.payroll_lines
  for each row execute function public.fn_payroll_lines_lock();

-- Roster workers: frozen once the roster is paid or its weekly payroll is approved/paid.
create or replace function public.fn_roster_entries_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_roster uuid; v_pay text; v_wp text;
begin
  if current_setting('app.payroll_guard', true) = 'on' or auth.uid() is null then
    return coalesce(NEW, OLD);
  end if;
  foreach v_roster in array array[case when TG_OP <> 'INSERT' then OLD.roster_id end,
                                  case when TG_OP <> 'DELETE' then NEW.roster_id end] loop
    continue when v_roster is null;
    select r.payment_status, w.status into v_pay, v_wp
      from daily_roster r left join weekly_labour_payroll w on w.id = r.payroll_id
     where r.id = v_roster;
    if v_pay = 'paid' or v_wp in ('ico_approved','md_approved','paid') then
      raise exception 'This roster is % — its workers are locked. Revert the payroll to draft to correct it.',
        case when v_pay = 'paid' then 'paid' else 'in a ' || v_wp || ' payroll' end;
    end if;
  end loop;
  return coalesce(NEW, OLD);
end $$;
revoke all on function public.fn_roster_entries_lock() from public, anon, authenticated;
drop trigger if exists trg_roster_entries_lock on public.daily_roster_entries;
create trigger trg_roster_entries_lock before insert or update or delete on public.daily_roster_entries
  for each row execute function public.fn_roster_entries_lock();

-- Loading crew: frozen once the load is paid or its weekly payroll is approved/paid.
create or replace function public.fn_loading_loaders_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_log uuid; v_pay text; v_wp text;
begin
  if current_setting('app.payroll_guard', true) = 'on' or auth.uid() is null then
    return coalesce(NEW, OLD);
  end if;
  foreach v_log in array array[case when TG_OP <> 'INSERT' then OLD.loading_log_id end,
                               case when TG_OP <> 'DELETE' then NEW.loading_log_id end] loop
    continue when v_log is null;
    select l.payment_status, w.status into v_pay, v_wp
      from truck_loading_log l left join weekly_labour_payroll w on w.id = l.payroll_id
     where l.id = v_log;
    if v_pay = 'paid' or v_wp in ('ico_approved','md_approved','paid') then
      raise exception 'This load is % — its loaders are locked. Revert the payroll to draft to correct it.',
        case when v_pay = 'paid' then 'paid' else 'in a ' || v_wp || ' payroll' end;
    end if;
  end loop;
  return coalesce(NEW, OLD);
end $$;
revoke all on function public.fn_loading_loaders_lock() from public, anon, authenticated;
drop trigger if exists trg_loading_loaders_lock on public.truck_loading_loaders;
create trigger trg_loading_loaders_lock before insert or update or delete on public.truck_loading_loaders
  for each row execute function public.fn_loading_loaders_lock();

-- #7 Approved/disbursed advances: amount, recipient, instalments and balance locked
--    (status moves already go through advance_salary_advance()).
create or replace function public.salary_advance_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('app.salary_advance_guard', true) = 'on' then return new; end if;
  if new.status is distinct from old.status then
    raise exception 'Advance status changes must go through advance_salary_advance()';
  end if;
  if old.status in ('settled','rejected','cancelled') then
    raise exception 'Advance is % and is locked', old.status;
  end if;
  if old.status in ('ico_approved','md_approved','disbursed') and (
       new.staff_id            is distinct from old.staff_id
    or new.amount              is distinct from old.amount
    or new.installments        is distinct from old.installments
    or new.installment_amount  is distinct from old.installment_amount
    or new.outstanding_balance is distinct from old.outstanding_balance
    or new.disbursed_date      is distinct from old.disbursed_date) then
    raise exception 'Advance is % — amount, staff, instalments and balance are locked. Reject it and raise a new request to change them.', old.status;
  end if;
  return new;
end $$;

-- #12 Approved leave: dates, days, type and paid/unpaid locked.
create or replace function public.leave_request_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('app.leave_request_guard', true) = 'on' then return new; end if;
  if new.status is distinct from old.status then
    raise exception 'Leave status changes must go through advance_leave_request()';
  end if;
  if old.status in ('rejected','cancelled') then
    raise exception 'Leave request is % and is locked', old.status;
  end if;
  if old.status in ('ico_approved','md_approved') and (
       new.staff_id   is distinct from old.staff_id
    or new.leave_type is distinct from old.leave_type
    or new.is_paid    is distinct from old.is_paid
    or new.start_date is distinct from old.start_date
    or new.end_date   is distinct from old.end_date
    or new.days       is distinct from old.days) then
    raise exception 'Leave is % — dates, days and paid/unpaid are locked. Cancel it and raise a new request.', old.status;
  end if;
  return new;
end $$;

-- #11 Labour rates: only the MD may change live rates; the ICO review and MD
--     approval fields of a rate request can only be set by those roles, in order.
create or replace function public.fn_labour_roles_rate_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.base_rate    is distinct from old.base_rate
   or new.target_bonus is distinct from old.target_bonus
   or new.bonus_type   is distinct from old.bonus_type
   or new.payment_type is distinct from old.payment_type)
   and get_user_role() is distinct from 'md' then
    raise exception 'Only the MD can change labour rates (through an approved rate change request).';
  end if;
  return new;
end $$;
revoke all on function public.fn_labour_roles_rate_lock() from public, anon, authenticated;
drop trigger if exists trg_labour_roles_rate_lock on public.labour_roles;
create trigger trg_labour_roles_rate_lock before update on public.labour_roles
  for each row execute function public.fn_labour_roles_rate_lock();

create or replace function public.fn_rate_request_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if old.overall_status in ('approved','rejected') then
    raise exception 'Rate request is % and is locked.', old.overall_status;
  end if;
  if (new.ico_status is distinct from old.ico_status or new.ico_reviewed_by is distinct from old.ico_reviewed_by
   or new.ico_review_date is distinct from old.ico_review_date or new.ico_comments is distinct from old.ico_comments)
   and not has_role('ico') then
    raise exception 'Only the ICO can record the ICO review.';
  end if;
  if (new.md_status is distinct from old.md_status or new.md_approved_by is distinct from old.md_approved_by
   or new.md_approval_date is distinct from old.md_approval_date or new.md_comments is distinct from old.md_comments)
   and get_user_role() is distinct from 'md' then
    raise exception 'Only the MD can record the MD decision.';
  end if;
  if new.md_status is distinct from old.md_status and coalesce(new.ico_status,'') <> 'approved' then
    raise exception 'The ICO must approve the request before the MD decides.';
  end if;
  if new.overall_status = 'approved' and (coalesce(new.ico_status,'') <> 'approved' or coalesce(new.md_status,'') <> 'approved') then
    raise exception 'A rate request is approved only after ICO and MD approval.';
  end if;
  if old.ico_status is not null and (new.role_id is distinct from old.role_id
     or new.proposed_rate is distinct from old.proposed_rate or new.proposed_bonus is distinct from old.proposed_bonus) then
    raise exception 'The proposed rate cannot change after the ICO has reviewed it.';
  end if;
  return new;
end $$;
revoke all on function public.fn_rate_request_guard() from public, anon, authenticated;
drop trigger if exists trg_rate_request_guard on public.labour_rate_change_requests;
create trigger trg_rate_request_guard before update on public.labour_rate_change_requests
  for each row execute function public.fn_rate_request_guard();

-- #10 Loading edits (quantity/product/vehicle/date) recalculated pay but never the
--     expense; the expense date never followed a date fix; a zeroed load kept its cost.
create or replace function public.sync_expense_from_loading()
returns trigger language plpgsql security definer set search_path = public as $$
DECLARE v_cat uuid;
BEGIN
  IF coalesce(NEW.total_amount, 0) = 0
     AND NOT EXISTS (SELECT 1 FROM expenses WHERE truck_loading_log_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_cat FROM expense_categories WHERE name ilike '%load%' LIMIT 1;
  IF v_cat IS NULL THEN SELECT id INTO v_cat FROM expense_categories WHERE cost_center='logistics' LIMIT 1; END IF;
  INSERT INTO expenses (truck_loading_log_id, amount, expense_date, category_id, description,
                        status, approval_status, approval_date, ingestion_source, notes)
  VALUES (NEW.id, coalesce(NEW.total_amount, 0), coalesce(NEW.date, NEW.created_at::date), v_cat,
          'Loading/offloading — ' || coalesce(NEW.blocks_loaded,0) || ' blocks, plate ' || coalesce(NEW.plate_number,'—'),
          'approved', 'approved', current_date, 'truck_loading',
          case when NEW.date is null then 'Auto-recognized; original date missing, dated to record-entry date instead.'
               else 'Auto-recognized on recording; corrected automatically if the load record is edited.' end)
  ON CONFLICT (truck_loading_log_id) DO UPDATE SET
    amount = EXCLUDED.amount, expense_date = EXCLUDED.expense_date,
    description = EXCLUDED.description, updated_at = now();
  RETURN NEW;
END $$;

drop trigger if exists trg_expense_from_loading on public.truck_loading_log;
create trigger trg_expense_from_loading after insert or update of total_amount, blocks_loaded, quantity_loaded, product_id, vehicle_id, date
  on public.truck_loading_log for each row execute function public.sync_expense_from_loading();

-- #19 A costed load could not be deleted (its expense blocked the delete). Remove
--     the auto-created expense with it, like rosters already do. (The delete policy
--     still refuses loads in a non-draft payroll.)
create or replace function public.fn_loading_delete_auto_expense()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from expenses where truck_loading_log_id = old.id and ingestion_source = 'truck_loading';
  return old;
end $$;
revoke all on function public.fn_loading_delete_auto_expense() from public, anon, authenticated;
drop trigger if exists trg_loading_delete_auto_expense on public.truck_loading_log;
create trigger trg_loading_delete_auto_expense before delete on public.truck_loading_log
  for each row execute function public.fn_loading_delete_auto_expense();

-- Data correction: 18 loading expenses disagreed with their load (net ₦13,140
-- understated) and 20 had the wrong date (2026-10-29).
update public.expenses e
   set amount = coalesce(l.total_amount, 0),
       expense_date = coalesce(l.date, l.created_at::date),
       updated_at = now()
  from public.truck_loading_log l
 where l.id = e.truck_loading_log_id and e.ingestion_source = 'truck_loading'
   and (e.amount is distinct from coalesce(l.total_amount, 0)
        or e.expense_date is distinct from coalesce(l.date, l.created_at::date));
