-- MD 2026-11-19: (1) payment-request actions honour granted roles (Kayode holds accountant + HR grants);
-- ICO and accountant may backfill historical spending. (2) Staff tasks assigned by the MD, shown on the assignee's
-- profile, with a daily reminder until done (overdue copies to the MD).

-- 1. Granted roles count in payment-request actions ----------------------------------------------------------------------
do $$
declare d text;
begin
  d := pg_get_functiondef('public.advance_payment_request(uuid,text,text,uuid)'::regprocedure);
  d := regexp_replace(d, 'v_role NOT IN \(([^)]*)\)', 'NOT has_any_role(array[\1])', 'g');
  d := regexp_replace(d, 'v_role <> (''\w+'')', 'NOT has_any_role(array[\1])', 'g');
  if d ~ 'v_role (NOT IN|<>)' then raise exception 'advance_payment_request: a role check was not converted'; end if;
  execute d;

  d := pg_get_functiondef('public.backfill_payment_request(uuid,numeric,text,date,text,text,text,text,text,uuid,text,uuid,uuid)'::regprocedure);
  if position('v_role NOT IN (''production_manager'',''logistics_manager'',''bdm'',''hr_officer'',''md'')' in d) = 0 then
    raise exception 'backfill_payment_request: expected role check not found';
  end if;
  d := replace(d, 'v_role NOT IN (''production_manager'',''logistics_manager'',''bdm'',''hr_officer'',''md'')',
                  'NOT has_any_role(array[''production_manager'',''logistics_manager'',''bdm'',''hr_officer'',''md'',''accountant'',''ico''])');
  execute d;
end $$;

-- 2. Staff tasks ----------------------------------------------------------------------------------------------------------
create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  assigned_to uuid not null references public.user_profiles(id),
  title text not null check (length(btrim(title)) > 0),
  details text,
  due_on date,
  kind text not null default 'manual' check (kind in ('manual','pr_closure')),
  target_ids uuid[],
  checklist jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','submitted','done','cancelled')),
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  done_at timestamptz,
  done_by uuid references public.user_profiles(id),
  last_reminded_on date,
  constraint staff_tasks_pr_targets check (kind <> 'pr_closure' or coalesce(cardinality(target_ids), 0) > 0)
);
create index if not exists staff_tasks_assignee_status on public.staff_tasks (assigned_to, status);

create table if not exists public.staff_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks(id) on delete cascade,
  actor_id uuid,
  actor_name text,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists staff_task_events_task on public.staff_task_events (task_id, created_at);

alter table public.staff_tasks enable row level security;
alter table public.staff_task_events enable row level security;
drop policy if exists staff_tasks_select on public.staff_tasks;
create policy staff_tasks_select on public.staff_tasks for select to authenticated
  using (assigned_to = auth.uid() or has_any_role(array['md']));
drop policy if exists staff_task_events_select on public.staff_task_events;
create policy staff_task_events_select on public.staff_task_events for select to authenticated
  using (exists (select 1 from public.staff_tasks t where t.id = task_id and (t.assigned_to = auth.uid() or has_any_role(array['md']))));
-- No insert/update/delete policies: all writes go through the functions below.

