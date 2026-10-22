// Phase 7B-1 — WhatsApp-ready notice texts for client sites.
// Client-facing text carries QUANTITIES AND DATES ONLY — never a naira amount,
// rate, cost or margin (§11 "Client-facing reports carry quantities only").
// Pure functions: the MD copies the text and decides whether to send it.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD' → '22 Oct 2026'. Plain string maths so the calendar date never
// shifts with the device's time zone.
export const longDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export const qty = (n) => Math.round(Number(n) || 0).toLocaleString('en-NG')

// Calendar-day add on an ISO date, in UTC so the date never shifts.
export const addDaysIso = (iso, days) => {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ~7-day advance notice before a cycle ends (Sequoia Proposal §3), or the
// "advance nearly used" notice for a service-fee contract (Bilaad).
export function buildAdvanceNoticeText({ clientName, siteName, contractModel, cycleNo, qtyTotal, done, remaining, forecastFinish }) {
  const lines = [
    `Abuja Precast Concrete Ltd — advance notice, cycle ${cycleNo}`,
    `To: ${clientName}`,
    `Site: ${siteName}`,
    '',
    `Cycle ${cycleNo}: ${qty(done)} of ${qty(qtyTotal)} blocks done, ${qty(remaining)} remaining.`,
    `At the current output we expect to finish this cycle on or about ${longDate(forecastFinish)}.`,
    '',
  ]
  if (contractModel === 'full_supply') {
    lines.push('To keep production continuous, please send the written production schedule for the next cycle, confirm the agreed rate, and complete mobilisation before this cycle ends.')
  } else {
    lines.push('The prepaid quantity for this cycle is nearly used. Please arrange the next payment so production can continue without a break.')
  }
  lines.push('', 'Thank you.')
  return lines.join('\n')
}

// Written completion notice. For full supply it starts the 7-calendar-day
// remobilisation window (Proposal §3/§6): deadline = notice date + 7.
export function buildCompletionNoticeText({ clientName, siteName, contractModel, cycleNo, qtyTotal, done, completedOn, noticeDate, remobilisationDeadline }) {
  const deadline = remobilisationDeadline || addDaysIso(noticeDate, 7)
  const lines = [
    `Abuja Precast Concrete Ltd — completion notice, cycle ${cycleNo}`,
    `To: ${clientName}`,
    `Site: ${siteName}`,
    '',
    `Cycle ${cycleNo} is complete: ${qty(done ?? qtyTotal)} of ${qty(qtyTotal)} blocks${completedOn ? `, completed ${longDate(completedOn)}` : ''}.`,
    `Date of this notice: ${longDate(noticeDate)}.`,
    '',
  ]
  if (contractModel === 'full_supply') {
    lines.push(
      `Please send the production schedule for the next cycle, agree the rate in writing and complete mobilisation by ${longDate(deadline)} (7 days from this notice).`,
      'If the next cycle is not mobilised by then, APCL may use the site capacity for other customers from the following day, as agreed in the proposal.',
    )
  } else {
    lines.push('Please arrange the next payment so production can resume.')
  }
  lines.push('', 'Thank you.')
  return lines.join('\n')
}

// Rejected client-owned material, notified before use (Contractor Warranty Form).
export function buildRejectionNoticeText({ siteName, receivedOn, qtyRejected, unit, itemName, ref, reason, hasPhoto }) {
  const refPart = ref ? ` (${ref})` : ''
  return `APCL notice of rejected material — ${siteName}, ${longDate(receivedOn)}: ` +
    `${qty(qtyRejected)} ${unit} of ${itemName} delivered${refPart} rejected before use. ` +
    `Reason: ${reason || '—'}.${hasPhoto ? ' Photo on file.' : ''} ` +
    'Per the Contractor Warranty Form, APCL notifies apparent material defects before use.'
}
