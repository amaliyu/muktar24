import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export const authService = {
  /**
   * Create a pre-confirmed user. Email confirmation is disabled in Supabase
   * settings, so signUp() lets staff log in immediately. A separate client
   * with persistSession:false is used so the MD's own session is untouched.
   */
  async createUser(email, password, fullName, role, staffId = null) {
    const tmpClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data, error } = await tmpClient.auth.signUp({ email, password })
    if (error) throw error
    const userId = data.user?.id
    if (!userId) throw new Error('User creation failed — no user ID returned.')
    // Upsert profile; the DB trigger may have already created a row
    const { data: profile, error: profErr } = await supabase
      .from('user_profiles')
      .upsert({ id: userId, email, full_name: fullName, role, is_active: true, ...(staffId ? { staff_id: staffId } : {}) })
      .select()
      .single()
    if (profErr) throw profErr
    return profile
  },

  /**
   * Fetch all active staff members ordered by name.
   */
  async getStaffList() {
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, role, staff_type')
      .eq('employment_status', 'active')
      .order('full_name')
    if (error) throw error
    return data || []
  },

  /**
   * Sign in with email and password.
   * Throws on auth error so callers can catch and display a message.
   */
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  /**
   * Sign the current user out and clear the local session.
   */
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  /**
   * Fetch the full profile for a single user, joining the role display name.
   * Returns the profile object or null (if not found).
   */
  async getProfile(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*, role_info:role(display_name)')
      .eq('id', userId)
      .single()
    if (error) throw error
    return data
  },

  /**
   * Create or update a user profile row.
   * Pass an existing `id` to update; omit it to insert (the DB will reject
   * inserts without a valid auth.users reference).
   */
  async upsertProfile(id, email, fullName, role) {
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ id, email, full_name: fullName, role })
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * List every user profile ordered by full name, with their role display name.
   */
  async listUsers() {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*, role_info:role(display_name)')
      .order('full_name')
    if (error) throw error
    return data || []
  },

  /**
   * Update the role for a single user.
   */
  async updateUserRole(id, role) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role })
      .eq('id', id)
    if (error) throw error
  },

  /**
   * Activate or deactivate a user account without deleting it.
   */
  async toggleUserActive(id, isActive) {
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: isActive })
      .eq('id', id)
    if (error) throw error
  },

  /**
   * Send a password reset email to the given address.
   */
  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  },

  /**
   * Change the current user's own password (must be logged in).
   */
  async changePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  },

  // ── Multi-role grants (MD-only writes, enforced by the DB RPCs/RLS) ──

  /** All active (non-revoked, non-expired) role grants across all users. */
  async listActiveGrants() {
    const { data, error } = await supabase
      .from('user_role_grants')
      .select('id, user_id, role, granted_by_name, granted_at, expires_at, reason')
      .is('revoked_at', null)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('granted_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  /** Returns a warning string if the role combo breaks separation of duties, else null. */
  async checkRoleConflict(userId, role) {
    const { data, error } = await supabase.rpc('check_role_conflict', { p_user_id: userId, p_new_role: role })
    if (error) throw error
    return data || null
  },

  /** Grant a role (MD-only). Null expiry → DB default (90 days). */
  async grantRole(userId, role, reason, expiresAt) {
    const { error } = await supabase.rpc('grant_user_role', {
      p_user_id: userId, p_role: role,
      p_reason: reason || null,
      p_expires_at: expiresAt || null,
    })
    if (error) throw error
  },

  /** Revoke an active grant (MD-only). */
  async revokeRole(userId, role) {
    const { error } = await supabase.rpc('revoke_user_role', { p_user_id: userId, p_role: role })
    if (error) throw error
  },
}
