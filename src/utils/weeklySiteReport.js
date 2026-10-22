// Phase 7B-2 — weekly site report model. Pure: takes plain arrays (already
// fetched) and returns { sections, totals } for the PDF renderer to draw.
//
// CLIENT version: quantities and dates only. The only naira figures allowed
// are the client's own money on a service-fee contract (fee earned on accepted
// blocks, mobilisation advance balance, payments received). A full-supply
// payment amount is qty × APCL's rate, so it would reveal the price — on a
// full-supply client report payments show status, ref and date only.
// INTERNAL version (md, ico): adds site expenses and the provisional margin.
//
// Money cells are { money: n } so the renderer formats them and the tests can
// prove the client model carries none.

export const BLOCK_9IN = '9 Inch 3 Hole Block'
export const BLOCK_6IN = '6 Inch 3 Hole Closed'
// Budget yield in blocks per bag of cement (§11 7B-2).
export const YIELD_BUDGET = { [BLOCK_9IN]: 40, [BLOCK_6IN]: 45 }
// Damage before handover; loading/delivery damage is not site production loss.
export const PRODUCTION_DAMAGE_STAGES = ['production', 'stacking', 'curing']
export const PROVISIONAL = 'Provisional — reconciled in 7C'

const DAY_MS = 86400000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── week helpers (Africa/Lagos) ─────────────────────────────
// The calendar date in Lagos for an instant, as YYYY-MM-DD.
export const lagosDateOf = (instant = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(instant))

const isoAdd = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()   // 0 = Sun

// Monday–Sunday week containing an ISO date.
export const weekOf = (iso) => {
  const back = (weekdayOf(iso) + 6) % 7
  const from = isoAdd(iso, -back)
  return { from, to: isoAdd(from, 6) }
}

// The last fully completed Mon–Sun week, judged by the Lagos calendar date.
export const lastCompletedWeek = (instant = new Date()) => weekOf(isoAdd(weekOf(lagosDateOf(instant)).from, -7))

export const weekDates = ({ from }) => Array.from({ length: 7 }, (_, i) => isoAdd(from, i))

export const shortDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
export const dayLabel = (iso) => `${DAYS[weekdayOf(iso)]} ${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`
export const weekLabel = (week) => `${shortDate(week.from)} – ${shortDate(week.to)}`

// ── small pure calculations (exported for tests) ────────────
const n = (v) => Number(v) || 0
const sum = (rows, f) => rows.reduce((s, r) => s + n(typeof f === 'function' ? f(r) : r[f]), 0)
const inWeek = (iso, week) => !!iso && iso >= week.from && iso <= week.to
const money = (v) => ({ money: Math.round(n(v) * 100) / 100 })

// Good blocks = produced − production/stacking/curing damage, per block type.
export function goodBlocksByType(production, damages) {
  const out = {}
  for (const p of production) {
    const t = p.block_type
    out[t] = out[t] || { produced: 0, damaged: 0, good: 0 }
    out[t].produced += n(p.quantity_produced)
  }
  for (const d of damages) {
    if (!PRODUCTION_DAMAGE_STAGES.includes(d.stage)) continue
    const t = d.block_type
    out[t] = out[t] || { produced: 0, damaged: 0, good: 0 }
    out[t].damaged += n(d.quantity_damaged)
  }
  for (const t of Object.keys(out)) out[t].good = out[t].produced - out[t].damaged
  return out
}

// Blocks per bag of cement per block type, against budget.
export function yieldByType(production) {
  const by = {}
  for (const p of production) {
    const t = p.block_type
    by[t] = by[t] || { produced: 0, bags: 0 }
    by[t].produced += n(p.quantity_produced)
    by[t].bags += n(p.cement_bags)
  }
  return Object.entries(by).map(([type, v]) => {
    const perBag = v.bags > 0 ? v.produced / v.bags : null
    const budget = YIELD_BUDGET[type] ?? null
    return {
      type, produced: v.produced, bags: v.bags,
      perBag: perBag == null ? null : Math.round(perBag * 10) / 10,
      budget,
      variancePct: perBag != null && budget ? Math.round(((perBag - budget) / budget) * 1000) / 10 : null,
    }
  })
}

