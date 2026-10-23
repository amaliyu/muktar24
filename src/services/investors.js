import { supabase } from '../lib/supabase'

// Phase 7C — investor register, capital, terms, reserve budgets, site receipts,
// SPV transfers and the monthly NDC close. Every call throws the Supabase /
// Postgres error unchanged (Rule 10.5): the triggers and RPCs raise
// plain-English messages ("These terms were used in an approved month…") that
// the pages show verbatim, and a failed query never looks like an empty list.
// Columns and RPC arguments verified against the live schema on 2026-10-23
// (Rule 11; record: supabase/migrations/20261023000000_phase7c_…sql).

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

// An UPDATE/DELETE that RLS filters out affects zero rows without an error
// (Rule 10.4). Ask for the rows back and treat "none" as a failure.
const mustTouch = (res, what) => {
  const data = must(res)
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error(`${what} was not saved — you may not have permission, or the record no longer exists.`)
  }
  return Array.isArray(data) ? data[0] : data
}

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]))
const blank = (v) => (typeof v === 'string' ? (v.trim() || null) : (v ?? null))

const INVESTOR_FIELDS = ['name', 'phone', 'email', 'notes', 'is_active']
// The receipt form's columns. bank_account_id is the only bank field — an
// account number is never read or sent.
const RECEIPT_FIELDS = ['site_id', 'cycle_id', 'received_on', 'amount', 'payer', 'reference', 'bank_account_id', 'notes']
const TERM_FIELDS = ['name', 'version', 'tiers', 'term_years', 'management_fee_pct', 'management_fee_basis', 'deductible_category_ids', 'notes']

