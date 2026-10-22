-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-22, verified. Kept here as the tracked record. DO NOT RE-RUN.
-- Accountant may record payments on a cycle, but only the primary-role MD may change its status or notice dates.
create or replace function public.fn_contract_cycle_md_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service/cron context
  if coalesce(get_user_role(),'') <> 'md' and (
       (tg_op = 'INSERT' and new.status <> 'awaiting_payment')
    or (tg_op = 'UPDATE' and (new.status is distinct from old.status
        or new.advance_notice_sent_on is distinct from old.advance_notice_sent_on
        or new.completion_notice_sent_on is distinct from old.completion_notice_sent_on
        or new.override_reason is distinct from old.override_reason))) then
    raise exception 'Only the MD can change a cycle''s status or record notices.';
  end if;
  return new;
end $$;
revoke all on function public.fn_contract_cycle_md_fields() from public, anon, authenticated;
create trigger trg_contract_cycle_md_fields before insert or update on public.contract_cycles
  for each row execute function public.fn_contract_cycle_md_fields();
