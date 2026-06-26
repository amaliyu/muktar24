import { supabase } from '../lib/supabase';

export const leaveBalanceService = {
  async getPolicySettings() {
    const { data, error } = await supabase
      .from('leave_policy_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getBalances(year) {
    const { data, error } = await supabase
      .from('staff_leave_balances')
      .select('*, staff:staff_id(full_name, staff_type)')
      .eq('year', year)
      .order('staff_id');
    if (error) throw error;
    return data || [];
  },

  async getMyBalance(year) {
    const { data, error } = await supabase
      .from('staff_leave_balances')
      .select('*')
      .eq('year', year);
    if (error) throw error;
    return data || [];
  },

  async seedDraft(year) {
    const { data, error } = await supabase.rpc('seed_leave_balances_draft', { p_year: year });
    if (error) throw error;
    return data;
  },

  async setEntitlement(staff_id, year, leave_type, days) {
    const { data, error } = await supabase.rpc('set_leave_entitlement', {
      p_staff_id: staff_id, p_year: year, p_leave_type: leave_type, p_days: days,
    });
    if (error) throw error;
    return data;
  },

  async setPolicyActive(active) {
    const { data, error } = await supabase.rpc('set_leave_policy_active', { p_active: active });
    if (error) throw error;
    return data;
  },
};
