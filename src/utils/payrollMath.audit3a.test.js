import { describe, it, expect } from 'vitest'
import { aggregateRosterWorkers, rosterNet, payrollSources, selectedPayrollRows, salaryLine, salaryForDays, calendarDays, unpaidLeaveDays, capAdvanceDeduction } from './payrollMath'

describe('Audit 3A payroll amounts and ownership', () => {
  it('2: half-day work contributes net_pay after deductions instead of total_pay', () => {
    const [worker] = aggregateRosterWorkers([{ entries: [{ labour_id: 'test', total_pay: 5000, base_rate: 5000, attendance_type: 'half_day', deduction_amount: 500, net_pay: 2000 }] }])
    expect(worker).toMatchObject({ days: 0.5, gross_pay: 2500, deductions: 500, net_pay: 2000 })
  })
  it('2: zero net is retained and only null/undefined net falls back to total_pay', () => {
    expect(rosterNet({ net_pay: 0, total_pay: 5000 })).toBe(0)
    expect(rosterNet({ net_pay: null, total_pay: 5000 })).toBe(5000)
    expect(rosterNet({ total_pay: 100 })).toBe(100)
  })
  it.each(['ico_approved','md_approved','paid'])('3: %s schedule contains only its linked work', status => {
    const p = { id: 'p', status }
    const rows = [{ id: 'own', payroll_id: 'p' }, { id: 'free', payroll_id: null }, { id: 'other', payroll_id: 'q' }]
    expect(payrollSources(rows, p).map(r => r.id)).toEqual(['own'])
    expect(selectedPayrollRows(rows, p).map(r => r.id)).toEqual(['own'])
  })
  it('4: drafts offer only unpaid unassigned or already-owned work', () => {
    const rows = [{ id: 'free', payroll_id: null, payment_status: 'unpaid' }, { id: 'paid', payroll_id: null, payment_status: 'paid' }, { id: 'other', payroll_id: 'q' }, { id: 'own', payroll_id: 'p' }]
    expect(payrollSources(rows, { id: 'p', status: 'draft' }).map(r => r.id)).toEqual(['free','own'])
    expect(selectedPayrollRows(rows, null).map(r => r.id)).toEqual(['free'])
  })
})
describe('Audit 3A calendar salary and advances', () => {
  it.each([[2026,28],[2024,29]])('8b: Jan 25-Feb 5 in %s uses each day\'s month length', (year, febDays) => {
    const staff = { id: 's', staff_type: 'permanent', monthly_salary: 31000 }
    const line = salaryLine(staff, 0, `${year}-01-25`, `${year}-02-05`, [{ start_date: `${year}-01-31`, end_date: `${year}-02-02` }])
    expect(line.amount_due).toBe(Math.round(7 * 31000 / 31 + 5 * 31000 / febDays))
    expect(line.leave_deduction).toBe(Math.round(31000 / 31 + 2 * 31000 / febDays))
  })
  it('11: overlapping approved unpaid leave days are charged once and clipped to the period', () => {
    const rows = [{ start_date: '2026-01-01', end_date: '2026-01-04' }, { start_date: '2026-01-03', end_date: '2026-01-08' }]
    expect(unpaidLeaveDays(rows, '2026-01-02', '2026-01-06')).toHaveLength(5)
    expect(salaryLine({ id: 's', monthly_salary: 31000, staff_type: 'permanent' }, 0, '2026-01-02', '2026-01-06', rows).leave_deduction).toBe(5000)
  })
  it('8b: a full year of monthly salary equals twelve months with rounding only at the end', () => {
    expect(salaryForDays(31000, calendarDays('2024-01-01','2024-12-31'))).toBeCloseTo(372000)
  })
  it('10: a sole disbursed advance is named and capped to its outstanding balance', () => {
    const line = salaryLine({ id: 's', monthly_salary: 31000 }, 0, '2026-01-01', '2026-01-31', [], [{ id: 'a', outstanding_balance: 800, installment_amount: 5000 }])
    expect(line).toMatchObject({ salary_advance_id: 'a', advance_deduction: 800, deductions: 800 })
    expect(line.advance_cap_note).toMatch(/Capped at 800/)
  })
  it('10: multiple advances require an explicit choice and never exceed available pay', () => {
    const a = [{ id: 'a1', outstanding_balance: 1000 }, { id: 'a2', outstanding_balance: 5000 }]
    const line = salaryLine({ id: 's', daily_rate: 100, staff_type: 'daily' }, 10, '2026-01-01', '2026-01-31', [], a)
    expect(line).toMatchObject({ salary_advance_id: null, advance_deduction: 0 })
    expect(capAdvanceDeduction(line, a[1], 9999)).toMatchObject({ salary_advance_id: 'a2', advance_deduction: 1000 })
  })
})
