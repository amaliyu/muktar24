import { supabase } from '../lib/supabase'
const rpc = async (name, args) => { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data }
const number = value => value === '' || value == null ? null : Number(value)
export const siteGenerator = {
  record: (siteId, date, f) => rpc('record_generator_day', {
    p_site_id: siteId, p_on_date: date, p_started_at: f.startedAt || null, p_stopped_at: f.stoppedAt || null,
    p_break_minutes: number(f.breakMinutes), p_hour_meter_start: number(f.meterStart), p_hour_meter_end: number(f.meterEnd),
    p_note: f.note?.trim() || null, p_late_reason: f.lateReason?.trim() || null,
  }),
  day: (siteId, date) => rpc('site_generator_day', { p_site_id: siteId, p_date: date }),
}
