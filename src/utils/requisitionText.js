import { lagosToday } from './lateEntry'

export const tomorrowLagos = () => {
  const date = new Date(lagosToday() + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export const MATERIALS = { cement: 'Cement', dust: 'Dust', chippings: '3/8', diesel: 'Diesel', water: 'Water', other: 'Other' }
export const RECEIPT_STATUSES = ['sent', 'client_approved']
export const number = value => Number(value ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })
export const tonnes = value => (Number(value) / 1000).toLocaleString('en-NG', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const quantity = (value, unit) => unit === 'kg' ? tonnes(value) + ' t' : number(value) + ' ' + (unit === 'litres' ? 'L' : unit)
export const blockMix = row => number(row.qty_9in) + ' × 9" + ' + number(row.qty_6in) + ' × 6"'
const dateText = (value, options) => value ? new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', ...options,
}).format(new Date(value.length === 10 ? value + 'T00:00:00Z' : value)).replace(',', '') : '—'

export function requisitionText(req, site, lines) {
  const materials = [...lines].sort((a, b) => Object.keys(MATERIALS).indexOf(a.material) - Object.keys(MATERIALS).indexOf(b.material))
  return [
    'ABUJA PRECAST CONCRETE LTD', 'Material Requisition ' + req.reference, 'Site: ' + site,
    'Blocks: ' + blockMix(req) + ' = ' + number(req.qty_total),
    'Needed by: ' + dateText(req.needed_by, { weekday: 'short', year: 'numeric' }), '',
    ...materials.filter(line => Number(line.qty_requested) > 0).map(line =>
      (MATERIALS[line.material] || line.material) + ': ' + quantity(line.qty_requested, line.unit)),
    '', 'Approved for APCL by ' + req.apcl_approved_by_name + ' on ' + dateText(req.apcl_approved_at, { year: 'numeric' }) + '.',
    'Please confirm approval.',
  ].join('\n')
}

export function reminderText(req, current) {
  const progress = current ? ' ' + current.reference + ' is ' + number(current.pct) + '% produced.' : ''
  return 'Salam. Reminder from APCL: requisition ' + req.reference + ' (' + blockMix(req) +
    '), sent on ' + dateText(req.sent_at) + ', is still awaiting your approval.' + progress +
    ' Please approve so production does not stop. Thank you.'
}

export function actionText(progress) {
  const current = progress?.current
  const next = progress?.next_requisition
  switch (progress?.action) {
    case 'raise_next': return current ? current.reference + ' is ' + number(current.pct) + '% used. Raise the balance requisition now.' : ''
    case 'approve_next': return next ? next.reference + ' is waiting for MD approval' : ''
    case 'send_next': return next ? next.reference + ' is approved — send it to the client' : ''
    case 'remind_client': return next ? 'The client has not approved ' + next.reference + ". Send today's reminder." : ''
    default: return ''
  }
}
