import React, { useEffect, useState } from 'react'
import { CalendarClock, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/roles'
import { siteName } from '../services/sites'
import SitePicker, { useSites } from './SitePicker'
import { IconText } from './Ico'
import { ConfirmDialog, ErrorBox, StackTable, fmtDate, fmtDateTime, ui } from './site/siteUi'

const recordTypes = {
  production_log: 'Production',
  site_day_status: 'Site day status',
  stock_counts: 'Stock count',
  damage_log: 'Breakage',
  waybills: 'Waybill',
  block_handovers: 'Handover',
  material_receipts: 'Material delivery',
  daily_roster: 'Roster',
  downtime_log: 'Downtime',
}

export function LateEntriesCard({ userProfile, onOpen }) {
  const canReview = hasRole(userProfile, 'md', 'ico')
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!canReview) return
    let current = true
    const load = async () => {
      try {
        const { count, error } = await supabase.from('late_entries')
          .select('id', { head: true, count: 'exact' }).is('reviewed_at', null)
        if (current) setResult({ count, error })
      } catch (error) {
        if (current) setResult({ error })
      }
    }
    load()
    return () => { current = false }
  }, [canReview])

  if (!canReview || !result) return null
  if (result.error) return <ErrorBox error={result.error} />
  if (!result.count) return null
  return <div style={ui.panel}>
    <button type="button" onClick={onOpen} style={ui.btn('secondary')}>
      <IconText icon={CalendarClock}>Late entries to review: {result.count}</IconText>
    </button>
  </div>
}

export default function LateEntries() {
  const { sites } = useSites()
  const [filter, setFilter] = useState('unreviewed')
  const [site, setSite] = useState('')
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [target, setTarget] = useState(null)
  const [note, setNote] = useState('')
  const [reviewError, setReviewError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let current = true
    setLoading(true)
    setError(null)
    const load = async () => {
      try {
        let query = supabase.from('late_entries')
          .select('id,table_name,site_id,entry_date,entered_at,days_late,reason,entered_by_name,reviewed_at,reviewed_by_name,review_note')
          .order('entered_at', { ascending: false }).order('id', { ascending: false })
        if (filter === 'unreviewed') query = query.is('reviewed_at', null)
        if (site) query = query.eq('site_id', site)
        const { data, error } = await query.range(page * 50, page * 50 + 50)
        if (error) throw error
        if (!current) return
        if (!data.length && page > 0) {
          setPage(page - 1)
          return
        }
        setRows(data.slice(0, 50))
        setHasNext(data.length > 50)
        setLoading(false)
      } catch (error) {
        if (current) { setError(error); setLoading(false) }
      }
    }
    load()
    return () => { current = false }
  }, [filter, site, page, refresh])

  const markReviewed = async () => {
    if (busy || note.trim().length < 3) return
    setReviewError(null)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('review_late_entry', { p_id: target.id, p_note: note.trim() })
      if (error) throw error
      setTarget(null)
      setRefresh(n => n + 1)
    } catch (error) {
      setReviewError(error)
    } finally {
      setBusy(false)
    }
  }

  const cell = { ...ui.td, overflowWrap: 'anywhere' }
  return <section style={ui.panel}>
    <h2>Late entries</h2>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <label style={ui.field}>Review status
        <select style={ui.input} value={filter} onChange={e => { setPage(0); setFilter(e.target.value) }}>
          <option value="unreviewed">Unreviewed</option><option value="all">All</option>
        </select>
      </label>
      <div style={ui.field}>
        <label htmlFor="late-entry-site">Site</label>
        <SitePicker id="late-entry-site" value={site} onChange={value => { setPage(0); setSite(value) }}
          allowAll style={ui.input} />
      </div>
    </div>
    <ErrorBox error={error} />
    {loading ? <p role="status">Loading late entries…</p> : !error && (
      rows.length ? <>
        <StackTable headers={['Record date', 'Days late', 'Record type', 'Site', 'Entered by', 'Entered on', 'Reason', 'Review status']}>
          {rows.map(row => <tr key={row.id}>
            <td style={cell}>{fmtDate(row.entry_date)}</td>
            <td style={cell}>{row.days_late}</td>
            <td style={cell}>{recordTypes[row.table_name] || row.table_name}</td>
            <td style={cell}>{row.site_id ? siteName(row.site_id, sites) : '—'}</td>
            <td style={cell}>{row.entered_by_name || '—'}</td>
            <td style={cell}>{fmtDateTime(row.entered_at)}</td>
            <td style={cell}>{row.reason ?? 'No reason — entered before the rule was switched on'}</td>
            <td style={cell}>{row.reviewed_at ? <>
              <div>Reviewed {row.reviewed_by_name ? `by ${row.reviewed_by_name}` : ''}</div>
              <div>{fmtDateTime(row.reviewed_at)}</div>
              {row.review_note && <div>{row.review_note}</div>}
            </> : <>
              <div>Unreviewed</div>
              <button type="button" style={ui.btn('secondary')} onClick={() => {
                setTarget(row); setNote(''); setReviewError(null)
              }}><IconText icon={Check}>Mark reviewed</IconText></button>
            </>}</td>
          </tr>)}
        </StackTable>
        {(page > 0 || hasNext) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button type="button" style={ui.btn('secondary')} disabled={!page} onClick={() => setPage(page - 1)}>Previous</button>
          <button type="button" style={ui.btn('secondary')} disabled={!hasNext} onClick={() => setPage(page + 1)}>Next</button>
        </div>}
      </> : <p>No late entries match these filters.</p>
    )}
    {target && <ConfirmDialog title="Mark late entry reviewed" confirmLabel="Mark reviewed"
      onCancel={() => setTarget(null)} onConfirm={markReviewed}
      busy={busy} confirmDisabled={note.trim().length < 3}>
      <ErrorBox error={reviewError} />
      <label htmlFor="late-entry-review-note" style={ui.label}>Review note (minimum 3 characters)</label>
      <textarea id="late-entry-review-note" style={ui.textarea} rows={3} required minLength={3}
        value={note} onChange={e => setNote(e.target.value)} />
    </ConfirmDialog>}
  </section>
}
