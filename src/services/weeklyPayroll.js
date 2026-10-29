import { supabase } from '../lib/supabase'
import { checkedWrite } from '../utils/checkedWrite'
import { availableForDraft } from '../utils/payrollMath'
import { monthStart, monthEnd } from '../utils/lagosDate'

const rows = ({ data, error }) => { if (error) throw error; return data || [] }
export const weeklyPayrollService = {
  async loadRange(from, to, selectedId = null) {
    const [rosters, loads, byDate] = await Promise.all([
      supabase.from('daily_roster').select('*, entries:daily_roster_entries(*), site:site_id(name)').gte('roster_date', from).lte('roster_date', to).then(rows),
      supabase.from('truck_loading_log').select('*, loaders:truck_loading_loaders(labour_id)').gte('date', from).lte('date', to).then(rows),
      supabase.from('weekly_labour_payroll').select('*').eq('week_ending', to).in('payroll_type', ['production','loading']).then(rows),
    ])
    const ids = [...new Set([...rosters, ...loads].map(r => r.payroll_id).concat(selectedId).filter(Boolean))]
    const linked = ids.length ? rows(await supabase.from('weekly_labour_payroll').select('*').in('id', ids)) : []
    const payrolls = [...new Map([...byDate, ...linked].map(p => [p.id, p])).values()]
    const choose = type => payrolls.find(p => p.id === selectedId && p.payroll_type === type)
      || payrolls.find(p => p.payroll_type === type && p.week_ending === to)
      || payrolls.find(p => p.payroll_type === type)
    const production = choose('production'), loading = choose('loading')
    // Always fetch the complete linked schedule, including rows outside a
    // widened/shifted display range. The payroll owns this selection.
    const ownedRosters = production ? rows(await supabase.from('daily_roster').select('*, entries:daily_roster_entries(*), site:site_id(name)').eq('payroll_id', production.id)) : []
    const ownedLoads = loading ? rows(await supabase.from('truck_loading_log').select('*, loaders:truck_loading_loaders(labour_id)').eq('payroll_id', loading.id)) : []
    const merge = (a, b) => [...new Map([...a, ...b].map(r => [r.id, r])).values()]
    return { rosters: merge(rosters, ownedRosters), loads: merge(loads, ownedLoads), payrolls, production, loading }
  },
  async saveDraft({ payroll = null, type, from, to, ids, total, workerCount, preparedBy }) {
    const table = type === 'production' ? 'daily_roster' : 'truck_loading_log'
    const selected = rows(await supabase.from(table).select('id, payroll_id, payment_status').in('id', ids))
    if (selected.length !== ids.length || selected.some(r => !(availableForDraft(r) || (payroll?.status === 'draft' && r.payroll_id === payroll.id && r.payment_status !== 'paid')))) {
      throw new Error('Some selected work is already paid or belongs to another payroll — reload and try again.')
    }
    let draft = payroll
    if (draft && draft.status !== 'draft') throw new Error('Only a draft payroll can be changed.')
    if (!draft) {
      const result = await supabase.from('weekly_labour_payroll').insert({ payroll_type: type, period_start: from, period_end: to, week_ending: to, status: 'draft', total_amount: 0, worker_count: 0, prepared_by: preparedBy }).select().single()
      if (result.error?.code === '23505') {
        const found = await supabase.from('weekly_labour_payroll').select('*').eq('week_ending', to).eq('payroll_type', type).single()
        if (found.error) throw found.error
        if (!found.data) throw new Error('An existing payroll could not be loaded.')
        return { payroll: found.data, existing: true }
      }
      draft = checkedWrite(result)
    }
    try {
      const newIds = selected.filter(r => r.payroll_id == null).map(r => r.id)
      if (newIds.length) checkedWrite(await supabase.from(table).update({ payroll_id: draft.id }).in('id', newIds).is('payroll_id', null).or('payment_status.is.null,payment_status.neq.paid').select('id'), newIds.length)
      const owned = rows(await supabase.from(table).select('id').eq('payroll_id', draft.id))
      const removed = owned.filter(r => !ids.includes(r.id)).map(r => r.id)
      if (removed.length) checkedWrite(await supabase.from(table).update({ payroll_id: null }).in('id', removed).eq('payroll_id', draft.id).select('id'), removed.length)
      checkedWrite(await supabase.from('weekly_labour_payroll').update({ total_amount: total, worker_count: workerCount }).eq('id', draft.id).eq('status', 'draft').select('id'))
    } catch (e) { throw new Error(`Draft payroll ${draft.id} exists, but its schedule or totals could not be saved: ${e.message}`) }
    return { payroll: draft, existing: false }
  },
  async advance(id, action, reason = null) {
    return checkedWrite(await supabase.rpc('advance_weekly_payroll', { p_payroll_id: id, p_action: action, p_reason: reason }))
  },
  async loadMonthly(month) {
    const [y, m] = month.split('-').map(Number)
    return rows(await supabase.from('weekly_labour_payroll').select('*').eq('payroll_type', 'monthly_fixed').gte('week_ending', monthStart(y, m - 1)).lte('week_ending', monthEnd(y, m - 1)).order('week_ending'))
  },
  async createMonthly(month, total, count, preparedBy) {
    // Keep the existing month-28 key, so older monthly payrolls hit the same
    // unique key instead of creating another run at a different month-end date.
    const result = await supabase.from('weekly_labour_payroll').insert({ week_ending: `${month}-28`, payroll_type: 'monthly_fixed', total_amount: total, worker_count: count, status: 'draft', prepared_by: preparedBy }).select('id')
    if (result.error?.code === '23505') {
      const existing = await weeklyPayrollService.loadMonthly(month)
      if (!existing.length) throw new Error('The existing monthly payroll could not be loaded.')
      return { payroll: existing[0], existing: true }
    }
    return { payroll: checkedWrite(result)[0], existing: false }
  },
}
