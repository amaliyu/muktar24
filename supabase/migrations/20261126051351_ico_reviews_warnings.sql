-- The ICO reviews explained budget warnings (MD 26 Nov): "The ICO should be
-- the one reviewing as control officer, I get notified or he can escalate to
-- me if necessary."
-- * Each explained day becomes an item on the ICO's "Follow up and report"
--   task: close it, send a question back, or escalate to the MD.
-- * The MD is told (info) when a day is explained, closed or sent back by the ICO.
-- * New action 'escalate' (ICO): marks the day, notifies the MD to act.

alter table public.production_exceptions
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by_name text,
  add column if not exists escalation_note text;

alter table public.production_exception_comments drop constraint production_exception_comments_kind_check;
alter table public.production_exception_comments add constraint production_exception_comments_kind_check
  check (kind = any (array['explanation','comment','question','closed','system','escalation']));

create or replace function public.respond_production_exception(p_id uuid, p_action text, p_text text default null)
returns production_exceptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare e production_exceptions%rowtype; v_name text; v_role text; v_reviewer boolean; v_site_user boolean; v_site text; v_title text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into e from production_exceptions where id = p_id for update;
  if not found then raise exception 'Warning not found.'; end if;
  if not can_see_site(e.site_id) then raise exception 'Not allowed for this site.' using errcode = '42501'; end if;
  perform 1 from production_exceptions where site_id = e.site_id and date = e.date for update;
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  v_reviewer := has_any_role(array['md','ico']);
  v_site_user := fn_can_raise_for_site(e.site_id);
  select name into v_site from production_sites where id = e.site_id;
  v_title := 'Budget warning — ' || v_site || ', ' || to_char(e.date, 'DD Mon');

  if p_action = 'explain' then
    if not v_site_user then raise exception 'Only the site manager (or the MD) can explain this.' using errcode = '42501'; end if;
    if not exists (select 1 from production_exceptions where site_id = e.site_id and date = e.date and status in ('open','explained')) then
      raise exception 'This day''s warning is already closed.';
    end if;
    if length(trim(coalesce(p_text,''))) < 10 then raise exception 'Give a proper explanation (at least 10 characters).'; end if;
    update production_exceptions set status = 'explained', explanation = trim(p_text), explained_by_name = v_name,
           explained_at = now(), escalated_at = null, escalated_by_name = null, escalation_note = null, updated_at = now()
     where site_id = e.site_id and date = e.date and status in ('open','explained');
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, 'explanation', trim(p_text), auth.uid(), v_name, v_role);
    -- The ICO is told through his follow-up item (fn_warning_follow_up_comment); the MD is kept informed.
    perform fn_notify_role('md', 'info', 'Explained: ' || v_title, v_name || ': ' || trim(p_text) || ' — the ICO will review.', 'production_exceptions', p_id);

  elsif p_action in ('comment','ask') then
    if not (v_reviewer or v_site_user) then raise exception 'Not allowed to comment here.' using errcode = '42501'; end if;
    if length(trim(coalesce(p_text,''))) < 2 then raise exception 'Write the comment.'; end if;
    if p_action = 'ask' and not v_reviewer then raise exception 'Only the MD or ICO can send a question back.' using errcode = '42501'; end if;
    if p_action = 'ask' and not exists (select 1 from production_exceptions where site_id = e.site_id and date = e.date and status <> 'resolved') then
      raise exception 'This day''s warning was resolved by a correction.';
    end if;
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, case when p_action = 'ask' then 'question' else 'comment' end, trim(p_text), auth.uid(), v_name, v_role);
    if p_action = 'ask' then
      update production_exceptions set status = 'open', closed_by_name = null, closed_at = null, close_note = null,
             escalated_at = null, escalated_by_name = null, escalation_note = null, updated_at = now()
       where site_id = e.site_id and date = e.date and status <> 'resolved';
      perform fn_notify_site_users(e.site_id, 'action_required', 'Question: ' || v_title, v_name || ' asks: ' || trim(p_text), 'production_exceptions', p_id);
      if v_role = 'ico' then
        perform fn_notify_role('md', 'info', 'Sent back: ' || v_title, v_name || ' asks the site: ' || trim(p_text), 'production_exceptions', p_id);
      end if;
    elsif v_reviewer then
      perform fn_notify_site_users(e.site_id, 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    else
      perform fn_notify_role('md', 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
      perform fn_notify_role('ico', 'info', 'Comment: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);
    end if;
    update production_exceptions set updated_at = now() where site_id = e.site_id and date = e.date;

  elsif p_action = 'close' then
    if not v_reviewer then raise exception 'Only the MD or ICO can close a warning.' using errcode = '42501'; end if;
    if not exists (select 1 from production_exceptions where site_id = e.site_id and date = e.date and status in ('open','explained')) then
      raise exception 'This day''s warning is already closed.';
    end if;
    update production_exceptions set status = 'closed', closed_by_name = v_name, closed_at = now(),
           close_note = nullif(trim(p_text), ''), updated_at = now()
     where site_id = e.site_id and date = e.date and status in ('open','explained');
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, 'closed', coalesce(nullif(trim(p_text), ''), 'Closed.'), auth.uid(), v_name, v_role);
    perform fn_notify_site_users(e.site_id, 'approved', 'Closed: ' || v_title, v_name || coalesce(': ' || nullif(trim(p_text), ''), ' closed it.'), 'production_exceptions', p_id);
    if v_role = 'ico' then
      perform fn_notify_role('md', 'info', 'Closed by the ICO: ' || v_title, v_name || coalesce(': ' || nullif(trim(p_text), ''), ' closed it.'), 'production_exceptions', p_id);
    end if;

  elsif p_action = 'escalate' then
    if v_role is distinct from 'ico' then raise exception 'Only the ICO can escalate a warning to the MD.' using errcode = '42501'; end if;
    if not exists (select 1 from production_exceptions where site_id = e.site_id and date = e.date and status in ('open','explained')) then
      raise exception 'This day''s warning is already closed.';
    end if;
    if length(trim(coalesce(p_text,''))) < 10 then raise exception 'Say why the MD should decide (at least 10 characters).'; end if;
    update production_exceptions set escalated_at = now(), escalated_by_name = v_name, escalation_note = trim(p_text), updated_at = now()
     where site_id = e.site_id and date = e.date and status in ('open','explained');
    insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
    values (p_id, 'escalation', trim(p_text), auth.uid(), v_name, v_role);
    perform fn_notify_role('md', 'action_required', 'Escalated to you: ' || v_title, v_name || ': ' || trim(p_text), 'production_exceptions', p_id);

  else
    raise exception 'Unknown action: %', p_action;
  end if;

  select * into e from production_exceptions where id = p_id;
  return e;
end $function$;

create or replace function public.close_explained_exceptions(p_site_id uuid default null, p_note text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_name text; v_role text; v_n int;
begin
  if not has_any_role(array['md','ico']) then raise exception 'Only the MD or ICO can close warnings.'; end if;
  select full_name, role into v_name, v_role from user_profiles where id = auth.uid();
  with c as (
    update production_exceptions e set status = 'closed', closed_by_name = v_name, closed_at = now(),
           close_note = coalesce(nullif(btrim(p_note), ''), 'Closed with the other explained warnings.'), updated_at = now()
     where e.status = 'explained' and (p_site_id is null or e.site_id = p_site_id) and can_see_site(e.site_id)
    returning e.id)
  insert into production_exception_comments (exception_id, kind, body, author_id, author_name, author_role)
  select id, 'closed', coalesce(nullif(btrim(p_note), ''), 'Closed with the other explained warnings.'), auth.uid(), v_name, v_role from c;
  get diagnostics v_n = row_count;
  if v_role = 'ico' and v_n > 0 then
    perform fn_notify_role('md', 'info', 'Closed by the ICO: ' || v_n || ' explained warning line(s)',
      v_name || coalesce(': ' || nullif(btrim(p_note), ''), ' closed them with the other explained warnings.'), 'production_exceptions', null);
  end if;
  return v_n;
end $function$;

create or replace function public.fn_warning_follow_up_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare e production_exceptions%rowtype; v_site text; r record; v_review text;
begin
  select * into e from production_exceptions where id = new.exception_id;
  if not found then return null; end if;
  select name into v_site from production_sites where id = e.site_id;
  v_review := 'review:' || e.site_id || ':' || e.date;
  if new.kind = 'question' then
    perform fn_ico_follow_up_tick(v_review, 'Sent back to the site by ' || coalesce(new.author_name, 'the reviewer') || '.');
    perform fn_ico_follow_up_add('pe:' || e.id,
      split_part(v_site, ' ', 1) || ' ' || to_char(e.date, 'FMDD Mon') || ' ' || replace(e.parameter, '_', ' ') || ': answer '
        || coalesce(new.author_name, 'the reviewer') || '''s question — ' || left(new.body, 140),
      'production_exceptions', e.id);
  elsif new.kind = 'explanation' then
    for r in select id from production_exceptions where site_id = e.site_id and date = e.date loop
      perform fn_ico_follow_up_tick('pe:' || r.id, 'Answered by ' || coalesce(new.author_name, 'site manager') || '.');
    end loop;
    perform fn_ico_follow_up_add(v_review,
      split_part(v_site, ' ', 1) || ' ' || to_char(e.date, 'FMDD Mon') || ': review ' || coalesce(new.author_name, 'the site manager')
        || '''s explanation — close it, send a question back, or escalate to the MD. "' || left(new.body, 160) || '"',
      'production_exceptions', e.id);
  elsif new.kind = 'escalation' then
    perform fn_ico_follow_up_tick(v_review, 'Escalated to the MD.');
  end if;
  return null;
end $function$;

create or replace function public.fn_warning_follow_up_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status in ('closed','resolved') and old.status is distinct from new.status then
    perform fn_ico_follow_up_tick('pe:' || new.id, case when new.status = 'closed' then 'Warning closed.' else 'Warning cleared by a correction.' end);
    if not exists (select 1 from production_exceptions where site_id = new.site_id and date = new.date and status in ('open','explained')) then
      perform fn_ico_follow_up_tick('review:' || new.site_id || ':' || new.date,
        case when new.status = 'closed' then 'Closed by ' || coalesce(new.closed_by_name, 'the reviewer') || '.' else 'Cleared by a correction.' end);
    end if;
  end if;
  return null;
end $function$;

-- Days already explained and waiting: put them on the ICO's list now.
do $f$
declare r record;
begin
  for r in select distinct on (e.site_id, e.date) e.id, e.site_id, e.date, ps.name, e.explained_by_name, e.explanation
             from production_exceptions e join production_sites ps on ps.id = e.site_id
            where e.status = 'explained'
            order by e.site_id, e.date, e.parameter loop
    perform fn_ico_follow_up_add('review:' || r.site_id || ':' || r.date,
      split_part(r.name, ' ', 1) || ' ' || to_char(r.date, 'FMDD Mon') || ': review ' || coalesce(r.explained_by_name, 'the site manager')
        || '''s explanation — close it, send a question back, or escalate to the MD. "' || left(coalesce(r.explanation, ''), 160) || '"',
      'production_exceptions', r.id);
  end loop;
end $f$;
