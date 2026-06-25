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
};
