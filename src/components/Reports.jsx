import React, { useState, useEffect, useCallback } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { effectiveRolesOf } from '../lib/roles'

// ── THEME ────────────────────────────────────────────────────
const theme = {
  bg: '#0f1117', surface: '#1a1d27', border: '#2a2d3a',
  text: '#e8eaf0', textMuted: '#8b8fa8', accent: '#4f8ef7',
  green: '#27ae60', red: '#e74c3c', blue: '#2980b9', orange: '#e67e22',
}
const styles = {
  input: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: theme.text, width: '100%', outline: 'none', boxSizing: 'border-box' },
  btn: (v = 'primary') => ({
    padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13px',
    ...(v === 'primary' ? { background: theme.accent, color: '#fff' } :
        v === 'danger'  ? { background: theme.red + '22', color: theme.red, border: `1px solid ${theme.red}44` } :
                          { background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}` })
  }),
  card: { background: theme.surface, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` },
}
const fmt  = n => Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const naira = n => '₦' + fmt(n)
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const today = () => new Date().toISOString().split('T')[0]

const COMPANY = {
  name: 'Abuja Precast Concrete Limited',
  address: '1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja',
  phone: '+234 905 554 4433',
  email: 'abujaprecastconcreteltd@gmail.com',
}

// ── CATEGORY COLOURS ─────────────────────────────────────────
const CAT_COLOR = {
  production: '#e67e22', sales: '#27ae60', customer: '#2980b9',
  delivery: '#9b59b6', staff: '#16a085', inventory: '#f39c12',
  vehicle: '#c0392b', financial: '#4f8ef7',
}

// ── REPORT CATALOG ───────────────────────────────────────────
const CATALOG = [
  // PRODUCTION
  { id: 'daily_production',    name: 'Daily Production Report',       category: 'production', description: 'Blocks produced, materials used, damages and cost per block for a single day', formats: ['pdf','excel'], roles: ['md','production_manager','assistant_production_manager','ico'], periodType: 'date' },
  { id: 'weekly_production',   name: 'Weekly Production Summary',     category: 'production', description: 'Day-by-day production table, weekly totals and efficiency vs target',           formats: ['pdf','excel'], roles: ['md','production_manager','assistant_production_manager','accountant','ico'], periodType: 'week' },
  { id: 'monthly_production',  name: 'Monthly Production Report',     category: 'production', description: 'Monthly totals, material costs, damage analysis and cost per block trend',      formats: ['pdf','excel'], roles: ['md','production_manager','assistant_production_manager','accountant','board_member','ico'], periodType: 'month' },
  { id: 'production_cost',     name: 'Production Cost Analysis',      category: 'production', description: 'Cost per block, selling price and gross margin per block type',                 formats: ['pdf','excel'], roles: ['md','accountant','ico'], periodType: 'range' },
  { id: 'damage_waste',        name: 'Damage & Waste Report',         category: 'production', description: 'Damages by stage, by block type, by vehicle and total value of damaged blocks', formats: ['pdf','excel'], roles: ['md','production_manager','assistant_production_manager','logistics_manager','ico'], periodType: 'range' },
  // SALES
  { id: 'sales_report',        name: 'Sales Report',                  category: 'sales', description: 'All orders, sales by block type, by area and by marketer with collection rate',    formats: ['pdf','excel'], roles: ['md','accountant','bdm','ico'], periodType: 'range' },
  { id: 'revenue_report',      name: 'Revenue Report',                category: 'sales', description: 'Confirmed payments, daily revenue chart and outstanding balances summary',          formats: ['pdf','excel'], roles: ['md','accountant','ico'], periodType: 'range' },
  { id: 'invoice_report',      name: 'Invoice Report',                category: 'sales', description: 'All invoices raised with status, days outstanding and oldest unpaid',               formats: ['pdf','excel'], roles: ['md','accountant','ico'], periodType: 'range' },
  { id: 'marketer_performance',name: 'Marketer Performance Report',   category: 'sales', description: 'Orders generated, value and collection rate per marketer',                          formats: ['pdf','excel'], roles: ['md','bdm','ico'], periodType: 'range' },
  // CUSTOMER
  { id: 'customer_statement',  name: 'Customer Statement',            category: 'customer', description: 'Full order and payment history for a specific customer',                         formats: ['pdf'], roles: ['md','accountant','bdm','ico'], periodType: 'range', extraFilters: [{ key: 'customer_id', label: 'Customer', type: 'customer' }] },
  { id: 'ar_aging',            name: 'Accounts Receivable Aging',     category: 'customer', description: 'All customer balances aged into Current / 31-60 / 61-90 / 91-120 / 120+ days',  formats: ['pdf','excel'], roles: ['md','accountant','ico','bdm'], periodType: 'asAt' },
  { id: 'customer_history',    name: 'Customer Purchase History',     category: 'customer', description: 'All orders, deliveries, spend and outstanding balance per customer',             formats: ['pdf','excel'], roles: ['md','accountant','bdm','ico'], periodType: 'range' },
  { id: 'new_customers',       name: 'New Customer Report',           category: 'customer', description: 'New customers registered in period, who added them and first order date',        formats: ['pdf','excel'], roles: ['md','bdm','ico'], periodType: 'range' },
  // DELIVERY
  { id: 'daily_delivery',      name: 'Daily Delivery Report',         category: 'delivery', description: 'All waybills for a selected date — loaded, received, damaged, driver, vehicle', formats: ['pdf'], roles: ['md','logistics_manager','store_officer','ico'], periodType: 'date' },
  { id: 'delivery_performance',name: 'Delivery Performance Report',   category: 'delivery', description: 'Trips, blocks delivered, transit damage rate and breakdown by vehicle/driver',   formats: ['pdf','excel'], roles: ['md','logistics_manager','ico'], periodType: 'range' },
  { id: 'waybill_recon',       name: 'Waybill Reconciliation Report', category: 'delivery', description: 'Loaded vs received discrepancies and transit damage vs damage log',             formats: ['pdf','excel'], roles: ['md','accountant','ico','store_officer'], periodType: 'range' },
  { id: 'pending_delivery',    name: 'Pending Delivery Report',       category: 'delivery', description: 'All customers with pending deliveries, days waiting and priority flagging',      formats: ['pdf'], roles: ['md','bdm','logistics_manager','store_officer','ico'], periodType: 'today' },
  // STAFF
  { id: 'attendance_report',   name: 'Attendance Report',             category: 'staff', description: 'Days present vs absent per worker, attendance rate and chronic absentees',         formats: ['pdf','excel'], roles: ['md','hr_officer','ico'], periodType: 'range' },
  { id: 'payroll_report',      name: 'Payroll Report',                category: 'staff', description: 'Wages per staff member, total payroll and payment status',                         formats: ['pdf','excel'], roles: ['md','hr_officer','accountant'], periodType: 'range' },
  { id: 'staff_directory',     name: 'Staff Directory Report',        category: 'staff', description: 'All active staff with role, type, date hired and contact details',                 formats: ['pdf','excel'], roles: ['md','hr_officer'], periodType: 'today' },
  // INVENTORY
  { id: 'stock_status',        name: 'Stock Status Report',           category: 'inventory', description: 'Current stock levels, reorder status, and total stock value',                  formats: ['pdf','excel'], roles: ['md','store_officer','production_manager','assistant_production_manager','ico'], periodType: 'today' },
  { id: 'stock_movement',      name: 'Stock Movement Report',         category: 'inventory', description: 'All stock in/out movements with opening and closing stock',                    formats: ['pdf','excel'], roles: ['md','store_officer','production_manager','assistant_production_manager','ico'], periodType: 'range' },
  { id: 'inventory_valuation', name: 'Inventory Valuation Report',    category: 'inventory', description: 'Quantity on hand × unit cost = total value per item',                          formats: ['pdf','excel'], roles: ['md','accountant','ico'], periodType: 'asAt' },
  // VEHICLE
  { id: 'fleet_status',        name: 'Fleet Status Report',           category: 'vehicle', description: 'All vehicles, document expiry dates, assigned driver and maintenance due',       formats: ['pdf'], roles: ['md','logistics_manager','ico'], periodType: 'today' },
  { id: 'vehicle_utilisation', name: 'Vehicle Utilisation Report',    category: 'vehicle', description: 'Trips, blocks delivered, fuel used, maintenance cost and cost per trip',        formats: ['pdf','excel'], roles: ['md','logistics_manager','ico'], periodType: 'range' },
  { id: 'maintenance_cost',    name: 'Maintenance Cost Report',       category: 'vehicle', description: 'All maintenance records by vehicle, type and vendor with totals',               formats: ['pdf','excel'], roles: ['md','logistics_manager','accountant','ico'], periodType: 'range' },
  { id: 'fuel_consumption',    name: 'Fuel Consumption Report',       category: 'vehicle', description: 'Fuel dispensed per vehicle, cost per trip and blocks per litre efficiency',     formats: ['pdf','excel'], roles: ['md','logistics_manager','ico'], periodType: 'range' },
  // FINANCIAL
  { id: 'expense_report',      name: 'Expense Report',                category: 'financial', description: 'All expenses by category with totals, trend and largest expenses',            formats: ['pdf','excel'], roles: ['md','accountant','ico'], periodType: 'range' },
  { id: 'pl_report',           name: 'Profit & Loss Report',          category: 'financial', description: 'Accrual income statement: revenue from goods delivered (not cash received), direct & operating costs by cost centre, gross and net profit; accrued labour, unpaid loading and unpriced items shown separately as not-yet-included',    formats: ['pdf','excel'], roles: ['md','accountant','ico','board_member'], periodType: 'range' },
  { id: 'balance_sheet',       name: 'Balance Sheet Report',          category: 'financial', description: 'Live-computed cash, receivables, inventory and payables combined with fixed assets and equity from static opening balances (pending accountant confirmation); includes a balance check',                        formats: ['pdf','excel'], roles: ['md','accountant','ico','board_member'], periodType: 'asAt' },
  { id: 'cash_flow',           name: 'Cash Flow Report',              category: 'financial', description: 'Operating cash flow (cash basis). Investing and financing activities are not yet tracked in this system.',                   formats: ['pdf','excel'], roles: ['md','accountant','ico','board_member'], periodType: 'range' },
  { id: 'bank_recon',          name: 'Bank Reconciliation Report',    category: 'financial', description: 'Statement balance vs book balance per bank account',                           formats: ['pdf'], roles: ['md','accountant','ico'], periodType: 'range' },
  { id: 'supplier_statement',  name: 'Supplier Statement Report',     category: 'financial', description: 'All purchases and payments per supplier with outstanding payables aging',      formats: ['pdf','excel'], roles: ['md','accountant','ico'], periodType: 'range' },
]

const CATEGORIES = [
  { id: 'all',        label: 'All Reports' },
  { id: 'production', label: 'Production' },
  { id: 'sales',      label: 'Sales & Revenue' },
  { id: 'customer',   label: 'Customer' },
  { id: 'delivery',   label: 'Delivery' },
  { id: 'staff',      label: 'Staff & Payroll' },
  { id: 'inventory',  label: 'Inventory' },
  { id: 'vehicle',    label: 'Vehicle' },
  { id: 'financial',  label: 'Financial' },
]

// ── PDF HELPERS ──────────────────────────────────────────────
function pdfHeader(doc, title, period) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(30, 40, 70)
  doc.rect(0, 0, W, 28, 'F')
  doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(COMPANY.name, 14, 11)
  doc.setFontSize(11); doc.setTextColor(180, 200, 255)
  doc.text(title, W - 14, 11, { align: 'right' })
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(200, 210, 240)
  doc.text(period, 14, 20)
  doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, W - 14, 20, { align: 'right' })
  doc.setDrawColor(79, 142, 247); doc.setLineWidth(0.5)
  doc.line(14, 28, W - 14, 28)
  return 34
}

