import { supabase } from '../lib/supabase';

export const kioskService = {
  // Returns { staff_id, employee_number, pin_hash } for every active staff member.
  // Used to populate the local IndexedDB cache so PIN + barcode resolve offline.
  async syncPins() {
    const { data, error } = await supabase.rpc('get_kiosk_pin_sync');
    if (error) throw error;
    return data || [];
  },

  // Batch-insert queued punches. Callers strip the photo_blob before calling.
  async uploadPunches(rows) {
    const { error } = await supabase.from('attendance_punches').insert(rows);
    if (error) throw error;
  },

  // Upload a captured photo; returns the storage path, or null on failure.
  async uploadPhoto(blob, path) {
    const { error } = await supabase.storage
      .from('attendance-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    return path;
  },

  // Flagged attendance rows for the management review page.
  async getFlagged(daysBack = 60) {
    const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('attendance')
      .select('*, staff:staff_id(full_name, employee_number)')
      .eq('flagged', true)
      .gte('date', from)
      .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // HR resolves a flagged day: optionally set hours_worked / present, always clears flagged.
  async resolveFlag(id, hours_worked, present) {
    const updates = { flagged: false };
    if (hours_worked !== undefined && hours_worked !== '') updates.hours_worked = Number(hours_worked);
    if (present !== undefined) updates.present = present;
    const { error } = await supabase.from('attendance').update(updates).eq('id', id);
    if (error) throw error;
  },

  // Self-service: employee views own attendance (RLS enforces ownership).
  async getMyAttendance(from, to) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Employee submits an explanation for a flagged day.
  async submitFlagResponse(attendanceId, response) {
    const { error } = await supabase.rpc('submit_attendance_flag_response', {
      p_attendance_id: attendanceId,
      p_response:      response,
    });
    if (error) throw error;
  },
};
