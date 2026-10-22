import { describe, it, expect } from 'vitest'
import {
  buildWeeklySiteReport, moneyCells, goodBlocksByType, yieldByType, feeEarned,
  lastCompletedWeek, weekOf, lagosDateOf, BLOCK_9IN, BLOCK_6IN,
} from './weeklySiteReport'

const week = { from: '2026-10-26', to: '2026-11-01' }
const kado = { id: 'kado', name: 'Kado Site (Sequoia)' }
const life = { id: 'life', name: 'Life Camp Site (Bilaad)' }
const sequoia = { id: 'k1', site_id: 'kado', client_name: 'Sequoia Projects Limited', contract_ref: 'Phase 1', contract_model: 'full_supply', opening_rate_9in: 1000, opening_rate_6in: 960 }
const bilaad = { id: 'b1', site_id: 'life', client_name: 'Bilaad Realty', contract_ref: 'BR/PMO/BALI GROVE/APCL/2026/001', contract_model: 'service_fee', fee_per_block: 241 }

const production = (site) => [
  { site_id: site, date: '2026-10-26', block_type: BLOCK_9IN, quantity_produced: 2000, cement_bags: 50 },
  { site_id: site, date: '2026-10-27', block_type: BLOCK_9IN, quantity_produced: 2400, cement_bags: 60 },
  { site_id: site, date: '2026-10-27', block_type: BLOCK_6IN, quantity_produced: 900, cement_bags: 20 },
  { site_id: site, date: '2026-11-02', block_type: BLOCK_9IN, quantity_produced: 9999, cement_bags: 1 }, // next week
]
const damages = (site) => [
  { site_id: site, date: '2026-10-26', block_type: BLOCK_9IN, stage: 'production', quantity_damaged: 30 },
  { site_id: site, date: '2026-10-27', block_type: BLOCK_9IN, stage: 'stacking', quantity_damaged: 20 },
  { site_id: site, date: '2026-10-28', block_type: BLOCK_6IN, stage: 'curing', quantity_damaged: 10 },
  { site_id: site, date: '2026-10-28', block_type: BLOCK_9IN, stage: 'delivery', quantity_damaged: 500 }, // not counted
]