export const investorsService = {
  // ── register ───────────────────────────────────────────────
  async listInvestors() {
    return must(await supabase.from('investors')
      .select('id, name, kind, phone, email, notes, user_id, is_active, created_at')
      .order('kind').order('name'))
  },

  async createInvestor(form) {
    const row = { ...pick(form, INVESTOR_FIELDS), kind: 'external' }
    return must(await supabase.from('investors').insert({
      name: row.name.trim(), kind: 'external', phone: blank(row.phone), email: blank(row.email), notes: blank(row.notes),
      is_active: row.is_active !== false,
    }).select().single())
  },

  // kind is never sent: an external investor stays external and the APCL row
  // stays APCL. The APCL row is never deactivated from the app.
  async updateInvestor(id, form, { isApcl = false } = {}) {
    const patch = {
      name: form.name.trim(), phone: blank(form.phone), email: blank(form.email), notes: blank(form.notes),
    }
    if (!isApcl && 'is_active' in form) patch.is_active = !!form.is_active
    return mustTouch(await supabase.from('investors').update(patch).eq('id', id).select(), 'Investor')
  },

  async setInvestorActive(id, isActive) {
    return mustTouch(await supabase.from('investors').update({ is_active: isActive }).eq('id', id).neq('kind', 'apcl').select(), 'Investor')
  },

  async linkLogin(id, userId) {
    return mustTouch(await supabase.from('investors').update({ user_id: userId || null }).eq('id', id).select(), 'Login link')
  },

  // Logins that may be linked: user_profiles with the 'investor' role.
  async listInvestorLogins() {
    return must(await supabase.from('user_profiles')
      .select('id, full_name, email, is_active')
      .eq('role', 'investor').order('full_name'))
  },

  async listPositions() {
    return must(await supabase.from('v_investor_position')
      .select('investor_id, name, site_id, capital_net, distributions_paid, distributions_due'))
  },

  // ── capital ────────────────────────────────────────────────
  async listContributions(siteId) {
    return must(await supabase.from('capital_contributions')
      .select('id, investor_id, site_id, asset_id, kind, amount, contributed_on, reference, notes, created_at')
      .eq('site_id', siteId)
      .order('contributed_on').order('created_at'))
  },

  async addContribution(row) {
    const payload = {
      investor_id: row.investor_id, site_id: row.site_id, asset_id: row.asset_id || null,
      kind: row.kind, amount: row.amount, contributed_on: row.contributed_on,
      reference: blank(row.reference), notes: blank(row.notes),
    }
    return must(await supabase.from('capital_contributions').insert(payload).select().single())
  },

  // Capital each investor has at a site on a day (capital tied to an asset
  // follows the asset). Staff pages only — never called from the investor portal.
  async capitalOn(siteId, day) {
    return must(await supabase.rpc('fn_site_capital_on', { p_site: siteId, p_day: day }))
  },

  async listSiteAssets(siteId) {
    return must(await supabase.from('v_site_asset_register')
      .select('asset_id, code, name, category, quantity, site_id')
      .eq('site_id', siteId).order('category').order('name'))
  },

  async listAssetsByIds(ids) {
    if (!ids?.length) return []
    return must(await supabase.from('v_site_asset_register')
      .select('asset_id, code, name, site_name').in('asset_id', ids))
  },

  // ── terms ──────────────────────────────────────────────────
  async listTerms() {
    return must(await supabase.from('term_templates')
      .select('id, name, version, tiers, term_years, management_fee_pct, management_fee_basis, deductible_category_ids, notes, created_at')
      .order('name').order('version', { ascending: false }))
  },

  // Always a new row — a version is never edited in place from the app.
  async createTermVersion(t) {
    const payload = pick(t, TERM_FIELDS)
    payload.notes = blank(payload.notes)
    return must(await supabase.from('term_templates').insert(payload).select().single())
  },

  async listExpenseCategories() {
    return must(await supabase.from('expense_categories').select('id, name, is_active, cost_center').order('name'))
  },

  async listSiteTerms(siteId) {
    return must(await supabase.from('site_pool_terms')
      .select('site_id, effective_from, term_template_id, notes, created_at')
      .eq('site_id', siteId).order('effective_from', { ascending: false }))
  },

  async setSiteTerms({ siteId, effectiveFrom, termTemplateId, notes }) {
    return must(await supabase.from('site_pool_terms').insert({
      site_id: siteId, effective_from: effectiveFrom, term_template_id: termTemplateId, notes: blank(notes),
    }).select().single())
  },

  // ── reserve budgets ────────────────────────────────────────
  async listReserves(siteId, from, to) {
    return must(await supabase.from('site_reserve_budgets')
      .select('site_id, month, amount, notes')
      .eq('site_id', siteId).gte('month', from).lte('month', to).order('month'))
  },

  async saveReserve({ siteId, month, amount }) {
    return mustTouch(await supabase.from('site_reserve_budgets')
      .upsert({ site_id: siteId, month, amount }, { onConflict: 'site_id,month' }).select(), 'Reserve budget')
  },

  async deleteReserve({ siteId, month }) {
    return mustTouch(await supabase.from('site_reserve_budgets').delete().eq('site_id', siteId).eq('month', month).select(), 'Reserve budget')
  },

  // ── site receipts ──────────────────────────────────────────
  async listSiteReceipts(siteId) {
    return must(await supabase.from('site_receipts')
      .select('id, site_id, cycle_id, received_on, amount, payer, reference, bank_account_id, notes, voided, void_reason, created_at')
      .eq('site_id', siteId)
      .order('received_on', { ascending: false }).order('created_at', { ascending: false }))
  },

  async recordSiteReceipt(form) {
    const row = pick(form, RECEIPT_FIELDS)
    const payload = {
      site_id: row.site_id, cycle_id: row.cycle_id || null, received_on: row.received_on, amount: row.amount,
      payer: blank(row.payer), reference: blank(row.reference), bank_account_id: row.bank_account_id || null, notes: blank(row.notes),
    }
    return must(await supabase.from('site_receipts').insert(payload).select().single())
  },

  async voidSiteReceipt(id, reason) {
    return mustTouch(await supabase.from('site_receipts').update({ voided: true, void_reason: reason.trim() }).eq('id', id).select(), 'Void')
  },

  // Bank accounts for the receipt picker: bank and account name only.
  async listBankAccounts() {
    return must(await supabase.from('bank_accounts').select('id, bank_name, account_name, is_active').order('bank_name'))
  },

  // ── SPV ledger ─────────────────────────────────────────────
  async listLedger(siteId) {
    return must(await supabase.from('v_spv_ledger')
      .select('site_id, entry_date, entry_type, owed_to_spv, paid_out, reference, source_id')
      .eq('site_id', siteId).order('entry_date'))
  },

  async recordTransfer({ siteId, transferredOn, amount, reference, notes }) {
    return must(await supabase.from('spv_transfers').insert({
      site_id: siteId, transferred_on: transferredOn, amount, reference: blank(reference), notes: blank(notes),
    }).select().single())
  },

  // ── monthly close ──────────────────────────────────────────
  async listPeriods(siteId, { month, status } = {}) {
    let q = supabase.from('ndc_periods').select('*').eq('site_id', siteId)
    if (month) q = q.eq('period_month', month)
    if (status) q = q.eq('status', status)
    return must(await q.order('period_month', { ascending: false }).order('created_at', { ascending: false }))
  },

  async listDistributions(periodId) {
    return must(await supabase.from('distributions')
      .select('id, period_id, site_id, investor_id, share_type, capital_share, amount, paid_on, paid_reference')
      .eq('period_id', periodId))
  },

  // One investor's distribution rows at a site, with their month and status.
  async listInvestorHistory(investorId, siteId) {
    const rows = must(await supabase.from('distributions')
      .select('id, period_id, site_id, investor_id, share_type, capital_share, amount, paid_on, paid_reference, period:period_id(period_month, status)')
      .eq('investor_id', investorId).eq('site_id', siteId))
    return rows.filter(r => r.period?.status === 'approved').map(r => ({ ...r, period_month: r.period.period_month }))
  },

  async computeMonth(siteId, month) {
    return must(await supabase.rpc('compute_ndc_period', { p_site_id: siteId, p_month: month }))
  },
  async approveMonth(periodId) {
    return must(await supabase.rpc('approve_ndc_period', { p_period_id: periodId }))
  },
  async voidMonth(periodId, reason) {
    return must(await supabase.rpc('void_ndc_period', { p_period_id: periodId, p_reason: reason }))
  },
  async markPaid(distributionId, paidOn, reference) {
    return must(await supabase.rpc('mark_distribution_paid', { p_distribution_id: distributionId, p_paid_on: paidOn, p_reference: reference || null }))
  },
}

// The investor portal reads ONLY these: its own investors row, its own
// positions and distributions, the approved months they belong to, the terms
// of those months and the names of its own sites. RLS limits each further.
export const myInvestmentService = {
  async myInvestor(userId) {
    return must(await supabase.from('investors').select('id, name, kind').eq('user_id', userId).maybeSingle())
  },
  async myPositions(investorId) {
    return must(await supabase.from('v_investor_position')
      .select('investor_id, site_id, capital_net, distributions_paid, distributions_due').eq('investor_id', investorId))
  },
  async myDistributions(investorId) {
    return must(await supabase.from('distributions')
      .select('id, period_id, site_id, investor_id, share_type, capital_share, amount, paid_on, paid_reference')
      .eq('investor_id', investorId))
  },
  async periods(ids) {
    if (!ids?.length) return []
    return must(await supabase.from('ndc_periods').select('*').in('id', ids).eq('status', 'approved'))
  },
  async terms(ids) {
    if (!ids?.length) return []
    return must(await supabase.from('term_templates').select('id, name, version, tiers').in('id', ids))
  },
  async siteNames(ids) {
    if (!ids?.length) return []
    return must(await supabase.from('production_sites').select('id, name').in('id', ids))
  },
}
