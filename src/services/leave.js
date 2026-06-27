import { supabase } from '../lib/supabase';

export const leaveService = {
  async list() {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data || [];
    const ids = [...new Set(rows.map(r => r.staff_id).filter(Boolean))];
    if (ids.length) {
      const { data: staffRows } = await supabase.from('staff_public').select('id, full_name').in('id', ids);
      const map = Object.fromEntries((staffRows || []).map(s => [s.id, s.full_name]));
      for (const row of rows) row.staff = { full_name: map[row.staff_id] || null };
    }
    return rows;
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
