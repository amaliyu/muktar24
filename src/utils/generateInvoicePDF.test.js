import { it, expect, vi, afterEach } from 'vitest'
const pdf = vi.hoisted(() => ({ texts: [], saves: [] }))
vi.mock('jspdf', () => ({ default: class {
  constructor() { this.internal = { pageSize: { getWidth: () => 210 } }; this.lastAutoTable = { finalY: 100 } }
  setFontSize() {} setFont() {} setTextColor() {} setDrawColor() {} setLineWidth() {} line() {} rect() {}
  text(value) { pdf.texts.push(Array.isArray(value) ? value.join(' ') : value) }
  splitTextToSize(value) { return [value] }
  save(value) { pdf.saves.push(value) }
} }))
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }))
import { generateInvoicePDF } from './generateInvoicePDF'
import { PROFORMA_DISCLAIMER } from './proforma'
afterEach(() => { vi.unstubAllGlobals(); pdf.texts.length = 0; pdf.saves.length = 0 })
it.each(['draft', 'issued', 'paid'])('PDF uses the correct heading and disclaimer for %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No logo in test')))
  await generateInvoicePDF({ invoice_number: 'TEST-001', status, items: [] }, { name: 'Test customer' })
  expect(pdf.texts).toContain(status === 'draft' ? 'PROFORMA INVOICE' : 'INVOICE')
  expect(pdf.texts.includes(PROFORMA_DISCLAIMER)).toBe(status === 'draft')
  expect(pdf.saves).toEqual([status === 'draft' ? 'PROFORMA_TEST-001.pdf' : 'TEST-001.pdf'])
  expect(pdf.texts).toContain('PAYMENT DETAILS')
})

it.each([
  [null, 'PROFORMA CANCELLED — NOT PAYABLE', 'CANCELLED_PROFORMA_TEST-001.pdf'],
  [undefined, 'PROFORMA CANCELLED — NOT PAYABLE', 'CANCELLED_PROFORMA_TEST-001.pdf'],
  ['2026-10-25T08:00:00Z', 'CANCELLED — NOT PAYABLE', 'CANCELLED_TEST-001.pdf'],
])('cancelled PDF uses issuance history %s and removes all payment prompts', async (issued_at, heading, filename) => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No logo in test')))
  await generateInvoicePDF({ invoice_number: 'TEST-001', status: 'cancelled', issued_at, items: [] }, { name: 'Test customer' })
  expect(pdf.texts).toContain(heading)
  expect(pdf.texts).toContain('This document was cancelled and no amount is owed.')
  expect(pdf.texts).not.toContain('INVOICE')
  expect(pdf.texts.join(' ')).not.toMatch(/PAYMENT DETAILS|Account No:|TAJ BANK|Payment must be confirmed|Invoice valid/)
  expect(pdf.saves).toEqual([filename])
})
