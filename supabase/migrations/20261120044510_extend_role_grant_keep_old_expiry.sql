-- Record the previous end date when a grant is extended.
create or replace function public.extend_role_grant(p_grant_id uuid, p_new_expires_at timestamptz, p_note text default null)
returns user_role_grants language plpgsql security definer set search_path = public as $$
declare g user_role_grants%rowtype; v_old timestamptz; v_name text; v_role text;
begin
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  if v_role is distinct from 'md' then raise exception 'Only the MD can extend access.'; end if;
  select * into g from user_role_grants where id = p_grant_id for update;
  if not found then raise exception 'Access record not found.'; end if;
  if g.revoked_at is not null then raise exception 'This access was removed. Grant it again instead.'; end if;
  if g.expires_at is not null and g.expires_at <= now() then raise exception 'This access has already ended. Grant it again instead.'; end if;
  if p_new_expires_at is null then raise exception 'Choose the new end date.'; end if;
  if p_new_expires_at <= now() then raise exception 'The new end date must be in the future.'; end if;
  if g.expires_at is not null and p_new_expires_at <= g.expires_at then
    raise exception 'The new end date must be after the current one (%).', to_char(g.expires_at at time zone 'Africa/Lagos', 'FMDD Mon YYYY');
  end if;
  v_old := g.expires_at;
  update user_role_grants set expires_at = p_new_expires_at where id = p_grant_id returning * into g;
  insert into role_grant_events (grant_id, action, old_expires_at, new_expires_at, actor_id, actor_name, note)
  values (p_grant_id, 'extended', v_old, p_new_expires_at, auth.uid(), v_name, nullif(btrim(p_note), ''));
  perform fn_create_notification(g.user_id, 'approved', 'Your ' || fn_role_label(g.role) || ' access was extended',
    'It now ends on ' || to_char(p_new_expires_at at time zone 'Africa/Lagos', 'FMDD Mon YYYY') || '.', 'user_role_grants', g.id);
  return g;
end $$;
revoke all on function public.extend_role_grant(uuid,timestamptz,text) from public, anon;
grant execute on function public.extend_role_grant(uuid,timestamptz,text) to authenticated;
