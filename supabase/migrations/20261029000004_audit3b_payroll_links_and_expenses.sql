-- Audit 3 — remaining database items (planning chat, 2026-10-29).
-- A3-3  paid / approved work can't be pulled into another weekly payroll.
-- A3-4  a staff member can't be paid twice for overlapping salary periods.
-- A3-13 accountant can record line payments on an MD-approved salary run.
-- A3-14 production managers can save the loading crew they record.
-- A3-15 one weekly payroll per (week_ending, payroll_type) — the key the app upserts on.
-- A3-17 roster expense follows roster date and a zeroed cost.
-- A3-18 salary-line expenses are posted when lines are written (not only on header update).
-- A3-20 editing a load's quantity keeps its trip number (and its rate).
-- A3-8  (part) payroll_lines.salary_advance_id: a deduction can name the advance it repays.

alter table public.weekly_labour_payroll
  add constraint weekly_labour_payroll_week_type_unique unique (week_ending, payroll_type);

-- A3-3 ----------------------------------------------------------------------
create or replace function public.fn_payroll_link_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old text; v_new text;
begin
  if NEW.payroll_id is not distinct from OLD.payroll_id then return NEW; end if;
  if current_setting('app.payroll_guard', true) = 'on' then return NEW; end if;
  if NEW.payroll_id is not null and OLD.payment_status = 'paid' then
    raise exception 'This record is already paid and cannot be added to another payroll.';
  end if;
  if OLD.payroll_id is not null then
    select status into v_old from weekly_labour_payroll where id = OLD.payroll_id;
    if v_old is distinct from 'draft' then
      raise exception 'This record belongs to a % payroll and cannot be moved.', v_old;
    end if;
  end if;
  if NEW.payroll_id is not null then
    select status into v_new from weekly_labour_payroll where id = NEW.payroll_id;
    if v_new is distinct from 'draft' then
      raise exception 'Records can only be added to a draft payroll (this one is %).', v_new;
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.fn_payroll_link_guard() from public, anon, authenticated;
drop trigger if exists trg_payroll_link_guard on public.daily_roster;
create trigger trg_payroll_link_guard before update of payroll_id on public.daily_roster
  for each row execute function public.fn_payroll_link_guard();
drop trigger if exists trg_payroll_link_guard on public.truck_loading_log;
create trigger trg_payroll_link_guard before update of payroll_id on public.truck_loading_log
  for each row execute function public.fn_payroll_link_guard();

-- A3-4 ----------------------------------------------------------------------
create or replace function public.fn_payroll_line_overlap_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from date; v_to date; v_other text;
begin
  select period_from, period_to into v_from, v_to from payroll_runs where id = NEW.payroll_run_id;
  select r.period_from || ' to ' || r.period_to into v_other
    from payroll_lines pl join payroll_runs r on r.id = pl.payroll_run_id
   where pl.staff_id = NEW.staff_id and pl.payroll_run_id <> NEW.payroll_run_id
     and pl.id is distinct from NEW.id
     and daterange(r.period_from, r.period_to, '[]') && daterange(v_from, v_to, '[]')
   limit 1;
  if v_other is not null then
    raise exception 'This staff member is already in a salary run for % — periods cannot overlap.', v_other;
  end if;
  return NEW;
end $$;
revoke all on function public.fn_payroll_line_overlap_guard() from public, anon, authenticated;
drop trigger if exists trg_payroll_line_overlap_guard on public.payroll_lines;
create trigger trg_payroll_line_overlap_guard before insert or update of staff_id, payroll_run_id on public.payroll_lines
  for each row execute function public.fn_payroll_line_overlap_guard();

-- A3-13 ---------------------------------------------------------------------
drop policy if exists payroll_lines_update on public.payroll_lines;
create policy payroll_lines_update on public.payroll_lines for update to authenticated
  using (has_any_role(array['md','hr_officer'])
         or (has_any_role(array['accountant']) and exists (
               select 1 from payroll_runs r where r.id = payroll_lines.payroll_run_id and r.status = 'md_approved')))
  with check (has_any_role(array['md','hr_officer'])
         or (has_any_role(array['accountant']) and exists (
               select 1 from payroll_runs r where r.id = payroll_lines.payroll_run_id and r.status = 'md_approved')));

