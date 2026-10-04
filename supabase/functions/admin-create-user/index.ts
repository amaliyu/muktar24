// admin-create-user
//
// Server-side user creation, replacing the old client-side authService.createUser
// (which called the anon client's auth.signUp() directly — only safe while public
// sign-up was on, and let the client set its own role/is_active on the profile
// upsert). This function requires a caller who is already the active MD, and does
// all privileged writes with the service-role key — none of that ever reaches
// the browser.
//
// Import style and env var names (SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY) follow the long-standing Supabase Edge Functions
// convention — these are auto-injected into every deployed function, no secrets
// config needed. NOTE: I could not reach supabase.com from this session (network
// egress to that host is blocked here) to double-check against the current docs
// before writing this, so this is written from trained knowledge, not a live doc
// check — worth a quick skim of the current Edge Functions quickstart before or
// right after deploying, in case the recommended import/env-var convention has
// moved on since.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { validateCreateUserInput } from './validate.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';

  // 1. Who is calling? Anon client carrying the caller's own JWT — this only
  //    tells us the request is authenticated, not that the caller is allowed
  //    to create users.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !caller) return json({ error: 'Not authenticated.' }, 401);

  // 2. Is the caller allowed? Service-role client so this read isn't gated by
  //    the caller's own RLS — we need to look up the caller's own profile
  //    regardless of who they turn out to be.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: callerProfile, error: callerProfileErr } = await admin
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', caller.id)
    .maybeSingle();

  if (
    callerProfileErr ||
    !callerProfile ||
    callerProfile.role !== 'md' ||
    callerProfile.is_active !== true
  ) {
    return json({ error: 'Only the active MD can create users.' }, 403);
  }

  // 3. Validate the request body's shape.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const result = validateCreateUserInput(body);
  if (!result.valid) return json({ error: result.errors.join(' ') }, 400);
  const { email, password, full_name, role, staff_id } = result.value;

  // 4. Role must actually exist — DB-verified, not just shape-checked.
  const { data: roleRow, error: roleErr } = await admin
    .from('app_roles')
    .select('id')
    .eq('id', role)
    .maybeSingle();
  if (roleErr || !roleRow) return json({ error: `Unknown role: ${role}` }, 400);

  // 5. Create the auth user. This works regardless of whether public sign-up
  //    is on or off — admin.createUser() is a privileged, service-role-only
  //    call, not the public signUp() flow.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message || 'Could not create the user.' }, 400);
  }
  const userId = created.user.id;

  // 6. handle_new_auth_user() (DB trigger, confirmed live SECURITY DEFINER
  //    owned by postgres) already inserted a default profile row
  //    (role='staff', is_active defaults true) by the time this runs. Update
  //    it to the real values; insert as a fallback if the trigger somehow
  //    didn't fire. This write goes through the service-role client, which
  //    the user_profiles guard trigger (migration 20261004000000) explicitly
  //    bypasses — current_user is 'service_role' here, not 'authenticated'.
  //    If this step fails, the auth user is deleted rather than left behind
  //    as an orphaned, profile-less account.
  const profilePayload = {
    full_name,
    role,
    staff_id,
    is_active: true,
    created_by: caller.email ?? caller.id,
  };

  const { data: updated, error: updateErr } = await admin
    .from('user_profiles')
    .update(profilePayload)
    .eq('id', userId)
    .select()
    .maybeSingle();

  let profile = updated;
  if (!updateErr && !updated) {
    const { data: inserted, error: insertErr } = await admin
      .from('user_profiles')
      .insert({ id: userId, email, ...profilePayload })
      .select()
      .single();
    if (insertErr) {
      await admin.auth.admin.deleteUser(userId);
      return json({ error: 'Profile could not be created; the new account was rolled back.' }, 500);
    }
    profile = inserted;
  } else if (updateErr) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: 'Profile could not be created; the new account was rolled back.' }, 500);
  }

  return json(profile, 200);
});