describe('weekly site report — client version', () => {
  it('(a) carries no naira values for a full_supply contract, even with cycle payments and expenses passed in', () => {
    const model = buildWeeklySiteReport({
      version: 'client', week, contract: sequoia, site: kado,
      cycles: [{ id: 'c1', cycle_no: 1, qty_total: 25000, rate_9in: 1000, rate_6in: 960, amount_due: 24800000, amount_received: 24800000, payment_ref: 'TRF-1', paid_on: '2026-10-20', status: 'active', started_on: '2026-10-26' }],
      forecasts: [{ cycle_id: 'c1', qty_total: 25000, done: 5250, remaining: 19750, rate_basis: 'planning', forecast_completion: '2026-11-09' }],
      production: production('kado'), damages: damages('kado'),
      items: [{ id: 'i1', site_id: 'kado', name: 'Cement', unit: 'bags', owner: 'apcl', current_stock: 300, unit_cost: 9500 }],
      expenses: [{ site_id: 'kado', expense_date: '2026-10-27', amount: 500000, category_name: 'Labour' }],
      preparedBy: 'Site Manager', generatedOn: '2026-11-02',
    })
    expect(moneyCells(model)).toEqual([])
    expect(model.totals.money).toBeUndefined()
    const text = JSON.stringify(model)
    expect(text).not.toMatch(/₦|\bN\d/)
    expect(text).not.toMatch(/24800000|9500|500000|\b1000\b|\b960\b/)
    expect(model.sections.find(s => s.id === 'payments').rows[0][1]).toBe('Paid in full')
    expect(model.sections.some(s => s.id === 'expenses' || s.id === 'margin')).toBe(false)
    expect(model.watermark).toBeNull()
  })

  it('(b) service_fee: fee earned = accepted blocks × ₦241, and the advance balance reduces by fees to date', () => {
    const handovers = [
      { site_id: 'life', cycle_id: 'b-c1', handover_date: '2026-10-20', block_type: BLOCK_9IN, qty_handed_over: 1000, qty_accepted: 1000, qty_rejected: 0, status: 'accepted' },
      { site_id: 'life', cycle_id: 'b-c1', handover_date: '2026-10-28', block_type: BLOCK_9IN, qty_handed_over: 3000, qty_accepted: 2800, qty_rejected: 200, rejection_reason: 'Cracked', status: 'partly_rejected' },
      { site_id: 'life', cycle_id: 'b-c1', handover_date: '2026-10-29', block_type: BLOCK_6IN, qty_handed_over: 1500, qty_accepted: 1500, qty_rejected: 0, status: 'deemed_accepted', deemed: true },
      { site_id: 'life', cycle_id: 'b-c1', handover_date: '2026-10-31', block_type: BLOCK_6IN, qty_handed_over: 700, qty_accepted: 0, qty_rejected: 0, status: 'pending' },
    ]
    const cycles = [{ id: 'b-c1', cycle_no: 1, qty_total: 43745, amount_due: 10542665.5, amount_received: 10542665.5, status: 'active', started_on: '2026-10-19' }]
    const model = buildWeeklySiteReport({ version: 'client', week, contract: bilaad, site: life, cycles, handovers, production: production('life'), damages: damages('life'), generatedOn: '2026-11-02' })
    expect(model.totals.accepted).toBe(4300)
    expect(model.totals.money.feeEarned).toBe(4300 * 241)
    expect(feeEarned(4300, 241)).toBe(1036300)
    // advance − (1000 + 2800 + 1500) × 241 to week end
    expect(model.totals.money.advanceBalance).toBeCloseTo(10542665.5 - 5300 * 241, 2)
    const ho = model.sections.find(s => s.id === 'handovers')
    expect(ho.rows).toEqual([[BLOCK_6IN, 2200, 0, 1500, 0, 700], [BLOCK_9IN, 3000, 2800, 0, 200, 0]])
    expect(ho.lines.join(' ')).toMatch(/Cracked/)
    // Only the client's own money: fee, advance balance, payments received.
    expect(moneyCells(model).sort()).toEqual([1036300, 10542665.5, 10542665.5 - 5300 * 241].sort())
    expect(model.sections.some(s => s.id === 'expenses')).toBe(false)
  })

  it('(d) good blocks = produced − (production + stacking + curing damage); loading/delivery damage excluded', () => {
    const g = goodBlocksByType(production('kado').slice(0, 3), damages('kado'))
    expect(g[BLOCK_9IN]).toEqual({ produced: 4400, damaged: 50, good: 4350 })
    expect(g[BLOCK_6IN]).toEqual({ produced: 900, damaged: 10, good: 890 })
    const model = buildWeeklySiteReport({ version: 'client', week, contract: sequoia, site: kado, production: production('kado'), damages: damages('kado'), generatedOn: '2026-11-02' })
    expect(model.totals).toMatchObject({ produced: 5300, damaged: 60, good: 5240 })
  })

  it('still builds with "No production recorded this week" when the week is empty', () => {
    const model = buildWeeklySiteReport({ version: 'client', week, contract: sequoia, site: kado, generatedOn: '2026-11-02' })
    expect(model.hasProduction).toBe(false)
    expect(model.sections.find(s => s.id === 'production').text).toBe('No production recorded this week.')
  })
})

describe('weekly site report — yield', () => {
  it('(c) blocks per bag by block type against the 40 / 45 budget', () => {
    const y = yieldByType(production('kado').slice(0, 3))
    const nine = y.find(r => r.type === BLOCK_9IN)
    const six = y.find(r => r.type === BLOCK_6IN)
    expect(nine).toMatchObject({ produced: 4400, bags: 110, perBag: 40, budget: 40, variancePct: 0 })
    expect(six).toMatchObject({ produced: 900, bags: 20, perBag: 45, budget: 45, variancePct: 0 })
    const low = yieldByType([{ block_type: BLOCK_9IN, quantity_produced: 1800, cement_bags: 50 }])[0]
    expect(low).toMatchObject({ perBag: 36, variancePct: -10 })
    expect(yieldByType([{ block_type: BLOCK_9IN, quantity_produced: 100, cement_bags: 0 }])[0].perBag).toBeNull()
  })
})