-- A3-14 ---------------------------------------------------------------------
drop policy if exists truck_loading_loaders_insert on public.truck_loading_loaders;
create policy truck_loading_loaders_insert on public.truck_loading_loaders for insert to authenticated
  with check (has_any_role(array['md','logistics_manager','production_manager','assistant_production_manager']));
drop policy if exists truck_loading_loaders_delete on public.truck_loading_loaders;
create policy truck_loading_loaders_delete on public.truck_loading_loaders for delete to authenticated
  using (has_any_role(array['md','logistics_manager','production_manager','assistant_production_manager']));
drop policy if exists truck_loading_loaders_update on public.truck_loading_loaders;
create policy truck_loading_loaders_update on public.truck_loading_loaders for update to authenticated
  using (has_any_role(array['md','logistics_manager','production_manager','assistant_production_manager']))
  with check (has_any_role(array['md','logistics_manager','production_manager','assistant_production_manager']));

-- A3-17 ---------------------------------------------------------------------
create or replace function public.sync_expense_from_roster()
returns trigger language plpgsql security definer set search_path = public as $$
DECLARE v_cat uuid;
BEGIN
  IF coalesce(NEW.total_daily_cost, 0) = 0
     AND NOT EXISTS (SELECT 1 FROM expenses WHERE daily_roster_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_cat FROM expense_categories WHERE name = 'Labour' LIMIT 1;
  INSERT INTO expenses (daily_roster_id, amount, expense_date, category_id, description,
                        status, approval_status, approval_date, ingestion_source, notes)
  VALUES (NEW.id, coalesce(NEW.total_daily_cost, 0), NEW.roster_date, v_cat,
          'Daily labour — ' || coalesce(NEW.worker_count, 0) || ' worker(s)',
          'approved', 'approved', current_date, 'daily_roster',
          'Auto-recognized on recording; corrected automatically if the roster is edited.')
  ON CONFLICT (daily_roster_id) DO UPDATE SET
    amount = EXCLUDED.amount, expense_date = EXCLUDED.expense_date,
    description = EXCLUDED.description, updated_at = now();
  RETURN NEW;
END $$;
drop trigger if exists trg_expense_from_roster on public.daily_roster;
create trigger trg_expense_from_roster after insert or update of total_daily_cost, worker_count, roster_date
  on public.daily_roster for each row execute function public.sync_expense_from_roster();

-- A3-18 ---------------------------------------------------------------------
create or replace function public.fn_payroll_line_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cat uuid; r payroll_runs%rowtype;
begin
  if TG_OP = 'DELETE' then
    delete from expenses where payroll_line_id = OLD.id and ingestion_source = 'payroll_run';
    return OLD;
  end if;
  select * into r from payroll_runs where id = NEW.payroll_run_id;
  select id into v_cat from expense_categories where name = 'Salaries' limit 1;
  insert into expenses (payroll_line_id, payroll_run_id, amount, expense_date, category_id,
                        description, status, approval_status, approval_date, ingestion_source, notes)
  values (NEW.id, NEW.payroll_run_id, coalesce(NEW.amount_due, 0), r.period_to, v_cat,
          'Monthly salary — period ' || r.period_from || ' to ' || r.period_to,
          'approved', 'approved', current_date, 'payroll_run', 'Auto-recognized when payroll line written.')
  on conflict (payroll_line_id) do update set amount = excluded.amount, updated_at = now();
  return NEW;
end $$;
revoke all on function public.fn_payroll_line_expense() from public, anon, authenticated;
drop trigger if exists trg_payroll_line_expense on public.payroll_lines;
create trigger trg_payroll_line_expense after insert or update of amount_due on public.payroll_lines
  for each row execute function public.fn_payroll_line_expense();
drop trigger if exists trg_payroll_line_expense_delete on public.payroll_lines;
create trigger trg_payroll_line_expense_delete before delete on public.payroll_lines
  for each row execute function public.fn_payroll_line_expense();

-- A3-20 ---------------------------------------------------------------------
create or replace function public.compute_truck_loading_rate()
returns trigger language plpgsql as $$
DECLARE
  v_base numeric; v_threshold integer; v_incentive numeric; v_trip_number integer;
BEGIN
  IF NEW.product_id IS NULL OR NEW.vehicle_id IS NULL OR NEW.date IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT base_rate, trip_threshold, incentive_rate INTO v_base, v_threshold, v_incentive
    FROM public.truck_loading_rates WHERE product_id = NEW.product_id;
  IF v_base IS NULL THEN RAISE EXCEPTION 'No loading rate configured for this product'; END IF;

  IF TG_OP = 'UPDATE' AND NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id
     AND NEW.date IS NOT DISTINCT FROM OLD.date AND OLD.trip_number_for_day IS NOT NULL THEN
    v_trip_number := OLD.trip_number_for_day;   -- a quantity/product fix keeps its place in the day
  ELSE
    SELECT count(*) + 1 INTO v_trip_number FROM public.truck_loading_log
     WHERE vehicle_id = NEW.vehicle_id AND date = NEW.date AND id IS DISTINCT FROM NEW.id;
  END IF;

  NEW.trip_number_for_day := v_trip_number;
  NEW.computed_rate_used := CASE WHEN v_threshold IS NOT NULL AND v_trip_number > v_threshold
                                 THEN v_incentive ELSE v_base END;
  NEW.rate_per_block := NEW.computed_rate_used;
  NEW.total_amount := COALESCE(NEW.quantity_loaded, 0) * NEW.computed_rate_used;
  RETURN NEW;
END $$;

-- A3-8 (part) ----------------------------------------------------------------
alter table public.payroll_lines add column if not exists salary_advance_id uuid references public.salary_advances(id);

create or replace function public.realize_advance_repayments()
returns trigger language plpgsql security definer set search_path = public as $$
declare ln record; v_adv public.salary_advances; v_pay numeric; v_newbal numeric; v_newstatus text;
begin
  if not (new.status = 'paid' and old.status is distinct from 'paid') then return new; end if;
  perform set_config('app.salary_advance_guard', 'on', true);
  for ln in
    select pl.staff_id, pl.advance_deduction, pl.salary_advance_id
      from public.payroll_lines pl
     where pl.payroll_run_id = new.id and coalesce(pl.advance_deduction, 0) > 0
  loop
    if ln.salary_advance_id is not null then
      select * into v_adv from public.salary_advances
       where id = ln.salary_advance_id and staff_id = ln.staff_id and status = 'disbursed' for update;
    else
      select * into v_adv from public.salary_advances
       where staff_id = ln.staff_id and status = 'disbursed' and coalesce(outstanding_balance, 0) > 0
       order by disbursed_date asc nulls last limit 1 for update;
    end if;
    if not found then continue; end if;
    v_pay := least(ln.advance_deduction, v_adv.outstanding_balance);
    v_newbal := v_adv.outstanding_balance - v_pay;
    v_newstatus := case when v_newbal <= 0 then 'settled' else v_adv.status end;
    update public.salary_advances set outstanding_balance = v_newbal, status = v_newstatus where id = v_adv.id;
    insert into public.salary_advance_audit(advance_id, actor_name, actor_role, action, old_status, new_status, reason)
    values (v_adv.id, 'system', 'system',
            case when v_newstatus = 'settled' then 'repayment_settled' else 'repayment' end,
            v_adv.status, v_newstatus,
            'Payroll run ' || new.id::text || ' advance_deduction ' || v_pay::text
            || case when ln.advance_deduction > v_pay then ' (line deducted ' || ln.advance_deduction::text || '; excess ' || (ln.advance_deduction - v_pay)::text || ' not applied)' else '' end);
  end loop;
  perform set_config('app.salary_advance_guard', 'off', true);
  return new;
end $$;

-- Data correction: post the 18 salary lines with no expense; fix the 2 roster expenses.
insert into public.expenses (payroll_line_id, payroll_run_id, amount, expense_date, category_id,
                             description, status, approval_status, approval_date, ingestion_source, notes)
select pl.id, pl.payroll_run_id, coalesce(pl.amount_due, 0), r.period_to,
       (select id from expense_categories where name = 'Salaries' limit 1),
       'Monthly salary — period ' || r.period_from || ' to ' || r.period_to,
       'approved', 'approved', current_date, 'payroll_run', 'Back-filled 2026-10-29 (audit A3-18).'
  from payroll_lines pl join payroll_runs r on r.id = pl.payroll_run_id
 where not exists (select 1 from expenses e where e.payroll_line_id = pl.id);

update public.expenses e set amount = coalesce(r.total_daily_cost, 0), expense_date = r.roster_date, updated_at = now()
  from public.daily_roster r
 where r.id = e.daily_roster_id and e.ingestion_source = 'daily_roster'
   and (e.expense_date is distinct from r.roster_date or e.amount is distinct from coalesce(r.total_daily_cost, 0));
