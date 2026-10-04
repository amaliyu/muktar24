-- Backend audit (pre-#5) — CONFIRMED SECURITY EXPOSURE fix
-- Category 2: SECURITY DEFINER / view grants.
--
-- Finding: public.order_items_delivery is a postgres-owned view WITHOUT
-- security_invoker, so it executes with the view owner's rights and BYPASSES
-- RLS on the underlying order_items table. SELECT is granted to the `anon`
-- role, so anyone holding the public anon key (shipped in the frontend bundle)
-- can read every order line item unauthenticated.
--   Verified: `SET LOCAL role anon; SELECT count(*) FROM order_items_delivery;`
--   returned 47 rows (order_id, block_type, quantity).
--
-- disciplinary_self is also anon-selectable but self-scopes via
-- current_staff_id(); for anon that resolves to NULL and returns 0 rows.
-- No data leaks today, but anon has no legitimate need for it — revoked too.
--
-- The app is authenticated-only; neither view is read by an unauthenticated
-- client, so revoking anon SELECT has no functional impact. `authenticated`
-- retains SELECT.

REVOKE SELECT ON public.order_items_delivery FROM anon;
REVOKE SELECT ON public.disciplinary_self    FROM anon;

-- Verify (expect anon_select = false for both):
-- SELECT c.relname, has_table_privilege('anon', c.oid, 'select') AS anon_select
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname='public' AND c.relname IN ('order_items_delivery','disciplinary_self');