describe('weekly site report — internal version', () => {
  it('full_supply: revenue = good blocks × cycle rate, cost and margin per block, watermark and provisional label', () => {
    const model = buildWeeklySiteReport({
      version: 'internal', week, contract: sequoia, site: kado,
      cycles: [{ id: 'c1', cycle_no: 1, qty_total: 25000, rate_9in: 1000, rate_6in: 960, status: 'active', started_on: '2026-10-26' }],
      production: production('kado'), damages: damages('kado'),
      expenses: [
        { site_id: 'kado', expense_date: '2026-10-27', amount: 1000000, category_name: 'Labour' },
        { site_id: 'kado', expense_date: '2026-10-28', amount: 3000000, category_name: 'Cement' },
        { site_id: 'kado', expense_date: '2026-11-03', amount: 7777777, category_name: 'Cement' }, // next week
        { site_id: 'dutse', expense_date: '2026-10-28', amount: 8888888, category_name: 'Cement' }, // other site
      ],
      generatedOn: '2026-11-02',
    })
    const m = model.totals.money
    expect(m.revenue).toBe(4350 * 1000 + 890 * 960)
    expect(m.expenses).toBe(4000000)
    expect(m.margin).toBe(m.revenue - 4000000)
    expect(m.costPerBlock).toBeCloseTo(4000000 / 5240, 6)
    expect(m.marginPerBlock).toBeCloseTo(m.margin / 5240, 6)
    expect(model.watermark).toBe('INTERNAL — NOT FOR CLIENT')
    expect(JSON.stringify(model)).toMatch(/reconciled in 7C/)
  })

  it('service_fee: net = fee earned − week expenses', () => {
    const model = buildWeeklySiteReport({
      version: 'internal', week, contract: bilaad, site: life,
      handovers: [{ site_id: 'life', handover_date: '2026-10-28', block_type: BLOCK_9IN, qty_handed_over: 1000, qty_accepted: 1000, qty_rejected: 0, status: 'accepted' }],
      expenses: [{ site_id: 'life', expense_date: '2026-10-29', amount: 100000, category: { name: 'Labour' } }],
      generatedOn: '2026-11-02',
    })
    expect(model.totals.money.net).toBe(241000 - 100000)
    expect(model.sections.find(s => s.id === 'expenses').rows).toEqual([['Labour', { money: 100000 }]])
  })
})

describe('weekly site report — week boundaries (Africa/Lagos, Mon–Sun)', () => {
  it('(e) a week runs Monday to Sunday', () => {
    expect(weekOf('2026-10-28')).toEqual({ from: '2026-10-26', to: '2026-11-01' })   // Wednesday
    expect(weekOf('2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-01' })   // Monday
    expect(weekOf('2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' })   // Sunday
  })

  it('(e) the default is the last completed week by the Lagos calendar, not UTC', () => {
    // 23:30 UTC Sunday 1 Nov = 00:30 Monday 2 Nov in Lagos (UTC+1): week 26 Oct–1 Nov is complete.
    expect(lagosDateOf(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02')
    expect(lastCompletedWeek(new Date('2026-11-01T23:30:00Z'))).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    // 22:30 UTC Sunday = 23:30 Sunday in Lagos: that week is still running.
    expect(lastCompletedWeek(new Date('2026-11-01T22:30:00Z'))).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    // Across a month/year end.
    expect(lastCompletedWeek(new Date('2027-01-02T12:00:00Z'))).toEqual({ from: '2026-12-21', to: '2026-12-27' })
  })

  it('rows dated outside the week are excluded', () => {
    const model = buildWeeklySiteReport({ version: 'client', week, contract: sequoia, site: kado, production: production('kado'), generatedOn: '2026-11-02' })
    expect(model.totals.produced).toBe(5300)
  })
})