create or replace function public.fn_staff_task_progress(p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t staff_tasks%rowtype; r jsonb;
begin
  select * into t from staff_tasks where id = p_task_id;
  if not found then return null; end if;
  if t.kind = 'pr_closure' then
    select jsonb_build_object(
      'total', cardinality(t.target_ids),
      'remaining', count(*) filter (where p.status <> 'closed'),
      'remaining_amount', coalesce(sum(p.amount) filter (where p.status <> 'closed'), 0),
      'remaining_with_receipt', count(*) filter (where p.status <> 'closed'
          and exists (select 1 from payment_request_attachments a where a.payment_request_id = p.id)))
      into r from payment_requests p where p.id = any(t.target_ids);
  else
    select jsonb_build_object('total', count(*), 'remaining', count(*) filter (where not coalesce((i->>'done')::boolean, false)))
      into r from jsonb_array_elements(t.checklist) i;
  end if;
  return r;
end $$;

create or replace function public.fn_staff_task_progress_text(p_task_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t staff_tasks%rowtype; p jsonb; v text;
begin
  select * into t from staff_tasks where id = p_task_id;
  if not found then return null; end if;
  p := fn_staff_task_progress(p_task_id);
  if t.kind = 'pr_closure' then
    v := (p->>'remaining') || ' of ' || (p->>'total') || ' still open (₦' || to_char((p->>'remaining_amount')::numeric, 'FM999,999,999,990') || ')';
  elsif (p->>'total')::int > 0 then
    v := ((p->>'total')::int - (p->>'remaining')::int) || ' of ' || (p->>'total') || ' done';
  else
    v := 'Not yet marked done';
  end if;
  if t.due_on is not null and t.status = 'open' then
    v := v || '. Due ' || to_char(t.due_on, 'FMDD Mon')
           || case when t.due_on < lagos_today() then ' — overdue by ' || (lagos_today() - t.due_on) || ' day' || case when lagos_today() - t.due_on = 1 then '' else 's' end else '' end;
  end if;
  return v || '.';
end $$;

create or replace function public.fn_staff_task_event(p_task_id uuid, p_action text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into staff_task_events (task_id, actor_id, actor_name, action, note)
  values (p_task_id, auth.uid(), coalesce((select full_name from user_profiles where id = auth.uid()), 'System'), p_action, nullif(btrim(p_note), ''));
end $$;

create or replace function public.list_staff_tasks(p_include_closed boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  return coalesce((
    select jsonb_agg(
      (to_jsonb(t) - 'target_ids') || jsonb_build_object(
        'assigned_to_name', up.full_name,
        'progress', fn_staff_task_progress(t.id),
        'progress_text', fn_staff_task_progress_text(t.id),
        'overdue', (t.status = 'open' and t.due_on is not null and t.due_on < lagos_today()),
        'open_requests', case when t.kind = 'pr_closure' then (
            select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference, 'amount', p.amount, 'purpose', p.purpose,
                     'payee', coalesce(s.company_name, p.payee_name), 'status', p.status, 'category', c.name,
                     'has_receipt', exists (select 1 from payment_request_attachments a where a.payment_request_id = p.id))
                   order by p.reference), '[]'::jsonb)
              from payment_requests p left join suppliers s on s.id = p.supplier_id left join expense_categories c on c.id = p.expense_category_id
             where p.id = any(t.target_ids) and p.status <> 'closed') end,
        'events', (select coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'note', e.note, 'actor_name', e.actor_name, 'created_at', e.created_at)
                     order by e.created_at desc), '[]'::jsonb) from staff_task_events e where e.task_id = t.id))
      order by (t.status = 'open') desc, t.due_on nulls last, t.created_at)
    from staff_tasks t join user_profiles up on up.id = t.assigned_to
    where (t.assigned_to = auth.uid() or has_any_role(array['md']))
      and (p_include_closed or t.status in ('open','submitted'))), '[]'::jsonb);
end $$;

create or replace function public.create_staff_task(p_assigned_to uuid, p_title text, p_details text default null, p_due_on date default null,
  p_checklist text[] default null, p_kind text default 'manual', p_target_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_items jsonb;
begin
  if not has_any_role(array['md']) then raise exception 'Only the MD can assign tasks.'; end if;
  if not exists (select 1 from user_profiles where id = p_assigned_to and is_active) then raise exception 'That person has no active login.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give the task a title.'; end if;
  if p_due_on is not null and p_due_on < lagos_today() then raise exception 'The due date cannot be in the past.'; end if;
  if p_kind not in ('manual','pr_closure') then raise exception 'Unknown task type.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', 'i' || ord, 'label', btrim(lbl), 'done', false) order by ord), '[]'::jsonb)
    into v_items from unnest(coalesce(p_checklist, array[]::text[])) with ordinality as x(lbl, ord) where btrim(lbl) <> '';
  insert into staff_tasks (assigned_to, title, details, due_on, kind, target_ids, checklist, created_by)
  values (p_assigned_to, btrim(p_title), nullif(btrim(p_details), ''), p_due_on, p_kind,
          case when p_kind = 'pr_closure' then p_target_ids end, v_items, auth.uid())
  returning id into v_id;
  perform fn_staff_task_event(v_id, 'created', null);
  perform fn_create_notification(p_assigned_to, 'action_required', 'New task from the MD', btrim(p_title) || '. ' || fn_staff_task_progress_text(v_id), 'staff_tasks', v_id);
  return v_id;
end $$;

