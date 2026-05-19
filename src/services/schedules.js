import { supabase } from '../lib/supabase'

export const schedulesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('delivery_schedules')
      .select(`*, items:delivery_schedule_items(
        *, customer:customer_id(name, location, phone),
        register:pending_register_id(id, total_qty, delivered_qty, remaining_qty, block_type)
      )`)
      .order('schedule_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getSubmitted() {
    const { data, error } = await supabase
      .from('delivery_schedules')
      .select(`*, items:delivery_schedule_items(
        *, customer:customer_id(name, location, phone),
        register:pending_register_id(id, total_qty, delivered_qty, remaining_qty)
      )`)
      .eq('status', 'submitted')
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  async getApproved() {
    const { data, error } = await supabase
      .from('delivery_schedules')
      .select(`*, items:delivery_schedule_items(
        *, customer:customer_id(name, location, phone)
      )`)
      .in('status', ['ico_approved', 'store_notified', 'in_progress'])
      .order('schedule_date', { ascending: true })
    if (error) throw error
    return data || []
  },

  async create(schedule, items) {
    const { data: sched, error } = await supabase
      .from('delivery_schedules')
      .insert(schedule)
      .select()
      .single()
    if (error) throw error

    if (items && items.length > 0) {
      await supabase.from('delivery_schedule_items')
        .insert(items.map(i => ({ ...i, schedule_id: sched.id })))
    }
    return sched
  },

  async updateStatus(id, status) {
    const { error } = await supabase
      .from('delivery_schedules')
      .update({ status })
      .eq('id', id)
    if (error) throw error
  },

  async icoApprove(id, approvedBy, notes, rejectedItemIds = []) {
    if (rejectedItemIds.length > 0) {
      await supabase.from('delivery_schedule_items').delete().in('id', rejectedItemIds)
    }
    const { error } = await supabase
      .from('delivery_schedules')
      .update({ status: 'ico_approved', ico_approved_by: approvedBy, ico_approved_at: new Date().toISOString(), ico_notes: notes || null })
      .eq('id', id)
    if (error) throw error
  },

  async icoReject(id, approvedBy, notes) {
    const { error } = await supabase
      .from('delivery_schedules')
      .update({ status: 'rejected', ico_approved_by: approvedBy, ico_approved_at: new Date().toISOString(), ico_notes: notes || null })
      .eq('id', id)
    if (error) throw error
  },
}
