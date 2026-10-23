import { supabase } from '../lib/supabase'

// Phase 7B-1 — site contracts, cycles, block handovers, material receiving and
// site warnings. Every call throws the Supabase/Postgres error unchanged
// (Rule 10.5): a DB guard message ("Cycle 1 cannot start: …") reaches the UI
// verbatim, and a failed query never looks like an empty list.

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

// Columns verified against the live schema on 2026-10-22 (Rule 11).
const CONTRACT_SETTINGS = ['planning_rate_per_day', 'advance_notice_days', 'material_warning_days', 'notes']
// amount_received / paid_on are not editable: since 7C the DB keeps them equal
// to the cycle's site_receipts (record or void a receipt instead).
const CYCLE_EDITABLE = ['qty_9in', 'qty_6in', 'qty_total', 'rate_9in', 'rate_6in', 'amount_due',
  'payment_ref', 'schedule_received_on', 'notes']
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]))

// Today's date in Lagos as YYYY-MM-DD (the DB's current_date is UTC, which is
// the same calendar day except 00:00–01:00 WAT).
export const lagosToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())

// A cycle may start only when fully paid and, for full supply, the schedule is
// received. Mirrors fn_contract_cycle_guard so the UI can offer "Start early";
// the DB stays the authority.
export const isCycleFunded = (cycle, contractModel) =>
  cycle?.amount_due != null && Number(cycle.amount_received || 0) >= Number(cycle.amount_due) &&
  (contractModel === 'service_fee' || !!cycle.schedule_received_on)

export const WARNING_TABLES = ['contract_cycles', 'block_handovers', 'inventory_items', 'material_receipts']