create or replace function public.tick_staff_task_item(p_task_id uuid, p_key text, p_done boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t staff_tasks%rowtype; v_label text; v_name text; v_remaining int;
begin
  select * into t from staff_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  if not (t.assigned_to = auth.uid() or has_any_role(array['md'])) then raise exception 'This is not your task.'; end if;
  if t.status not in ('open','submitted') then raise exception 'This task is already %.', t.status; end if;
  if t.kind <> 'manual' then raise exception 'This task finishes by itself when the work is done.'; end if;
  select i->>'label' into v_label from jsonb_array_elements(t.checklist) i where i->>'key' = p_key;
  if v_label is null then raise exception 'Checklist item not found.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  update staff_tasks set checklist = (
      select jsonb_agg(case when i->>'key' = p_key
                            then i || jsonb_build_object('done', p_done, 'done_at', case when p_done then now() end, 'done_by', case when p_done then v_name end)
                            else i end order by ord)
        from jsonb_array_elements(t.checklist) with ordinality as x(i, ord)),
      updated_at = now()
   where id = p_task_id;
  perform fn_staff_task_event(p_task_id, case when p_done then 'ticked' else 'unticked' end, v_label || coalesce(' — ' || nullif(btrim(p_note), ''), ''));
  v_remaining := (fn_staff_task_progress(p_task_id)->>'remaining')::int;
  if v_remaining = 0 and t.status = 'open' then
    update staff_tasks set status = 'submitted', submitted_at = now(), updated_at = now() where id = p_task_id;
    perform fn_staff_task_event(p_task_id, 'submitted', null);
    perform fn_notify_role('md', 'action_required', 'Task ready for your confirmation', v_name || ' finished: ' || t.title, 'staff_tasks', p_task_id);
  elsif v_remaining > 0 and t.status = 'submitted' then
    update staff_tasks set status = 'open', submitted_at = null, updated_at = now() where id = p_task_id;
  end if;
  return fn_staff_task_progress(p_task_id);
end $$;

