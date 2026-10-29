import { deleteWhere, deleteById } from '../utils/checkedDelete'
import { checkedWrite } from '../utils/checkedWrite'
import { supabase } from '../lib/supabase'

export const NIGERIAN_BANKS = [
  'Access Bank', 'First Bank of Nigeria', 'GTBank (Guaranty Trust Bank)',
  'United Bank for Africa (UBA)', 'Zenith Bank', 'Fidelity Bank',
  'First City Monument Bank (FCMB)', 'Union Bank', 'Sterling Bank',
  'Wema Bank', 'Polaris Bank', 'Keystone Bank', 'Ecobank Nigeria',
  'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Citibank Nigeria',
  'Heritage Bank', 'Unity Bank', 'Providus Bank', 'SunTrust Bank',
  'Kuda Bank', 'Opay', 'Palmpay', 'Moniepoint',
]

export const labourRolesService = {
  async getAll() {
    const { data, error } = await supabase
      .from('labour_roles')
      .select('*')
      .order('role_name')
    if (error) throw error
    return data || []
  },

  async update(id, updates) {
    checkedWrite(await supabase.from('labour_roles').update(updates).eq('id', id).select('id'))
  },
}

export const labourPoolService = {
  async getAll() {
    const { data, error } = await supabase
      .from('labour_pool')
      .select('*, role:usual_role_id(role_name, payment_type, base_rate)')
      .order('full_name')
    if (error) throw error
    return data || []
  },

  async create(worker) {
    const { data, error } = await supabase
      .from('labour_pool')
      .insert(worker)
      .select()
      .single()
    checkedWrite({ data, error })
    return data
  },

  async update(id, updates) {
    checkedWrite(await supabase.from('labour_pool').update(updates).eq('id', id).select('id'))
  },
}

