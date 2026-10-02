import { supabase } from '../lib/supabase';

// Maintenance & downtime data access (Phase 6A).
// All four operational tables are RLS-protected: INSERT/UPDATE are restricted
// to md / production_manager / assistant_production_manager / logistics_manager;
// SELECT is additionally open to board_member / ico / store_officer. A write
// attempt by the wrong role fails at the database, which is expected behaviour —
// the UI hides write controls for read-only roles, but the DB is the real gate.
export const maintenanceService = {
  // ── Reference data ────────────────────────────────────────────
  async getAssets() {
    const { data, error } = await supabase
      .from('assets')
      .select('id, name, code, asset_type, status, vehicle_id')
      .order('asset_type')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async getActiveTemplates() {
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('id, asset_type, name, frequency, active')
      .eq('active', true)
      .order('asset_type')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async getTemplateItems(templateId) {
    const { data, error } = await supabase
      .from('checklist_items')
      .select('id, template_id, item_text, sort_order')
      .eq('template_id', templateId)
      .order('sort_order');
    if (error) throw error;
    return data || [];
  },

  // Active staff for the "who is this for" picker. staff_public is the
  // universally-readable projection of `staff` (the base table has stricter
  // RLS); is_active filtering keeps terminated employees out of the picker,
  // while callers keep the full list for name lookups on historical rows.
  async getStaffForPicker() {
    const { data, error } = await supabase
      .from('staff_public')
      .select('id, full_name, is_active, role, reports_to_staff_id')
      .order('full_name');
    if (error) throw error;
    return data || [];
  },

  // ── Checklist completions ─────────────────────────────────────
  async getCompletionsForDate(dateStr) {
    const { data, error } = await supabase
      .from('checklist_completions')
      .select('*')
      .eq('completed_date', dateStr)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async insertCompletion(row) {
    const { data, error } = await supabase
      .from('checklist_completions')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── Downtime log ──────────────────────────────────────────────
  async getOpenDowntime() {
    const { data, error } = await supabase
      .from('downtime_log')
      .select('*')
      .eq('resolved', false)
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getResolvedDowntime(limit = 50) {
    const { data, error } = await supabase
      .from('downtime_log')
      .select('*')
      .eq('resolved', true)
      .order('end_time', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async insertDowntime(row) {
    const { data, error } = await supabase
      .from('downtime_log')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async resolveDowntime(id) {
    const { error } = await supabase
      .from('downtime_log')
      .update({ end_time: new Date().toISOString(), resolved: true })
      .eq('id', id);
    if (error) throw error;
  },

  // ── Photos ────────────────────────────────────────────────────
  // Mirrors the attendance-photos flow in kioskService.uploadPhoto: upload to a
  // private bucket, return the storage path on success or null on failure so the
  // caller can save the record regardless and warn non-blockingly. Reads use the
  // shared getSignedDocUrl('maintenance-photos', path) helper in services/storage.
  async uploadPhoto(file, path) {
    const { error } = await supabase.storage
      .from('maintenance-photos')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
    if (error) return null;
    return path;
  },
};
