import React, { useId, useState } from 'react'
import { daysLate, isLate } from '../utils/lateEntry'
import { ui } from './site/siteUi'

export function useLateReason(date, originalDate) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const reset = () => { setValue(''); setError('') }
  const required = !!error || (date !== originalDate && isLate(date))
  const reason = value.trim()
  return {
    date, required, value, reason, error, setValue, reset,
    invalid: required && reason.length < 10,
    payload: required ? { late_reason: reason } : {},
    handleError(e) {
      if (!e?.message?.startsWith('LATE_ENTRY:')) return false
      setError(e.message)
      return true
    },
  }
}

export function LateReasonField({ entry }) {
  const id = useId()
  if (!entry.required) return null
  return (
    <div style={{ ...ui.field, minWidth: 0, marginBottom: 12 }}>
      <label htmlFor={id} style={ui.label}>Why wasn't this recorded on time?</label>
      <div id={id + '-help'}>
        {entry.error && <div role="alert" style={{ overflowWrap: 'anywhere' }}>{entry.error}</div>}
        <div>This entry is for {entry.date}, {daysLate(entry.date)} days ago.</div>
        <div aria-live="polite">{entry.reason.length} characters (minimum 10)</div>
      </div>
      <textarea id={id} required minLength={10} rows={3} aria-describedby={id + '-help'}
        style={{ ...ui.textarea, resize: 'vertical', maxWidth: '100%' }}
        value={entry.value} onChange={e => entry.setValue(e.target.value)} />
    </div>
  )
}
