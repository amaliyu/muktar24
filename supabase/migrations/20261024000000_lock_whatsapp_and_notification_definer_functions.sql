-- Record of migration applied by the planning chat on 2026-10-24.
-- These SECURITY DEFINER functions were executable by anon/authenticated; only
-- server-side jobs (service_role) and triggers need them.
do $$ declare f text; begin
  foreach f in array array[
    'public.claim_whatsapp_batch(integer)',
    'public.mark_whatsapp_result(uuid,text,text,text,text)',
    'public.enqueue_whatsapp(text,text,text,text,jsonb,text,uuid,text,uuid)',
    'public.fn_create_notification(uuid,text,text,text,text,uuid)',
    'public.fn_notify_role(text,text,text,text,text,uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
