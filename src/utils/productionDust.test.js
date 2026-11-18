import { describe, expect, it } from 'vitest'
import { calculatedDustKg, dustStandard, formatDust, missingProductionItems } from './productionDust'
describe('B1 production dust preview and formatting', () => {
  it('uses site + block type and gross production', () => {
    const rows = [{ site_id: 'kado', block_type: '9 Inch 3 Hole Block', dust_kg_per_block: 23 }]
    expect(dustStandard(rows, 'kado', '9 Inch 3 Hole Block').dust_kg_per_block).toBe(23)
    expect(dustStandard(rows, 'dutse', '9 Inch 3 Hole Block')).toBeNull()
    expect(calculatedDustKg(100, 23)).toBe(2300)
    expect(formatDust(2300)).toBe('2,300 kg (2.3 t)')
    expect(formatDust(250)).toBe('250 kg')
  })
  it('warns for positive missing materials at the exact site', () => {
    const items = [{ site_id: 'other', material: 'dust' }, { site_id: 'kado', material: 'cement' }]
    expect(missingProductionItems(items, { site_id: 'kado', cement_bags: 2, granite_dust_kg: 2300, chippings_kg: 0, diesel_litres: 8 }))
      .toEqual(['dust', 'diesel'])
  })
})
