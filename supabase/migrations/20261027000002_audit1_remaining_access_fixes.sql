-- ChatGPT audit 1, remaining findings (#4-#8 + views). Planning chat, 2026-10-27.

-- #4 Any signed-in user could add THEMSELVES to any conversation and then read it.
--    Only the conversation's creator may add participants (createDM/createGroup
--    insert every participant as the creator).
drop policy if exists participants_insert on public.conversation_participants;
create policy participants_insert on public.conversation_participants for insert to authenticated
  with check (exists (select 1 from public.conversations c
                      where c.id = conversation_participants.conversation_id
                        and c.created_by = auth.uid()));

-- #5 Deactivated accounts kept working: several approval/payroll functions read
--    user_profiles.role without checking is_active, and has_role() ignored it.
--    Deactivating now bans the login and ends its sessions; reactivating lifts it.
create or replace function public.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_profiles where id = auth.uid() and is_active = true)
     and (exists (select 1 from user_profiles where id = auth.uid() and role = p_role)
          or exists (select 1 from user_role_grants
                     where user_id = auth.uid() and role = p_role and revoked_at is null
                       and (expires_at is null or expires_at > now())));
$$;

create or replace function public.fn_sync_login_with_active()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if NEW.is_active is distinct from OLD.is_active then
    if NEW.is_active then
      update auth.users set banned_until = null where id = NEW.id;
    else
      update auth.users set banned_until = 'infinity' where id = NEW.id;
      delete from auth.sessions where user_id = NEW.id;
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.fn_sync_login_with_active() from public, anon, authenticated;

drop trigger if exists trg_sync_login_with_active on public.user_profiles;
create trigger trg_sync_login_with_active after update of is_active on public.user_profiles
  for each row execute function public.fn_sync_login_with_active();

-- Existing deactivated accounts (5 on 2026-10-27, 2 still had sessions).
update auth.users u set banned_until = 'infinity'
  from public.user_profiles up where up.id = u.id and up.is_active = false;
delete from auth.sessions s using public.user_profiles up
  where up.id = s.user_id and up.is_active = false;

-- #6 Payment-request attachments: requesters could read every request's files.
--    Finance/oversight roles see all; a requester sees and uploads only files of
--    their own requests (path = <payment_request_id>/<file>).
drop policy if exists payment_request_attachments_storage_select on storage.objects;
create policy payment_request_attachments_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-request-attachments' and (
    has_any_role(array['md','accountant','ico','board_member'])
    or exists (select 1 from public.payment_requests pr
               where pr.id::text = (storage.foldername(name))[1] and pr.requested_by = auth.uid())));

drop policy if exists payment_request_attachments_storage_insert on storage.objects;
create policy payment_request_attachments_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-request-attachments' and (
    has_any_role(array['md','accountant'])
    or (has_any_role(array['production_manager','logistics_manager','bdm','hr_officer'])
        and exists (select 1 from public.payment_requests pr
                    where pr.id::text = (storage.foldername(name))[1] and pr.requested_by = auth.uid()))));

-- #7 Labour pay and loading rates were readable by every signed-in user
--    (drivers, kiosk, marketers, investors). Limit to roles that open Labour,
--    Truck Loading, P&L or Accounting.
drop policy if exists weekly_labour_payroll_select on public.weekly_labour_payroll;
create policy weekly_labour_payroll_select on public.weekly_labour_payroll for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member','logistics_manager','hr_officer','production_manager','assistant_production_manager']));

drop policy if exists truck_loading_rates_select on public.truck_loading_rates;
create policy truck_loading_rates_select on public.truck_loading_rates for select to authenticated
  using (has_any_role(array['md','accountant','ico','board_member','logistics_manager','hr_officer','production_manager','assistant_production_manager']));

-- #8 Definer functions callable while logged out. Nothing in the app calls these
--    before sign-in. (has_any_role / has_role / my_effective_roles stay: they only
--    return false for a logged-out caller and are used inside policies.)
revoke execute on function public.advance_payment_request(uuid,text,text,uuid) from public, anon;
revoke execute on function public.approve_vendor(uuid) from public, anon;
revoke execute on function public.backfill_payment_request(uuid,numeric,text,date,text,text,text,text,text,uuid,text,uuid,uuid) from public, anon;
revoke execute on function public.check_role_conflict(uuid,text) from public, anon;
revoke execute on function public.confirm_bank_match(uuid,text,text) from public, anon;
revoke execute on function public.create_supplier_from_payment_request(text,text,text,text,text,text) from public, anon;
revoke execute on function public.fn_is_conversation_participant(uuid,uuid) from public, anon;
revoke execute on function public.get_next_payment_request_reference() from public, anon;
revoke execute on function public.get_order_trading_margin(uuid) from public, anon;
revoke execute on function public.suggest_bank_match(uuid,text,uuid) from public, anon;
grant execute on function public.advance_payment_request(uuid,text,text,uuid) to authenticated;
grant execute on function public.approve_vendor(uuid) to authenticated;
grant execute on function public.backfill_payment_request(uuid,numeric,text,date,text,text,text,text,text,uuid,text,uuid,uuid) to authenticated;
grant execute on function public.check_role_conflict(uuid,text) to authenticated;
grant execute on function public.confirm_bank_match(uuid,text,text) to authenticated;
grant execute on function public.create_supplier_from_payment_request(text,text,text,text,text,text) to authenticated;
grant execute on function public.fn_is_conversation_participant(uuid,uuid) to authenticated;
grant execute on function public.get_next_payment_request_reference() to authenticated;
grant execute on function public.get_order_trading_margin(uuid) to authenticated;
grant execute on function public.suggest_bank_match(uuid,text,uuid) to authenticated;

-- Views that ran with the owner's rights, so any signed-in user could read them
-- past the underlying tables' RLS. Now they follow the caller's RLS; write grants
-- removed (they are reports, not editable).
alter view public.cash_withdrawal_drift set (security_invoker = on);
alter view public.payment_request_batch_status set (security_invoker = on);
alter view public.payment_request_override_report set (security_invoker = on);
revoke insert, update, delete, truncate, references, trigger on
  public.cash_withdrawal_drift, public.payment_request_batch_status, public.payment_request_override_report,
  public.order_items_delivery, public.disciplinary_self,
  public.v_spv_ledger, public.v_investor_position, public.v_site_yard
  from authenticated;
-- disciplinary_self stays owner-rights on purpose: it filters to the caller's own
-- cases (staff_id = current_staff_id()) so staff can read their own record.
-- order_items_delivery stays owner-rights on purpose: logistics/store/driver need
-- order quantities (no prices) for Pending Deliveries but cannot read order_items.
