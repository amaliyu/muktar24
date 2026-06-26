import { supabase } from '../lib/supabase';

export const leaveService = {
  async list() {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*, staff:staff_id(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create({ staff_id, leave_type, is_paid, start_date, end_date, days, reason, requested_by }) {
    const { data, error } = await supabase
      .from('leave_requests')
      .insert({ staff_id, leave_type, is_paid, start_date, end_date, days, reason, requested_by, status: 'requested' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async advance(id, action, reason = null) {
    const { data, error } = await supabase.rpc('advance_leave_request',
      { p_req_id: id, p_action: action, p_reason: reason });
    if (error) throw error;
    return data;
  },

  async getUnpaidApprovedOverlapping(from, to) {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('staff_id, start_date, end_date')
      .eq('status', 'md_approved')
      .eq('is_paid', false)
      .lte('start_date', to)
      .gte('end_date', from);
    if (error) throw error;
    const map = {};
    for (const row of data || []) {
      if (!map[row.staff_id]) map[row.staff_id] = [];
      map[row.staff_id].push(row);
    }
    return map;
  },
};
