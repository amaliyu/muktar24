import { describe, it, expect } from 'vitest'
import {
  validateTiers, tiersToJson, tierPlainWords, tiersPlainText, tierForMultiple, apclPct, feeText,
  contributionAmount, withRunningTotal, capitalSummary, ledgerWithBalances,
  buildCloseStatement, buildInvestorStatement, pendingBanner, statementLines,
  lastCompletedMonth, monthEnd, addMonths, fmtNaira2, APCL_CONTRIBUTOR, APCL_OPERATOR,
} from './investorPools'

const V2 = [
  { from: 0, to: 1, investor_pct: 65 }, { from: 1, to: 1.5, investor_pct: 35 },
  { from: 1.5, to: 2, investor_pct: 25 }, { from: 2, to: null, investor_pct: 20 },
]

describe('validateTiers (mirrors fn_term_template_guard)', () => {
  it('accepts Term Sheet V2 and editor rows with a blank last end', () => {
    expect(validateTiers(V2)).toBeNull()
    expect(validateTiers([{ from: '0', to: '1', investor_pct: '65' }, { from: '1', to: '', investor_pct: '20' }])).toBeNull()
    expect(validateTiers([{ from: 0, to: null, investor_pct: 50 }])).toBeNull()
  })
  it('gives the trigger\'s message for each rule', () => {
    expect(validateTiers([])).toBe('Add at least one tier.')
    expect(validateTiers([{ from: 0.5, to: null, investor_pct: 50 }])).toBe('Tier 1 must start where the previous one ends (0x).')
    expect(validateTiers([{ from: 0, to: 1, investor_pct: 65 }, { from: 1.2, to: null, investor_pct: 20 }])).toBe('Tier 2 must start where the previous one ends (1x).')
    expect(validateTiers([{ from: 0, to: null, investor_pct: 101 }])).toBe('Tier 1 investor share must be 0-100%.')
    expect(validateTiers([{ from: 0, to: null, investor_pct: -1 }])).toBe('Tier 1 investor share must be 0-100%.')
    expect(validateTiers([{ from: 0, to: null, investor_pct: 65 }, { from: 0, to: null, investor_pct: 20 }])).toBe('Tier 1 needs an end above its start.')
    expect(validateTiers([{ from: 0, to: 0, investor_pct: 65 }, { from: 0, to: null, investor_pct: 20 }])).toBe('Tier 1 needs an end above its start.')
    expect(validateTiers([{ from: 0, to: 1, investor_pct: 65 }])).toBe('The last tier must be open-ended.')
  })
  it('editor rows convert to the stored jsonb', () => {
    expect(tiersToJson([{ from: '0', to: '1', investor_pct: '65' }, { from: '1', to: '', investor_pct: '20' }]))
      .toEqual([{ from: 0, to: 1, investor_pct: 65 }, { from: 1, to: null, investor_pct: 20 }])
  })
})

describe('tiers in plain words', () => {
  it('reads Term Sheet V2', () => {
    expect(tiersPlainText(V2)).toEqual([
      'Until investors have received 1× their capital: investors 65%, APCL 35%',
      'From 1× to 1.5× their capital: investors 35%, APCL 65%',
      'From 1.5× to 2× their capital: investors 25%, APCL 75%',
      'After investors have received 2× their capital: investors 20%, APCL 80%',
    ])
  })
  it('single open tier, APCL share and fee text', () => {
    expect(tierPlainWords({ from: 0, to: null, investor_pct: 50 }, 0, 1)).toBe('At all times: investors 50%, APCL 50%')
    expect(apclPct(33.3)).toBe(66.7)
    expect(feeText({ management_fee_pct: 0 })).toBe('No management fee')
    expect(feeText({ management_fee_pct: 5, management_fee_basis: 'gross_receipts' })).toBe('APCL management fee 5% of gross receipts')
  })
  it('finds the tier for a multiple of capital', () => {
    expect(tierForMultiple(V2, 0).index).toBe(0)
    expect(tierForMultiple(V2, 1).index).toBe(1)
    expect(tierForMultiple(V2, 1.99).index).toBe(2)
    expect(tierForMultiple(V2, 7).index).toBe(3)
  })
})

describe('capital', () => {
  it('a bridge refund is typed positive and sent negative; a correction keeps its sign', () => {
    expect(contributionAmount('bridge_refund', '500000')).toEqual({ amount: -500000 })
    expect(contributionAmount('bridge_refund', '-5').error).toBeTruthy()
    expect(contributionAmount('contribution', '1000000')).toEqual({ amount: 1000000 })
    expect(contributionAmount('bridge', '0').error).toBeTruthy()
    expect(contributionAmount('correction', '-1000000')).toEqual({ amount: -1000000 })
    expect(contributionAmount('correction', '0').error).toBe('A correction cannot be zero.')
    expect(contributionAmount('contribution', '').error).toBe('Enter the amount.')
  })
  it('running total in date order and the pool split', () => {
    const rows = withRunningTotal([
      { id: 'b', contributed_on: '2026-09-16', amount: -1000000, created_at: '2' },
      { id: 'a', contributed_on: '2026-09-01', amount: 1000000, created_at: '1' },
    ])
    expect(rows.map(r => [r.id, r.running])).toEqual([['a', 1000000], ['b', 0]])
    const s = capitalSummary([{ investor_id: 'x', capital: 27000000 }, { investor_id: 'apcl', capital: 3000000 }],
      [{ id: 'x', name: 'TEST Investor', kind: 'external' }, { id: 'apcl', name: 'Abuja Precast Concrete Limited (APCL)', kind: 'apcl' }])
    expect(s.total).toBe(30000000)
    expect(s.lines[0]).toMatchObject({ name: 'TEST Investor', share: 0.9 })
    expect(s.lines[1].name).toBe(APCL_CONTRIBUTOR)
  })
})

