-- ============================================================
-- Rollback for 20261004000000_user_profiles_privilege_guard.sql
--
-- Restores the exact pre-migration live state captured 2026-10-04.
-- Kept out of supabase/migrations/ so the CLI never runs this
-- automatically — apply by hand only if the guard needs to be reverted.
-- ============================================================

begin;

-- ── 4. Restore the old (superseded) policy set ─────────────────────────
-- Exact live definitions as of 2026-10-04, before this migration dropped
-- them. The newer user_profiles_* policies are untouched by this
-- rollback and remain in place either way.

create policy "profiles_select" on public.user_profiles
  for select
  to authenticated
  using (id = auth.uid() or get_user_role() = 'md');

create policy "profiles_insert" on public.user_profiles
  for insert
  to authenticated
  with check (id = auth.uid() or get_user_role() = 'md');

create policy "profiles_update" on public.user_profiles
  for update
  to authenticated
  using (id = auth.uid() or get_user_role() = 'md')
  with check (id = auth.uid() or get_user_role() = 'md');

create policy "profiles_delete" on public.user_profiles
  for delete
  to authenticated
  using (get_user_role() = 'md');

-- ── 3. Restore grants ───────────────────────────────────────────────────
-- Live pre-migration grant was effectively GRANT ALL TO anon, authenticated.
-- Restoring authenticated unconditionally; anon is commented out by
-- default since RLS blocked it in practice even before this migration —
-- uncomment only if something genuinely requires it (it should not).

grant all on table public.user_profiles to authenticated;
-- grant all on table public.user_profiles to anon;

-- ── 2. Drop the guard trigger ───────────────────────────────────────────

drop trigger if exists trg_guard_user_profile_privileged_cols on public.user_profiles;
drop function if exists public.guard_user_profile_privileged_cols();

-- ── 1. Restore the three functions to their pre-migration bodies ──────
-- Exact live bodies captured 2026-10-04, before the is_active gate was
-- added.

create or replace function public.get_user_role()
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select role from public.user_profiles where id = auth.uid()
$function$;

create or replace function public.my_effective_roles()
returns text[]
language sql
stable security definer
as $function$
  select array_agg(distinct r) from (
    select role as r from user_profiles where id = auth.uid()
    union
    select role from user_role_grants
    where user_id = auth.uid() and revoked_at is null
      and (expires_at is null or expires_at > now())
  ) x;
$function$;

create or replace function public.has_any_role(p_roles text[])
returns boolean
language sql
stable security definer
as $function$
  select exists (
    select 1 from user_profiles where id = auth.uid() and role = any(p_roles)
  ) or exists (
    select 1 from user_role_grants
    where user_id = auth.uid() and role = any(p_roles)
      and revoked_at is null
      and (expires_at is null or expires_at > now())
  );
$function$;

commit;
