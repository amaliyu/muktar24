import { supabase } from '../lib/supabase'

export const staffService = {
  async getAll() {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('full_name')
    if (error) throw error
    return data
  },

  async getActive() {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    if (error) throw error
    return data
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

  async deactivate(id) {
    return staffService.update(id, { is_active: false })
  },

  async activate(id) {
    return staffService.update(id, { is_active: true })
  },
}
