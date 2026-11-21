import React, { useEffect, useState } from 'react'
import { Banknote } from 'lucide-react'
import { hasRole } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { siteAttendance } from '../services/siteAttendance'
import { dailyWagesService } from '../services/labour'

const money = value => Number(value).toLocaleString('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const control = { minHeight: 44, maxWidth: '100%', borderRadius: 7, padding: '8px 12px', border: '1px solid #474e69', background: '#21263a', color: '#e8eaf0', boxSizing: 'border-box' }
const panel = { padding: 16, marginBottom: 16, border: '1px solid #596078', borderRadius: 10, overflowWrap: 'anywhere' }

function useWages(profile, revision) {
  const allowed = hasRole(profile, 'md', 'accountant')
  const [result, setResult] = useState({ rows: [], error: '' })
  useEffect(() => {
    if (!allowed) return
    let active = true
    dailyWagesService.due().then(rows => {
      if (active) setResult({ rows, error: '' })
    }).catch(error => {
      if (active) setResult({ rows: [], error: error.message })
    })
    return () => { active = false }
  }, [allowed, profile?.id, revision])
  return allowed ? result : { rows: [], error: '' }
}

export function WageDashboard({ userProfile, onOpen }) {
  const { rows } = useWages(userProfile)
  if (!rows.length) return null
  return <button type="button" style={{ ...panel, ...control }} onClick={onOpen}>
    <Banknote size={16} aria-hidden="true" /> Wages to pay: {rows.length} {rows.length === 1 ? 'day' : 'days'}, {money(rows.reduce((sum, row) => sum + Number(row.total), 0))}
  </button>
}

function PaymentForm({ row, onClose, onPaid }) {
  const key = 'daily-wages-paid-to:' + row.site_id
  const [form, setForm] = useState(() => {
    let paidTo = ''
    try { paidTo = localStorage.getItem(key) || '' } catch { /* Storage is optional. */ }
    return { amount: row.total, paidTo, reference: '', account: '', note: '' }
  })
  const bind = field => ({ value: form[field], onChange: e => setForm({ ...form, [field]: e.target.value }), style: { ...control, display: 'block', width: '100%' } })
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    supabase.from('bank_accounts').select('id, account_name, bank_name').then(({ data, error }) => {
      if (!active) return
      if (error) setAccountError(error.message)
      else setAccounts(data || [])
    })
    return () => { active = false }
  }, [])

  async function save(event) {
    event.preventDefault()
    if (!form.paidTo.trim() || !form.reference.trim() || Number(form.amount) !== Number(row.total)) {
      setError('Enter the full roster total, who received it, and the transfer reference.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await dailyWagesService.pay(row.roster_id, form)
      try { localStorage.setItem(key, form.paidTo.trim()) } catch { /* Storage is optional. */ }
      onPaid()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return <dialog open aria-label="Record payment" style={{ ...panel, position: 'relative', width: '100%', boxSizing: 'border-box', background: '#1a1d27', color: '#e8eaf0' }}>
    <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
      <strong>Record payment</strong>
      {error && <div role="alert">{error}</div>}
      <label>Amount (₦) <input {...bind('amount')} type="number" step="0.01" required /></label>
      <label>Paid to <input {...bind('paidTo')} required /></label>
      <label>Transfer reference <input {...bind('reference')} required /></label>
      <label>From account <select {...bind('account')}>
        <option value="">None</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name || a.bank_name}</option>)}
      </select></label>
      {accountError && <div role="alert">{accountError}</div>}
      <label>Note <textarea {...bind('note')} /></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={control} type="submit" disabled={saving}>Save payment</button>
        <button style={control} type="button" onClick={onClose} disabled={saving}>Cancel</button>
      </div>
    </form>
  </dialog>
}

function RosterCoverage({ site, date, workers, revision }) {
  const [missing, setMissing] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    siteAttendance.register(site, date).then(data => {
      if (active && data?.on_roster_not_checked_in) {
        setMissing(data.on_roster_not_checked_in.length)
        setError('')
      }
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [site, date, revision])
  if (error) return <p role="alert">{error}</p>
  return missing == null ? null : <p>Register: {Math.max(0, workers - missing)} of {workers} checked in</p>
}

export function WagesToPay({ userProfile, onRoster, revision, onPaid }) {
  const { rows, error } = useWages(userProfile, revision)
  const [selected, setSelected] = useState(null)
  if (!rows.length && !error) return null
  return <section aria-label="Wages to pay" style={panel}>
    <h2>Wages to pay</h2>
    {error && <div role="alert">{error}</div>}
    {rows.map(row => {
      const waiting = !hasRole(userProfile, 'md') && row.md_status !== 'approved'
      return <div key={row.roster_id} style={panel}>
        <button style={control} onClick={() => onRoster(row.roster_id)}>{row.site_name} · {row.roster_date} · View roster</button>
        <p>{row.workers} workers · {money(row.total)} · MD approval: {row.md_status || 'pending'}</p>
        <RosterCoverage site={row.site_id} date={row.roster_date} workers={row.workers} revision={revision} />
        <p style={{ color: row.days_waiting > 1 ? '#f06b6b' : undefined }}>{row.days_waiting} days waiting</p>
        <button style={control} disabled={waiting} onClick={() => setSelected(row.roster_id)}>{waiting ? 'Waiting for MD approval' : 'Record payment'}</button>
        {selected === row.roster_id && !waiting && <PaymentForm row={row} onClose={() => setSelected(null)} onPaid={() => {
          setSelected(null)
          onPaid()
        }} />}
      </div>
    })}
  </section>
}
