import { supabase } from '../lib/supabase'

export const staffService = {
  async getAll() {
    const { data, error } = await supabase
      .from('staff')
      .select('*, staffRole:role_id(id, role_name, department)')
      .order('full_name')
    if (error) throw error
    return data || []
  },

  async getActive() {
    const { data, error } = await supabase
      .from('staff')
      .select('*, staffRole:role_id(id, role_name, department)')
      .eq('employment_status', 'active')
      .order('full_name')
    if (error) throw error
    return data || []
  },

  async create(staff) {
    const { data, error } = await supabase
      .from('staff')
      .insert(staff)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('staff')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
