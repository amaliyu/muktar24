// Phase 7C — investor pools: pure helpers shared by the pages, the PDFs and the
// tests. Nothing here talks to the database. The DB (compute_ndc_period and the
// term-template trigger) stays the authority; these mirror its rules so the UI
// can explain and pre-check, and they lay out stored figures — they never
// recompute the split.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const n = (v) => Number(v) || 0
const round2 = (v) => Math.round(n(v) * 100) / 100

// ── money ───────────────────────────────────────────────────
// Investor pages always show kobo: ₦1,234,567.00
export const fmtNaira2 = (v) => {
  if (v == null || v === '') return '—'
  const x = Number(v)
  const s = Math.abs(x).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${x < 0 ? '−' : ''}₦${s}`
}
export const fmtPct = (fraction, dp = 2) => (fraction == null ? '—' : `${(Number(fraction) * 100).toLocaleString('en-NG', { minimumFractionDigits: dp, maximumFractionDigits: dp })}%`)

// ── months ──────────────────────────────────────────────────
export const monthStart = (iso) => `${String(iso).slice(0, 7)}-01`
export const monthEnd = (iso) => {
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${String(iso).slice(0, 7)}-${String(d).padStart(2, '0')}`
}
export const addMonths = (iso, k) => {
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}
// The last calendar month that has fully ended, from a Lagos YYYY-MM-DD.
export const lastCompletedMonth = (todayIso) => addMonths(monthStart(todayIso), -1)
export const monthLabel = (iso) => {
  if (!iso) return '—'
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
export const monthLabelLong = (iso) => {
  if (!iso) return '—'
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number)
  return `${FULL_MONTHS[m - 1]} ${y}`
}
// Months from `fromIso` back `count` months, newest first.
export const recentMonths = (fromIso, count = 24) => Array.from({ length: count }, (_, i) => addMonths(fromIso, -i))

// ── tiers ───────────────────────────────────────────────────
// Same rules and wording as fn_term_template_guard: start at 0, each tier
// starts where the previous ended, investor share 0–100, every tier but the
// last needs an end above its start, the last is open-ended. Returns the first
// problem as text, or null.
export function validateTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 'Add at least one tier.'
  let prev = 0
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const no = i + 1
    const from = t.from === '' || t.from == null ? NaN : Number(t.from)
    if (from !== prev) return `Tier ${no} must start where the previous one ends (${prev}x).`
    const pct = t.investor_pct === '' || t.investor_pct == null ? NaN : Number(t.investor_pct)
    if (!(pct >= 0 && pct <= 100)) return `Tier ${no} investor share must be 0-100%.`
    const open = t.to === '' || t.to == null
    if (i < tiers.length - 1) {
      if (open || !(Number(t.to) > prev)) return `Tier ${no} needs an end above its start.`
      prev = Number(t.to)
    } else if (!open) {
      return 'The last tier must be open-ended.'
    }
  }
  return null
}

// Editor rows (strings) → the jsonb the DB stores.
export const tiersToJson = (rows) => rows.map(r => ({
  from: Number(r.from),
  to: r.to === '' || r.to == null ? null : Number(r.to),
  investor_pct: Number(r.investor_pct),
}))

export const apclPct = (investorPct) => Math.round((100 - n(investorPct)) * 100) / 100
const mult = (x) => `${Number(x).toLocaleString('en-NG', { maximumFractionDigits: 4 })}×`

// "Until investors have received 1× their capital: investors 65%, APCL 35%"
export function tierPlainWords(tier, index, count) {
  const split = `investors ${Number(tier.investor_pct)}%, APCL ${apclPct(tier.investor_pct)}%`
  const open = tier.to == null
  if (index === 0 && open) return `At all times: ${split}`
  if (index === 0) return `Until investors have received ${mult(tier.to)} their capital: ${split}`
  if (open || index === count - 1) return `After investors have received ${mult(tier.from)} their capital: ${split}`
  return `From ${mult(tier.from)} to ${mult(tier.to)} their capital: ${split}`
}
export const tiersPlainText = (tiers = []) => tiers.map((t, i) => tierPlainWords(t, i, tiers.length))

// The tier a multiple of capital falls in (from ≤ multiple < to; last is open).
export function tierForMultiple(tiers = [], multiple) {
  if (!tiers.length) return null
  const m = n(multiple)
  const i = tiers.findIndex(t => m >= n(t.from) && (t.to == null || m < n(t.to)))
  const idx = i === -1 ? tiers.length - 1 : i
  return { index: idx, tier: tiers[idx], text: tierPlainWords(tiers[idx], idx, tiers.length) }
}

