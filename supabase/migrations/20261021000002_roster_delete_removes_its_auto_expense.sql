-- ALREADY APPLIED to the live DB by the planning chat on 2026-10-21, verified. Kept here as the tracked record. DO NOT RE-RUN.
-- Deleting a roster failed whenever it had a cost: its auto-expense (sync_expense_from_roster)
-- blocks the delete via expenses_daily_roster_id_fkey. Remove that auto-expense first.
-- Who may delete a roster is still decided by daily_roster's own RLS delete policy.
create or replace function public.fn_roster_delete_auto_expense()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from expenses where daily_roster_id = old.id and ingestion_source = 'daily_roster';
  return old;
end $$;
revoke all on function public.fn_roster_delete_auto_expense() from public, anon, authenticated;
create trigger trg_roster_delete_auto_expense before delete on public.daily_roster
  for each row execute function public.fn_roster_delete_auto_expense();
