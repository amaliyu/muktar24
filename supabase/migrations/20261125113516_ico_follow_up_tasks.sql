-- MD 2026-11-25: "On all cases of follow ups notify the ICO and add it as a task for him to follow up and report."
-- One standing ICO task "Follow up and report" collects every follow-up as a checklist item. Questions sent back on
-- budget warnings are added automatically; the item ticks itself when the site manager answers or the warning is
-- closed/cleared. The MD can add any other follow-up with add_ico_follow_up(). The ICO submits the task with a report.

create or replace function public.fn_ico_follow_up_add(p_key text, p_label text, p_link_table text default null, p_link_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ico uuid; v_task staff_tasks%rowtype; v_id uuid;
begin
  select id into v_ico from user_profiles where role = 'ico' and is_active order by created_at limit 1;
  if v_ico is null then return null; end if;
  select * into v_task from staff_tasks
   where assigned_to = v_ico and title = 'Follow up and report' and status in ('open','submitted')
   order by created_at desc limit 1 for update;
  if not found then
    insert into staff_tasks (assigned_to, title, details, due_on, kind, checklist, created_by)
    values (v_ico, 'Follow up and report',
            'Follow up each item with the person responsible until it is done, tick it, and report to the MD (Submit with a short report of what was done and what is still outstanding). Items tick themselves when a site manager answers a warning question.',
            lagos_today() + 2, 'manual', '[]'::jsonb, auth.uid())
    returning * into v_task;
    perform fn_staff_task_event(v_task.id, 'created', null);
  end if;
  v_id := v_task.id;
  if exists (select 1 from jsonb_array_elements(v_task.checklist) i where i->>'key' = p_key) then
    update staff_tasks set checklist = (select jsonb_agg(case when i->>'key' = p_key
                                         then jsonb_build_object('key', p_key, 'label', p_label, 'done', false) else i end)
                                       from jsonb_array_elements(checklist) i),
           status = 'open', due_on = greatest(coalesce(due_on, lagos_today()), lagos_today() + 2), updated_at = now()
     where id = v_id;
  else
    update staff_tasks set checklist = checklist || jsonb_build_array(jsonb_build_object('key', p_key, 'label', p_label, 'done', false)),
           status = 'open', due_on = greatest(coalesce(due_on, lagos_today()), lagos_today() + 2), updated_at = now()
     where id = v_id;
  end if;
  perform fn_staff_task_event(v_id, 'item_added', p_label);
  perform fn_create_notification(v_ico, 'action_required', 'Follow up: ' || left(p_label, 80),
    p_label || ' — follow up and report to the MD.', coalesce(p_link_table, 'staff_tasks'), coalesce(p_link_id, v_id));
  return v_id;
end $$;
revoke all on function public.fn_ico_follow_up_add(text, text, text, uuid) from public, anon, authenticated;

create or replace function public.fn_ico_follow_up_tick(p_key text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  for t in select id from staff_tasks where title = 'Follow up and report' and status in ('open','submitted')
             and exists (select 1 from jsonb_array_elements(checklist) i where i->>'key' = p_key and not coalesce((i->>'done')::boolean, false)) loop
    update staff_tasks set checklist = (select jsonb_agg(case when i->>'key' = p_key
                     then i || jsonb_build_object('done', true, 'done_at', now(), 'done_by', 'App', 'note', p_note) else i end)
                   from jsonb_array_elements(checklist) i), updated_at = now()
     where id = t.id;
    perform fn_staff_task_event(t.id, 'item_done', p_note);
  end loop;
end $$;
revoke all on function public.fn_ico_follow_up_tick(text, text) from public, anon, authenticated;

-- MD (or ICO) adds any other follow-up.
create or replace function public.add_ico_follow_up(p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not has_any_role(array['md','ico']) then raise exception 'Only the MD or ICO can add follow-ups.'; end if;
  if length(btrim(coalesce(p_label, ''))) < 5 then raise exception 'Describe the follow-up.'; end if;
  return fn_ico_follow_up_add('m:' || md5(btrim(p_label)), btrim(p_label));
end $$;
revoke all on function public.add_ico_follow_up(text) from public, anon;
grant execute on function public.add_ico_follow_up(text) to authenticated;

-- Warning questions → follow-up item; answers → tick.
create or replace function public.fn_warning_follow_up_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare e production_exceptions%rowtype; v_site text; r record;
begin
  select * into e from production_exceptions where id = new.exception_id;
  if not found then return null; end if;
  select name into v_site from production_sites where id = e.site_id;
  if new.kind = 'question' then
    perform fn_ico_follow_up_add('pe:' || e.id,
      split_part(v_site, ' ', 1) || ' ' || to_char(e.date, 'FMDD Mon') || ' ' || e.parameter || ': answer the MD''s question — ' || left(new.body, 140),
      'production_exceptions', e.id);
  elsif new.kind = 'explanation' then
    for r in select id from production_exceptions where site_id = e.site_id and date = e.date loop
      perform fn_ico_follow_up_tick('pe:' || r.id, 'Answered by ' || coalesce(new.author_name, 'site manager') || '.');
    end loop;
  end if;
  return null;
end $$;
create trigger trg_warning_follow_up_comment after insert on public.production_exception_comments
  for each row execute function fn_warning_follow_up_comment();

create or replace function public.fn_warning_follow_up_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('closed','resolved') and old.status is distinct from new.status then
    perform fn_ico_follow_up_tick('pe:' || new.id, case when new.status = 'closed' then 'Warning closed.' else 'Warning cleared by a correction.' end);
  end if;
  return null;
end $$;
create trigger trg_warning_follow_up_status after update of status on public.production_exceptions
  for each row execute function fn_warning_follow_up_status();
