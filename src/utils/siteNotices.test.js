import { describe, it, expect } from 'vitest'
import { buildAdvanceNoticeText, buildCompletionNoticeText, buildRejectionNoticeText, addDaysIso } from './siteNotices'

// Client-facing text: quantities and dates only — never money (§11).
const MONEY = /₦|NGN|naira|amount|rate of|fee|kobo/i

const sequoia = { clientName: 'Sequoia Projects Limited', siteName: 'Kado Site (Sequoia)', contractModel: 'full_supply', cycleNo: 1, qtyTotal: 25000, done: 19500, remaining: 5500, forecastFinish: '2026-12-29' }
const bilaad = { ...sequoia, clientName: 'Bilaad Realty Nigeria Limited', siteName: 'Life Camp Site (Bilaad)', contractModel: 'service_fee', qtyTotal: 43745 }

describe('notice text builders', () => {
  it('advance notice carries quantities and the forecast date, no ₦ amounts', () => {
    for (const d of [sequoia, bilaad]) {
      const t = buildAdvanceNoticeText(d)
      expect(t).not.toMatch(MONEY)
      expect(t).toContain('5,500')
      expect(t).toContain('29 Dec 2026')
    }
  })

  it('completion notice gives the 7-day remobilisation deadline, no ₦ amounts', () => {
    const t = buildCompletionNoticeText({ ...sequoia, done: 25000, remaining: 0, completedOn: '2026-12-21', noticeDate: '2026-12-22' })
    expect(t).not.toMatch(MONEY)
    expect(t).toContain('29 Dec 2026')
    expect(addDaysIso('2026-12-22', 7)).toBe('2026-12-29')
    expect(buildCompletionNoticeText({ ...bilaad, noticeDate: '2026-12-22' })).not.toMatch(MONEY)
  })

  it('rejection notice matches the agreed wording and has no ₦ amounts', () => {
    const t = buildRejectionNoticeText({ siteName: 'Life Camp Site (Bilaad)', receivedOn: '2026-12-21', qtyRejected: 2, unit: 'bags', itemName: 'Cement (Bilaad)', ref: 'TRK-123', reason: 'TEST caked', hasPhoto: true })
    expect(t).toBe('APCL notice of rejected material — Life Camp Site (Bilaad), 21 Dec 2026: 2 bags of Cement (Bilaad) delivered (TRK-123) rejected before use. Reason: TEST caked. Photo on file. Per the Contractor Warranty Form, APCL notifies apparent material defects before use.')
    expect(t).not.toMatch(/₦/)
  })
})
