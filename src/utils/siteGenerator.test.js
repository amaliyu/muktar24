import { expect, it } from 'vitest'
import { measures, reading, generatorWhatsApp } from './siteGenerator'
const day = { recorded: true, started_at: '07:30', stopped_at: '17:00', running_hours: 8.5, litres_per_hour: 3.2, blocks_per_hour: 313, blocks_per_litre: 83.3, target_litres_per_hour: 3.75, target_blocks_per_hour: 313, target_blocks_per_litre: 83.3 }
it('applies each tolerance at the boundary and just beyond', () => {
  const boundary = { ...day, litres_per_hour: 3.75 * 1.05, blocks_per_hour: 313 * .95, blocks_per_litre: 83.3 * .95 }
  expect(measures(boundary).map(r => r.good)).toEqual([true, true, true])
  expect(measures({ ...boundary, litres_per_hour: boundary.litres_per_hour + .001, blocks_per_hour: boundary.blocks_per_hour - .001, blocks_per_litre: boundary.blocks_per_litre - .001 }).map(r => r.pill)).toEqual(['Above target', 'Below target', 'Below target'])
  expect(measures({ blocks_per_litre: 33 })[2]).toMatchObject({ value: '33', target: null, pill: null })
})
it('gives the three plain readings', () => {
  expect(reading(day)).toBe('On target.')
  expect(reading({ ...day, blocks_per_hour: 100 })).toBe('Diesel use was normal; output per hour was low.')
  expect(reading({ ...day, litres_per_hour: 5 })).toContain('More diesel per hour')
  expect(reading({})).toBe('')
})
it('formats generator sharing and omits absent targets', () => {
  expect(generatorWhatsApp(day)).toBe('Generator 07:30–17:00 (8.5 h): 3.2 L/h (target 3.8), 313 blocks/h (target 313), 83 blocks/L (target 83)')
  expect(generatorWhatsApp({ ...day, target_litres_per_hour: null })).toContain('3.2 L/h,')
  expect(generatorWhatsApp({ recorded: false })).toBe('Generator times not recorded')
})
