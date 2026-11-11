export const emptyBalance = (overrides = {}) => ({
  openingBalances: [], vehicles: [], bankAccounts: [], finishedGoods: [], products: [], inventoryItems: [],
  cashTotal: 0, cashOnHand: 0, receivables: 0, customerDeposits: 0, supplierPayables: 0, ytdProfit: 0, bankTotal: 0, rawMatsValue: 0,
  adjustments: [], stockValue: { valued: 0, unvalued: [] }, historicalNotes: [], stockNotes: [], warnings: [],
  ...overrides,
})
export const sites = [{ id: 'dut', code: 'DUTSE', site_type: 'factory' },
  { id: 'kado', code: 'KADO', site_type: 'client_site' }, { id: 'life', code: 'LIFE_CAMP', site_type: 'client_site' }]
export const septemberSources = {
  sites,
  contracts: [{ site_id: 'kado', contract_model: 'full_supply', opening_rate_9in: 1000, opening_rate_6in: 900 },
    { site_id: 'life', contract_model: 'service_fee', fee_per_block: 200 }],
  deliveries: [{ customer_id: 'a', waybill_id: 'w', waybill_date: '2026-09-05', block_type: '9 Inch', line_value: 1000 },
    { customer_id: 'a', waybill_date: '2026-10-01', block_type: '9 Inch', line_value: 9000 },
    { customer_id: 'a', waybill_date: '2026-09-06', block_type: 'Other', line_value: null, unvalued: true }],
  payments: [{ customer_id: 'a', payment_date: '2026-09-03', amount_paid: 600, status: 'confirmed', invoice_status: 'issued' },
    { customer_id: 'b', payment_date: '2026-09-03', amount_paid: 500, status: 'confirmed', invoice_status: 'paid' }],
  handovers: [{ id: 'h1', site_id: 'kado', handover_date: '2026-09-05', block_type: '9 Inch', qty_accepted: 2, status: 'accepted' },
    { id: 'h2', site_id: 'life', handover_date: '2026-09-05', block_type: '6 Inch', qty_accepted: 3, status: 'deemed_accepted', deemed: true },
    { id: 'h3', site_id: 'kado', handover_date: '2026-09-05', block_type: '9 Inch', qty_accepted: 99, status: 'rejected', deemed: true },
    { id: 'h4', site_id: 'kado', handover_date: '2026-09-05', block_type: '9 Inch', qty_accepted: 99, status: 'pending' }],
  receipts: [{ site_id: 'kado', received_on: '2026-09-02', amount: 2500, voided: false },
    { site_id: 'life', received_on: '2026-09-02', amount: 100, voided: false },
    { site_id: 'kado', received_on: '2026-09-02', amount: 99999, voided: true }],
}
