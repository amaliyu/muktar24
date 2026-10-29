import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const svc = vi.hoisted(() => ({ range: vi.fn(), save: vi.fn(), monthly: vi.fn(), createMonthly: vi.fn(), calls: null, rpcError: null, sheets: [], pdfTables: [] }))
vi.mock('../lib/supabase', async () => {
  const { createSupabaseMock } = await import('../test/supabaseMock')
  const mock = createSupabaseMock(table => table.startsWith('rpc:') ? { data: { id: 'payroll', status: 'paid' }, error: svc.rpcError } : { data: [], error: null })
  svc.calls = mock.calls
  return { supabase: mock.supabase }
})
vi.mock('../services/weeklyPayroll', async importOriginal => {
  const actual = await importOriginal()
  return { weeklyPayrollService: { ...actual.weeklyPayrollService, loadRange: svc.range, saveDraft: svc.save, loadMonthly: svc.monthly, createMonthly: svc.createMonthly } }
})
vi.mock('xlsx', () => ({ utils: { json_to_sheet: rows => { svc.sheets.push(rows); return {} }, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: vi.fn() }))
vi.mock('jspdf', () => ({ default: class { setFontSize() {} setFont() {} text() {} save() {} lastAutoTable = { finalY: 90 } } }))
vi.mock('jspdf-autotable', () => ({ default: (_, options) => svc.pdfTables.push(options) }))
import { WeeklyPayrollTab, MonthlyFixedTab, generatePayrollPDF, generatePaymentScheduleXLSX, generateBulkTransferXLSX } from './Labour'
const own = { id: 'own', roster_date: '2026-10-20', site: { name: 'TEST site' }, payroll_id: 'p', entries: [{ labour_id: 'w', total_pay: 5000, net_pay: 2000, deduction_amount: 500, attendance_type: 'half_day' }] }
const free = { id: 'free', roster_date: '2026-10-21', payroll_id: null, payment_status: 'unpaid', entries: [{ labour_id: 'other', total_pay: 9999, net_pay: 9999 }] }
const pool = [{ id: 'w', full_name: 'TEST worker' }, { id: 'other', full_name: 'TEST unassigned worker' }]
const data = status => ({ rosters: [own, free], loads: [], payrolls: [{ id: 'p', payroll_type: 'production', status }], production: { id: 'p', payroll_type: 'production', status }, loading: null })
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks(); svc.calls.length = 0; svc.sheets.length = 0; svc.pdfTables.length = 0; svc.rpcError = null
  svc.range.mockResolvedValue(data('md_approved'))
  svc.monthly.mockResolvedValue([])
  svc.createMonthly.mockResolvedValue({ payroll: { id: 'monthly' }, existing: false })
})
it('1/2/3: approved weekly payroll shows only its own workers, Gross/Deductions/Net, no checkboxes or expense insert', async () => {
  render(<WeeklyPayrollTab pool={pool} roles={[]} userProfile={{ role: 'accountant' }} />)
  await screen.findByText('TEST worker')
  expect(screen.queryByText('TEST unassigned worker')).toBeNull()
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  expect(screen.getByRole('columnheader', { name: 'Gross', exact: true })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Deductions/advances' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Net', exact: true })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Mark as Paid' }))
  await screen.findByText('Updated.')
  expect(svc.calls.filter(c => c.rpc)).toEqual([{ rpc: 'advance_weekly_payroll', args: { p_payroll_id: 'p', p_action: 'mark_paid', p_reason: null } }])
  expect(svc.calls.some(c => c.table === 'expenses')).toBe(false)
})
it('1: refused payroll transition displays the database message', async () => {
  svc.rpcError = { message: 'TEST second approver required' }
  render(<WeeklyPayrollTab pool={pool} roles={[]} userProfile={{ role: 'accountant' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Mark as Paid' }))
  expect(await screen.findByText('TEST second approver required')).toBeInTheDocument()
  expect(screen.queryByText('Updated.')).toBeNull()
})
it('2: payroll PDF, payment schedule and bank transfer exports use net pay', () => {
  const workers = [{ id: 'w', name: 'TEST worker', gross_pay: 2500, deductions: 500, net_pay: 2000, total_pay: 5000 }]
  generatePayrollPDF('production','TEST',workers,2000,{})
  expect(svc.pdfTables[0].head[0]).toEqual(expect.arrayContaining(['Gross','Deductions/advances','Net']))
  expect(svc.pdfTables[0].body[0][7]).toBe('₦2,000')
  generatePaymentScheduleXLSX('production','TEST',workers,[])
  expect(svc.sheets[0][0]).toMatchObject({ Gross: 2500, 'Deductions/advances': 500, Net: 2000, Amount: 2000 })
  generateBulkTransferXLSX('TEST',workers,[])
  expect(svc.sheets[1][0].Amount).toBe(2000)
})
it('4: draft work list excludes paid unassigned records and shows the duplicate-generation result', async () => {
  svc.range.mockResolvedValue({ ...data('draft'), payrolls: [], production: null, rosters: [{ ...own, payroll_id: null }, { ...free, payment_status: 'paid' }] })
  svc.save.mockResolvedValue({ payroll: { id: 'existing', status: 'draft' }, existing: true })
  render(<WeeklyPayrollTab pool={pool} roles={[]} userProfile={{ role: 'production_manager' }} />)
  await screen.findByText('TEST worker')
  expect(screen.queryByText('TEST unassigned worker')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Generate Payroll' }))
  expect(await screen.findByText(/An existing draft payroll was loaded/)).toBeInTheDocument()
  expect(svc.save.mock.calls[0][0]).toMatchObject({ ids: ['own'], total: 2000 })
})
it('4: refused draft linking shows the error with no success message', async () => {
  svc.range.mockResolvedValue(data('draft'))
  svc.save.mockRejectedValue(new Error('TEST link refused'))
  render(<WeeklyPayrollTab pool={pool} roles={[]} userProfile={{ role: 'production_manager' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Update Draft' }))
  expect(await screen.findByText('TEST link refused')).toBeInTheDocument()
  expect(screen.queryByText('Draft payroll and schedule saved.')).toBeNull()
})
it('7: monthly fixed query error is visible', async () => {
  svc.monthly.mockRejectedValue(new Error('TEST month could not load'))
  render(<MonthlyFixedTab pool={[]} roles={[]} userProfile={{ role: 'md' }} />)
  expect(await screen.findByText('TEST month could not load')).toBeInTheDocument()
})
it('7: monthly generation explains that a duplicate was loaded', async () => {
  svc.createMonthly.mockResolvedValue({ payroll: { id: 'existing' }, existing: true })
  render(<MonthlyFixedTab pool={[{ id: 'w', full_name: 'TEST fixed worker', category: 'monthly_fixed', usual_role_id: 'role' }]} roles={[{ id: 'role', base_rate: 1000 }]} userProfile={{ role: 'md' }} />)
  await waitFor(() => expect(svc.monthly).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: /Create Payroll for/ }))
  expect(await screen.findByText('An existing payroll for this month was loaded; no new payroll was created.')).toBeInTheDocument()
})
it('4: a partial draft cannot be approved before its schedule and net totals are saved', async () => {
  svc.range.mockResolvedValue(data('draft'))
  render(<WeeklyPayrollTab pool={pool} roles={[]} userProfile={{ role: 'ico' }} />)
  await userEvent.click(await screen.findByRole('button', { name: 'ICO Approve' }))
  expect(await screen.findByText('The draft totals do not match its schedule. Update Draft before approval.')).toBeInTheDocument()
  expect(svc.calls.some(c => c.rpc)).toBe(false)
})
