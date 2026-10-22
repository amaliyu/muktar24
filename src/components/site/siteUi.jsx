import { useEffect, useRef, useState } from 'react'
import { getSignedDocUrl } from '../../services/storage'
import { longDate } from '../../utils/siteNotices'

// Shared look for the Phase 7B-1 site pages. Same dark palette as App.jsx so
// the pages sit in the existing app; house rules applied on top: tabular
// numerals, status pills that always carry a word, 4px control radius.
export const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e', textDim: '#4a5175',
}

const num = { fontVariantNumeric: 'tabular-nums' }

export const ui = {
  num,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: '700', color: theme.text },
  subtitle: { fontSize: '13px', color: theme.textMuted, marginTop: '3px' },
  panel: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '16px', marginBottom: '16px' },
  section: { fontSize: '14px', fontWeight: '700', color: theme.text, marginBottom: '12px' },
  micro: { fontSize: '11px', fontWeight: '700', color: theme.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' },
  label: { fontSize: '11px', fontWeight: '700', color: theme.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px', display: 'block' },
  input: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '0 12px', height: '44px', fontSize: '14px', color: theme.text, width: '100%', outline: 'none', boxSizing: 'border-box', ...num },
  textarea: { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '4px', padding: '10px 12px', fontSize: '14px', color: theme.text, width: '100%', outline: 'none', boxSizing: 'border-box', minHeight: '64px', fontFamily: 'inherit' },
  field: { marginBottom: '12px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', ...num },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: '700', color: theme.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${theme.border}`, background: theme.surface, position: 'sticky', top: 0 },
  td: { padding: '10px 12px', borderBottom: `1px solid ${theme.border}55`, color: theme.text, verticalAlign: 'top' },
  right: { textAlign: 'right' },
  btn: (variant = 'secondary', disabled = false) => ({
    minHeight: '44px', padding: '0 16px', borderRadius: '4px', fontSize: '13px', fontWeight: '600',
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    border: variant === 'secondary' ? `1px solid ${theme.border}` : variant === 'ghost' ? 'none' : 'none',
    background: disabled ? theme.surface : variant === 'primary' ? theme.accent : variant === 'danger' ? theme.red : variant === 'ghost' ? 'transparent' : theme.surface,
    color: disabled ? theme.textDim : variant === 'primary' ? '#1a0e00' : variant === 'danger' ? '#fff' : variant === 'ghost' ? theme.blue : theme.text,
  }),
  small: (color = theme.blue) => ({ minHeight: '32px', padding: '0 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: `1px solid ${color}66`, background: color + '1f', color, fontFamily: 'inherit' }),
  error: { padding: '10px 14px', borderRadius: '4px', marginBottom: '16px', background: theme.red + '1f', border: `1px solid ${theme.red}66`, color: theme.red, fontSize: '13px', whiteSpace: 'pre-wrap' },
  ok: { padding: '10px 14px', borderRadius: '4px', marginBottom: '16px', background: theme.green + '1f', border: `1px solid ${theme.green}66`, color: theme.green, fontSize: '13px' },
  hint: { fontSize: '12px', color: theme.textMuted, marginTop: '4px' },
  fieldError: { fontSize: '12px', color: theme.red, marginTop: '4px', fontWeight: '600' },
}

export const STATUS_COLOR = {
  awaiting_payment: theme.accent, active: theme.green, completed: theme.blue, closed: theme.textMuted, cancelled: theme.red,
  pending: theme.accent, accepted: theme.green, deemed_accepted: theme.green, partly_rejected: theme.accent, rejected: theme.red,
  suspended: theme.accent, voided: theme.red,
}

export const Pill = ({ status, label, color }) => {
  const c = color || STATUS_COLOR[status] || theme.textMuted
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em', textTransform: 'uppercase', background: c + '1f', color: c, border: `1px solid ${c}66`, whiteSpace: 'nowrap' }}>
      {label || String(status || '').replace(/_/g, ' ')}
    </span>
  )
}

export const fmtQty = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('en-NG'))
export const fmtDec = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-NG', { maximumFractionDigits: dp }))
// ₦ with thousands separators; kobo only when the figure actually has them
// (Bilaad's advance is ₦10,542,665.50 and must not be shown rounded).
export const fmtNaira = (n) => {
  if (n == null || n === '') return '—'
  const v = Number(n)
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })
}
export const fmtDate = longDate
export const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(iso)).replace(' am', 'am').replace(' pm', 'pm')
}

// Whole calendar days from today (Lagos) to an ISO date; negative = past.
export const daysFrom = (todayIso, iso) => {
  if (!iso) return null
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86400000)
}
export const countdown = (todayIso, iso) => {
  const d = daysFrom(todayIso, iso)
  if (d == null) return ''
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d > 1) return `in ${d} days`
  if (d === -1) return '1 day ago'
  return `${-d} days ago`
}

export const ErrorBox = ({ error, onRetry }) => error ? (
  <div style={ui.error} role="alert">
    {typeof error === 'string' ? error : (error.message || String(error))}
    {onRetry && <button data-board-allow data-ico-allow style={{ ...ui.small(theme.red), marginLeft: '12px' }} onClick={onRetry}>Retry</button>}
  </div>
) : null

export const SkeletonRows = ({ rows = 3 }) => (
  <div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} style={{ height: '40px', marginBottom: '6px', borderRadius: '4px', background: theme.surface, opacity: 0.7 }} />
    ))}
  </div>
)

// Opens a stored photo through a 1-hour signed URL (private bucket).
export const PhotoLink = ({ path }) => {
  const [err, setErr] = useState(null)
  if (!path) return <span style={{ color: theme.textDim }}>—</span>
  const open = async () => {
    setErr(null)
    // Open the tab synchronously so mobile browsers don't block it as a popup.
    const w = window.open('', '_blank')
    try {
      const url = await getSignedDocUrl('site-records', path)
      if (!url) throw new Error('No file')
      if (w) w.location.href = url; else window.location.href = url
    } catch (e) {
      if (w) w.close()
      setErr(e.message || 'Could not open photo')
    }
  }
  return (
    <span>
      <button data-board-allow data-ico-allow type="button" style={ui.small()} onClick={open}>Photo</button>
      {err && <div style={ui.fieldError}>{err}</div>}
    </span>
  )
}

// Copies text to the clipboard, with a visible fallback when the browser
// refuses (older Android WebViews).
export const CopyButton = ({ text, label = 'Copy notice text' }) => {
  const [state, setState] = useState('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('manual')
    }
  }
  return (
    <span style={{ display: 'inline-block' }}>
      <button data-board-allow data-ico-allow type="button" style={ui.small(theme.green)} onClick={copy}>
        {state === 'copied' ? 'Copied' : label}
      </button>
      {state === 'manual' && (
        <textarea readOnly value={text} style={{ ...ui.textarea, marginTop: '8px', minHeight: '140px' }} onFocus={e => e.target.select()} />
      )}
    </span>
  )
}

export function useIsMobile() {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

export const ConfirmDialog = ({ title, body, confirmLabel = 'Confirm', danger = false, children, onConfirm, onCancel, busy = false, confirmDisabled = false }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
      <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>{title}</div>
      {body && <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px', lineHeight: 1.45 }}>{body}</div>}
      {children}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px', flexWrap: 'wrap' }}>
        <button type="button" style={ui.btn('secondary')} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" style={ui.btn(danger ? 'danger' : 'primary', busy || confirmDisabled)} onClick={onConfirm} disabled={busy || confirmDisabled}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
)

// Table that becomes a stacked list on phones (house style: never a sideways-
// scrolling table). Each cell gets its column header as a label; the App's
// global `table { min-width }` mobile rule is overridden for these tables.
const STACK_CSS = `
@media (max-width: 768px) {
  table.site-stack { min-width: 0 !important; }
  table.site-stack thead { display: none; }
  table.site-stack, table.site-stack tbody, table.site-stack tr, table.site-stack td { display: block; width: 100%; box-sizing: border-box; }
  table.site-stack tr { border: 1px solid ${theme.border}; border-radius: 8px; margin-bottom: 12px; padding: 8px 12px; background: ${theme.surface}; }
  table.site-stack td { border: none !important; padding: 4px 0 4px 42% !important; text-align: right !important; position: relative; min-height: 24px; }
  table.site-stack td::before { content: attr(data-label); position: absolute; left: 0; top: 6px; width: 40%; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${theme.textMuted}; }
  table.site-stack td[data-label=""] { padding-left: 0 !important; text-align: left !important; }
  table.site-stack td[data-label=""]::before { display: none; }
  table.site-stack td > div { justify-content: flex-end; }
  table.site-stack td:empty { display: none; }
}`

export function StackTable({ headers, rightCols = [], children }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.querySelectorAll('tbody tr').forEach(tr => {
      Array.from(tr.children).forEach((td, i) => td.setAttribute('data-label', headers[i] ?? ''))
    })
  })
  return (
    <>
      <style>{STACK_CSS}</style>
      <table ref={ref} className="site-stack" style={ui.table}>
        <thead><tr>
          {headers.map((h, i) => <th key={i} style={{ ...ui.th, ...(rightCols.includes(i) ? ui.right : {}) }}>{h}</th>)}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </>
  )
}