export const feeText = (t) => (n(t?.management_fee_pct) > 0
  ? `APCL management fee ${Number(t.management_fee_pct)}% of ${t.management_fee_basis === 'ndc_before_fee' ? 'NDC before the fee' : 'gross receipts'}`
  : 'No management fee')

export const termLabel = (t) => (t ? `${t.name} v${t.version}` : '—')

// ── capital ─────────────────────────────────────────────────
export const CAPITAL_KINDS = [
  { id: 'contribution', label: 'Contribution' },
  { id: 'bridge', label: 'Bridge (APCL advance)' },
  { id: 'bridge_refund', label: 'Bridge refund' },
  { id: 'correction', label: 'Correction' },
]
export const capitalKindLabel = (k) => CAPITAL_KINDS.find(x => x.id === k)?.label || k

// The form takes a positive number for a refund and the DB stores it negative.
// A correction keeps the sign it was given. Returns { amount } or { error }.
export function contributionAmount(kind, entered) {
  const v = entered === '' || entered == null ? NaN : Number(entered)
  if (!Number.isFinite(v)) return { error: 'Enter the amount.' }
  if (kind === 'correction') {
    if (v === 0) return { error: 'A correction cannot be zero.' }
    return { amount: v }
  }
  if (!(v > 0)) return { error: 'Enter an amount above zero.' }
  return { amount: kind === 'bridge_refund' ? -v : v }
}

// Contributions in date order with a running total.
export function withRunningTotal(rows = [], key = 'amount') {
  let run = 0
  return [...rows]
    .sort((a, b) => String(a.contributed_on ?? a.entry_date).localeCompare(String(b.contributed_on ?? b.entry_date)) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map(r => { run = round2(run + n(r[key])); return { ...r, running: run } })
}

// fn_site_capital_on rows → [{ investor_id, name, capital, share }] largest first.
export function capitalSummary(rows = [], investors = []) {
  const total = rows.reduce((s, r) => s + n(r.capital), 0)
  return {
    total: round2(total),
    lines: rows.map(r => ({
      investor_id: r.investor_id,
      name: investorName(investors.find(i => i.id === r.investor_id)),
      capital: round2(r.capital),
      share: total ? n(r.capital) / total : null,
    })).sort((a, b) => b.capital - a.capital),
  }
}

// APCL appears twice in a month: as a contributor (its capital share of the
// investor portion) and as the operator (the rest).
export const APCL_CONTRIBUTOR = 'APCL (as contributor)'
export const APCL_OPERATOR = 'APCL (operator share)'
export const investorName = (inv) => (!inv ? 'Unknown investor' : inv.kind === 'apcl' ? APCL_CONTRIBUTOR : inv.name)

// ── SPV ledger ──────────────────────────────────────────────
export const LEDGER_LABEL = {
  receipt: 'Client receipt',
  transfer_to_spv: 'Transfer to SPV',
  investor_distribution_paid: 'Investor distribution paid',
  apcl_share_paid: 'APCL operator share paid',
}
// Date order with running "owed to SPV" and "paid out" totals, over the whole
// history (so a month filter still shows the true balance).
export function ledgerWithBalances(rows = []) {
  let owed = 0
  let paid = 0
  return [...rows]
    .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)) || ENTRY_ORDER[a.entry_type] - ENTRY_ORDER[b.entry_type])
    .map(r => {
      owed = round2(owed + n(r.owed_to_spv))
      paid = round2(paid + n(r.paid_out))
      return { ...r, owed_balance: owed, paid_total: paid }
    })
}
const ENTRY_ORDER = { receipt: 0, transfer_to_spv: 1, investor_distribution_paid: 2, apcl_share_paid: 3 }

// ── monthly close statement ─────────────────────────────────
export const pendingBanner = (count) => {
  const c = n(count)
  if (c <= 0) return null
  return `${c} site expense${c === 1 ? '' : 's'} for this month ${c === 1 ? 'is' : 'are'} still pending — approve or reject them, then compute again`
}

