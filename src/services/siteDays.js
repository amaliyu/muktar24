import { supabase } from '../lib/supabase'

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export const siteDays = {
  overview: (siteId, from, to) => rpc('site_day_overview', { p_site_id: siteId, p_from: from, p_to: to }),
  record: (siteId, date, { reason, note, staffWorked, workDone, workNote, lateReason }) => rpc('record_site_day_status', {
    p_site_id: siteId, p_on_date: date, p_reason: reason, p_note: note || null,
    p_staff_worked: staffWorked, p_work_done: staffWorked ? workDone : [], p_work_note: staffWorked ? (workNote || null) : null,
    ...(lateReason ? { p_late_reason: lateReason } : {}),
  }),
  clear: (siteId, date) => rpc('clear_site_day_status', { p_site_id: siteId, p_on_date: date }),
}
