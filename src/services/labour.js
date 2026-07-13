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

async function getOrCreateExpenseCategory(name) {
  const { data } = await supabase
    .from('expense_categories')
    .select('id')
    .ilike('name', name)
    .limit(1)
  if (data?.[0]?.id) return data[0].id
  const { data: c } = await supabase
    .from('expense_categories')
    .insert({ name, is_active: true })
    .select('id')
    .single()
  return c?.id || null
}

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
    const { error } = await supabase.from('labour_roles').update(updates).eq('id', id)
    if (error) throw error
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
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { error } = await supabase.from('labour_pool').update(updates).eq('id', id)
    if (error) throw error
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
    if (error) throw error
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
    const { error } = await supabase.from('labour_rate_change_requests').update(updates).eq('id', id)
    if (error) throw error
  },

  async mdReview(id, status, comments, reviewerName) {
    const updates = {
      md_approved_by: reviewerName,
      md_approval_date: new Date().toISOString().split('T')[0],
      md_comments: comments,
      md_status: status,
      overall_status: status === 'approved' ? 'approved' : 'rejected',
    }
    if (status === 'approved') {
      const { data: req } = await supabase
        .from('labour_rate_change_requests')
        .select('role_id, proposed_rate, proposed_bonus, effective_date')
        .eq('id', id)
        .single()
      if (req) {
        await supabase.from('labour_roles').update({
          base_rate: req.proposed_rate,
          target_bonus: req.proposed_bonus,
          effective_date: req.effective_date || new Date().toISOString().split('T')[0],
          approved_by: reviewerName,
        }).eq('id', req.role_id)
      }
    }
    const { error } = await supabase.from('labour_rate_change_requests').update(updates).eq('id', id)
    if (error) throw error
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

  async getByDate(date) {
    const { data } = await supabase
      .from('daily_roster')
      .select('*, entries:daily_roster_entries(*, worker:labour_id(full_name, labour_number), role:role_id(role_name))')
      .eq('roster_date', date)
      .maybeSingle()
    return data
  },

  async create(roster, entries) {
    const { data: r, error: re } = await supabase
      .from('daily_roster')
      .insert(roster)
      .select()
      .single()
    if (re) throw re
    if (entries.length > 0) {
      const { error: ee } = await supabase
        .from('daily_roster_entries')
        .insert(entries.map(e => ({ ...e, roster_id: r.id })))
      if (ee) throw ee
    }
    return r
  },

  async update(id, updates) {
    const { error } = await supabase.from('daily_roster').update(updates).eq('id', id)
    if (error) throw error
  },

  async deleteEntries(rosterId) {
    await supabase.from('daily_roster_entries').delete().eq('roster_id', rosterId)
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
    const { error } = await supabase.from('truck_loader_assignments').insert({
      vehicle_id: vehicleId,
      labour_id: labourId,
      assigned_date: new Date().toISOString().split('T')[0],
      is_active: true,
    })
    if (error) throw error
  },

  async removeAssignment(id) {
    const { error } = await supabase.from('truck_loader_assignments').update({
      is_active: false,
      removed_date: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    if (error) throw error
  },

  async getLogs() {
    const { data, error } = await supabase
      .from('truck_loading_log')
      .select('*, product:product_id(name), vehicle:vehicle_id(vehicle_number, vehicle_name), loaders:truck_loading_loaders(labour_id)')
      .order('date', { ascending: false })
      .order('trip_number_for_day', { ascending: false })
    if (error) throw error
    return data || []
  },

  async createLog({ vehicle_id, product_id, date, quantity_loaded, waybill_id }, loaderIds = []) {
    const { data, error } = await supabase
      .from('truck_loading_log')
      .insert({ vehicle_id, product_id, date, quantity_loaded, ...(waybill_id ? { waybill_id } : {}) })
      .select('*, product:product_id(name), vehicle:vehicle_id(vehicle_number, vehicle_name)')
      .single()
    if (error) throw error
    if (loaderIds.length > 0) {
      await supabase.from('truck_loading_loaders')
        .insert(loaderIds.map(lid => ({ loading_log_id: data.id, labour_id: lid })))
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
    const { error } = await supabase
      .from('truck_loading_rates')
      .update(fields)
      .eq('id', id)
    if (error) throw error
  },

  async deleteLog(id) {
    const { error } = await supabase.from('truck_loading_log').delete().eq('id', id);
    if (error) throw error;
  },

  async updateLog(id, { vehicle_id, product_id, date, quantity_loaded }) {
    const { error } = await supabase
      .from('truck_loading_log')
      .update({ vehicle_id, product_id, date, quantity_loaded: Number(quantity_loaded) })
      .eq('id', id)
    if (error) throw error
  },

  async syncLoaders(loadingLogId, loaderIds) {
    await supabase.from('truck_loading_loaders').delete().eq('loading_log_id', loadingLogId)
    if (loaderIds.length > 0) {
      const { error } = await supabase.from('truck_loading_loaders')
        .insert(loaderIds.map(lid => ({ loading_log_id: loadingLogId, labour_id: lid })))
      if (error) throw error
    }
  },

  async getLogByWaybill(waybillId) {
    const { data } = await supabase
      .from('truck_loading_log')
      .select('id')
      .eq('waybill_id', waybillId)
      .maybeSingle()
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
    const { error: upErr } = await supabase.from('weekly_labour_payroll').upsert(
      payroll,
      { onConflict: 'week_ending,payroll_type', ignoreDuplicates: true }
    )
    if (upErr) throw upErr
    const { data, error } = await supabase.from('weekly_labour_payroll')
      .select('*').eq('week_ending', payroll.week_ending).eq('payroll_type', payroll.payroll_type).single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { error } = await supabase.from('weekly_labour_payroll').update(updates).eq('id', id)
    if (error) throw error
  },

  async markPaid(id, paymentDate, totalAmount, workerCount, payrollType, weekEnding, mdName) {
    const { error: updateErr } = await supabase.from('weekly_labour_payroll').update({
      status: 'paid',
      payment_date: paymentDate,
    }).eq('id', id)
    if (updateErr) throw updateErr

    // Auto-create expense entry
    try {
      const catName = payrollType === 'loading' ? 'Loading & Offloading' : 'Daily Labour Wages'
      const categoryId = await getOrCreateExpenseCategory(catName)
      const desc = payrollType === 'production'
        ? `Production Labour Week ending ${weekEnding} — ${workerCount} workers`
        : payrollType === 'loading'
          ? `Truck Loading Week ending ${weekEnding} — ${workerCount} loaders`
          : `Monthly Fixed Labour — ${weekEnding}`
      await supabase.from('expenses').insert({
        category_id: categoryId,
        description: desc,
        amount: totalAmount,
        expense_date: paymentDate,
        status: 'approved',
        vendor: 'Labour Pool',
      })
    } catch {
      // Expense creation failure doesn't block payroll marking
    }
  },
}