// Statement lines from a stored ndc_periods row. kind: 'add' | 'less' |
// 'total' | 'info'. Amounts are the stored figures; "less" lines carry the
// deducted amount as a negative so a renderer can print them as they read.
export function statementLines(p) {
  const lines = [
    { key: 'receipts', label: 'Receipts', amount: round2(p.receipts), kind: 'add' },
    { key: 'deductible', label: 'Less deductible site expenses', amount: -round2(p.deductible_expenses), kind: 'less' },
    { key: 'reserve', label: 'Less reserve', amount: -round2(p.reserve), kind: 'less' },
  ]
  if (n(p.management_fee) > 0) lines.push({ key: 'fee', label: 'Less management fee', amount: -round2(p.management_fee), kind: 'less' })
  lines.push({ key: 'ndc', label: '= NDC for the month', amount: round2(p.ndc_raw), kind: 'total' })
  lines.push({ key: 'deficit_bf', label: 'Less deficit brought forward', amount: -round2(p.deficit_brought_forward), kind: 'less' })
  lines.push({ key: 'distributable', label: '= Distributable', amount: round2(p.distributable), kind: 'total' })
  if (n(p.deficit_carried_forward) > 0) lines.push({ key: 'deficit_cf', label: 'Deficit carried forward to next month', amount: round2(p.deficit_carried_forward), kind: 'info' })
  return lines
}

export const tierRows = (p) => (Array.isArray(p.tier_breakdown) ? p.tier_breakdown : []).map((t, i, all) => ({
  text: tierPlainWords(t, i, all.length),
  investor_pct: n(t.investor_pct),
  ndc_in_tier: round2(t.ndc_in_tier),
  investor: round2(t.investor),
  apcl: round2(t.apcl),
}))

// Full internal statement for the Monthly close page and the SPV close PDF.
// `period` is an ndc_periods row, `distributions` its distributions rows,
// `investors` the register (for names).
export function buildCloseStatement({ period, distributions = [], investors = [], term = null }) {
  if (!period) return null
  const lines = (distributions || []).map(d => {
    const inv = investors.find(i => i.id === d.investor_id)
    const operator = d.share_type === 'apcl_operator'
    return {
      id: d.id,
      investor_id: d.investor_id,
      share_type: d.share_type,
      name: operator ? APCL_OPERATOR : investorName(inv),
      capital_share: operator ? null : d.capital_share,
      amount: round2(d.amount),
      paid: !!d.paid_on,
      paid_on: d.paid_on || null,
      paid_reference: d.paid_reference || null,
    }
  }).sort((a, b) => (a.share_type === b.share_type ? b.amount - a.amount : a.share_type === 'apcl_operator' ? 1 : -1))
  const banner = period.status === 'draft' ? pendingBanner(period.pending_expenses_count) : null
  return {
    status: period.status,
    month: period.period_month,
    term: term ? termLabel(term) : null,
    lines: statementLines(period),
    excluded: { label: 'Excluded site expenses', amount: round2(period.excluded_expenses), note: 'not deductible under these terms' },
    ica: round2(period.ica),
    investorsPaidBefore: round2(period.investor_receipts_before),
    tiers: tierRows(period),
    investorPortion: round2(period.investor_portion),
    apclOperatorShare: round2(period.apcl_operator_share),
    investorLines: lines,
    banner,
    canApprove: period.status === 'draft' && !banner && !!period.computed_at,
  }
}

// One investor's monthly statement. Only that investor's own distribution rows
// are used — anything else passed in is dropped, so the model can never carry
// another investor's name or amount. `history` = this investor's distribution
// rows at the site with their period (approved months), for cumulative paid.
export function buildInvestorStatement({ investor, siteName, period, distributions = [], history = [], capital, tiers = [], term = null }) {
  if (!investor || !period) return null
  const mine = (distributions || []).filter(d => d.investor_id === investor.id && d.share_type === 'investor_portion')
  const amount = round2(mine.reduce((s, d) => s + n(d.amount), 0))
  const share = mine.length ? n(mine[0].capital_share) : 0
  const paid = mine.length > 0 && mine.every(d => !!d.paid_on)
  const ownHistory = (history || []).filter(d => d.investor_id === investor.id && d.share_type === 'investor_portion')
  const upTo = ownHistory.filter(d => (d.period_month || d.period?.period_month || '') <= period.period_month)
  const cumulativePaid = round2(upTo.filter(d => d.paid_on).reduce((s, d) => s + n(d.amount), 0))
  const cap = round2(capital)
  const multiple = cap > 0 ? cumulativePaid / cap : 0
  return {
    investorName: investor.kind === 'apcl' ? APCL_CONTRIBUTOR : investor.name,
    siteName,
    month: period.period_month,
    term: term ? termLabel(term) : null,
    capital: cap,
    capitalShare: share,
    lines: statementLines(period),
    investorPortion: round2(period.investor_portion),
    amount,
    paid,
    paidOn: paid ? mine.map(d => d.paid_on).sort().pop() : null,
    paidReference: paid ? mine.map(d => d.paid_reference).filter(Boolean).join(', ') || null : null,
    cumulativePaid,
    multiple,
    currentTier: tierForMultiple(tiers, multiple),
  }
}
