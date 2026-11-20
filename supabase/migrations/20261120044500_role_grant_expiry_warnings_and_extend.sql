-- MD 2026-11-20: warn before granted roles end (Kayode accountant + Abubakar assistant PM both end 31 Dec), and let the MD
-- extend a grant in one step instead of revoke + re-grant.

create table if not exists public.role_grant_events (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.user_role_grants(id) on delete cascade,
  action text not null check (action in ('extended','warned_14','warned_3','ended_notice')),
  old_expires_at timestamptz,
  new_expires_at timestamptz,
  actor_id uuid,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists role_grant_events_grant on public.role_grant_events (grant_id, created_at);
-- One warning of each kind per end date (an extension moves the end date, so warnings can fire again).
create unique index if not exists role_grant_events_one_warning on public.role_grant_events (grant_id, action, new_expires_at) where action <> 'extended';
alter table public.role_grant_events enable row level security;
drop policy if exists role_grant_events_select on public.role_grant_events;
create policy role_grant_events_select on public.role_grant_events for select to authenticated
  using (has_any_role(array['md','ico','board_member','hr_officer'])
         or exists (select 1 from public.user_role_grants g where g.id = grant_id and g.user_id = auth.uid()));

create or replace function public.fn_role_label(p_role text)
returns text language sql immutable as $$
  select case p_role
    when 'md' then 'MD' when 'ico' then 'ICO' when 'bdm' then 'BDM' when 'hr_officer' then 'HR Officer'
    else initcap(replace(p_role, '_', ' ')) end
$$;

create or replace function public.extend_role_grant(p_grant_id uuid, p_new_expires_at timestamptz, p_note text default null)
returns user_role_grants language plpgsql security definer set search_path = public as $$
declare g user_role_grants%rowtype; v_name text; v_role text;
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
  update user_role_grants set expires_at = p_new_expires_at where id = p_grant_id returning * into g;
  insert into role_grant_events (grant_id, action, old_expires_at, new_expires_at, actor_id, actor_name, note)
  values (p_grant_id, 'extended', (select old_expires_at from (select null::timestamptz as old_expires_at) x), p_new_expires_at, auth.uid(), v_name, nullif(btrim(p_note), ''));
  perform fn_create_notification(g.user_id, 'approved', 'Your ' || fn_role_label(g.role) || ' access was extended',
    'It now ends on ' || to_char(p_new_expires_at at time zone 'Africa/Lagos', 'FMDD Mon YYYY') || '.', 'user_role_grants', g.id);
  return g;
end $$;

create or replace function public.run_role_grant_expiry_warnings()
returns int language plpgsql security definer set search_path = public as $$
declare g record; v_today date := lagos_today(); v_end date; v_days int; v_action text; v_n int := 0; v_id uuid; v_role text; v_when text;
begin
  for g in select rg.*, up.full_name from user_role_grants rg join user_profiles up on up.id = rg.user_id
            where rg.revoked_at is null and rg.expires_at is not null and rg.expires_at > now() - interval '7 days' loop
    v_end := (g.expires_at at time zone 'Africa/Lagos')::date;
    v_days := v_end - v_today;
    v_action := case when g.expires_at <= now() then 'ended_notice'
                     when v_days <= 3 then 'warned_3'
                     when v_days <= 14 then 'warned_14' end;
    continue when v_action is null;
    insert into role_grant_events (grant_id, action, new_expires_at, actor_name)
    values (g.id, v_action, g.expires_at, 'System')
    on conflict (grant_id, action, new_expires_at) where action <> 'extended' do nothing
    returning id into v_id;
    continue when v_id is null;
    v_role := fn_role_label(g.role);
    v_when := to_char(v_end, 'FMDD Mon');
    if v_action = 'ended_notice' then
      perform fn_create_notification(g.user_id, 'info', 'Your ' || v_role || ' access has ended',
        'It ended on ' || v_when || '. Ask the MD if you still need it.', 'user_role_grants', g.id);
      perform fn_notify_role('md', 'info', g.full_name || '''s ' || v_role || ' access has ended',
        'Ended on ' || v_when || '. Grant it again in User Management if still needed.', 'user_role_grants', g.id);
    else
      perform fn_create_notification(g.user_id, 'action_required', 'Your ' || v_role || ' access ends on ' || v_when,
        case when v_days = 0 then 'Today.' when v_days = 1 then 'Tomorrow.' else 'In ' || v_days || ' days.' end || ' Ask the MD if you still need it.',
        'user_role_grants', g.id);
      perform fn_notify_role('md', 'action_required', g.full_name || '''s ' || v_role || ' access ends on ' || v_when,
        case when v_days = 0 then 'Today.' when v_days = 1 then 'Tomorrow.' else 'In ' || v_days || ' days.' end || ' Extend it in User Management if still needed.',
        'user_role_grants', g.id);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.extend_role_grant(uuid,timestamptz,text) from public, anon;
grant execute on function public.extend_role_grant(uuid,timestamptz,text) to authenticated;
revoke all on function public.run_role_grant_expiry_warnings() from public, anon, authenticated;

-- Daily 08:10 Lagos (07:10 UTC)
select cron.schedule('role-grant-expiry-warnings-daily', '10 7 * * *', 'select public.run_role_grant_expiry_warnings()');
