import { describe, it, expect } from 'vitest'
import { customerInvoiceStats, salesOrders } from './proforma'

const order = (invoices) => ({
  id: 'order-1', invoices, invoice: invoices,
  order_items: [{ subtotal: 900000 }], items: [{ subtotal: 900000 }],
})

describe('invoice-only customer debt and sales', () => {
  it.each(['draft', 'cancelled'])('%s quotes owe zero and do not appear in sales', status => {
    const quote = order([{ id: 'quote', status, total_amount: 100000,
      payments: [{ status: 'confirmed', amount_paid: 5000 }] }])
    expect(customerInvoiceStats({ orders: [quote] })).toEqual({
      totalValue: 0, totalPaid: 0, outstanding: 0, orderCount: 1,
    })
    expect(salesOrders([quote])).toEqual([])
  })

  it('does not treat an order without any invoice as debt or sales', () => {
    const unissued = order([])
    expect(customerInvoiceStats({ orders: [unissued] }).outstanding).toBe(0)
    expect(salesOrders([unissued])).toEqual([])
  })

  it('keeps issued amounts and confirmed receipts, ignoring pending payments and void quotes', () => {
    const issued = order([
      { id: 'old', status: 'cancelled', total_amount: 80000 },
      { id: 'open-quote', status: 'draft', total_amount: 70000 },
      { id: 'invoice', status: 'issued', total_amount: '107500', payments: [
        { status: 'confirmed', amount_paid: '25000' },
        { status: 'pending', amount_paid: 15000 },
      ] },
    ])
    expect(customerInvoiceStats({ orders: [issued] })).toEqual({
      totalValue: 107500, totalPaid: 25000, outstanding: 82500, orderCount: 1,
    })
    expect(salesOrders([issued])).toEqual([{ ...issued, salesTotal: 107500 }])
  })

  it('counts multiple issued/paid invoices once in one order row, with no item-value addition', () => {
    const sale = order([
      { id: 'one', status: 'issued', total_amount: 100 },
      { id: 'two', status: 'paid', total_amount: 50, payments: [{ status: 'confirmed', amount_paid: 50 }] },
    ])
    expect(salesOrders([sale])).toEqual([{ ...sale, salesTotal: 150 }])
    expect(customerInvoiceStats({ orders: [sale] })).toEqual({
      totalValue: 150, totalPaid: 50, outstanding: 100, orderCount: 1,
    })
  })
})
