import { describe, it, expect } from 'vitest'
import { handoverYardWarning } from './handoverYard'

const base = { blockType: '9 Inch 3 Hole Block', siteName: 'Kado Site (Sequoia)' }

describe('handoverYardWarning', () => {
  it('warns when the handover is larger than the yard balance', () => {
    expect(handoverYardWarning({ ...base, qty: 1500, balance: 1200 }))
      .toBe('This hands over 1,500 but the yard shows only 1,200 9 Inch 3 Hole Block at Kado Site (Sequoia). Save anyway?')
  })
  it('warns when the yard has no stock of that block type', () => {
    expect(handoverYardWarning({ ...base, qty: 10, balance: 0 })).toMatch(/shows only 0 /)
  })
  it('returns null when the handover fits the balance exactly', () => {
    expect(handoverYardWarning({ ...base, qty: 1200, balance: 1200 })).toBeNull()
  })
  it('returns null when the handover is below the balance', () => {
    expect(handoverYardWarning({ ...base, qty: '300', balance: '1200' })).toBeNull()
  })
  it('returns null when the yard balance is unknown (failed to load)', () => {
    expect(handoverYardWarning({ ...base, qty: 5000, balance: null })).toBeNull()
  })
  it('returns null for an empty or zero quantity', () => {
    expect(handoverYardWarning({ ...base, qty: '', balance: 0 })).toBeNull()
    expect(handoverYardWarning({ ...base, qty: 0, balance: 0 })).toBeNull()
  })
})
