// Effective-role helpers for the multi-role feature.
//
// A user's `effectiveRoles` is the array returned by the my_effective_roles()
// RPC — their primary role plus any active (non-revoked, non-expired) grants.
// When it's absent (older session, RPC failure) we fall back to the primary
// role so behaviour degrades to single-role rather than locking anyone out.

export function effectiveRolesOf(userProfile) {
  if (!userProfile) return [];
  const eff = userProfile.effectiveRoles;
  if (Array.isArray(eff) && eff.length) return eff;
  return userProfile.role ? [userProfile.role] : [];
}

// True if the user holds ANY of the given roles via primary OR active grant.
// Use this for delegatable permissions. For MD-only authority that must never
// be delegated, check the PRIMARY role directly (userProfile.role === 'md').
export function hasRole(userProfile, ...roles) {
  const eff = effectiveRolesOf(userProfile);
  return roles.some(r => eff.includes(r));
}
