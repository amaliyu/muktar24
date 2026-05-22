import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Admin client uses the service role key so it can create pre-confirmed users.
// VITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env.local and in Vercel env vars.
const adminClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export const authService = {
  /**
   * Create a pre-confirmed user via the Admin API so they can log in immediately.
   * Requires VITE_SUPABASE_SERVICE_ROLE_KEY in the environment.
   */
  async createUser(email, password, fullName, role, staffId = null) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    })
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
      .eq('is_active', true)
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
}