// Service fee: earned only on accepted blocks (deemed acceptance included —
// the DB sets qty_accepted when it deems).
export const feeEarned = (acceptedBlocks, feePerBlock) => n(acceptedBlocks) * n(feePerBlock)

// The cycle that governed the week: one active during it, else the current one.
export function cycleForWeek(cycles, week) {
  const live = cycles.filter(c => c.status !== 'cancelled')
  const during = live.filter(c => c.started_on && c.started_on <= week.to && (!c.completed_on || c.completed_on >= week.from))
  if (during.length) return during.sort((a, b) => b.cycle_no - a.cycle_no)[0]
  return live.find(c => c.status === 'active') ||
    [...live].sort((a, b) => b.cycle_no - a.cycle_no).find(c => ['awaiting_payment', 'completed'].includes(c.status)) || null
}

// ── the model ───────────────────────────────────────────────
export function buildWeeklySiteReport({
  version = 'client', week, contract, site, cycles = [], forecasts = [],
  production = [], damages = [], handovers = [], receipts = [], items = [], movements = [], expenses = [],
  preparedBy = '', generatedOn = '',
}) {
  if (!['client', 'internal'].includes(version)) throw new Error(`Unknown report version: ${version}`)
  const internal = version === 'internal'
  const serviceFee = contract.contract_model === 'service_fee'
  const fullSupply = contract.contract_model === 'full_supply'
  const sections = []

  // Only the week, only this site — the caller may pass wider lists.
  const siteId = site.id
  const atSite = (r) => !r.site_id || r.site_id === siteId
  const prodW = production.filter(p => atSite(p) && inWeek(p.date, week))
  const dmgW = damages.filter(d => atSite(d) && inWeek(d.date, week))
  const hoW = handovers.filter(h => atSite(h) && inWeek(h.handover_date, week))
  const rcW = receipts.filter(r => atSite(r) && !r.voided && inWeek(r.received_on, week))
  const expW = expenses.filter(e => atSite(e) && inWeek(e.expense_date, week))

  // 1. Header
  sections.push({
    id: 'header', kind: 'facts', title: 'Report',
    items: [
      { label: 'Client', value: contract.client_name || '—' },
      { label: 'Site', value: site.name || '—' },
      { label: 'Contract ref', value: contract.contract_ref || '—' },
      { label: 'Week', value: weekLabel(week) },
    ],
  })

  // 2. Production by block type and day
  const good = goodBlocksByType(prodW, dmgW)
  const types = Object.keys(good).sort()
  const days = weekDates(week)
  const produced = sum(prodW, 'quantity_produced')
  const damagedTotal = types.reduce((s, t) => s + good[t].damaged, 0)
  const goodTotal = produced - damagedTotal
  if (prodW.length === 0) {
    sections.push({ id: 'production', kind: 'text', title: 'Production', text: 'No production recorded this week.' })
  } else {
    const rows = []
    for (const d of days) {
      for (const t of types) {
        const p = sum(prodW.filter(r => r.date === d && r.block_type === t), 'quantity_produced')
        const dm = sum(dmgW.filter(r => r.date === d && r.block_type === t && PRODUCTION_DAMAGE_STAGES.includes(r.stage)), 'quantity_damaged')
        if (p || dm) rows.push([dayLabel(d), t, p, dm, p - dm])
      }
    }
    sections.push({
      id: 'production', kind: 'table', title: 'Production by block type and day',
      head: ['Day', 'Block type', 'Produced', 'Damaged', 'Good'], numericCols: [2, 3, 4],
      rows,
      foot: types.map(t => ['Week total', t, good[t].produced, good[t].damaged, good[t].good]),
      note: 'Damaged = production, stacking and curing damage. Good = produced − damaged.',
    })
  }

  // 3. Handovers
  const hoTypes = [...new Set(hoW.map(h => h.block_type))].sort()
  const accepted = sum(hoW, 'qty_accepted')
  const hoSummary = (rows) => ({
    handed: sum(rows, 'qty_handed_over'),
    accepted: sum(rows.filter(h => !h.deemed), 'qty_accepted'),
    deemed: sum(rows.filter(h => h.deemed), 'qty_accepted'),
    rejected: sum(rows, 'qty_rejected'),
    pending: sum(rows.filter(h => h.status === 'pending'), r => n(r.qty_handed_over) - n(r.qty_accepted) - n(r.qty_rejected)),
  })
  if (hoW.length === 0) {
    sections.push({ id: 'handovers', kind: 'text', title: 'Handovers', text: 'No handovers recorded this week.' })
  } else {
    const rows = hoTypes.map(t => {
      const s = hoSummary(hoW.filter(h => h.block_type === t))
      return [t, s.handed, s.accepted, s.deemed, s.rejected, s.pending]
    })
    const all = hoSummary(hoW)
    const reasons = hoW.filter(h => n(h.qty_rejected) > 0)
      .map(h => `${shortDate(h.handover_date)} · ${h.block_type} · ${n(h.qty_rejected).toLocaleString('en-NG')} rejected — ${h.rejection_reason || 'no reason given'}`)
    sections.push({
      id: 'handovers', kind: 'table', title: 'Handovers',
      head: ['Block type', 'Handed over', 'Accepted', 'Deemed accepted', 'Rejected', 'Pending'], numericCols: [1, 2, 3, 4, 5],
      rows,
      foot: hoTypes.length > 1 ? [['Total', all.handed, all.accepted, all.deemed, all.rejected, all.pending]] : [],
      lines: reasons.length ? ['Rejection reasons:', ...reasons] : [],
    })
  }

  // 4. Materials (quantities only — never a unit cost)
  const matRows = []
  for (const it of items.filter(atSite)) {
    const rc = rcW.filter(r => r.item_id === it.id)
    const usedW = sum(movements.filter(m => m.item_id === it.id && m.movement_type === 'out' && inWeek(m.date, week) && String(m.reference || '').startsWith('PROD-')), 'quantity')
    // Closing balance at week end = current stock with every movement dated
    // after the week reversed.
    const after = movements.filter(m => m.item_id === it.id && m.date > week.to)
    const closing = n(it.current_stock) - sum(after.filter(m => m.movement_type === 'in'), 'quantity') + sum(after.filter(m => m.movement_type === 'out'), 'quantity')
    matRows.push({
      owner: it.owner,
      row: [it.name + (it.unit ? ` (${it.unit})` : ''), it.owner === 'client' ? `${contract.client_name || 'Client'}-owned` : 'Supplied by APCL',
        sum(rc, 'qty_accepted'), sum(rc, 'qty_rejected'), usedW, Math.round(closing * 100) / 100],
    })
  }
  const matReasons = rcW.filter(r => n(r.qty_rejected) > 0).map(r => {
    const it = items.find(i => i.id === r.item_id)
    return `${shortDate(r.received_on)} · ${it?.name || 'material'} · ${n(r.qty_rejected).toLocaleString('en-NG')} rejected — ${r.rejection_reason || 'no reason given'}`
  })
  sections.push(matRows.length ? {
    id: 'materials', kind: 'table', title: 'Materials',
    head: ['Material', 'Owner', 'Received (accepted)', 'Rejected', 'Used', 'Closing balance'], numericCols: [2, 3, 4, 5],
    rows: matRows.map(m => m.row),
    note: fullSupply ? 'Materials at this site are supplied by APCL. Quantities only.' : 'Used = issued to production this week. Closing balance at the end of the week.',
    lines: matReasons.length ? ['Rejected deliveries:', ...matReasons] : [],
  } : { id: 'materials', kind: 'text', title: 'Materials', text: 'No site stock items recorded.' })

  // 5. Yield
  const yields = yieldByType(prodW)
  sections.push(yields.length ? {
    id: 'yield', kind: 'table', title: 'Yield (blocks per bag of cement)',
    head: ['Block type', 'Produced', 'Cement bags', 'Blocks per bag', 'Budget', 'Variance'], numericCols: [1, 2, 3, 4, 5],
    rows: yields.map(y => [y.type, y.produced, y.bags, y.perBag ?? '—', y.budget ?? '—',
      y.variancePct == null ? '—' : `${y.variancePct > 0 ? '+' : ''}${y.variancePct}%`]),
    note: 'Budget: 40 blocks per bag for 9-inch, 45 for 6-inch.',
  } : { id: 'yield', kind: 'text', title: 'Yield (blocks per bag of cement)', text: 'No production recorded this week.' })

  // 6. Cycle status
  const cyc = cycleForWeek(cycles, week)
  const fc = cyc ? forecasts.find(f => f.cycle_id === cyc.id) : null
  sections.push(cyc ? {
    id: 'cycle', kind: 'facts', title: `Cycle status (as at ${shortDate(generatedOn)})`,
    items: [
      { label: 'Cycle no', value: String(cyc.cycle_no) },
      { label: serviceFee ? 'Prepaid quantity (accepted blocks)' : 'Prepaid quantity', value: n(fc?.qty_total ?? cyc.qty_total) },
      { label: 'Done', value: n(fc?.done) },
      { label: 'Remaining', value: n(fc?.remaining ?? cyc.qty_total) },
      { label: 'Forecast finish', value: cyc.status === 'active' && fc?.forecast_completion ? shortDate(fc.forecast_completion) : (cyc.completed_on ? `Completed ${shortDate(cyc.completed_on)}` : '—') },
      { label: 'Forecast basis', value: fc ? (fc.rate_basis === 'actual' ? 'Actual 5-day average output' : 'Planning rate (fewer than 5 production days)') : '—' },
      { label: 'Status', value: String(cyc.status || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) },
    ],
  } : { id: 'cycle', kind: 'text', title: 'Cycle status', text: 'No cycle recorded for this contract.' })

  // 7. Client payments received (the client's own money)
  const paid = cycles.filter(c => n(c.amount_received) > 0 || c.paid_on)
  if (paid.length) {
    sections.push(serviceFee || internal ? {
      id: 'payments', kind: 'table', title: 'Payments received',
      head: ['Cycle', 'Amount received', 'Reference', 'Paid on'], numericCols: [1],
      rows: paid.map(c => [String(c.cycle_no), money(c.amount_received), c.payment_ref || '—', shortDate(c.paid_on)]),
    } : {
      id: 'payments', kind: 'table', title: 'Payments received',
      head: ['Cycle', 'Payment', 'Reference', 'Paid on'],
      rows: paid.map(c => [String(c.cycle_no), c.amount_due != null && n(c.amount_received) >= n(c.amount_due) ? 'Paid in full' : 'Part paid', c.payment_ref || '—', shortDate(c.paid_on)]),
    })
  }

  // 8. Service fee: fee earned and advance balance (client's own money)
  const totals = {
    produced, damaged: damagedTotal, good: goodTotal,
    handedOver: sum(hoW, 'qty_handed_over'), accepted, rejected: sum(hoW, 'qty_rejected'),
  }
  const moneyTotals = {}
  if (serviceFee) {
    const fee = n(contract.fee_per_block)
    const earned = feeEarned(accepted, fee)
    const c1 = cycles.find(c => c.cycle_no === 1)
    const toDate = handovers.filter(h => atSite(h) && h.handover_date <= week.to && (!c1 || !h.cycle_id || h.cycle_id === c1.id))
    const advance = n(c1?.amount_received)
    const balance = Math.max(0, advance - feeEarned(sum(toDate, 'qty_accepted'), fee))
    moneyTotals.feeEarned = earned
    moneyTotals.advanceBalance = balance
    sections.push({
      id: 'fee', kind: 'facts', title: 'Service fee',
      items: [
        { label: 'Accepted blocks this week', value: accepted },
        { label: 'Fee earned on accepted blocks', value: money(earned) },
        { label: `Mobilisation advance balance (at ${shortDate(week.to)})`, value: money(balance) },
      ],
    })
  }

  // 9. INTERNAL only: expenses and provisional margin
  if (internal) {
    const byCat = {}
    for (const e of expW) {
      const k = e.category_name || e.category?.name || 'Uncategorised'
      byCat[k] = (byCat[k] || 0) + n(e.amount)
    }
    const expTotal = sum(expW, 'amount')
    moneyTotals.expenses = expTotal
    sections.push(expW.length ? {
      id: 'expenses', kind: 'table', title: 'Site expenses (internal)',
      head: ['Category', 'Amount'], numericCols: [1],
      rows: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v)]),
      foot: [['Total', money(expTotal)]],
      note: `Expenses tagged to this site, dated in the week. Labour from daily rosters is included. ${PROVISIONAL}.`,
    } : { id: 'expenses', kind: 'text', title: 'Site expenses (internal)', text: `No expenses recorded for this site this week. ${PROVISIONAL}.` })

    if (fullSupply) {
      const r9 = n(cyc?.rate_9in), r6 = n(cyc?.rate_6in)
      const rateOf = (t) => (t === BLOCK_9IN ? r9 : t === BLOCK_6IN ? r6 : null)
      const unpriced = types.filter(t => rateOf(t) == null && good[t].good > 0)
      const revenue = types.reduce((s, t) => s + (rateOf(t) == null ? 0 : good[t].good * rateOf(t)), 0)
      const margin = revenue - expTotal
      Object.assign(moneyTotals, {
        revenue, margin,
        costPerBlock: goodTotal > 0 ? expTotal / goodTotal : null,
        marginPerBlock: goodTotal > 0 ? margin / goodTotal : null,
      })
      sections.push({
        id: 'margin', kind: 'facts', title: 'Margin (internal, provisional)',
        items: [
          { label: 'Good blocks', value: goodTotal },
          { label: `Rates (cycle ${cyc?.cycle_no ?? '—'}) 9" / 6"`, value: `${r9 ? `N${r9.toLocaleString('en-NG')}` : '—'} / ${r6 ? `N${r6.toLocaleString('en-NG')}` : '—'}` },
          { label: 'Revenue earned (good blocks × rate)', value: money(revenue) },
          { label: 'Week expenses', value: money(expTotal) },
          { label: 'Cost per block', value: goodTotal > 0 ? money(expTotal / goodTotal) : '—' },
          { label: 'Margin', value: money(margin) },
          { label: 'Margin per block', value: goodTotal > 0 ? money(margin / goodTotal) : '—' },
        ],
        lines: [
          ...(unpriced.length ? [`Not priced (no cycle rate): ${unpriced.join(', ')}.`] : []),
          `${PROVISIONAL}.`,
        ],
      })
    } else if (serviceFee) {
      moneyTotals.net = moneyTotals.feeEarned - expTotal
      sections.push({
        id: 'margin', kind: 'facts', title: 'Net (internal, provisional)',
        items: [
          { label: 'Fee earned on accepted blocks', value: money(moneyTotals.feeEarned) },
          { label: 'Week expenses', value: money(expTotal) },
          { label: 'Net', value: money(moneyTotals.net) },
        ],
        lines: [`${PROVISIONAL}.`],
      })
    }
  }

  // 10. Signature
  sections.push({
    id: 'signature', kind: 'text', title: 'Notes',
    text: `Prepared by APCL — ${preparedBy || '________________'}, ${shortDate(generatedOn)}`,
  })

  if (Object.keys(moneyTotals).length) totals.money = moneyTotals
  return {
    version,
    title: internal ? 'WEEKLY SITE REPORT — INTERNAL' : 'WEEKLY SITE REPORT',
    watermark: internal ? 'INTERNAL — NOT FOR CLIENT' : null,
    week, weekLabel: weekLabel(week),
    clientName: contract.client_name, siteName: site.name, contractRef: contract.contract_ref,
    hasProduction: prodW.length > 0,
    sections, totals,
  }
}

// Every money cell in a model (used by tests and as a renderer guard).
export function moneyCells(model) {
  const found = []
  const walk = (v) => {
    if (v && typeof v === 'object') {
      if ('money' in v && Object.keys(v).length === 1) found.push(v.money)
      else Object.values(v).forEach(walk)
    }
  }
  walk(model.sections)
  return found
}
