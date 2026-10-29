import { shiftDate } from './lagosDate'

export const rosterNet = entry => Number(entry.net_pay ?? entry.total_pay ?? 0)
export const availableForDraft = row => row.payroll_id == null && row.payment_status !== 'paid'
export const payrollSources = (rows, payroll) => rows.filter(row => payroll && payroll.status !== 'draft'
  ? row.payroll_id === payroll.id
  : (row.payroll_id === payroll?.id && row.payment_status !== 'paid') || availableForDraft(row))
export const selectedPayrollRows = (rows, payroll) => payroll
  ? rows.filter(r => r.payroll_id === payroll.id && (payroll.status !== 'draft' || r.payment_status !== 'paid'))
  : rows.filter(availableForDraft)

export function aggregateRosterWorkers(rosters, pool = [], roles = []) {
  const map = new Map()
  for (const roster of rosters) for (const e of roster.entries || []) {
    const person = pool.find(w => w.id === e.labour_id)
    const role = roles.find(r => r.id === e.role_id)
    if (!map.has(e.labour_id)) map.set(e.labour_id, {
      id: e.labour_id, name: person?.full_name || '?', role: role?.role_name || '?',
      days: 0, base_rate: e.base_rate, bonus: 0, gross_pay: 0, deductions: 0, net_pay: 0,
      bank: person?.bank_name || '—', account: person?.bank_account_number || '—',
    })
    const w = map.get(e.labour_id)
    const net = rosterNet(e)
    // net_pay includes the attendance adjustment. Add back only the monetary
    // advances/deductions to show the attendance-adjusted gross.
    const deductions = e.net_pay == null ? 0 : Number(e.advance_amount || 0) + Number(e.deduction_amount || 0)
    w.days += e.attendance_type === 'half_day' ? 0.5 : e.attendance_type === 'absent' ? 0 : 1
    w.bonus += Number(e.bonus_amount ?? (e.bonus_applicable ? e.target_bonus : 0) ?? 0)
    w.gross_pay += net + deductions
    w.deductions += deductions
    w.net_pay += net
  }
  return [...map.values()]
}

export function calendarDays(from, to) {
  if (!from || !to || from > to) return []
  const days = []
  for (let day = from; day <= to; day = shiftDate(day, 1)) days.push(day)
  return days
}
export function salaryForDays(monthlySalary, dates) {
  return dates.reduce((sum, day) => {
    const [year, month] = day.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return sum + Number(monthlySalary || 0) / daysInMonth
  }, 0)
}
export function unpaidLeaveDays(rows, from, to) {
  return [...new Set(rows.flatMap(r => calendarDays(r.start_date > from ? r.start_date : from, r.end_date < to ? r.end_date : to)))].sort()
}
export function capAdvanceDeduction(line, advance, requested) {
  const limit = Math.max(0, Math.min(Number(advance?.outstanding_balance || 0), Number(line.amount_due || 0) - Number(line.leave_deduction || 0)))
  const amount = Math.max(0, Math.min(Number(requested) || 0, limit))
  return { salary_advance_id: advance?.id || null, advance_deduction: amount,
    deductions: Number(line.leave_deduction || 0) + amount,
    advance_cap_note: Number(requested) > limit ? `Capped at ${limit.toLocaleString()} — the advance balance or available salary is lower.` : '',
  }
}
export function salaryLine(staff, daysPresent, from, to, leave = [], advances = []) {
  const amount = staff.staff_type === 'daily'
    ? Number(daysPresent || 0) * Number(staff.daily_rate || 0)
    : salaryForDays(staff.monthly_salary, calendarDays(from, to))
  const amount_due = Math.round(amount)
  const leave_deduction = staff.staff_type === 'daily' ? 0 : Math.min(amount_due, Math.round(salaryForDays(staff.monthly_salary, unpaidLeaveDays(leave, from, to))))
  const line = { staff_id: staff.id, full_name: staff.full_name, role: staff.staffRole?.role_name || staff.role || '—',
    staff_type: staff.staff_type, days_present: daysPresent || 0, daily_rate: staff.daily_rate || 0,
    monthly_salary: staff.monthly_salary || 0, amount_due, leave_deduction }
  const advance = advances.length === 1 ? advances[0] : null
  return { ...line, ...capAdvanceDeduction(line, advance, advance?.installment_amount || 0) }
}