export const siteContractsService = {
  // ── contracts ──────────────────────────────────────────────
  async listContracts() {
    return must(await supabase.from('site_contracts').select('*').order('client_name'))
  },

  async updateContractSettings(id, patch) {
    return mustTouch(await supabase.from('site_contracts').update(pick(patch, CONTRACT_SETTINGS)).eq('id', id).select(), 'Contract settings')
  },

  // ── cycles ─────────────────────────────────────────────────
  async listCycles(contractIds) {
    if (!contractIds?.length) return []
    return must(await supabase.from('contract_cycles').select('*').in('contract_id', contractIds).order('cycle_no'))
  },

  async createCycle(row) {
    const payload = { ...pick(row, CYCLE_EDITABLE), contract_id: row.contract_id, cycle_no: row.cycle_no }
    return must(await supabase.from('contract_cycles').insert(payload).select().single())
  },

  // Payment / scope fields only. Status moves go through setCycleStatus.
  async updateCycle(id, patch) {
    return mustTouch(await supabase.from('contract_cycles').update(pick(patch, CYCLE_EDITABLE)).eq('id', id).select(), 'Cycle')
  },

  async setCycleStatus(id, status, overrideReason = null) {
    const patch = { status }
    if (overrideReason) patch.override_reason = overrideReason
    return mustTouch(await supabase.from('contract_cycles').update(patch).eq('id', id).select(), 'Cycle status')
  },

  async markNoticeSent(id, kind, date) {
    const col = kind === 'completion' ? 'completion_notice_sent_on' : 'advance_notice_sent_on'
    return mustTouch(await supabase.from('contract_cycles').update({ [col]: date }).eq('id', id).select(), 'Notice date')
  },

  async listCycleAudit(cycleIds) {
    if (!cycleIds?.length) return []
    return must(await supabase.from('contract_cycle_audit')
      .select('id, cycle_id, from_status, to_status, note, actor_role, at')
      .in('cycle_id', cycleIds).order('at', { ascending: false }))
  },

  async listForecasts() {
    return must(await supabase.from('v_cycle_forecast').select('*'))
  },

  async runSiteWarnings() {
    return must(await supabase.rpc('run_site_warnings'))
  },

  // ── public holidays ────────────────────────────────────────
  async listHolidays() {
    return must(await supabase.from('public_holidays').select('holiday_date, name').order('holiday_date'))
  },
  async addHoliday(holiday_date, name) {
    return must(await supabase.from('public_holidays').insert({ holiday_date, name }).select().single())
  },
  async deleteHoliday(holiday_date) {
    return mustTouch(await supabase.from('public_holidays').delete().eq('holiday_date', holiday_date).select(), 'Holiday delete')
  },

  // ── material receiving (writes are RPC-only) ───────────────
  async listSiteItems(siteId) {
    return must(await supabase.from('inventory_items')
      .select('id, name, unit, owner, material, site_id, current_stock')
      .eq('site_id', siteId).order('name'))
  },

  async listReceipts({ siteId, from, to, itemId } = {}) {
    let q = supabase.from('material_receipts')
      .select('*, item:item_id(name, unit, owner, material)')
      .order('received_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)
    if (siteId) q = q.eq('site_id', siteId)
    if (itemId) q = q.eq('item_id', itemId)
    if (from) q = q.gte('received_on', from)
    if (to) q = q.lte('received_on', to)
    return must(await q)
  },

  async recordReceipt({ itemId, receivedOn, qtyDelivered, qtyAccepted, rejectionReason, supplier, ref, photoPath, notes }) {
    return must(await supabase.rpc('record_material_receipt', {
      p_item_id: itemId,
      p_received_on: receivedOn,
      p_qty_delivered: qtyDelivered,
      p_qty_accepted: qtyAccepted,
      p_rejection_reason: rejectionReason || null,
      p_supplier: supplier || null,
      p_ref: ref || null,
      p_photo_path: photoPath || null,
      p_notes: notes || null,
    }))
  },

  async voidReceipt(id, reason) {
    must(await supabase.rpc('void_material_receipt', { p_id: id, p_reason: reason }))
  },

  // ── block handovers ────────────────────────────────────────
  async listHandovers({ siteId } = {}) {
    let q = supabase.from('block_handovers').select('*')
      .order('handover_date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    if (siteId) q = q.eq('site_id', siteId)
    return must(await q)
  },

  async createHandover(row) {
    const payload = pick(row, ['site_id', 'handover_date', 'block_type', 'qty_handed_over', 'client_rep', 'photo_path', 'notes'])
    return must(await supabase.from('block_handovers').insert(payload).select().single())
  },

  async recordVerdict(id, { qty_accepted, qty_rejected, rejection_reason, verdict_on }) {
    return mustTouch(await supabase.from('block_handovers')
      .update({ qty_accepted, qty_rejected, rejection_reason: rejection_reason || null, verdict_on })
      .eq('id', id).select(), 'Verdict')
  },

  async recordRectification(id, { rectified_on, rectification_notes }) {
    return mustTouch(await supabase.from('block_handovers')
      .update({ rectified_on, rectification_notes: rectification_notes || null })
      .eq('id', id).select(), 'Rectification')
  },

  async deleteHandover(id) {
    return mustTouch(await supabase.from('block_handovers').delete().eq('id', id).select(), 'Handover delete')
  },

  async listYard(siteId) {
    let q = supabase.from('v_site_yard').select('*').order('block_type')
    if (siteId) q = q.eq('site_id', siteId)
    return must(await q)
  },

  async listRunway() {
    return must(await supabase.from('v_site_material_runway').select('*').order('item_name'))
  },

  // ── dashboard ──────────────────────────────────────────────
  async outputOn(siteIds, date) {
    if (!siteIds?.length) return {}
    const rows = must(await supabase.from('production_log').select('site_id, quantity_produced')
      .in('site_id', siteIds).eq('date', date))
    return rows.reduce((acc, r) => ({ ...acc, [r.site_id]: (acc[r.site_id] || 0) + Number(r.quantity_produced || 0) }), {})
  },

  // Unread site-warning notifications for this user, counted per site. The
  // notification row carries no site, so each related record is resolved to
  // its site.
  async openWarningsBySite(userId) {
    if (!userId) return {}
    const notes = must(await supabase.from('notifications').select('related_table, related_id')
      .eq('recipient_id', userId).is('read_at', null).in('related_table', WARNING_TABLES))
    const ids = (t) => [...new Set(notes.filter(n => n.related_table === t && n.related_id).map(n => n.related_id))]
    const siteOf = {}
    const cycleIds = ids('contract_cycles')
    if (cycleIds.length) {
      const rows = must(await supabase.from('contract_cycles').select('id, contract:contract_id(site_id)').in('id', cycleIds))
      rows.forEach(r => { siteOf[r.id] = r.contract?.site_id })
    }
    for (const t of ['block_handovers', 'inventory_items', 'material_receipts']) {
      const list = ids(t)
      if (!list.length) continue
      const rows = must(await supabase.from(t).select('id, site_id').in('id', list))
      rows.forEach(r => { siteOf[r.id] = r.site_id })
    }
    return notes.reduce((acc, n) => {
      const s = siteOf[n.related_id]
      if (s) acc[s] = (acc[s] || 0) + 1
      return acc
    }, {})
  },

  // ── photos (private bucket `site-records`) ────────────────
  // Path: <site_code>/<receipts|handovers>/<yyyy-mm-dd>/<uuid>.<ext>
  async uploadPhoto({ siteCode, kind, date, file }) {
    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${siteCode || 'SITE'}/${kind}/${date}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('site-records')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
    if (error) throw error
    return path
  },
}
