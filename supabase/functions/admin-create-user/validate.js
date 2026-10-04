// Dependency-free shape validation for admin-create-user. Plain JS, no
// imports — importable as-is by both the Deno Edge Function and Vitest.
//
// Does NOT check that `role` exists in app_roles — that needs a DB lookup
// and is done in index.ts after this passes. This module only validates
// the shape of what the client sent.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateCreateUserInput(body) {
  const errors = [];

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const full_name = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
  const role = typeof body?.role === 'string' ? body.role.trim() : '';
  const rawStaffId = body?.staff_id;
  const staff_id = rawStaffId === undefined || rawStaffId === null || rawStaffId === '' ? null : rawStaffId;

  if (!email || !EMAIL_RE.test(email)) errors.push('A valid email address is required.');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  if (!full_name) errors.push('Full name is required.');
  if (!role) errors.push('Role is required.');
  if (staff_id !== null && (typeof staff_id !== 'string' || !UUID_RE.test(staff_id))) {
    errors.push('staff_id must be a valid UUID or omitted.');
  }

  if (errors.length) return { valid: false, errors };
  return { valid: true, value: { email, password, full_name, role, staff_id } };
}
