import { expect, it } from 'vitest'
import { daysLate, isLate, lagosToday } from './lateEntry'

it('switches the late threshold at midnight in Lagos', () => {
  const before = new Date('2026-11-17T22:59:59Z')
  const after = new Date('2026-11-17T23:00:00Z')
  expect(lagosToday(before)).toBe('2026-11-17')
  expect(lagosToday(after)).toBe('2026-11-18')
  expect(daysLate('2026-11-16', before)).toBe(1)
  expect(isLate('2026-11-16', before)).toBe(false)
  expect(daysLate('2026-11-16', after)).toBe(2)
  expect(isLate('2026-11-16', after)).toBe(true)
  expect(isLate('2026-11-17', after)).toBe(false)
})

it('handles empty, invalid, same-day and future dates', () => {
  const now = new Date('2026-03-03T12:00:00Z')
  for (const date of ['', '2026-02-30', '2026-03-03', '2026-03-04']) {
    expect(daysLate(date, now)).toBe(0)
  }
  expect(daysLate('2026-02-28', now)).toBe(3)
})
