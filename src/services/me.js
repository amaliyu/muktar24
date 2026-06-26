import { supabase } from '../lib/supabase';

export const meService = {
  async getMyStaff() {
    const { data } = await supabase.from('staff').select('*').limit(1).maybeSingle();
    return data;
  },
};
