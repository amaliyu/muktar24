-- ============================================================
-- user_profiles privilege guard
--
-- Fixes (live-DB-verified 2026-10-04 against project kcijsspzteglqqnffokb):
--
-- 1. Self-promotion to MD. profiles_update / user_profiles_update both
--    allow id = auth.uid() with no column restriction — any authenticated
--    user of any role can currently set their own role/is_active/staff_id.
--    No trigger exists today (confirmed: zero non-internal triggers on
--    user_profiles).
--
-- 2. Deactivation is a no-op at the DB layer. get_user_role(),
--    my_effective_roles() AND has_any_role() (the function actually behind
--    ~230 of this schema's 325 RLS policies — not just user_profiles) all
--    ignore is_active. A deactivated user keeps full access everywhere
--    until their JWT expires.
--
-- 3. anon holds GRANT ALL on user_profiles (DELETE/INSERT/SELECT/TRUNCATE/
--    UPDATE, confirmed live). Currently inert — RLS is enabled and no
--    policy targets {anon} — but it's a live defense-in-depth gap: if any
--    future policy or a FORCE ROW LEVEL SECURITY change ever slips, anon
--    has unrestricted table access ready and waiting.
--
-- 4. Two overlapping policy sets exist on user_profiles: the old
--    profiles_* set (get_user_role()-based) and the newer user_profiles_*
--    set (has_any_role()-based). Both independently permit the same
--    unrestricted self-row update — the old set was never dropped when
--    the new one landed. The guard trigger below closes the gap
--    regardless of which policy let a row through, but the duplication
--    itself is the kind of hidden-duplicate-logic trap this schema has
--    been bitten by before (see docs/UNIFIED_MASTER_STATE_AND_PLAN.md
--    §10) — dropped here rather than left to rot.
--
-- Not touched here (follow-up, flagged not fixed): app_roles,
-- opening_balances, opening_balance_history, financial_adjustments also
-- carry GRANT ALL ... TO anon per supabase/auth_roles_financial_tables.sql.
-- ============================================================

begin;

-- ── 1. is_active gate on the three role-resolution functions ──────────
-- All three live bodies captured 2026-10-04 and reproduced verbatim below
-- except for the added is_active check — no other logic changed.

create or replace function public.get_user_role()
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select role from public.user_profiles where id = auth.uid() and is_active = true
$function$;

create or replace function public.my_effective_roles()
returns text[]
language sql
stable security definer
as $function$
  select case
    when not exists (
      select 1 from user_profiles where id = auth.uid() and is_active = true
    ) then array[]::text[]
    else (
      select array_agg(distinct r) from (
        select role as r from user_profiles where id = auth.uid()
        union
        select role from user_role_grants
        where user_id = auth.uid() and revoked_at is null
          and (expires_at is null or expires_at > now())
      ) x
    )
  end
$function$;

create or replace function public.has_any_role(p_roles text[])
returns boolean
language sql
stable security definer
as $function$
  select exists (
    select 1 from user_profiles where id = auth.uid() and is_active = true
  ) and (
    exists (
      select 1 from user_profiles where id = auth.uid() and role = any(p_roles)
    ) or exists (
      select 1 from user_role_grants
      where user_id = auth.uid() and role = any(p_roles)
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    )
  )
$function$;

-- ── 2. Guard privileged columns on user_profiles ───────────────────────
-- SECURITY INVOKER on purpose, so current_user is the real caller:
-- 'authenticated'/'anon' via the API, 'service_role' for the Edge
-- Function (Task C), 'postgres' in the SQL editor and for the
-- SECURITY DEFINER handle_new_auth_user() trigger (confirmed live:
-- owned by postgres, so current_user becomes 'postgres' for the
-- duration of that function's execution — this bypass is correct and
-- was verified against the live function, not assumed).
--
-- Uses the PRIMARY role only (get_user_role() = 'md'). A secondary
-- 'md' grant through my_effective_roles()/has_any_role() does NOT
-- count as MD here — MD authority is never delegated.

create or replace function public.guard_user_profile_privileged_cols()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;                                   -- service_role / postgres
  end if;
  if public.get_user_role() is not distinct from 'md' then
    return new;                                   -- active MD may change anything
  end if;

  if tg_op = 'INSERT' then
    new.role      := 'staff';
    new.is_active := true;
    new.staff_id  := null;
    return new;
  end if;

  if new.role      is distinct from old.role
  or new.is_active is distinct from old.is_active
  or new.staff_id  is distinct from old.staff_id then
    raise exception 'Only the MD can change role, active status or staff link'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_user_profile_privileged_cols on public.user_profiles;
create trigger trg_guard_user_profile_privileged_cols
  before insert or update on public.user_profiles
  for each row execute function public.guard_user_profile_privileged_cols();

-- ── 3. Tighten grants (RLS still decides which rows) ───────────────────
-- Live grants before this migration: anon and authenticated both held
-- DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE.

revoke all on table public.user_profiles from anon;
revoke all on table public.user_profiles from authenticated;
grant select, insert, update, delete on table public.user_profiles to authenticated;

-- ── 4. Drop the superseded old policy set ──────────────────────────────
-- user_profiles_{select,insert,update,delete} (has_any_role()-based,
-- added with the PR #110 multi-role rollout) already cover every case
-- these did. Exact definitions preserved in the rollback file.

drop policy if exists "profiles_select" on public.user_profiles;
drop policy if exists "profiles_insert" on public.user_profiles;
drop policy if exists "profiles_update" on public.user_profiles;
drop policy if exists "profiles_delete" on public.user_profiles;

commit;
