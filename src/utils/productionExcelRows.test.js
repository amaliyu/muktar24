import { describe, expect, it } from 'vitest'
import { buildProductionExcelRows } from './productionExcelRows'

describe('production Excel kilograms', () => {
  it('keeps granite dust as a summable number, including zero and tonnes-scale values', () => {
    const rows = buildProductionExcelRows([
      { date: '2026-11-18', block_type: '9 Inch 3 Hole Block', quantity_produced: 1305, cement_bags: 30, granite_dust_kg: '30015', diesel_litres: 10 },
      { date: '2026-11-19', block_type: '9 Inch 3 Hole Block', quantity_produced: 0, granite_dust_kg: null },
    ])
    expect(rows[0][4]).toBe(30015)
    expect(typeof rows[0][4]).toBe('number')
    expect(rows[1][4]).toBe(0)
    expect(rows.reduce((sum, row) => sum + row[4], 0)).toBe(30015)
  })
})
