# admin-create-user

Server-side replacement for the old client-side `authService.createUser` (which
called `auth.signUp()` directly from the browser). This function requires the
caller to already be the active MD; it creates the auth user and the
`user_profiles` row with the service-role key, so no privileged write ever
happens from the client.

## Deploy

```
supabase functions deploy admin-create-user --project-ref kcijsspzteglqqnffokb
```

Service-role env (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
is provided automatically by the platform — no secrets to set, no `VITE_*` var
needed on the client side.

## After deploying

- With Supabase public sign-up **off**, log in as the MD, create a user from
  User Management, confirm the new account can log in with the role you set.
- As a non-MD (or a deactivated MD), calling the function should return 403.
- A request with no `Authorization` header should return 401.
- A request with a bad email / short password / missing name should return
  400 with a readable message.

I could not reach supabase.com from the coding session to verify the current
Edge Functions docs (network egress to that host is blocked there) — the
import style (`jsr:@supabase/supabase-js@2`) and the env var names above are
from trained knowledge, not a live doc check. If `supabase functions deploy`
errors on either, that's the first thing to check against the current docs.
