-- Applied to production 2026-11-11 by the planning chat (recorded here afterwards).
-- Fixes "duplicate key value violates unique constraint uq_active_role_grant" when re-granting a role
-- whose earlier grant had lapsed but was never revoked.
CREATE OR REPLACE FUNCTION public.grant_user_role(p_user_id uuid, p_role text, p_reason text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS user_role_grants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text; v_actor_role text;
  v_target_role text; v_row user_role_grants;
  v_expires timestamptz;
  v_live_expiry timestamptz; v_live_found boolean := false;
BEGIN
  SELECT full_name, role INTO v_actor_name, v_actor_role FROM user_profiles WHERE id = v_actor;
  IF v_actor_role IS DISTINCT FROM 'md' THEN
    RAISE EXCEPTION 'Only the MD may grant additional roles';
  END IF;
  IF p_role = 'md' THEN
    RAISE EXCEPTION 'The MD role cannot be delegated — only one MD at a time';
  END IF;

  SELECT role INTO v_target_role FROM user_profiles WHERE id = p_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'No such user profile'; END IF;
  IF v_target_role = p_role THEN
    RAISE EXCEPTION 'User already holds % as their primary role', p_role;
  END IF;

  v_expires := COALESCE(p_expires_at, now() + interval '90 days');
  IF v_expires = 'infinity'::timestamptz THEN v_expires := NULL; END IF;
  IF v_expires IS NOT NULL AND v_expires <= now() THEN
    RAISE EXCEPTION 'Expiry date is already in the past — pick a future date';
  END IF;

  -- Close out lapsed grants that were never revoked; they block the unique index
  -- while conferring no access (has_any_role already ignores them).
  UPDATE user_role_grants
     SET revoked_at = expires_at,
         revoked_by_name = 'System (expired)'
   WHERE user_id = p_user_id AND role = p_role
     AND revoked_at IS NULL
     AND expires_at IS NOT NULL AND expires_at <= now();

  SELECT true, expires_at INTO v_live_found, v_live_expiry
    FROM user_role_grants
   WHERE user_id = p_user_id AND role = p_role AND revoked_at IS NULL
   LIMIT 1;
  IF v_live_found THEN
    RAISE EXCEPTION 'This user already has an active % grant (expires %). Revoke it first to change the expiry.',
      p_role, COALESCE(to_char(v_live_expiry AT TIME ZONE 'Africa/Lagos', 'DD Mon YYYY'), 'never');
  END IF;

  INSERT INTO user_role_grants (user_id, role, granted_by, granted_by_name, reason, expires_at)
  VALUES (p_user_id, p_role, v_actor, v_actor_name, p_reason, v_expires)
  RETURNING * INTO v_row;
  RETURN v_row;
END; $function$;

-- One-time tidy: mark all currently lapsed, unrevoked grants as expired.
UPDATE public.user_role_grants
   SET revoked_at = expires_at, revoked_by_name = 'System (expired)'
 WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now();

REVOKE ALL ON FUNCTION public.grant_user_role(uuid,text,text,timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.grant_user_role(uuid,text,text,timestamptz) TO authenticated;
