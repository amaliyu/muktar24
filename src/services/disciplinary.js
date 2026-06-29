import { supabase } from '../lib/supabase';

export const disciplinaryService = {
  async listAll() {
    const { data, error } = await supabase
      .from('disciplinary_cases')
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

  async getMine() {
    const { data, error } = await supabase
      .from('disciplinary_self')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAudit(caseId) {
    const { data, error } = await supabase
      .from('disciplinary_audit')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async issue({ staff_id, type, title, allegation, incident_date, response_deadline }) {
    const { data, error } = await supabase.rpc('issue_disciplinary_case', {
      p_staff_id: staff_id,
      p_type: type,
      p_title: title,
      p_allegation: allegation,
      p_incident_date: incident_date,
      p_response_deadline: response_deadline || null,
    });
    if (error) throw error;
    return data;
  },

  async advance(caseId, action, text = null, sanction = null) {
    const { data, error } = await supabase.rpc('advance_disciplinary', {
      p_case_id: caseId,
      p_action: action,
      p_text: text,
      p_sanction: sanction,
    });
    if (error) throw error;
    return data;
  },
};
