-- Record of migration applied by the planning chat on 2026-10-25 (ChatGPT audit 1, criticals #1/#2).
-- grant_user_role / revoke_user_role used "IF v_actor_role <> 'md'", which is NULL (passes)
-- for a caller with no profile, and anon could execute them. Made NULL-safe and anon revoked.
-- Two views allowed anon INSERT/UPDATE/DELETE; four financial views were anon-readable.
do $$ declare f regprocedure; d text; n text; begin
  foreach f in array array['public.grant_user_role(uuid,text,text,timestamptz)'::regprocedure,
                           'public.revoke_user_role(uuid,text)'::regprocedure] loop
    d := pg_get_functiondef(f);
    n := replace(d, 'IF v_actor_role <> ''md''', 'IF v_actor_role IS DISTINCT FROM ''md''');
    if n = d then raise exception 'MD check text not found in %', f; end if;
    execute n;
  end loop;
end $$;
revoke execute on function public.grant_user_role(uuid,text,text,timestamptz) from public, anon;
revoke execute on function public.revoke_user_role(uuid,text) from public, anon;
grant execute on function public.grant_user_role(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.revoke_user_role(uuid,text) to authenticated;
revoke all on public.order_items_delivery from anon;
revoke all on public.disciplinary_self from anon;
revoke all on public.cash_withdrawal_drift, public.payment_request_batch_status,
              public.payment_request_override_report, public.v_delivered_revenue from anon;