export const rateChangeService = {
  async getAll() {
    const { data, error } = await supabase
      .from('labour_rate_change_requests')
      .select('*, role:role_id(role_name, payment_type)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(req) {
    const { data, error } = await supabase
      .from('labour_rate_change_requests')
      .insert({ ...req, overall_status: 'pending' })
      .select()
      .single()
    checkedWrite({ data, error })
    return data
  },

  async icoReview(id, status, comments, reviewerName) {
    const updates = {
      ico_reviewed_by: reviewerName,
      ico_review_date: new Date().toISOString().split('T')[0],
      ico_comments: comments,
      ico_status: status,
      overall_status: status === 'approved' ? 'md_review' : 'rejected',
    }
    checkedWrite(await supabase.from('labour_rate_change_requests').update(updates).eq('id', id).select('id'))
  },

  async mdReview(id, status, comments, reviewerName) {
    const updates = {
      md_approved_by: reviewerName,
      md_approval_date: new Date().toISOString().split('T')[0],
      md_comments: comments,
      md_status: status,
      overall_status: status === 'approved' ? 'approved' : 'rejected',
    }
    let ratesUpdated = false
    if (status === 'approved') {
      const { data: req, error: reqError } = await supabase
        .from('labour_rate_change_requests')
        .select('role_id, proposed_rate, proposed_bonus, effective_date, ico_status, overall_status')
        .eq('id', id)
        .single()
      if (reqError) throw reqError
      if (!req) throw new Error("Rate request could not be loaded.")
      if (req.ico_status !== 'approved' || ['approved','rejected'].includes(req.overall_status)) throw new Error('The ICO must approve the pending request before the MD decides.')
      if (req) {
        checkedWrite(await supabase.from('labour_roles').update({
          base_rate: req.proposed_rate,
          target_bonus: req.proposed_bonus,
          effective_date: req.effective_date || new Date().toISOString().split('T')[0],
          approved_by: reviewerName,
        }).eq('id', req.role_id).select('id'))
        ratesUpdated = true
      }
    }
    try { checkedWrite(await supabase.from('labour_rate_change_requests').update(updates).eq('id', id).select('id')) }
    catch (e) {
      if (ratesUpdated) throw new Error(`The labour rate was updated, but the request could not be finalized: ${e.message}`)
      throw e
    }
  },
}

export const rosterService = {
  async getAll() {
    const { data, error } = await supabase
      .from('daily_roster')
      .select('*, entries:daily_roster_entries(*, worker:labour_id(full_name, labour_number), role:role_id(role_name))')
      .order('roster_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  // One roster per site per day (daily_roster_site_date_key). With a siteId this
  // returns that site's roster or null; without one it returns EVERY site's
  // roster for the date as an array (maybeSingle would error with 2+ sites).
  async getByDate(date, siteId = null) {
    let q = supabase
      .from('daily_roster')
      .select('*, entries:daily_roster_entries(*, worker:labour_id(full_name, labour_number), role:role_id(role_name))')
      .eq('roster_date', date)
    if (siteId) {
      const { data, error } = await q.eq('site_id', siteId).maybeSingle()
      if (error) throw error
      return data
    }
    const { data, error } = await q.order('created_at')
    if (error) throw error
    return data
  },

  async saveEntriesFirst(id, header, entries) {
    const labourIds = entries.map(e => e.labour_id)
    if (new Set(labourIds).size !== labourIds.length) throw new Error('Each worker can only appear once per roster.')
    if (entries.length) checkedWrite(await supabase.from('daily_roster_entries')
      .upsert(entries.map(e => ({ ...e, roster_id: id })), { onConflict: 'roster_id,labour_id' }).select('id'), entries.length)
    const { data: previous, error } = await supabase.from('daily_roster_entries').select('id, labour_id').eq('roster_id', id)
    if (error) throw error
    for (const entry of previous || []) if (!labourIds.includes(entry.labour_id)) await deleteById(supabase, 'daily_roster_entries', entry.id)
    // No header/date/totals change is attempted until ALL entry writes succeed.
    return checkedWrite(await supabase.from('daily_roster').update(header).eq('id', id).select('id'))
  },

  async create(roster, entries) {
    const result = await supabase.from('daily_roster').insert({ ...roster, total_daily_cost: 0, worker_count: 0 }).select().single()
    const created = checkedWrite(result)
    try { await rosterService.saveEntriesFirst(created.id, roster, entries) }
    catch (e) { throw new Error(`Roster ${created.id} exists, but its entries or totals were not saved: ${e.message}`) }
    return created
  },

  async update(id, updates) {
    return checkedWrite(await supabase.from('daily_roster').update(updates).eq('id', id).select('id'))
  },
  async deleteEntries(rosterId) {
    return deleteWhere(supabase, 'daily_roster_entries', 'roster_id', rosterId)
  },
  async delete(id) {
    // Parent deletion cascades entries; a refused parent delete changes none.
    return deleteById(supabase, 'daily_roster', id)
  },
}

export const truckLoadingService = {
  async getAssignments() {
    const { data, error } = await supabase
      .from('truck_loader_assignments')
      .select('*, vehicle:vehicle_id(vehicle_number, vehicle_name), worker:labour_id(full_name, labour_number)')
      .eq('is_active', true)
      .order('assigned_date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async assign(vehicleId, labourId) {
    const { data, error } = await supabase.from('truck_loader_assignments').insert({
      vehicle_id: vehicleId,
      labour_id: labourId,
      assigned_date: new Date().toISOString().split('T')[0],
      is_active: true,
    }).select('id')
    checkedWrite({ data, error })
  },

  async removeAssignment(id) {
    const { data, error } = await supabase.from('truck_loader_assignments').update({
      is_active: false,
      removed_date: new Date().toISOString().split('T')[0],
    }).eq('id', id).select('id')
    checkedWrite({ data, error })
  },

  // Optional { from, to } narrows by date; includeNull (default true) also
  // returns undated legacy rows so a range filter never silently hides them.
  // No args → returns everything (unchanged for any other caller).
  async getLogs({ from, to, includeNull = true } = {}) {
    let q = supabase
      .from('truck_loading_log')
      // payroll:payroll_id(status) — content editing is locked by the DB once
      // the linked payroll is ico_approved/md_approved/paid (single join, no N+1).
      .select('*, product:product_id(name), vehicle:vehicle_id(vehicle_number, vehicle_name), loaders:truck_loading_loaders(labour_id), payroll:payroll_id(status)')
    // Single query. The .or() with a nested and(...) mirrors the proven pattern
    // used elsewhere (bank/expense ingestion filters); "OR date is null" keeps
    // the 53 undated backfill rows visible when includeNull is on.
    if (from && to) {
      q = includeNull ? q.or(`and(date.gte.${from},date.lte.${to}),date.is.null`) : q.gte('date', from).lte('date', to)
    } else if (from) {
      q = includeNull ? q.or(`date.gte.${from},date.is.null`) : q.gte('date', from)
    } else if (to) {
      q = includeNull ? q.or(`date.lte.${to},date.is.null`) : q.lte('date', to)
    }
    q = q.order('date', { ascending: false }).order('trip_number_for_day', { ascending: false })
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  // Total count of undated rows (regardless of range) — for the toggle label.
  async getUndatedCount() {
    const { count, error } = await supabase
      .from('truck_loading_log')
      .select('id', { count: 'exact', head: true })
      .is('date', null)
    if (error) throw error
    return count || 0
  },

  async createLog({ vehicle_id, product_id, date, quantity_loaded, waybill_id }, loaderIds = []) {
    const { data, error } = await supabase
      .from('truck_loading_log')
      .insert({ vehicle_id, product_id, date, quantity_loaded, ...(waybill_id ? { waybill_id } : {}) })
      .select('*, product:product_id(name), vehicle:vehicle_id(vehicle_number, vehicle_name)')
      .single()
    checkedWrite({ data, error })
    try { await truckLoadingService.syncLoaders(data.id, loaderIds) }
    catch (e) {
      const failure = new Error(`Load ${data.id} exists, but its crew was not saved: ${e.message}`)
      failure.loadCreated = data
      throw failure
    }
    return data
  },

  async getRates() {
    const { data, error } = await supabase
      .from('truck_loading_rates')
      .select('*, product:product_id(name)')
      .order('updated_at')
    if (error) throw error
    return data || []
  },

  async updateRate(id, fields) {
    const { data, error } = await supabase
      .from('truck_loading_rates')
      .update(fields)
      .eq('id', id).select('id')
    checkedWrite({ data, error })
  },

  async deleteLog(id) {
    return deleteById(supabase, 'truck_loading_log', id)
  },

  async updateLog(id, { vehicle_id, product_id, date, quantity_loaded }) {
    const { data, error } = await supabase
      .from('truck_loading_log')
      .update({ vehicle_id, product_id, date, quantity_loaded: Number(quantity_loaded) })
      .eq('id', id).select('id')
    checkedWrite({ data, error })
  },

  async syncLoaders(loadingLogId, loaderIds) {
    await deleteWhere(supabase, 'truck_loading_loaders', 'loading_log_id', loadingLogId)
    if (loaderIds.length > 0) {
      checkedWrite(await supabase.from('truck_loading_loaders')
        .insert(loaderIds.map(lid => ({ loading_log_id: loadingLogId, labour_id: lid }))).select('id'), loaderIds.length)
    }
  },

  async getLogByWaybill(waybillId) {
    const { data, error } = await supabase
      .from('truck_loading_log')
      .select('id')
      .eq('waybill_id', waybillId)
      .maybeSingle()
    if (error) throw error
    return data
  },
}

export const payrollService = {
  async getAll() {
    const { data, error } = await supabase
      .from('weekly_labour_payroll')
      .select('*')
      .order('week_ending', { ascending: false })
    if (error) throw error
    return data || []
  },

  async create(payroll) {
    return checkedWrite(await supabase.from('weekly_labour_payroll').insert({ ...payroll, status: 'draft' }).select().single())
  },
  async update(id, updates) {
    return checkedWrite(await supabase.from('weekly_labour_payroll').update(updates).eq('id', id).select('id'))
  },
  async markPaid(id) {
    return checkedWrite(await supabase.rpc('advance_weekly_payroll', { p_payroll_id: id, p_action: 'mark_paid', p_reason: null }))
  },
}
