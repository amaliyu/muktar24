import { supabase } from '../lib/supabase';

export const paymentRequestsService = {
  async list() {
    const { data, error } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data || [];
    const ids = [...new Set(rows.map(r => r.requested_by).filter(Boolean))];
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', ids);
      const map = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]));
      for (const row of rows) row.requester = { full_name: map[row.requested_by] || null };
    }
    return rows;
  },

  async listMine(userId) {
    const { data, error } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('requested_by', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create({ amount, purpose, expense_category_id, disbursement_method }) {
    const { data: ref, error: refErr } = await supabase.rpc('get_next_payment_request_reference');
    if (refErr) throw refErr;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        reference: ref,
        requested_by: user.id,
        amount,
        purpose: purpose || null,
        expense_category_id: expense_category_id || null,
        disbursement_method: disbursement_method || 'bank_transfer',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async advance(id, action, reason = null) {
    const { data, error } = await supabase.rpc('advance_payment_request', {
      p_request_id: id,
      p_action: action,
      p_reason: reason,
    });
    if (error) throw error;
    return data;
  },
};