function pdfFooter(doc) {
  const pages = doc.internal.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(140, 140, 160); doc.setFont(undefined, 'normal')
    doc.text(`${COMPANY.address} | ${COMPANY.phone}`, W / 2, H - 8, { align: 'center' })
    doc.text(`Page ${i} of ${pages}`, W - 14, H - 8, { align: 'right' })
  }
}

function pdfTable(doc, startY, head, body, totalsRow = null) {
  const rows = totalsRow ? [...body, totalsRow] : body
  autoTable(doc, {
    startY,
    head: [head],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [30, 40, 70], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    didParseCell: data => {
      if (totalsRow && data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [220, 230, 255]
      }
    },
    margin: { left: 14, right: 14 },
  })
}

// ── EXCEL HELPER ─────────────────────────────────────────────
function excelExport(filename, title, period, headers, rows, totalsRow = null) {
  const data = [
    [COMPANY.name],
    [title],
    [period],
    [],
    headers,
    ...rows,
  ]
  if (totalsRow) data.push(totalsRow)
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = headers.map(() => ({ wch: 20 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, filename)
}

// ── DATA FETCHERS ────────────────────────────────────────────
async function fetchProductionRange(from, to) {
  let q = supabase.from('production_log').select('*, recorder:recorded_by(full_name)').order('date')
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchDamageRange(from, to) {
  let q = supabase.from('damage_log').select('*, delivery:waybill_id(waybill_number)').order('date')
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data } = await q
  const rows = data || []
  const ids = [...new Set(rows.map(r => r.recorded_by).filter(Boolean))]
  if (ids.length) {
    const { data: profiles } = await supabase.from('user_profiles_directory').select('id, full_name').in('id', ids)
    const nameMap = {}
    for (const p of profiles || []) nameMap[p.id] = p.full_name
    return rows.map(r => ({ ...r, recorder: r.recorded_by ? { id: r.recorded_by, full_name: nameMap[r.recorded_by] || null } : null }))
  }
  return rows
}
async function fetchWaybillRange(from, to) {
  let q = supabase.from('waybills').select('*, driver:driver_id(full_name), vehicle:vehicle_id(vehicle_number)').order('waybill_date')
  if (from) q = q.gte('waybill_date', from)
  if (to)   q = q.lte('waybill_date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchOrdersRange(from, to) {
  let q = supabase.from('orders').select('*, customer:customer_id(name,location), marketer:marketer_id(full_name), items:order_items(*), invoice:invoices(invoice_number,total_amount,issued_date,due_date)').order('created_at')
  if (from) q = q.gte('created_at', from + 'T00:00:00')
  if (to)   q = q.lte('created_at', to + 'T23:59:59')
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchPaymentsRange(from, to) {
  let q = supabase.from('payments').select('*, invoice:invoice_id(invoice_number, order:order_id(customer:customer_id(name)))').order('payment_date')
  if (from) q = q.gte('payment_date', from)
  if (to)   q = q.lte('payment_date', to)
  q = q.eq('status', 'confirmed')
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchExpensesRange(from, to) {
  let q = supabase.from('expenses').select('*, category:category_id(name, cost_center)').order('expense_date')
  if (from) q = q.gte('expense_date', from)
  if (to)   q = q.lte('expense_date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchAttendanceRange(from, to) {
  let q = supabase.from('attendance').select('*').order('date')
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchAllStaff() {
  const { data } = await supabase.from('staff').select('*').eq('is_active', true).order('full_name')
  return data || []
}
async function fetchPayrollStaff() {
  const { data } = await supabase
    .from('staff_payroll')
    .select('id, full_name, employee_number, staff_type, daily_rate, monthly_salary, bank_name, bank_account_number, bank_account_name')
    .eq('is_active', true)
    .order('full_name')
  return data || []
}
async function fetchAllVehicles() {
  const { data } = await supabase.from('vehicles').select('*, driver:assigned_driver_id(full_name)').order('vehicle_number')
  return data || []
}
async function fetchMaintenanceRange(from, to) {
  let q = supabase.from('vehicle_maintenance').select('*, vehicle:vehicle_id(vehicle_number)').order('maintenance_date')
  if (from) q = q.gte('maintenance_date', from)
  if (to)   q = q.lte('maintenance_date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchFuelRange(from, to) {
  let q = supabase.from('vehicle_fuel_log').select('*, vehicle:vehicle_id(vehicle_number)').order('date')
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchInventoryItems() {
  const { data } = await supabase.from('inventory_items').select('*').order('name')
  return data || []
}
async function fetchStockMovements(from, to) {
  let q = supabase.from('stock_movements').select('*, item:item_id(name,unit)').order('date')
  if (from) q = q.gte('date', from)
  if (to)   q = q.lte('date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
async function fetchCustomers() {
  const { data } = await supabase.from('customers').select('*, added_by_staff:added_by(full_name)').order('name')
  return data || []
}
async function fetchSuppliers() {
  const { data } = await supabase.from('suppliers').select('*').order('name')
  return data || []
}
async function fetchSupplierTransactions(from, to) {
  // Real date column is transaction_date. The old `supplier:supplier_id(name)`
  // embed referenced a non-existent suppliers.name column (would error); the
  // renderer resolves names via fetchSuppliers, so the embed is dropped.
  let q = supabase.from('supplier_transactions').select('*').order('transaction_date')
  if (from) q = q.gte('transaction_date', from)
  if (to)   q = q.lte('transaction_date', to)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ── REPORT GENERATORS ────────────────────────────────────────
const GENERATORS = {
  // 1. Daily Production
  daily_production: async (params) => {
    const rows = await fetchProductionRange(params.date, params.date)
    const damages = await fetchDamageRange(params.date, params.date)
    return { rows, damages }
  },
  // 2-3. Weekly/Monthly Production
  weekly_production: async (params) => fetchProductionRange(params.from, params.to),
  monthly_production: async (params) => fetchProductionRange(params.from, params.to),
  // 4. Production Cost
  production_cost: async (params) => fetchProductionRange(params.from, params.to),
  // 5. Damage & Waste
  damage_waste: async (params) => fetchDamageRange(params.from, params.to),
  // 6. Sales
  sales_report: async (params) => fetchOrdersRange(params.from, params.to),
  // 7. Revenue
  revenue_report: async (params) => fetchPaymentsRange(params.from, params.to),
  // 8. Invoice
  invoice_report: async (params) => {
    let q = supabase.from('invoices').select('*, order:order_id(customer:customer_id(name), payments(*))').order('issued_date')
    if (params.from) q = q.gte('issued_date', params.from)
    if (params.to)   q = q.lte('issued_date', params.to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },
  // 9. Marketer Performance
  marketer_performance: async (params) => {
    const orders = await fetchOrdersRange(params.from, params.to)
    const payments = await fetchPaymentsRange(params.from, params.to)
    return { orders, payments }
  },
  // 10. Customer Statement
  customer_statement: async (params) => {
    const [orders, payments] = await Promise.all([
      fetchOrdersRange(params.from, params.to),
      fetchPaymentsRange(params.from, params.to),
    ])
    const custOrders = params.customer_id ? orders.filter(o => o.customer_id === params.customer_id) : orders
    return { orders: custOrders, payments }
  },
  // 11. AR Aging
  ar_aging: async (params) => {
    const { data: invoices } = await supabase.from('invoices').select('*, order:order_id(customer:customer_id(name)), payments(amount_paid,status)').lte('issued_date', params.date || today())
    return invoices || []
  },
  // 12. Customer History
  customer_history: async (params) => fetchOrdersRange(params.from, params.to),
  // 13. New Customers
  new_customers: async (params) => {
    let q = supabase.from('customers').select('*, added_by_staff:added_by(full_name), orders(id,created_at,order_items(quantity,unit_price,subtotal))').order('created_at')
    if (params.from) q = q.gte('created_at', params.from + 'T00:00:00')
    if (params.to)   q = q.lte('created_at', params.to + 'T23:59:59')
    const { data, error } = await q
    if (error) throw error
    return data || []
  },
  // 14. Daily Delivery
  daily_delivery: async (params) => fetchWaybillRange(params.date, params.date),
  // 15. Delivery Performance
  delivery_performance: async (params) => fetchWaybillRange(params.from, params.to),
  // 16. Waybill Reconciliation
  waybill_recon: async (params) => fetchWaybillRange(params.from, params.to),
  // 17. Pending Delivery
  pending_delivery: async () => {
    const { data } = await supabase.from('orders').select('*, customer:customer_id(name), items:order_items(quantity,block_type,unit_price)').in('status', ['pending','in_progress'])
    return data || []
  },
  // 18. Attendance
  attendance_report: async (params) => {
    const att = await fetchAttendanceRange(params.from, params.to)
    const ids = [...new Set(att.map(a => a.staff_id).filter(Boolean))]
    const { data: staffRows } = ids.length
      ? await supabase.from('staff_public').select('id, full_name').in('id', ids)
      : { data: [] }
    const nameMap = Object.fromEntries((staffRows || []).map(s => [s.id, s.full_name]))
    return att.map(a => ({ ...a, _staff_name: nameMap[a.staff_id] || null }))
  },
  // 19. Payroll
  payroll_report: async (params) => {
    const [att, staff] = await Promise.all([fetchAttendanceRange(params.from, params.to), fetchPayrollStaff()])
    return { att, staff }
  },
  // 20. Staff Directory
  staff_directory: async () => fetchAllStaff(),
  // 21. Stock Status
  stock_status: async () => fetchInventoryItems(),
  // 22. Stock Movement
  stock_movement: async (params) => fetchStockMovements(params.from, params.to),
  // 23. Inventory Valuation
  inventory_valuation: async () => fetchInventoryItems(),
  // 24. Fleet Status
  fleet_status: async () => fetchAllVehicles(),
  // 25. Vehicle Utilisation
  vehicle_utilisation: async (params) => {
    const [wb, fuel, maint] = await Promise.all([fetchWaybillRange(params.from, params.to), fetchFuelRange(params.from, params.to), fetchMaintenanceRange(params.from, params.to)])
    return { wb, fuel, maint }
  },
  // 26. Maintenance Cost
  maintenance_cost: async (params) => fetchMaintenanceRange(params.from, params.to),
  // 27. Fuel Consumption
  fuel_consumption: async (params) => fetchFuelRange(params.from, params.to),
  // 28. Expense
  expense_report: async (params) => fetchExpensesRange(params.from, params.to),
  // 29. P&L — accrual income statement (delivered revenue, cost centres, memo)
  pl_report: async (params) => {
    const { from, to } = params
    const unwrap = r => { if (r.error) throw r.error; return r.data || [] }
    // Monthly-salary accrual: payroll_lines whose run falls in the period.
    // Two-step (run ids → lines) avoids fragile embedded-column filtering.
    const runs = unwrap(await supabase.from('payroll_runs').select('id').gte('run_date', from).lte('run_date', to))
    const runIds = runs.map(r => r.id)
    const [deliveries, expenses, weeklyLabour, loadingUnpaid, payrollLines, payments] = await Promise.all([
      supabase.from('v_delivered_revenue').select('waybill_id, waybill_date, block_type, quantity_received, unit_price, line_value, unvalued').gte('waybill_date', from).lte('waybill_date', to).then(unwrap),
      supabase.from('expenses').select('amount, category:category_id(name, cost_center)').gte('expense_date', from).lte('expense_date', to).then(unwrap),
      supabase.from('weekly_labour_payroll').select('total_amount').gte('week_ending', from).lte('week_ending', to).then(unwrap),
      // Unlinked loading only — rows WITH a payroll_id are already inside
      // weekly_labour_payroll.total_amount; including them would double-count.
      supabase.from('truck_loading_log').select('total_amount').is('payroll_id', null).gte('date', from).lte('date', to).then(unwrap),
      runIds.length ? supabase.from('payroll_lines').select('amount_due').in('payroll_run_id', runIds).then(unwrap) : Promise.resolve([]),
      supabase.from('payments').select('amount_paid').eq('status', 'confirmed').gte('payment_date', from).lte('payment_date', to).then(unwrap),
    ])
    return { deliveries, expenses, weeklyLabour, loadingUnpaid, payrollLines, payments }
  },
  // 30. Balance Sheet — live working-capital positions + static opening balances
  balance_sheet: async () => {
    const unwrap = r => { if (r.error) throw r.error; return r.data || [] }
    const [openingBalances, banks, invoices, paymentsConfirmed, inventory, payablesExp] = await Promise.all([
      supabase.from('opening_balances').select('category, account_name, amount, as_at_date').then(unwrap),
      supabase.from('bank_accounts').select('current_balance').eq('is_active', true).then(unwrap),
      supabase.from('invoices').select('total_amount').then(unwrap),
      supabase.from('payments').select('amount_paid').eq('status', 'confirmed').then(unwrap),
      supabase.from('inventory_items').select('current_stock, unit_cost').then(unwrap),
      // Trade Payables = approved but not-yet-disbursed expenses (no payment_request,
      // not ingested from a bank statement) — i.e. owed-but-unpaid. See PR note.
      supabase.from('expenses').select('amount').eq('status', 'approved').is('payment_request_id', null).is('ingestion_source', null).then(unwrap),
    ])
    return { openingBalances, banks, invoices, paymentsConfirmed, inventory, payablesExp }
  },
  // 31. Cash Flow — true cash basis (money that actually moved)
  cash_flow: async (params) => {
    const { from, to } = params
    const unwrap = r => { if (r.error) throw r.error; return r.data || [] }
    const [payments, expenses] = await Promise.all([
      supabase.from('payments').select('amount_paid').eq('status', 'confirmed').gte('payment_date', from).lte('payment_date', to).then(unwrap),
      // Confirmed cash out only: disbursed via payment_request, or approved
      // manual expenses. Excludes pending (never paid).
      supabase.from('expenses').select('amount')
        .or('ingestion_source.eq.payment_request,and(ingestion_source.is.null,status.eq.approved)')
        .gte('expense_date', from).lte('expense_date', to).then(unwrap),
    ])
    return { payments, expenses }
  },
  // 32. Bank Recon
  bank_recon: async (params) => {
    let q = supabase.from('bank_reconciliations').select('*, account:bank_account_id(account_name,bank_name)').order('created_at', { ascending: false })
    if (params.from) q = q.gte('statement_date', params.from)
    if (params.to)   q = q.lte('statement_date', params.to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },
  // 33. Supplier Statement
  supplier_statement: async (params) => {
    const [suppliers, txns] = await Promise.all([fetchSuppliers(), fetchSupplierTransactions(params.from, params.to)])
    return { suppliers, txns }
  },
}

// ── P&L (ACCRUAL INCOME STATEMENT) SHARED BUILDER ────────────
// Single source of truth so the PDF and Excel renderers are identical.
// Revenue = delivered goods (accrual), not cash received. Direct/operating
// costs come ONLY from the expenses table; the payroll tables feed ONLY the
// memo below net profit and never enter the profit calculation (no double
// count — see the pl_report notes).
const capWord = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
function buildPLStatement(data) {
  const { deliveries = [], expenses = [], weeklyLabour = [], loadingUnpaid = [], payrollLines = [], payments = [] } = data || {}
  const num = v => Number(v) || 0

  // REVENUE — delivered goods that could be priced
  const revenue = deliveries.filter(d => d.unvalued === false).reduce((s, d) => s + num(d.line_value), 0)
  const unvaluedCount = deliveries.filter(d => d.unvalued === true).length

  // DIRECT COSTS — expenses in the 'production' cost centre, one line per category
  const directMap = {}
  for (const e of expenses) {
    if (e.category?.cost_center === 'production') {
      const k = e.category?.name || 'Uncategorised'
      directMap[k] = (directMap[k] || 0) + num(e.amount)
    }
  }
  const directLines = Object.entries(directMap).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  const directTotal = directLines.reduce((s, l) => s + l.amount, 0)
  const grossProfit = revenue - directTotal

  // OPERATING EXPENSES — every non-production expense, grouped by cost centre
  // (null grouped as Uncategorised, never dropped)
  const opMap = {}
  for (const e of expenses) {
    const cc = e.category?.cost_center
    if (cc === 'production') continue
    const key = cc || '__null__'
    opMap[key] = (opMap[key] || 0) + num(e.amount)
  }
  const opLines = Object.entries(opMap)
    .map(([key, amount]) => ({ label: key === '__null__' ? 'Uncategorised' : capWord(key), amount }))
    .sort((a, b) => b.amount - a.amount)
  const operatingTotal = opLines.reduce((s, l) => s + l.amount, 0)
  const netProfit = grossProfit - operatingTotal

  // NOT YET INCLUDED (memo only — from payroll tables, never in net profit)
  const dailyLabour = weeklyLabour.reduce((s, r) => s + num(r.total_amount), 0)
  const loadingUnpaidSum = loadingUnpaid.reduce((s, r) => s + num(r.total_amount), 0)
  const loadingUnpaidCount = loadingUnpaid.length
  const monthlySalaries = payrollLines.reduce((s, r) => s + num(r.amount_due), 0)

  // MEMO — deposits held = confirmed cash in − delivered revenue, only if positive
  const paymentsTotal = payments.reduce((s, r) => s + num(r.amount_paid), 0)
  const depositsRaw = paymentsTotal - revenue
  const deposits = depositsRaw > 0 ? depositsRaw : null

  return { revenue, unvaluedCount, directLines, directTotal, grossProfit, opLines, operatingTotal,
           netProfit, dailyLabour, loadingUnpaidSum, loadingUnpaidCount, monthlySalaries, deposits }
}
// Rows shared by both renderers: { label, amount(string), kind } — kind drives PDF styling.
function plStatementRows(S) {
  const rows = []
  const add = (label, amount, kind) => rows.push({ label, amount, kind })
  add('REVENUE', '', 'header')
  add('   Goods delivered', naira(S.revenue), 'line')
  if (S.unvaluedCount > 0) add(`   ⚠ ${S.unvaluedCount} deliveries excluded — could not be priced`, '', 'warn')
  add('', '', 'spacer')
  add('DIRECT COSTS', '', 'header')
  if (S.directLines.length === 0) add('   (none recorded)', '', 'line')
  S.directLines.forEach(l => add('   ' + l.label, naira(l.amount), 'line'))
  add('   Total direct costs', '(' + naira(S.directTotal) + ')', 'total')
  add('', '', 'spacer')
  add('GROSS PROFIT', naira(S.grossProfit), 'grossprofit')
  add('', '', 'spacer')
  add('OPERATING EXPENSES', '', 'header')
  if (S.opLines.length === 0) add('   (none recorded)', '', 'line')
  S.opLines.forEach(l => add('   ' + l.label, naira(l.amount), 'line'))
  add('   Total operating expenses', '(' + naira(S.operatingTotal) + ')', 'total')
  add('', '', 'spacer')
  add('NET PROFIT / (LOSS) — before items below', naira(S.netProfit), 'netprofit')
  add('', '', 'spacer')
  add('── NOT YET INCLUDED IN THIS STATEMENT ──', '', 'memohead')
  add('   Daily-paid labour (weekly payroll)', naira(S.dailyLabour), 'memo')
  add('   Loading & offloading — unpaid', naira(S.loadingUnpaidSum), 'memo')
  add(`      ${S.loadingUnpaidCount} records not yet attached to a payroll`, '', 'memonote')
  add('   Monthly staff salaries (accrued)', naira(S.monthlySalaries), 'memo')
  add('   Materials consumed in production', '—', 'memo')
  add('      (costing layer pending)', '', 'memonote')
  add('   Unvalued deliveries', `${S.unvaluedCount} waybills`, 'memo')
  if (S.deposits !== null) {
    add('', '', 'spacer')
    add('── MEMO ──', '', 'memohead')
    add('   Customer deposits held', naira(S.deposits), 'memo')
    add('      money received for goods not yet delivered — a liability, not revenue', '', 'memonote')
  }
  return rows
}

// ── SUPPLIER STATEMENT (with payables aging) ────────────────
// Bucket a supplier's whole outstanding balance by the age of its oldest
// still-unpaid purchase (payments applied FIFO to oldest purchases first).
function supplierAging(purchaseTxns, totalPaid, asOfStr) {
  const b = { current: 0, d31: 0, d61: 0, d90: 0 }
  const purchases = [...purchaseTxns].sort((a, z) => new Date(a.transaction_date) - new Date(z.transaction_date))
  const balance = purchases.reduce((s, p) => s + Number(p.amount || 0), 0) - totalPaid
  if (balance <= 0) return b
  let remaining = totalPaid, oldestUnpaid = null
  for (const p of purchases) {
    const amt = Number(p.amount || 0)
    if (remaining >= amt) { remaining -= amt; continue }
    oldestUnpaid = p.transaction_date; break
  }
  if (!oldestUnpaid) oldestUnpaid = purchases[purchases.length - 1]?.transaction_date
  const days = oldestUnpaid ? Math.floor((new Date(asOfStr) - new Date(oldestUnpaid)) / 86400000) : 0
  if (days <= 30) b.current = balance
  else if (days <= 60) b.d31 = balance
  else if (days <= 90) b.d61 = balance
  else b.d90 = balance
  return b
}
function supplierStatementRows(data) {
  const { suppliers = [], txns = [] } = data || {}
  const asOf = today()
  return suppliers.map(s => {
    const st = txns.filter(t => t.supplier_id === s.id)
    const purchases = st.filter(t => t.transaction_type === 'purchase')
    const purchased = purchases.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const paid = st.filter(t => t.transaction_type === 'payment').reduce((sum, t) => sum + Number(t.amount || 0), 0)
    const b = supplierAging(purchases, paid, asOf)
    return { name: s.company_name || '—', purchased, paid, balance: purchased - paid, ...b }
  })
}

// ── CASH FLOW (cash basis) ──────────────────────────────────
function buildCashFlowRows(data) {
  const num = v => Number(v) || 0
  const received = (data.payments || []).reduce((s, p) => s + num(p.amount_paid), 0)
  const paid = (data.expenses || []).reduce((s, e) => s + num(e.amount), 0)
  const net = received - paid
  const rows = []
  const add = (l, a, k) => rows.push({ label: l, amount: a, kind: k })
  add('OPERATING ACTIVITIES', '', 'header')
  add('   Cash received from customers', naira(received), 'line')
  add('   Cash paid for expenses', '(' + naira(paid) + ')', 'line')
  add('   Net Operating Cash Flow', naira(net), 'subtotal')
  add('', '', 'spacer')
  add('INVESTING ACTIVITIES', '', 'header')
  add('   Not currently tracked in this system', '—', 'memonote')
  add('', '', 'spacer')
  add('FINANCING ACTIVITIES', '', 'header')
  add('   Not currently tracked in this system', '—', 'memonote')
  add('', '', 'spacer')
  add('NET CHANGE IN CASH', naira(net), 'net')
  return { rows, net }
}

// ── BALANCE SHEET (live positions + static opening balances) ─
function buildBalanceSheet(data) {
  const num = v => Number(v) || 0
  const ob = data.openingBalances || []
  const cashAtBank = (data.banks || []).reduce((s, b) => s + num(b.current_balance), 0)
  const receivables = (data.invoices || []).reduce((s, i) => s + num(i.total_amount), 0)
    - (data.paymentsConfirmed || []).reduce((s, p) => s + num(p.amount_paid), 0)
  const inventory = (data.inventory || []).reduce((s, i) => s + num(i.current_stock) * num(i.unit_cost), 0)
  const payables = (data.payablesExp || []).reduce((s, e) => s + num(e.amount), 0)

  // Static rows, excluding the four items now computed live (avoid double count)
  const COMPUTED = new Set(['Cash on Hand', 'Trade Receivables', 'Inventory', 'Trade Payables'])
  const pick = cat => ob.filter(o => o.category === cat && !COMPUTED.has(o.account_name))
  const staticAssets = pick('asset'), staticLiab = pick('liability'), staticEquity = pick('equity')
  const sum = arr => arr.reduce((s, o) => s + num(o.amount), 0)

  const totalAssets = cashAtBank + receivables + inventory + sum(staticAssets)
  const totalLE = payables + sum(staticLiab) + sum(staticEquity)
  const balanceCheck = totalAssets - totalLE

  const rows = []
  const add = (l, a, k) => rows.push({ label: l, amount: a, kind: k })
  const staticRow = o => add(`   ${o.account_name} · per opening balances (as at ${fmtDate(o.as_at_date)})`, naira(num(o.amount)), 'static')
  add('ASSETS', '', 'header')
  add('   Cash at Bank (live)', naira(cashAtBank), 'line')
  add('   Trade Receivables (live)', naira(receivables), 'line')
  add('   Inventory (live)', naira(inventory), 'line')
  staticAssets.forEach(staticRow)
  add('   Total Assets', naira(totalAssets), 'total')
  add('', '', 'spacer')
  add('LIABILITIES & EQUITY', '', 'header')
  add('   Trade Payables (live)', naira(payables), 'line')
  staticLiab.forEach(staticRow)
  staticEquity.forEach(staticRow)
  add('   Total Liabilities & Equity', naira(totalLE), 'total')
  add('', '', 'spacer')
  add(balanceCheck === 0 ? 'Balance Check: ✓ Balanced' : 'Balance Check (Assets − Liabilities & Equity)',
      balanceCheck === 0 ? '' : naira(balanceCheck), 'balancecheck')
  return { rows, balanceCheck }
}

// Shared statement-style autoTable used by cash flow & balance sheet.
function statementTable(doc, startY, rows, colorFor) {
  autoTable(doc, {
    startY,
    head: [['', 'Amount (₦)']],
    body: rows.map(r => [r.label, r.amount]),
    styles: { fontSize: 10, cellPadding: 1.4 },
    headStyles: { fillColor: [30, 40, 70], textColor: 255 },
    columnStyles: { 1: { halign: 'right', cellWidth: 48 } },
    didParseCell: d => {
      const k = rows[d.row.index]?.kind
      if (['header', 'subtotal', 'total', 'net', 'balancecheck'].includes(k)) d.cell.styles.fontStyle = 'bold'
      if (k === 'header') d.cell.styles.fillColor = [235, 238, 245]
      if (k === 'static') d.cell.styles.textColor = [110, 110, 120]
      if (k === 'memonote') { d.cell.styles.fontStyle = 'italic'; d.cell.styles.textColor = [140, 140, 150] }
      const fill = colorFor && colorFor(k)
      if (fill) d.cell.styles.fillColor = fill
    },
    margin: { left: 14, right: 14 },
  })
}

// ── PDF RENDERERS ────────────────────────────────────────────
function renderPDF(reportId, data, params, period) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const report = CATALOG.find(r => r.id === reportId)
  const startY = pdfHeader(doc, report.name, period)

  switch (reportId) {
    case 'daily_production': {
      const { rows, damages } = data
      const head = ['Date', 'Block Type', 'Qty Produced', 'Cement Bags', 'Granite kg', 'Diesel L', 'Recorded By']
      const body = rows.map(r => [r.date, r.block_type, r.quantity_produced, r.cement_bags || 0, r.granite_dust_kg || 0, r.diesel_litres || 0, r.recorder?.full_name || '—'])
      const totals = ['TOTAL', '', rows.reduce((s,r)=>s+r.quantity_produced,0), rows.reduce((s,r)=>s+Number(r.cement_bags||0),0).toFixed(1), rows.reduce((s,r)=>s+Number(r.granite_dust_kg||0),0).toFixed(1), rows.reduce((s,r)=>s+Number(r.diesel_litres||0),0).toFixed(1), '']
      pdfTable(doc, startY, head, body, totals)
      if (damages.length) {
        const dmgY = doc.lastAutoTable.finalY + 8
        doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(30,30,30)
        doc.text('Damage Summary', 14, dmgY)
        const dhead = ['Date', 'Block Type', 'Stage', 'Qty Damaged', 'Notes']
        const dbody = damages.map(d => [d.date, d.block_type, d.stage, d.quantity_damaged, d.notes || ''])
        pdfTable(doc, dmgY + 4, dhead, dbody)
      }
      break
    }
    case 'weekly_production':
    case 'monthly_production': {
      const rows = data
      const head = ['Date', 'Block Type', 'Qty Produced', 'Cement Bags', 'Granite kg', 'Diesel L']
      const body = rows.map(r => [r.date, r.block_type, r.quantity_produced, r.cement_bags || 0, r.granite_dust_kg || 0, r.diesel_litres || 0])
      const totals = ['TOTAL', '', rows.reduce((s,r)=>s+r.quantity_produced,0), rows.reduce((s,r)=>s+Number(r.cement_bags||0),0).toFixed(1), rows.reduce((s,r)=>s+Number(r.granite_dust_kg||0),0).toFixed(1), rows.reduce((s,r)=>s+Number(r.diesel_litres||0),0).toFixed(1)]
      pdfTable(doc, startY, head, body, totals)
      break
    }
    case 'production_cost': {
      const rows = data
      const types = [...new Set(rows.map(r => r.block_type))]
      const head = ['Block Type', 'Total Produced', 'Cement Bags', 'Granite kg', 'Diesel L', 'Est. Cost/Block']
      const body = types.map(t => {
        const tr = rows.filter(r => r.block_type === t)
        const qty = tr.reduce((s,r)=>s+r.quantity_produced,0)
        const cement = tr.reduce((s,r)=>s+Number(r.cement_bags||0),0)
        const granite = tr.reduce((s,r)=>s+Number(r.granite_dust_kg||0),0)
        const diesel = tr.reduce((s,r)=>s+Number(r.diesel_litres||0),0)
        const estCost = qty > 0 ? ((cement * 5000 + granite * 50 + diesel * 750) / qty) : 0
        return [t, qty, cement.toFixed(1), granite.toFixed(1), diesel.toFixed(1), naira(estCost)]
      })
      pdfTable(doc, startY, head, body)
      break
    }
    case 'damage_waste': {
      const head = ['Date', 'Block Type', 'Stage', 'Qty Damaged', 'Notes']
      const body = data.map(d => [d.date, d.block_type, d.stage, d.quantity_damaged, d.notes || ''])
      const totals = ['TOTAL', '', '', data.reduce((s,d)=>s+d.quantity_damaged,0), '']
      pdfTable(doc, startY, head, body, totals)
      break
    }
    case 'sales_report': {
      const head = ['Date', 'Customer', 'Location', 'Marketer', 'Items', 'Value (₦)', 'Status']
      const body = data.map(o => {
        const value = (o.items||[]).reduce((s,i)=>s+Number(i.subtotal||0),0)
        const items = (o.items||[]).map(i=>`${i.block_type}(${i.quantity})`).join(', ')
        return [fmtDate(o.created_at), o.customer?.name||'—', o.customer?.location||'—', o.marketer?.full_name||'—', items, naira(value), o.status]
      })
      const total = data.reduce((s,o)=>s+(o.items||[]).reduce((ss,i)=>ss+Number(i.subtotal||0),0),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','','',naira(total),''])
      break
    }
    case 'revenue_report': {
      const head = ['Date', 'Customer', 'Invoice No', 'Amount Paid (₦)', 'Method']
      const body = data.map(p => [fmtDate(p.payment_date), p.invoice?.order?.customer?.name||'—', p.invoice?.invoice_number||'—', naira(p.amount_paid), p.payment_method||'—'])
      const total = data.reduce((s,p)=>s+Number(p.amount_paid),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','',naira(total),''])
      break
    }
    case 'invoice_report': {
      const head = ['Invoice No', 'Customer', 'Issued', 'Due', 'Amount (₦)', 'Paid (₦)', 'Balance (₦)', 'Status']
      const body = data.map(inv => {
        const paid = (inv.order?.payments||[]).filter(p=>p.status==='confirmed').reduce((s,p)=>s+Number(p.amount_paid),0)
        const bal = Number(inv.total_amount||0) - paid
        return [inv.invoice_number, inv.order?.customer?.name||'—', fmtDate(inv.issued_date), fmtDate(inv.due_date), naira(inv.total_amount), naira(paid), naira(bal), bal<=0?'Paid':'Outstanding']
      })
      pdfTable(doc, startY, head, body)
      break
    }
    case 'marketer_performance': {
      const { orders } = data
      const marketers = {}
      orders.forEach(o => {
        const k = o.marketer?.full_name || 'Unknown'
        if (!marketers[k]) marketers[k] = { orders: 0, value: 0 }
        marketers[k].orders++
        marketers[k].value += (o.items||[]).reduce((s,i)=>s+Number(i.subtotal||0),0)
      })
      const head = ['Marketer', 'Orders', 'Total Value (₦)']
      const body = Object.entries(marketers).map(([k,v]) => [k, v.orders, naira(v.value)])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'customer_statement':
    case 'customer_history': {
      const { orders } = data
      const head = ['Date', 'Customer', 'Block Type', 'Qty', 'Unit Price', 'Subtotal']
      const body = orders.flatMap(o => (o.items||[]).map(i => [fmtDate(o.created_at), o.customer?.name||'—', i.block_type, i.quantity, naira(i.unit_price), naira(i.subtotal)]))
      const total = orders.flatMap(o=>o.items||[]).reduce((s,i)=>s+Number(i.subtotal||0),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','','',naira(total)])
      break
    }
    case 'ar_aging': {
      const head = ['Customer', 'Invoice No', 'Issued', 'Amount (₦)', 'Paid (₦)', 'Balance (₦)', 'Days Outstanding', 'Aging Bucket']
      const body = data.map(inv => {
        const paid = (inv.payments||[]).filter(p=>p.status==='confirmed').reduce((s,p)=>s+Number(p.amount_paid),0)
        const bal = Number(inv.total_amount||0) - paid
        const days = inv.issued_date ? Math.floor((new Date()-new Date(inv.issued_date))/(1000*60*60*24)) : 0
        const bucket = days <= 30 ? 'Current' : days <= 60 ? '31-60 days' : days <= 90 ? '61-90 days' : days <= 120 ? '91-120 days' : '120+ days'
        return [inv.order?.customer?.name||'—', inv.invoice_number, fmtDate(inv.issued_date), naira(inv.total_amount), naira(paid), naira(bal), days, bucket]
      }).filter(r => Number(r[5].replace(/[₦,]/g,'')) > 0)
      pdfTable(doc, startY, head, body)
      break
    }
    case 'new_customers': {
      const head = ['Name', 'Phone', 'Location', 'Registered By', 'Date Registered', 'Orders']
      const body = data.map(c => [c.name, c.phone||'—', c.location||'—', c.added_by_staff?.full_name||'—', fmtDate(c.created_at), (c.orders||[]).length])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'daily_delivery':
    case 'delivery_performance':
    case 'waybill_recon': {
      const rows = Array.isArray(data) ? data : []
      const head = ['Waybill No', 'Date', 'Customer', 'Block Type', 'Loaded', 'Received', 'Damaged', 'Driver', 'Vehicle']
      const body = rows.map(w => [w.waybill_number, fmtDate(w.waybill_date), w.receiver_name||'—', w.block_type, w.quantity_loaded||0, w.quantity_received||0, w.quantity_damaged||0, w.driver?.full_name||'—', w.vehicle?.vehicle_number||w.truck_number||'—'])
      const totals = ['TOTAL','','','',rows.reduce((s,w)=>s+(w.quantity_loaded||0),0),rows.reduce((s,w)=>s+(w.quantity_received||0),0),rows.reduce((s,w)=>s+(w.quantity_damaged||0),0),'','']
      pdfTable(doc, startY, head, body, totals)
      break
    }
    case 'pending_delivery': {
      const head = ['Customer', 'Status', 'Block Types', 'Total Qty', 'Date Ordered', 'Days Waiting']
      const body = data.map(o => {
        const days = Math.floor((new Date()-new Date(o.created_at))/(1000*60*60*24))
        const items = (o.items||[]).map(i=>`${i.block_type}(${i.quantity})`).join(', ')
        const total = (o.items||[]).reduce((s,i)=>s+(i.quantity||0),0)
        return [o.customer?.name||'—', o.status, items, total, fmtDate(o.created_at), days > 30 ? `⚠ ${days}` : days]
      })
      pdfTable(doc, startY, head, body)
      break
    }
    case 'attendance_report': {
      const rows = data
      const staffMap = {}
      rows.forEach(a => {
        const k = a._staff_name || a.staff_id
        if (!staffMap[k]) staffMap[k] = { days: 0, present: 0, rate: 0 }
        staffMap[k].days++
        if (a.present) staffMap[k].present++
      })
      Object.values(staffMap).forEach(s => s.rate = s.days ? ((s.present/s.days)*100).toFixed(1) : 0)
      const head = ['Staff Member', 'Days Recorded', 'Days Present', 'Days Absent', 'Attendance %']
      const body = Object.entries(staffMap).map(([k,v]) => [k, v.days, v.present, v.days-v.present, v.rate+'%'])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'payroll_report': {
      const { att, staff } = data
      const head = ['Staff Member', 'Role', 'Type', 'Days Present', 'Rate', 'Gross Pay (₦)']
      const body = staff.map(s => {
        const records = att.filter(a => a.staff_id === s.id)
        const present = records.filter(a => a.present).length
        const gross = s.staff_type === 'daily' ? present * Number(s.daily_rate||0) : Number(s.monthly_salary||0)
        return [s.full_name, s.role, s.staff_type, present, s.staff_type==='daily'?naira(s.daily_rate)+'/day':naira(s.monthly_salary)+'/mo', naira(gross)]
      })
      const total = staff.reduce((sum,s)=>{
        const present = att.filter(a=>a.staff_id===s.id&&a.present).length
        return sum + (s.staff_type==='daily'?present*Number(s.daily_rate||0):Number(s.monthly_salary||0))
      },0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','','',naira(total)])
      break
    }
    case 'staff_directory': {
      const head = ['Name', 'Role', 'Type', 'Phone', 'Date Hired', 'Status']
      const body = data.map(s => [s.full_name, s.role, s.staff_type, s.phone||'—', fmtDate(s.date_hired), s.is_active?'Active':'Inactive'])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'stock_status': {
      const head = ['Item', 'Unit', 'Current Stock', 'Reorder Level', 'Unit Cost (₦)', 'Total Value (₦)', 'Status']
      const body = data.map(i => [i.name, i.unit||'—', i.current_stock, i.reorder_level||0, naira(i.unit_cost), naira(Number(i.current_stock)*Number(i.unit_cost||0)), Number(i.current_stock)<=Number(i.reorder_level)?'⚠ LOW':'OK'])
      const total = data.reduce((s,i)=>s+Number(i.current_stock)*Number(i.unit_cost||0),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','','',naira(total),''])
      break
    }
    case 'stock_movement': {
      const head = ['Date', 'Item', 'Unit', 'Type', 'Qty', 'Reason', 'Reference']
      const body = data.map(m => [fmtDate(m.date), m.item?.name||'—', m.item?.unit||'—', m.type, m.quantity, m.reason||'—', m.reference||'—'])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'inventory_valuation': {
      const head = ['Item', 'Unit', 'Qty on Hand', 'Unit Cost (₦)', 'Total Value (₦)']
      const body = data.map(i => [i.name, i.unit||'—', i.current_stock, naira(i.unit_cost), naira(Number(i.current_stock)*Number(i.unit_cost||0))])
      const total = data.reduce((s,i)=>s+Number(i.current_stock)*Number(i.unit_cost||0),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','',naira(total)])
      break
    }
    case 'fleet_status': {
      const head = ['Vehicle No', 'Make/Model', 'Status', 'Driver', 'Insurance Expiry', 'Road Worthiness', 'Last Service']
      const body = data.map(v => [v.vehicle_number, `${v.make||''} ${v.model||''}`.trim()||'—', v.status, v.driver?.full_name||'—', fmtDate(v.insurance_expiry), fmtDate(v.road_worthiness_expiry), fmtDate(v.last_service_date)])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'vehicle_utilisation': {
      const { wb, fuel, maint } = data
      const vehicles = [...new Set([...wb.map(w=>w.vehicle?.vehicle_number||w.truck_number||'—'), ...fuel.map(f=>f.vehicle?.vehicle_number||'—')])]
      const head = ['Vehicle', 'Trips', 'Blocks Delivered', 'Fuel (L)', 'Fuel Cost (₦)', 'Maint. Cost (₦)', 'Cost/Trip (₦)']
      const body = vehicles.map(vn => {
        const wbr = wb.filter(w=>(w.vehicle?.vehicle_number||w.truck_number||'—')===vn)
        const fr  = fuel.filter(f=>(f.vehicle?.vehicle_number||'—')===vn)
        const mr  = maint.filter(m=>(m.vehicle?.vehicle_number||'—')===vn)
        const trips = wbr.length
        const blocks = wbr.reduce((s,w)=>s+(w.quantity_received||0),0)
        const fl  = fr.reduce((s,f)=>s+Number(f.litres||0),0)
        const fc  = fr.reduce((s,f)=>s+Number(f.total_cost||0),0)
        const mc  = mr.reduce((s,m)=>s+Number(m.cost||0),0)
        const ct  = trips>0?(fc+mc)/trips:0
        return [vn, trips, blocks, fl.toFixed(1), naira(fc), naira(mc), naira(ct)]
      })
      pdfTable(doc, startY, head, body)
      break
    }
    case 'maintenance_cost': {
      const head = ['Date', 'Vehicle', 'Type', 'Description', 'Vendor', 'Cost (₦)']
      const body = data.map(m => [fmtDate(m.maintenance_date), m.vehicle?.vehicle_number||'—', m.maintenance_type||'—', m.description||'—', m.vendor||'—', naira(m.cost)])
      const total = data.reduce((s,m)=>s+Number(m.cost||0),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','','',naira(total)])
      break
    }
    case 'fuel_consumption': {
      const head = ['Date', 'Vehicle', 'Litres', 'Cost/Litre (₦)', 'Total Cost (₦)', 'Odometer (km)']
      const body = data.map(f => [fmtDate(f.date), f.vehicle?.vehicle_number||'—', f.litres, naira(f.cost_per_litre), naira(f.total_cost), f.odometer_reading||'—'])
      const total = data.reduce((s,f)=>s+Number(f.total_cost||0),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','',naira(total),''])
      break
    }
    case 'expense_report': {
      const head = ['Date', 'Category', 'Cost Center', 'Description', 'Paid To', 'Amount (₦)']
      const body = data.map(e => [fmtDate(e.expense_date), e.category?.name||'—', e.category?.cost_center||'—', e.description||'—', e.paid_to||'—', naira(e.amount)])
      const total = data.reduce((s,e)=>s+Number(e.amount||0),0)
      pdfTable(doc, startY, head, body, ['TOTAL','','','','',naira(total)])
      break
    }
    case 'pl_report': {
      const S = buildPLStatement(data)
      const stmtRows = plStatementRows(S)
      const kinds = stmtRows.map(r => r.kind)
      autoTable(doc, {
        startY,
        head: [['', 'Amount (₦)']],
        body: stmtRows.map(r => [r.label, r.amount]),
        styles: { fontSize: 10, cellPadding: 1.4 },
        headStyles: { fillColor: [30,40,70], textColor: 255 },
        columnStyles: { 1: { halign: 'right', cellWidth: 48 } },
        didParseCell: d => {
          const k = kinds[d.row.index]
          if (['header','total','grossprofit','netprofit','memohead'].includes(k)) d.cell.styles.fontStyle = 'bold'
          if (k === 'header') d.cell.styles.fillColor = [235,238,245]
          if (k === 'grossprofit') d.cell.styles.fillColor = [225,230,245]
          if (k === 'netprofit') d.cell.styles.fillColor = S.netProfit >= 0 ? [200,240,210] : [255,200,200]
          if (k === 'memohead') { d.cell.styles.textColor = [110,110,120]; d.cell.styles.fillColor = [245,245,245] }
          if (k === 'memo') d.cell.styles.textColor = [90,90,100]
          if (k === 'memonote') { d.cell.styles.fontStyle = 'italic'; d.cell.styles.fontSize = 8; d.cell.styles.textColor = [140,140,150] }
          if (k === 'warn') { d.cell.styles.textColor = [200,120,0]; d.cell.styles.fontSize = 9 }
        },
        margin: { left: 14, right: 14 },
      })
      break
    }
    case 'cash_flow': {
      const { rows, net } = buildCashFlowRows(data)
      statementTable(doc, startY, rows, k => k === 'net' ? (net >= 0 ? [200,240,210] : [255,200,200]) : null)
      break
    }
    case 'bank_recon': {
      const head = ['Account', 'Bank', 'Statement Date', 'Statement Bal (₦)', 'Book Bal (₦)', 'Difference (₦)']
      const body = data.map(r => [r.account?.account_name||'—', r.account?.bank_name||'—', fmtDate(r.statement_date), naira(r.statement_balance), naira(r.book_balance), naira(Number(r.statement_balance||0)-Number(r.book_balance||0))])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'supplier_statement': {
      const head = ['Supplier', 'Total Purchased (₦)', 'Total Paid (₦)', 'Balance (₦)', 'Current', '31-60d', '61-90d', '90+d']
      const body = supplierStatementRows(data).map(r =>
        [r.name, naira(r.purchased), naira(r.paid), naira(r.balance), naira(r.current), naira(r.d31), naira(r.d61), naira(r.d90)])
      pdfTable(doc, startY, head, body)
      break
    }
    case 'balance_sheet': {
      const { rows, balanceCheck } = buildBalanceSheet(data)
      statementTable(doc, startY, rows, k => k === 'balancecheck' && balanceCheck !== 0 ? [255,200,200] : null)
      break
    }
    default: {
      doc.setFontSize(11); doc.setTextColor(100,100,120)
      doc.text('No data available for this report.', 14, startY + 10)
    }
  }
  pdfFooter(doc)
  return doc
}

// ── EXCEL RENDERERS ──────────────────────────────────────────
function renderExcel(reportId, data, params, period) {
  const report = CATALOG.find(r => r.id === reportId)
  const filename = `${report.name.replace(/\s+/g,'-')}-${today()}.xlsx`

  switch (reportId) {
    case 'daily_production':
    case 'weekly_production':
    case 'monthly_production': {
      const rows = Array.isArray(data) ? data : data.rows || []
      excelExport(filename, report.name, period,
        ['Date','Block Type','Qty Produced','Cement Bags','Granite kg','Diesel L','Recorded By'],
        rows.map(r=>[r.date, r.block_type, r.quantity_produced, r.cement_bags||0, r.granite_dust_kg||0, r.diesel_litres||0, r.recorder?.full_name||'—']),
        ['TOTAL','',rows.reduce((s,r)=>s+r.quantity_produced,0),rows.reduce((s,r)=>s+Number(r.cement_bags||0),0).toFixed(1),'','',''])
      break
    }
    case 'damage_waste':
      excelExport(filename, report.name, period, ['Date','Block Type','Stage','Qty Damaged','Notes'],
        data.map(d=>[d.date,d.block_type,d.stage,d.quantity_damaged,d.notes||'']),
        ['TOTAL','','',data.reduce((s,d)=>s+d.quantity_damaged,0),''])
      break
    case 'sales_report':
      excelExport(filename, report.name, period, ['Date','Customer','Location','Marketer','Value (₦)','Status'],
        data.map(o=>[fmtDate(o.created_at),o.customer?.name||'—',o.customer?.location||'—',o.marketer?.full_name||'—',(o.items||[]).reduce((s,i)=>s+Number(i.subtotal||0),0),o.status]))
      break
    case 'revenue_report':
      excelExport(filename, report.name, period, ['Date','Customer','Invoice No','Amount Paid (₦)'],
        data.map(p=>[fmtDate(p.payment_date),p.invoice?.order?.customer?.name||'—',p.invoice?.invoice_number||'—',Number(p.amount_paid)]),
        ['TOTAL','','',data.reduce((s,p)=>s+Number(p.amount_paid),0)])
      break
    case 'expense_report':
      excelExport(filename, report.name, period, ['Date','Category','Cost Center','Description','Paid To','Amount (₦)'],
        data.map(e=>[fmtDate(e.expense_date),e.category?.name||'—',e.category?.cost_center||'—',e.description||'—',e.paid_to||'—',Number(e.amount||0)]),
        ['TOTAL','','','','',data.reduce((s,e)=>s+Number(e.amount||0),0)])
      break
    case 'staff_directory':
      excelExport(filename, report.name, period, ['Name','Role','Type','Phone','Date Hired'],
        data.map(s=>[s.full_name,s.role,s.staff_type,s.phone||'—',fmtDate(s.date_hired)]))
      break
    case 'stock_status':
      excelExport(filename, report.name, period, ['Item','Unit','Current Stock','Reorder Level','Unit Cost (₦)','Total Value (₦)'],
        data.map(i=>[i.name,i.unit||'—',i.current_stock,i.reorder_level||0,Number(i.unit_cost||0),Number(i.current_stock)*Number(i.unit_cost||0)]))
      break
    case 'maintenance_cost':
      excelExport(filename, report.name, period, ['Date','Vehicle','Type','Description','Vendor','Cost (₦)'],
        data.map(m=>[fmtDate(m.maintenance_date),m.vehicle?.vehicle_number||'—',m.maintenance_type||'—',m.description||'—',m.vendor||'—',Number(m.cost||0)]),
        ['TOTAL','','','','',data.reduce((s,m)=>s+Number(m.cost||0),0)])
      break
    case 'fuel_consumption':
      excelExport(filename, report.name, period, ['Date','Vehicle','Litres','Cost/Litre (₦)','Total Cost (₦)'],
        data.map(f=>[fmtDate(f.date),f.vehicle?.vehicle_number||'—',Number(f.litres||0),Number(f.cost_per_litre||0),Number(f.total_cost||0)]),
        ['TOTAL','','','',data.reduce((s,f)=>s+Number(f.total_cost||0),0)])
      break
    case 'pl_report': {
      const S = buildPLStatement(data)
      excelExport(filename, report.name, period, ['', 'Amount (₦)'],
        plStatementRows(S).map(r => [r.label, r.amount]))
      break
    }
    case 'supplier_statement':
      excelExport(filename, report.name, period,
        ['Supplier','Total Purchased (₦)','Total Paid (₦)','Balance (₦)','Current','31-60d','61-90d','90+d'],
        supplierStatementRows(data).map(r => [r.name, r.purchased, r.paid, r.balance, r.current, r.d31, r.d61, r.d90]))
      break
    case 'cash_flow':
      excelExport(filename, report.name, period, ['', 'Amount (₦)'],
        buildCashFlowRows(data).rows.map(r => [r.label, r.amount]))
      break
    case 'balance_sheet':
      excelExport(filename, report.name, period, ['', 'Amount (₦)'],
        buildBalanceSheet(data).rows.map(r => [r.label, r.amount]))
      break
    default:
      excelExport(filename, report.name, period, ['No Data'], [['This report does not support Excel export yet.']])
  }
}

// ── PERIOD HELPERS ───────────────────────────────────────────
function periodLabel(report, params) {
  if (report.periodType === 'date')  return `Date: ${params.date || today()}`
  if (report.periodType === 'today' || report.periodType === 'asAt') return `As at: ${params.date || today()}`
  if (report.periodType === 'week')  return `Week: ${params.from} → ${params.to}`
  if (report.periodType === 'month') return `Month: ${params.from} → ${params.to}`
  return `Period: ${params.from || '—'} → ${params.to || '—'}`
}

function weekBounds(w) {
  // w = '2025-W22'
  const [year, week] = w.split('-W').map(Number)
  const jan1 = new Date(year, 0, 1)
  const doy = (week - 1) * 7 - jan1.getDay() + 1
  const mon = new Date(year, 0, 1 + doy)
  const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
  return [mon.toISOString().split('T')[0], sun.toISOString().split('T')[0]]
}
function monthBounds(m) {
  // m = '2025-05'
  const [year, month] = m.split('-').map(Number)
  const from = `${year}-${String(month).padStart(2,'0')}-01`
  const last = new Date(year, month, 0).getDate()
  const to   = `${year}-${String(month).padStart(2,'0')}-${last}`
  return [from, to]
}

// ── HISTORY HELPERS ──────────────────────────────────────────
const HISTORY_KEY = 'apc_report_history'
async function saveHistory(reportName, period, generatedBy, userId, format, reportId) {
  // 1. Keep local cache (fast / offline)
  const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  arr.unshift({ name: reportName, period, generatedBy, generatedAt: new Date().toISOString(), format: format || 'pdf' })
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 50)))
  // 2. Also persist to DB (non-critical — swallow errors)
  try {
    const cat = CATALOG.find(r => r.id === reportId)?.category || null
    await supabase.from('report_history').insert({
      report_id: reportId || null,
      report_name: reportName,
      report_category: cat,
      period,
      generated_by: userId || null,
      generated_by_name: generatedBy,
      format: format || 'pdf',
      generated_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }
}
function getHistory() {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
}

// ── SCHEDULE HELPERS ─────────────────────────────────────────
const SCHEDULE_KEY = 'apc_report_schedules'
function saveSchedule(schedule) {
  const arr = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '[]')
  const idx = arr.findIndex(s => s.reportId === schedule.reportId)
  if (idx >= 0) arr[idx] = schedule; else arr.push(schedule)
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(arr))
}
function getSchedules() {
  return JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '[]')
}

// ── GENERATE MODAL ───────────────────────────────────────────
function GenerateModal({ report, userProfile, onClose, onGenerated }) {
  const [params, setParams]   = useState({ date: today(), from: today().slice(0,8)+'01', to: today(), week: '', month: today().slice(0,7), customer_id: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [customers, setCustomers] = useState([])

  useEffect(() => {
    if (report.extraFilters?.some(f => f.type === 'customer')) {
      fetchCustomers().then(setCustomers).catch(() => {})
    }
  }, [report])

  const buildParams = () => {
    if (report.periodType === 'week') {
      const [from, to] = params.week ? weekBounds(params.week) : [params.from, params.to]
      return { ...params, from, to }
    }
    if (report.periodType === 'month') {
      const [from, to] = params.month ? monthBounds(params.month) : [params.from, params.to]
      return { ...params, from, to }
    }
    if (report.periodType === 'date' || report.periodType === 'today' || report.periodType === 'asAt') {
      return { ...params }
    }
    return params
  }

  const handleGenerate = async (format) => {
    setLoading(true); setError('')
    try {
      const p = buildParams()
      const data = await GENERATORS[report.id](p)
      const period = periodLabel(report, p)
      if (format === 'pdf') {
        const doc = renderPDF(report.id, data, p, period)
        const url = doc.output('bloburl')
        window.open(url, '_blank')
      } else {
        renderExcel(report.id, data, p, period)
      }
      await saveHistory(report.name, period, userProfile?.full_name || 'Unknown', userProfile?.id, format, report.id)
      onGenerated()
      onClose()
    } catch(e) {
      setError(e.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  const lbl = { display:'block', fontSize:'11px', color:theme.textMuted, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.06em' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ background:theme.surface, borderRadius:'14px', padding:'28px', width:'100%', maxWidth:'480px', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' }}>
          <div>
            <div style={{ fontWeight:'700', fontSize:'15px', marginBottom:'4px' }}>{report.name}</div>
            <div style={{ fontSize:'12px', color:theme.textMuted }}>{report.description}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:theme.textMuted, fontSize:'18px', cursor:'pointer', padding:'0 4px' }}>✕</button>
        </div>

        {error && <div style={{ background:theme.red+'18', border:`1px solid ${theme.red}44`, borderRadius:'8px', padding:'10px 14px', marginBottom:'14px', fontSize:'12px', color:theme.red }}>{error}</div>}

        <div style={{ display:'grid', gap:'12px', marginBottom:'20px' }}>
          {(report.periodType === 'date' || report.periodType === 'today' || report.periodType === 'asAt') && (
            <div>
              <label style={lbl}>{report.periodType === 'asAt' ? 'As At Date' : 'Date'}</label>
              <input type="date" style={styles.input} value={params.date} onChange={e=>setParams(p=>({...p,date:e.target.value}))} />
            </div>
          )}
          {report.periodType === 'week' && (
            <div>
              <label style={lbl}>Week</label>
              <input type="week" style={styles.input} value={params.week} onChange={e=>setParams(p=>({...p,week:e.target.value}))} />
            </div>
          )}
          {report.periodType === 'month' && (
            <div>
              <label style={lbl}>Month</label>
              <input type="month" style={styles.input} value={params.month} onChange={e=>setParams(p=>({...p,month:e.target.value}))} />
            </div>
          )}
          {report.periodType === 'range' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div><label style={lbl}>From</label><input type="date" style={styles.input} value={params.from} onChange={e=>setParams(p=>({...p,from:e.target.value}))} /></div>
              <div><label style={lbl}>To</label><input type="date" style={styles.input} value={params.to} onChange={e=>setParams(p=>({...p,to:e.target.value}))} /></div>
            </div>
          )}
          {report.extraFilters?.map(f => f.type === 'customer' && (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <select style={styles.input} value={params[f.key]||''} onChange={e=>setParams(p=>({...p,[f.key]:e.target.value}))}>
                <option value="">— All Customers —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          <button data-board-allow data-ico-allow style={styles.btn('primary')} onClick={()=>handleGenerate('pdf')} disabled={loading}>
            {loading ? 'Generating…' : '⬇ Generate PDF'}
          </button>
          {report.formats.includes('excel') && (
            <button data-board-allow data-ico-allow style={styles.btn('secondary')} onClick={()=>handleGenerate('excel')} disabled={loading}>
              ⬇ Generate Excel
            </button>
          )}
          <button style={styles.btn('secondary')} onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── SCHEDULE MODAL ───────────────────────────────────────────
function ScheduleModal({ report, onClose }) {
  const existing = getSchedules().find(s => s.reportId === report.id) || {}
  const [freq, setFreq]   = useState(existing.frequency || 'weekly')
  const [emails, setEmails] = useState(existing.emails || '')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    saveSchedule({ reportId: report.id, reportName: report.name, frequency: freq, emails, createdAt: new Date().toISOString() })
    setSaved(true)
    setTimeout(onClose, 1200)
  }

  const lbl = { display:'block', fontSize:'11px', color:theme.textMuted, marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.06em' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ background:theme.surface, borderRadius:'14px', padding:'28px', width:'100%', maxWidth:'400px', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ fontWeight:'700', fontSize:'15px', marginBottom:'4px' }}>Schedule Report</div>
        <div style={{ fontSize:'12px', color:theme.textMuted, marginBottom:'20px' }}>{report.name}</div>
        {saved && <div style={{ color:theme.green, marginBottom:'12px', fontSize:'13px' }}>✓ Schedule saved!</div>}
        <div style={{ display:'grid', gap:'12px', marginBottom:'20px' }}>
          <div>
            <label style={lbl}>Frequency</label>
            <select style={styles.input} value={freq} onChange={e=>setFreq(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Recipients (one email per line)</label>
            <textarea style={{ ...styles.input, height:'80px', resize:'vertical' }} value={emails} onChange={e=>setEmails(e.target.value)} placeholder="user@example.com" />
          </div>
          <div style={{ fontSize:'11px', color:theme.textMuted, padding:'8px 10px', background:theme.accent+'11', borderRadius:'6px' }}>
            A "Due" badge will appear on this report card when it is time to generate the next scheduled report.
          </div>
        </div>
        <div style={{ display:'flex', gap:'10px' }}>
          <button style={styles.btn('primary')} onClick={handleSave}>Save Schedule</button>
          <button style={styles.btn('secondary')} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── REPORT CARD ──────────────────────────────────────────────
const ROLE_LABELS = { md:'MD', accountant:'Accountant', board_member:'Board', bdm:'BDM', ico:'ICO', store_officer:'Store', logistics_manager:'Logistics', marketer:'Marketer', driver:'Driver', hr_officer:'HR', production_manager:'Production', assistant_production_manager:'Asst. Production' }

function ReportCard({ report, userRole, effectiveRoles = [], schedule, onGenerate, onSchedule }) {
  const hasAccess = report.roles.some(r => effectiveRoles.includes(r))
  const catColor  = CAT_COLOR[report.category] || theme.accent
  const isDue = schedule && (() => {
    if (!schedule.frequency) return false
    const last = getHistory().find(h=>h.name===report.name)
    if (!last) return true
    const lastDate = new Date(last.generatedAt)
    const now = new Date()
    const diff = (now - lastDate) / (1000*60*60*24)
    return (schedule.frequency==='daily'&&diff>=1)||(schedule.frequency==='weekly'&&diff>=7)||(schedule.frequency==='monthly'&&diff>=28)
  })()

  return (
    <div style={{ ...styles.card, borderLeft:`3px solid ${catColor}`, position:'relative', display:'flex', flexDirection:'column', gap:'10px' }}>
      {isDue && (
        <span style={{ position:'absolute', top:'12px', right:'12px', background:theme.orange, color:'#fff', fontSize:'10px', fontWeight:'700', borderRadius:'10px', padding:'2px 8px' }}>DUE</span>
      )}
      <div>
        <div style={{ fontWeight:'700', fontSize:'13px', marginBottom:'4px', paddingRight: isDue?'50px':'0' }}>{report.name}</div>
        <div style={{ fontSize:'11px', color:theme.textMuted, lineHeight:'1.5' }}>{report.description}</div>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
        {report.roles.map(r => (
          <span key={r} style={{ fontSize:'10px', padding:'1px 6px', borderRadius:'4px', fontWeight:'600', background: r===userRole?catColor+'33':theme.border+'44', color: r===userRole?catColor:theme.textMuted }}>
            {ROLE_LABELS[r]||r}
          </span>
        ))}
      </div>
      <div style={{ display:'flex', gap:'6px' }}>
        {report.formats.map(f => (
          <span key={f} style={{ fontSize:'10px', padding:'1px 6px', borderRadius:'4px', background: f==='pdf'?theme.red+'22':theme.green+'22', color: f==='pdf'?theme.red:theme.green, fontWeight:'600', textTransform:'uppercase' }}>{f}</span>
        ))}
      </div>
      <div style={{ marginTop:'auto', display:'flex', gap:'8px', alignItems:'center' }}>
        {hasAccess ? (
          <>
            <button data-board-allow data-ico-allow style={{ ...styles.btn('primary'), padding:'6px 14px', fontSize:'12px' }} onClick={onGenerate}>Generate</button>
            <button style={{ ...styles.btn('secondary'), padding:'6px 10px', fontSize:'11px' }} onClick={onSchedule}>Schedule</button>
          </>
        ) : (
          <span style={{ fontSize:'12px', color:theme.textMuted }}>🔒 No access for your role</span>
        )}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function Reports({ userProfile }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [generateModal, setGenerateModal]   = useState(null)
  const [scheduleModal, setScheduleModal]   = useState(null)
  const [search, setSearch]                 = useState('')
  const [showHistory, setShowHistory]       = useState(false)
  const [history, setHistory]               = useState(getHistory())
  const [schedules, setSchedules]           = useState(getSchedules())

  const userRole = userProfile?.role || 'staff'
  // A report is runnable if ANY of the user's effective roles (primary + active
  // grants) is on its access list — so a granted role can run the reports that
  // role is entitled to. userRole is kept only for the "your role" chip display.
  const effectiveRoles = effectiveRolesOf(userProfile)

  const refreshHistory  = useCallback(() => { setHistory(getHistory()); setSchedules(getSchedules()) }, [])

  const filtered = CATALOG.filter(r => {
    const matchCat = activeCategory === 'all' || r.category === activeCategory
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const countForCat = (cat) => CATALOG.filter(r => cat === 'all' || r.category === cat).length

  return (
    <div>
      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:'800', color:theme.text, marginBottom:'4px' }}>Reports</div>
          <div style={{ fontSize:'13px', color:theme.textMuted }}>{CATALOG.length} reports across {CATEGORIES.length - 1} categories</div>
        </div>
        <input style={{ ...styles.input, maxWidth:'280px' }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reports…" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:'20px', alignItems:'start' }}>
        {/* LEFT SIDEBAR */}
        <div style={{ ...styles.card, padding:'12px 0', position:'sticky', top:'20px' }}>
          {CATEGORIES.map(cat => (
            <div key={cat.id} onClick={() => setActiveCategory(cat.id)}
              style={{ padding:'9px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', background: activeCategory===cat.id ? theme.accent+'18' : 'transparent', borderLeft: activeCategory===cat.id ? `3px solid ${theme.accent}` : '3px solid transparent', fontSize:'13px', color: activeCategory===cat.id ? theme.accent : theme.text, fontWeight: activeCategory===cat.id ? '700' : '400', transition:'all 0.15s' }}>
              <span>{cat.label}</span>
              <span style={{ fontSize:'11px', color:theme.textMuted, background:theme.border+'44', borderRadius:'10px', padding:'1px 7px' }}>{countForCat(cat.id)}</span>
            </div>
          ))}
        </div>

        {/* REPORT CARDS */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ ...styles.card, textAlign:'center', padding:'40px', color:theme.textMuted }}>No reports match your search.</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'14px', marginBottom:'20px' }}>
              {filtered.map(r => (
                <ReportCard
                  key={r.id}
                  report={r}
                  userRole={userRole}
                  effectiveRoles={effectiveRoles}
                  schedule={schedules.find(s=>s.reportId===r.id)}
                  onGenerate={() => setGenerateModal(r)}
                  onSchedule={() => setScheduleModal(r)}
                />
              ))}
            </div>
          )}

          {/* HISTORY */}
          <div style={styles.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', userSelect:'none' }} onClick={() => setShowHistory(s=>!s)}>
              <div style={{ fontWeight:'700', fontSize:'13px' }}>Report History</div>
              <span style={{ fontSize:'12px', color:theme.textMuted }}>{showHistory ? '▲ Hide' : '▼ Show'} ({history.length})</span>
            </div>
            {showHistory && (
              <div style={{ marginTop:'14px', overflowX:'auto' }}>
                {history.length === 0 ? (
                  <div style={{ color:theme.textMuted, fontSize:'13px' }}>No reports generated yet.</div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                    <thead>
                      <tr style={{ borderBottom:`1px solid ${theme.border}` }}>
                        {['Report Name','Period','Generated By','Generated At'].map(h =>
                          <th key={h} style={{ padding:'6px 10px', textAlign:'left', color:theme.textMuted, fontWeight:'700', fontSize:'11px' }}>{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h,i) => (
                        <tr key={i} style={{ borderBottom:`1px solid ${theme.border}22` }}>
                          <td style={{ padding:'6px 10px' }}>{h.name}</td>
                          <td style={{ padding:'6px 10px', color:theme.textMuted }}>{h.period}</td>
                          <td style={{ padding:'6px 10px', color:theme.textMuted }}>{h.generatedBy}</td>
                          <td style={{ padding:'6px 10px', color:theme.textMuted }}>{fmtDate(h.generatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS */}
      {generateModal && (
        <GenerateModal
          report={generateModal}
          userProfile={userProfile}
          onClose={() => setGenerateModal(null)}
          onGenerated={refreshHistory}
        />
      )}
      {scheduleModal && (
        <ScheduleModal
          report={scheduleModal}
          onClose={() => { setScheduleModal(null); refreshHistory() }}
        />
      )}
    </div>
  )
}
