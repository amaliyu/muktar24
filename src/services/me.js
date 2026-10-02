import { supabase } from '../lib/supabase';

export const meService = {
  async getMyStaff() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('user_profiles').select('staff_id').eq('id', user.id).maybeSingle();
    if (!profile?.staff_id) return null;
    const { data, error } = await supabase.from('staff').select('*').eq('id', profile.staff_id).maybeSingle();
    if (error) throw error;
    return data;
  },
};
