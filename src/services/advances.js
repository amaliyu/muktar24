import { supabase } from '../lib/supabase';

export const advancesService = {
  async list() {
    const { data, error } = await supabase
      .from('salary_advances')
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

  // Self-scoped variant for My HR — filters to a single staff member.
  // (list() above returns all rows and is used by the management AdvancesPage.)
  async listMine(staffId) {
    const { data, error } = await supabase
      .from('salary_advances')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create({ staff_id, amount, reason, installments, requested_by }) {
    const installment_amount = installments > 0 ? Math.round(amount / installments) : amount;
    const { data, error } = await supabase
      .from('salary_advances')
      .insert({ staff_id, amount, reason, installments, installment_amount, outstanding_balance: amount, requested_by, status: 'requested' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async advance(id, action, reason = null) {
    const { data, error } = await supabase.rpc('advance_salary_advance',
      { p_adv_id: id, p_action: action, p_reason: reason });
    if (error) throw error;
    return data;
  },

  async getOutstandingByStaff() {
    const { data, error } = await supabase
      .from('salary_advances')
      .select('staff_id, installment_amount, outstanding_balance')
      .eq('status', 'disbursed')
      .gt('outstanding_balance', 0);
    if (error) throw error;
    const map = {};
    for (const row of data || []) map[row.staff_id] = row;
    return map;
  },
};
