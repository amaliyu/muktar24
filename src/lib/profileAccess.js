// Pure decision function: does this profile get into the app?
// `profile` is either a user_profiles row or null/undefined (no row found).
export function checkProfileAccess(profile) {
  if (!profile) return { ok: false, reason: 'missing' };
  if (profile.is_active === false) return { ok: false, reason: 'inactive' };
  return { ok: true };
}