create or replace function public.submit_staff_task(p_task_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t staff_tasks%rowtype;
begin
  select * into t from staff_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  if t.assigned_to <> auth.uid() then raise exception 'Only the person the task is assigned to can mark it done.'; end if;
  if t.status <> 'open' then raise exception 'This task is already %.', t.status; end if;
  if t.kind <> 'manual' then raise exception 'This task finishes by itself when the work is done.'; end if;
  if (fn_staff_task_progress(p_task_id)->>'remaining')::int > 0 then raise exception 'Tick every item first.'; end if;
  update staff_tasks set status = 'submitted', submitted_at = now(), updated_at = now() where id = p_task_id;
  perform fn_staff_task_event(p_task_id, 'submitted', p_note);
  perform fn_notify_role('md', 'action_required', 'Task ready for your confirmation',
    (select full_name from user_profiles where id = auth.uid()) || ' finished: ' || t.title, 'staff_tasks', p_task_id);
end $$;

create or replace function public.review_staff_task(p_task_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t staff_tasks%rowtype;
begin
  if not has_any_role(array['md']) then raise exception 'Only the MD can confirm, return or cancel tasks.'; end if;
  select * into t from staff_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  if t.status not in ('open','submitted') then raise exception 'This task is already %.', t.status; end if;
  if p_action = 'confirm' then
    update staff_tasks set status = 'done', done_at = now(), done_by = auth.uid(), updated_at = now() where id = p_task_id;
    perform fn_staff_task_event(p_task_id, 'confirmed', p_note);
    perform fn_create_notification(t.assigned_to, 'approved', 'Task confirmed', t.title, 'staff_tasks', p_task_id);
  elsif p_action = 'return' then
    if coalesce(btrim(p_note), '') = '' then raise exception 'Say what still needs doing.'; end if;
    if t.status <> 'submitted' then raise exception 'Only a task marked done can be returned.'; end if;
    update staff_tasks set status = 'open', submitted_at = null, updated_at = now() where id = p_task_id;
    perform fn_staff_task_event(p_task_id, 'returned', p_note);
    perform fn_create_notification(t.assigned_to, 'rejected', 'Task returned by the MD', t.title || ': ' || btrim(p_note), 'staff_tasks', p_task_id);
  elsif p_action = 'cancel' then
    if coalesce(btrim(p_note), '') = '' then raise exception 'Give a reason for cancelling.'; end if;
    update staff_tasks set status = 'cancelled', updated_at = now() where id = p_task_id;
    perform fn_staff_task_event(p_task_id, 'cancelled', p_note);
    perform fn_create_notification(t.assigned_to, 'info', 'Task cancelled', t.title || ': ' || btrim(p_note), 'staff_tasks', p_task_id);
  else
    raise exception 'Unknown action.';
  end if;
end $$;

create or replace function public.comment_staff_task(p_task_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare t staff_tasks%rowtype; v_name text;
begin
  select * into t from staff_tasks where id = p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  if not (t.assigned_to = auth.uid() or has_any_role(array['md'])) then raise exception 'This is not your task.'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Write a comment.'; end if;
  select full_name into v_name from user_profiles where id = auth.uid();
  perform fn_staff_task_event(p_task_id, 'comment', p_note);
  if t.assigned_to = auth.uid() then
    perform fn_notify_role('md', 'info', 'Comment on task: ' || t.title, v_name || ': ' || btrim(p_note), 'staff_tasks', p_task_id);
  else
    perform fn_create_notification(t.assigned_to, 'info', 'MD comment on your task', t.title || ': ' || btrim(p_note), 'staff_tasks', p_task_id);
  end if;
end $$;

create or replace function public.fn_staff_task_auto_done(p_task_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare t staff_tasks%rowtype;
begin
  select * into t from staff_tasks where id = p_task_id for update;
  if not found or t.kind <> 'pr_closure' or t.status <> 'open' then return false; end if;
  if (fn_staff_task_progress(p_task_id)->>'remaining')::int > 0 then return false; end if;
  update staff_tasks set status = 'done', done_at = now(), updated_at = now() where id = p_task_id;
  insert into staff_task_events (task_id, actor_id, actor_name, action, note) values (p_task_id, null, 'System', 'auto_done', 'Every request on the list is closed.');
  perform fn_create_notification(t.assigned_to, 'approved', 'Task complete', t.title, 'staff_tasks', p_task_id);
  perform fn_notify_role('md', 'info', 'Task complete', (select full_name from user_profiles where id = t.assigned_to) || ' finished: ' || t.title, 'staff_tasks', p_task_id);
  return true;
end $$;

create or replace function public.fn_staff_task_pr_closed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    for v_id in select id from staff_tasks where kind = 'pr_closure' and status = 'open' and new.id = any(target_ids) loop
      perform fn_staff_task_auto_done(v_id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists trg_zz_staff_task_pr_closed on public.payment_requests;
create trigger trg_zz_staff_task_pr_closed after update of status on public.payment_requests
  for each row execute function public.fn_staff_task_pr_closed();

create or replace function public.run_staff_task_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare t staff_tasks%rowtype; v_n int := 0; v_txt text; v_who text;
begin
  for t in select * from staff_tasks where status in ('open','submitted') and (last_reminded_on is null or last_reminded_on < lagos_today()) loop
    if t.kind = 'pr_closure' and fn_staff_task_auto_done(t.id) then continue; end if;
    v_txt := fn_staff_task_progress_text(t.id);
    select full_name into v_who from user_profiles where id = t.assigned_to;
    if t.status = 'open' then
      perform fn_create_notification(t.assigned_to, 'action_required', 'Reminder: ' || t.title, v_txt, 'staff_tasks', t.id);
      if t.due_on is not null and t.due_on < lagos_today() then
        perform fn_notify_role('md', 'action_required', 'Overdue task: ' || t.title, v_who || ' — ' || v_txt, 'staff_tasks', t.id);
      end if;
    else
      perform fn_notify_role('md', 'action_required', 'Task awaiting your confirmation', v_who || ': ' || t.title, 'staff_tasks', t.id);
    end if;
    update staff_tasks set last_reminded_on = lagos_today() where id = t.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.fn_staff_task_progress(uuid), public.fn_staff_task_progress_text(uuid), public.fn_staff_task_event(uuid,text,text),
  public.fn_staff_task_auto_done(uuid), public.fn_staff_task_pr_closed(), public.run_staff_task_reminders() from public, anon, authenticated;
revoke all on function public.list_staff_tasks(boolean), public.create_staff_task(uuid,text,text,date,text[],text,uuid[]),
  public.tick_staff_task_item(uuid,text,boolean,text), public.submit_staff_task(uuid,text), public.review_staff_task(uuid,text,text),
  public.comment_staff_task(uuid,text) from public, anon;
grant execute on function public.list_staff_tasks(boolean), public.create_staff_task(uuid,text,text,date,text[],text,uuid[]),
  public.tick_staff_task_item(uuid,text,boolean,text), public.submit_staff_task(uuid,text), public.review_staff_task(uuid,text,text),
  public.comment_staff_task(uuid,text) to authenticated;

-- Daily at 08:00 Lagos (07:00 UTC)
select cron.schedule('staff-task-reminders-daily', '0 7 * * *', 'select public.run_staff_task_reminders()');
