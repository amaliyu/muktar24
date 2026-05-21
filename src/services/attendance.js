import { supabase } from '../lib/supabase'

export const attendanceService = {
  async getByDate(date) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*, staff:staff_id(id, full_name, role, staff_type, daily_rate)')
      .eq('date', date)
    if (error) throw error
    return data || []
  },

  async saveAll(records) {
    const { error } = await supabase
      .from('attendance')
      .upsert(records, { onConflict: 'staff_id,date' })
    if (error) throw error
  },

  async getByRange(from, to, staffId = null) {
    let q = supabase
      .from('attendance')
      .select('*, staff:staff_id(id, full_name, role, staff_type)')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
    if (staffId) q = q.eq('staff_id', staffId)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getCountsByRange(from, to) {
    const { data, error } = await supabase
      .from('attendance')
      .select('staff_id, present')
      .gte('date', from)
      .lte('date', to)
    if (error) throw error
    const counts = {}
    for (const r of data || []) {
      if (!counts[r.staff_id]) counts[r.staff_id] = 0
      if (r.present) counts[r.staff_id]++
    }
    return counts
  },
}

export const payrollService = {
  async getRuns() {
    const { data, error } = await supabase
      .from('payroll_runs')
      .select('*')
      .order('run_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getRunWithLines(id) {
    const [{ data: run, error: re }, { data: lines, error: le }] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('id', id).single(),
      supabase.from('payroll_lines').select('*, staff:staff_id(id, full_name, role)').eq('payroll_run_id', id),
    ])
    if (re) throw re
    if (le) throw le
    return { run, lines: lines || [] }
  },

  async createRun(run, lines) {
    const { data: newRun, error: re } = await supabase
      .from('payroll_runs')
      .insert(run)
      .select()
      .single()
    if (re) throw re
    if (lines.length) {
      const { error: le } = await supabase
        .from('payroll_lines')
        .insert(lines.map(l => ({ ...l, payroll_run_id: newRun.id })))
      if (le) throw le
    }
    return newRun
  },

  async updateRun(id, updates) {
    const { error } = await supabase.from('payroll_runs').update(updates).eq('id', id)
    if (error) throw error
  },

  async updateLine(id, updates) {
    const { error } = await supabase.from('payroll_lines').update(updates).eq('id', id)
    if (error) throw error
  },
}