describe('SPV ledger', () => {
  it('keeps running balances over the whole history', () => {
    const rows = ledgerWithBalances([
      { entry_date: '2026-10-05', entry_type: 'transfer_to_spv', owed_to_spv: -4000000, paid_out: 0, source_id: 't' },
      { entry_date: '2026-09-10', entry_type: 'receipt', owed_to_spv: 12000000, paid_out: 0, source_id: 'r' },
      { entry_date: '2026-10-08', entry_type: 'investor_distribution_paid', owed_to_spv: 0, paid_out: 4875000, source_id: 'd' },
    ])
    expect(rows.map(r => [r.source_id, r.owed_balance, r.paid_total])).toEqual([['r', 12000000, 0], ['t', 8000000, 0], ['d', 8000000, 4875000]])
  })
})

// The Kado September test from §11 7C (rolled back in the DB): receipts 12.0m,
// deductible 4.0m, excluded 0.1m, reserve 0.5m → NDC 7.5m; ICA 30m.
const kadoSept = {
  id: 'p1', site_id: 'kado', period_month: '2026-09-01', status: 'draft', computed_at: '2026-10-02T09:00:00Z',
  receipts: 12000000, deductible_expenses: 4000000, excluded_expenses: 100000, pending_expenses_count: 0,
  reserve: 500000, management_fee: 0, ndc_raw: 7500000, deficit_brought_forward: 0, distributable: 7500000,
  deficit_carried_forward: 0, ica: 30000000, investor_receipts_before: 0, investor_portion: 4875000, apcl_operator_share: 2625000,
  tier_breakdown: [{ from: 0, to: 1, investor_pct: 65, ndc_in_tier: 7500000, investor: 4875000, apcl: 2625000 }],
}
const investors = [{ id: 'A', name: 'TEST Investor A', kind: 'external' }, { id: 'APCL', name: 'Abuja Precast Concrete Limited (APCL)', kind: 'apcl' }]
const dists = [
  { id: 'd1', investor_id: 'A', share_type: 'investor_portion', capital_share: 0.9474, amount: 4618421 },
  { id: 'd2', investor_id: 'APCL', share_type: 'investor_portion', capital_share: 0.0526, amount: 256579 },
  { id: 'd3', investor_id: null, share_type: 'apcl_operator', capital_share: null, amount: 2625000 },
]

describe('monthly close statement', () => {
  it('lays out the stored figures, with no fee line when the fee is 0', () => {
    const st = buildCloseStatement({ period: kadoSept, distributions: dists, investors })
    expect(st.lines.map(l => l.label)).toEqual([
      'Receipts', 'Less deductible site expenses', 'Less reserve', '= NDC for the month', 'Less deficit brought forward', '= Distributable',
    ])
    expect(st.lines.find(l => l.key === 'ndc').amount).toBe(7500000)
    expect(st.excluded).toMatchObject({ amount: 100000, note: 'not deductible under these terms' })
    expect(st.tiers[0].text).toBe('Until investors have received 1× their capital: investors 65%, APCL 35%')
    expect(st.investorLines.map(l => l.name)).toEqual(['TEST Investor A', APCL_CONTRIBUTOR, APCL_OPERATOR])
    expect(st.banner).toBeNull()
    expect(st.canApprove).toBe(true)
  })
  it('shows a fee line only when there is a fee', () => {
    const lines = statementLines({ ...kadoSept, management_fee: 375000, ndc_raw: 7125000 })
    expect(lines.find(l => l.key === 'fee')).toMatchObject({ label: 'Less management fee', amount: -375000 })
  })
  it('pending site expenses raise the banner and block approval', () => {
    const st = buildCloseStatement({ period: { ...kadoSept, pending_expenses_count: 3 }, distributions: dists, investors })
    expect(st.banner).toBe('3 site expenses for this month are still pending — approve or reject them, then compute again')
    expect(st.canApprove).toBe(false)
    expect(pendingBanner(1)).toBe('1 site expense for this month is still pending — approve or reject them, then compute again')
    expect(buildCloseStatement({ period: { ...kadoSept, status: 'approved', pending_expenses_count: 3 }, distributions: dists, investors }).canApprove).toBe(false)
  })
})

describe('investor statement', () => {
  it('carries only that investor\'s own figures', () => {
    const m = buildInvestorStatement({
      investor: investors[0], siteName: 'Kado Site (Sequoia)', period: { ...kadoSept, status: 'approved' },
      distributions: dists, history: [{ ...dists[0], site_id: 'kado', period_month: '2026-09-01', paid_on: '2026-10-08' }, { ...dists[1], period_month: '2026-09-01', paid_on: '2026-10-08' }],
      capital: 27000000, tiers: V2,
    })
    expect(m.amount).toBe(4618421)
    expect(m.capitalShare).toBe(0.9474)
    expect(m.cumulativePaid).toBe(4618421)
    expect(m.currentTier.index).toBe(0)
    const text = JSON.stringify(m)
    expect(text).not.toMatch(/APCL \(as contributor\)|256579|Abuja Precast Concrete Limited|2625000/)
    expect(text).not.toMatch(/"d2"|"d3"/)
  })
})

describe('months', () => {
  it('defaults to the last completed month', () => {
    expect(lastCompletedMonth('2026-10-23')).toBe('2026-09-01')
    expect(lastCompletedMonth('2026-01-05')).toBe('2025-12-01')
    expect(monthEnd('2026-02-01')).toBe('2026-02-28')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(fmtNaira2(1234567)).toBe('₦1,234,567.00')
    expect(fmtNaira2(-1000000)).toBe('−₦1,000,000.00')
  })
})
