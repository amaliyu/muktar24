import { checkedWrite } from '../utils/checkedWrite'
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
    if (!records.length) return
    checkedWrite(await supabase.from('attendance').upsert(records, { onConflict: 'staff_id,date' }).select('id'), records.length)
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

  async checkOverlap(from, to) {
    if (!from || !to || from > to) throw new Error('Select a valid salary period.')
    const { data, error } = await supabase.from('payroll_runs').select('id, period_from, period_to')
      .lte('period_from', to).gte('period_to', from).limit(1)
    if (error) throw error
    if (data?.length) throw new Error(`A salary run already covers ${data[0].period_from} to ${data[0].period_to}`)
  },
  async createRun(run, lines) {
    await payrollService.checkOverlap(run.period_from, run.period_to)
    const deductions = lines.filter(l => Number(l.advance_deduction) > 0)
    if (deductions.length) {
      if (deductions.some(l => !l.salary_advance_id)) throw new Error('Choose the advance for each advance deduction.')
      const { data, error } = await supabase.from('salary_advances').select('id, staff_id, outstanding_balance, status').in('id', [...new Set(deductions.map(l => l.salary_advance_id))])
      if (error) throw error
      for (const line of deductions) {
        const advance = data?.find(a => a.id === line.salary_advance_id && a.staff_id === line.staff_id && a.status === 'disbursed')
        if (!advance || Number(line.advance_deduction) > Number(advance.outstanding_balance)) throw new Error('The advance balance changed or is no longer available. Recalculate the payroll deduction.')
      }
    }
    const newRun = checkedWrite(await supabase.from('payroll_runs').insert({ ...run, status: 'draft' }).select().single())
    try {
      if (lines.length) checkedWrite(await supabase.from('payroll_lines')
        .insert(lines.map(l => ({ ...l, payroll_run_id: newRun.id }))).select('id'), lines.length)
    } catch (e) {
      const failure = new Error(`Salary run ${newRun.id} exists, but its lines were not saved: ${e.message}`)
      failure.runCreated = newRun
      throw failure
    }
    return newRun
  },
  async updateRun(id, updates) {
    return checkedWrite(await supabase.from('payroll_runs').update(updates).eq('id', id).select('id'))
  },
  async updateLine(id, updates) {
    return checkedWrite(await supabase.from('payroll_lines').update(updates).eq('id', id).select('id'))
  },

  async advanceRun(id, action, reason = null) {
    const { data, error } = await supabase.rpc('advance_staff_payroll',
      { p_run_id: id, p_action: action, p_reason: reason });
    return checkedWrite({ data, error });
  },
}
