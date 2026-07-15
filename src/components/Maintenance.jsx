import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { maintenanceService } from '../services/maintenance'
import { getSignedDocUrl } from '../services/storage'

const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e',
}

// Roles allowed to record checklists / log & resolve downtime. Mirrors the RLS
// INSERT/UPDATE policy on the four operational tables — the DB is the real gate,
// this just hides controls read-only roles (board_member/ico/store_officer)
// shouldn't see.
const WRITE_ROLES = ['md', 'production_manager', 'assistant_production_manager', 'logistics_manager']

const REASON_CATEGORIES = [
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'changeover', label: 'Changeover' },
  { value: 'minor_stop', label: 'Minor Stop' },
  { value: 'speed_loss', label: 'Speed Loss' },
  { value: 'defect_rework', label: 'Defect / Rework' },
  { value: 'startup', label: 'Startup' },
  { value: 'scheduled_maintenance', label: 'Scheduled Maintenance' },
  { value: 'other', label: 'Other' },
]
const reasonLabel = (v) => REASON_CATEGORIES.find(r => r.value === v)?.label || v || '—'

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annual: 'Annual' }
const STATUS_COLOR = { active: '#2dd4a0', down: '#f06b6b', maintenance: '#f5a623', retired: '#7c839e' }

const todayStr = () => new Date().toISOString().split('T')[0]

// datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time.
const nowLocalInput = () => {
  const d = new Date()
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

// "3h 20m" / "45m" / "just now" between two Date-ish values.
const humanDuration = (fromIso, toIso) => {
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  let mins = Math.max(0, Math.round((to - from) / 60000))
  if (mins < 1) return 'just now'
  const days = Math.floor(mins / 1440); mins -= days * 1440
  const hrs = Math.floor(mins / 60); mins -= hrs * 60
  const parts = []
  if (days) parts.push(`${days}d`)
  if (hrs) parts.push(`${hrs}h`)
  if (mins || parts.length === 0) parts.push(`${mins}m`)
  return parts.join(' ')
}

const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
}) : '—'

const styles = {
  page: { padding: '24px 28px', color: theme.text, minHeight: '100vh', background: theme.bg },
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '18px 20px', marginBottom: '16px' },
  row: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: theme.textMuted, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: { width: '100%', padding: '9px 12px', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', boxSizing: 'border-box' },
  btn: (v = 'primary') => ({
    padding: '9px 16px', borderRadius: '7px', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
    border: `1px solid ${v === 'danger' ? theme.red : v === 'success' ? theme.green : v === 'primary' ? theme.accent : v === 'blue' ? theme.blue : theme.border}`,
    background: v === 'primary' ? theme.accent : v === 'danger' ? '#3d1515' : v === 'success' ? '#0d3028' : v === 'blue' ? '#1a2a4a' : theme.surface,
    color: v === 'primary' ? '#1a0e00' : v === 'danger' ? theme.red : v === 'success' ? theme.green : v === 'blue' ? theme.blue : theme.text,
  }),
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: color + '22', color, border: `1px solid ${color}44`, textTransform: 'uppercase' }),
  th: { padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${theme.border}` },
  td: { padding: '10px 12px', fontSize: '13px', borderBottom: `1px solid ${theme.border}22`, verticalAlign: 'top' },
  tab: (active) => ({ padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '700' : '400', background: active ? theme.accent + '22' : 'transparent', color: active ? theme.accent : theme.textMuted }),
  formGroup: { marginBottom: '14px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' },
  empty: { padding: '32px', textAlign: 'center', color: theme.textMuted, fontSize: '13px', border: `1px dashed ${theme.border}`, borderRadius: '8px' },
}

const Spinner = () => (
  <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>Loading…</div>
)

const AlertBar = ({ msg, type = 'error', onClose }) => msg ? (
  <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '14px', background: type === 'success' ? theme.green + '22' : type === 'warning' ? theme.accent + '22' : theme.red + '22', color: type === 'success' ? theme.green : type === 'warning' ? theme.accent : theme.red, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
    <span>{msg}</span>
    {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}>×</button>}
  </div>
) : null

// Signed-URL photo link (private maintenance-photos bucket). Fetches the URL
// on click so we never hold a wall of expiring URLs in state.
const PhotoLink = ({ path }) => {
  const [busy, setBusy] = useState(false)
  if (!path) return <span style={{ color: theme.textMuted }}>—</span>
  const open = async () => {
    setBusy(true)
    try {
      const url = await getSignedDocUrl('maintenance-photos', path)
      if (url) window.open(url, '_blank', 'noopener')
    } catch { /* ignore — link just won't open */ }
    finally { setBusy(false) }
  }
  return (
    <button onClick={open} disabled={busy} style={{ ...styles.btn('secondary'), padding: '3px 10px', fontSize: '11px' }}>
      {busy ? '…' : '📷 View'}
    </button>
  )
}

const assetLabel = (a) => a ? `${(a.name || '').trim()} (${(a.code || '').trim()})` : '—'

// ── CHECKLIST TAB ────────────────────────────────────────────────
function ChecklistTab({ assets, templates, staffById, activeStaff, userProfile, canWrite }) {
  const [templateId, setTemplateId] = useState('')
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [assetId, setAssetId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [checked, setChecked] = useState({})
  const [flagToggle, setFlagToggle] = useState(false)
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState(null)

  const [completions, setCompletions] = useState([])
  const [loadingList, setLoadingList] = useState(true)

  const loadToday = useCallback(async () => {
    setLoadingList(true)
    try { setCompletions(await maintenanceService.getCompletionsForDate(todayStr())) }
    catch (e) { setAlert({ type: 'error', msg: e?.message || 'Could not load today’s completions' }) }
    finally { setLoadingList(false) }
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  const selectedTemplate = templates.find(t => t.id === templateId) || null

  // Assets valid for the selected template must match its asset_type.
  const eligibleAssets = useMemo(() => {
    if (!selectedTemplate) return []
    return assets.filter(a => a.asset_type === selectedTemplate.asset_type)
  }, [assets, selectedTemplate])

  const resetForm = () => {
    setTemplateId(''); setItems([]); setAssetId(''); setStaffId('')
    setChecked({}); setFlagToggle(false); setNotes(''); setPhotoFile(null)
  }

  const onTemplateChange = async (id) => {
    setTemplateId(id); setAssetId(''); setChecked({}); setItems([]); setFlagToggle(false)
    if (!id) return
    setItemsLoading(true)
    try {
      const its = await maintenanceService.getTemplateItems(id)
      setItems(its)
      setChecked(Object.fromEntries(its.map(i => [i.id, false])))
    } catch (e) {
      setAlert({ type: 'error', msg: e?.message || 'Could not load checklist items' })
    } finally {
      setItemsLoading(false)
    }
  }

  const anyUnchecked = items.some(i => !checked[i.id])
  const noneChecked = items.length > 0 && items.every(i => !checked[i.id])
  const flaggedIssue = anyUnchecked || flagToggle

  const submit = async () => {
    setAlert(null)
    if (!templateId) { setAlert({ type: 'error', msg: 'Select a checklist first.' }); return }
    if (items.length === 0) { setAlert({ type: 'error', msg: 'This checklist has no items configured — nothing to record.' }); return }
    if (!assetId) { setAlert({ type: 'error', msg: 'Select the asset this checklist is for.' }); return }
    if (!staffId) { setAlert({ type: 'error', msg: 'Select the staff member this checklist is for.' }); return }
    // Block silent incomplete data: nothing ticked and no issue explained.
    if (noneChecked && !notes.trim()) {
      setAlert({ type: 'error', msg: 'Nothing is checked. Either tick the items completed, or explain in Notes why none were (that records it as a flagged issue).' })
      return
    }
    if (flaggedIssue && !notes.trim()) {
      setAlert({ type: 'error', msg: 'Some items are unchecked or you flagged an issue — a note explaining why is required.' })
      return
    }

    setSubmitting(true)
    let photoWarning = false
    try {
      let photo_storage_path = null
      if (photoFile) {
        const ext = (photoFile.name?.split('.').pop() || 'jpg').toLowerCase()
        const path = `checklists/${assetId}/${Date.now()}.${ext}`
        photo_storage_path = await maintenanceService.uploadPhoto(photoFile, path)
        if (!photo_storage_path) photoWarning = true // non-blocking: save record anyway
      }

      await maintenanceService.insertCompletion({
        asset_id: assetId,
        template_id: templateId,
        completed_date: todayStr(),
        staff_id: staffId,
        recorded_by_user: userProfile?.id || null,
        device_source: 'web',
        items_checked: Object.fromEntries(items.map(i => [i.id, !!checked[i.id]])),
        flagged_issue: flaggedIssue,
        notes: notes.trim() || null,
        photo_storage_path,
      })

      setAlert({
        type: photoWarning ? 'warning' : 'success',
        msg: photoWarning
          ? 'Checklist saved, but the photo failed to upload and was not attached.'
          : 'Checklist recorded.' + (flaggedIssue ? ' Flagged as an issue.' : ''),
      })
      resetForm()
      loadToday()
    } catch (e) {
      setAlert({ type: 'error', msg: e?.message || 'Could not save the checklist.' })
    } finally {
      setSubmitting(false)
    }
  }

  const staffName = (id) => staffById[id]?.full_name || (id ? 'Unknown staff' : '—')

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {canWrite && (
        <div style={styles.card}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}>Record a checklist</div>

          {templates.length === 0 ? (
            <div style={styles.empty}>No active checklist templates are configured yet.</div>
          ) : (
            <>
              <div style={styles.grid2}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Checklist</label>
                  <select style={styles.input} value={templateId} onChange={e => onTemplateChange(e.target.value)}>
                    <option value="">Select a checklist…</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {FREQ_LABEL[t.frequency] || t.frequency} · {t.asset_type}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Asset {selectedTemplate ? `(${selectedTemplate.asset_type})` : ''}</label>
                  <select style={styles.input} value={assetId} onChange={e => setAssetId(e.target.value)} disabled={!selectedTemplate}>
                    <option value="">{selectedTemplate ? 'Select an asset…' : 'Pick a checklist first'}</option>
                    {eligibleAssets.map(a => (
                      <option key={a.id} value={a.id}>{assetLabel(a)} — {a.status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>For staff member (required)</label>
                <select style={styles.input} value={staffId} onChange={e => setStaffId(e.target.value)}>
                  <option value="">Select staff…</option>
                  {activeStaff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                  Who the checklist is for/about — not necessarily you. Recorded by {userProfile?.full_name || 'you'} automatically.
                </div>
              </div>

              {itemsLoading ? <Spinner /> : selectedTemplate && (
                items.length === 0 ? (
                  <div style={styles.empty}>No checklist configured — this template has no items yet.</div>
                ) : (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Items</label>
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                      {items.map((it, idx) => (
                        <label key={it.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', background: idx % 2 ? theme.surface : 'transparent', borderBottom: idx < items.length - 1 ? `1px solid ${theme.border}22` : 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!checked[it.id]}
                            onChange={e => setChecked(c => ({ ...c, [it.id]: e.target.checked }))}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '13px' }}>{it.item_text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              )}

              {selectedTemplate && items.length > 0 && (
                <>
                  <div style={{ ...styles.row, marginBottom: '12px' }}>
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={flagToggle} onChange={e => setFlagToggle(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                      <span style={{ fontSize: '13px' }}>Flag an issue</span>
                    </label>
                    {flaggedIssue && <span style={styles.badge(theme.red)}>Will be flagged</span>}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Notes {flaggedIssue ? '(required — explain the issue)' : '(optional)'}</label>
                    <textarea
                      style={{ ...styles.input, minHeight: '64px', resize: 'vertical' }}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder={flaggedIssue ? 'What is wrong / why are items unchecked?' : 'Anything worth noting'}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Photo (optional)</label>
                    <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} style={{ fontSize: '13px', color: theme.text }} />
                  </div>

                  <button style={styles.btn('primary')} onClick={submit} disabled={submitting}>
                    {submitting ? 'Saving…' : 'Submit checklist'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div style={styles.card}>
        <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '14px' }}>Today&rsquo;s completions</div>
        {loadingList ? <Spinner /> : completions.length === 0 ? (
          <div style={styles.empty}>No checklists recorded today.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={styles.th}>Asset</th>
                  <th style={styles.th}>For</th>
                  <th style={styles.th}>Items</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Notes</th>
                  <th style={styles.th}>Photo</th>
                </tr>
              </thead>
              <tbody>
                {completions.map(c => {
                  const asset = assets.find(a => a.id === c.asset_id)
                  const checks = c.items_checked && typeof c.items_checked === 'object' ? Object.values(c.items_checked) : []
                  const done = checks.filter(Boolean).length
                  return (
                    <tr key={c.id}>
                      <td style={styles.td}>{asset ? assetLabel(asset) : '—'}</td>
                      <td style={styles.td}>{staffName(c.staff_id)}</td>
                      <td style={styles.td}>{checks.length ? `${done}/${checks.length}` : '—'}</td>
                      <td style={styles.td}>
                        {c.flagged_issue
                          ? <span style={styles.badge(theme.red)}>⚠ Flagged</span>
                          : <span style={styles.badge(theme.green)}>OK</span>}
                      </td>
                      <td style={{ ...styles.td, maxWidth: '260px', whiteSpace: 'pre-wrap' }}>{c.notes || '—'}</td>
                      <td style={styles.td}><PhotoLink path={c.photo_storage_path} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── DOWNTIME TAB ─────────────────────────────────────────────────
function DowntimeTab({ assets, activeStaff, staffById, userProfile, canWrite }) {
  const [assetId, setAssetId] = useState('')
  const [startTime, setStartTime] = useState(nowLocalInput())
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [staffId, setStaffId] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState(null)

  const [open, setOpen] = useState([])
  const [resolved, setResolved] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState(null)
  // Ticks every 30s so open-duration figures stay live without a reload.
  const [, setTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [o, r] = await Promise.all([
        maintenanceService.getOpenDowntime(),
        maintenanceService.getResolvedDowntime(50),
      ])
      setOpen(o); setResolved(r)
    } catch (e) {
      setAlert({ type: 'error', msg: e?.message || 'Could not load downtime log' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const resetForm = () => {
    setAssetId(''); setStartTime(nowLocalInput()); setReason(''); setDetail(''); setStaffId(''); setPhotoFile(null)
  }

  const submit = async () => {
    setAlert(null)
    if (!assetId) { setAlert({ type: 'error', msg: 'Select the asset that stopped.' }); return }
    if (!startTime) { setAlert({ type: 'error', msg: 'Set the start time.' }); return }
    if (!reason) { setAlert({ type: 'error', msg: 'Pick a reason category.' }); return }

    setSubmitting(true)
    let photoWarning = false
    try {
      let photo_storage_path = null
      if (photoFile) {
        const ext = (photoFile.name?.split('.').pop() || 'jpg').toLowerCase()
        const path = `downtime/${assetId}/${Date.now()}.${ext}`
        photo_storage_path = await maintenanceService.uploadPhoto(photoFile, path)
        if (!photo_storage_path) photoWarning = true
      }

      await maintenanceService.insertDowntime({
        asset_id: assetId,
        start_time: new Date(startTime).toISOString(),
        reason_category: reason,
        reason_detail: detail.trim() || null,
        staff_id: staffId || null,
        recorded_by_user: userProfile?.id || null,
        resolved: false,
        photo_storage_path,
      })

      setAlert({
        type: photoWarning ? 'warning' : 'success',
        msg: photoWarning ? 'Downtime logged, but the photo failed to upload and was not attached.' : 'Downtime logged.',
      })
      resetForm()
      load()
    } catch (e) {
      setAlert({ type: 'error', msg: e?.message || 'Could not log downtime.' })
    } finally {
      setSubmitting(false)
    }
  }

  const resolve = async (id) => {
    setResolvingId(id)
    try {
      await maintenanceService.resolveDowntime(id)
      await load()
    } catch (e) {
      setAlert({ type: 'error', msg: e?.message || 'Could not resolve.' })
    } finally {
      setResolvingId(null)
    }
  }

  const assetById = useMemo(() => Object.fromEntries(assets.map(a => [a.id, a])), [assets])
  const staffName = (id) => staffById[id]?.full_name || (id ? 'Unknown staff' : '—')

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {canWrite && (
        <div style={styles.card}>
          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '16px' }}>Log downtime</div>
          <div style={styles.grid2}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Asset</label>
              <select style={styles.input} value={assetId} onChange={e => setAssetId(e.target.value)}>
                <option value="">Select an asset…</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{assetLabel(a)} — {a.status}</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Start time</label>
              <input type="datetime-local" style={styles.input} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
          </div>
          <div style={styles.grid2}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Reason</label>
              <select style={styles.input} value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {REASON_CATEGORIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Reported by (optional)</label>
              <select style={styles.input} value={staffId} onChange={e => setStaffId(e.target.value)}>
                <option value="">Not specified</option>
                {activeStaff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Detail (optional)</label>
            <textarea style={{ ...styles.input, minHeight: '56px', resize: 'vertical' }} value={detail} onChange={e => setDetail(e.target.value)} placeholder="What happened?" />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Photo (optional)</label>
            <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} style={{ fontSize: '13px', color: theme.text }} />
          </div>
          <button style={styles.btn('primary')} onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Log downtime'}
          </button>
        </div>
      )}

      <div style={styles.card}>
        <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '14px' }}>Open downtime</div>
        {loading ? <Spinner /> : open.length === 0 ? (
          <div style={styles.empty}>No open downtime — everything running.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={styles.th}>Asset</th>
                  <th style={styles.th}>Reason</th>
                  <th style={styles.th}>Started</th>
                  <th style={styles.th}>Open for</th>
                  <th style={styles.th}>Reported by</th>
                  <th style={styles.th}>Photo</th>
                  {canWrite && <th style={styles.th}></th>}
                </tr>
              </thead>
              <tbody>
                {open.map(d => (
                  <tr key={d.id}>
                    <td style={styles.td}>{assetById[d.asset_id] ? assetLabel(assetById[d.asset_id]) : '—'}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(theme.accent)}>{reasonLabel(d.reason_category)}</span>
                      {d.reason_detail && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px', whiteSpace: 'pre-wrap' }}>{d.reason_detail}</div>}
                    </td>
                    <td style={styles.td}>{fmtDateTime(d.start_time)}</td>
                    <td style={styles.td}><span style={{ color: theme.red, fontWeight: '700' }}>{humanDuration(d.start_time)}</span></td>
                    <td style={styles.td}>{staffName(d.staff_id)}</td>
                    <td style={styles.td}><PhotoLink path={d.photo_storage_path} /></td>
                    {canWrite && (
                      <td style={styles.td}>
                        <button style={{ ...styles.btn('success'), padding: '5px 12px', fontSize: '12px' }} onClick={() => resolve(d.id)} disabled={resolvingId === d.id}>
                          {resolvingId === d.id ? 'Resolving…' : 'Resolve'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '14px' }}>Resolved history</div>
        {loading ? <Spinner /> : resolved.length === 0 ? (
          <div style={styles.empty}>No resolved downtime yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={styles.th}>Asset</th>
                  <th style={styles.th}>Reason</th>
                  <th style={styles.th}>Started</th>
                  <th style={styles.th}>Ended</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Reported by</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map(d => (
                  <tr key={d.id}>
                    <td style={styles.td}>{assetById[d.asset_id] ? assetLabel(assetById[d.asset_id]) : '—'}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(theme.textMuted)}>{reasonLabel(d.reason_category)}</span>
                      {d.reason_detail && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px', whiteSpace: 'pre-wrap' }}>{d.reason_detail}</div>}
                    </td>
                    <td style={styles.td}>{fmtDateTime(d.start_time)}</td>
                    <td style={styles.td}>{fmtDateTime(d.end_time)}</td>
                    <td style={styles.td}>{humanDuration(d.start_time, d.end_time)}</td>
                    <td style={styles.td}>{staffName(d.staff_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAINTENANCE PAGE ─────────────────────────────────────────────
export default function Maintenance({ userProfile }) {
  const role = userProfile?.role
  const canWrite = WRITE_ROLES.includes(role)

  const [activeTab, setActiveTab] = useState('checklists')
  const [assets, setAssets] = useState([])
  const [templates, setTemplates] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [a, t, s] = await Promise.all([
          maintenanceService.getAssets(),
          maintenanceService.getActiveTemplates(),
          maintenanceService.getStaffForPicker(),
        ])
        if (cancelled) return
        setAssets(a); setTemplates(t); setStaff(s)
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Could not load maintenance data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const activeStaff = useMemo(() => staff.filter(s => s.is_active), [staff])
  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s])), [staff])

  const TABS = [
    { key: 'checklists', label: 'Checklists' },
    { key: 'downtime', label: 'Downtime Log' },
  ]

  return (
    <div style={styles.page}>
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: theme.text }}>Maintenance</h1>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
            Preventive checklists &amp; downtime tracking · Abuja Precast Concrete Limited
          </div>
        </div>
        <div style={{ fontSize: '12px', color: theme.textMuted }}>
          {userProfile?.full_name} · <span style={{ color: theme.accent }}>{role}</span>
        </div>
      </div>

      {!canWrite && (
        <div style={{ ...styles.card, background: theme.surface, borderColor: theme.blue + '55', color: theme.textMuted, fontSize: '13px' }}>
          Read-only view — your role can see maintenance records but cannot record checklists or log downtime.
        </div>
      )}

      {loadError && <AlertBar msg={loadError} type="error" onClose={() => setLoadError(null)} />}

      <div style={{ ...styles.row, gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} style={styles.tab(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {activeTab === 'checklists' && (
            <ChecklistTab
              assets={assets}
              templates={templates}
              staffById={staffById}
              activeStaff={activeStaff}
              userProfile={userProfile}
              canWrite={canWrite}
            />
          )}
          {activeTab === 'downtime' && (
            <DowntimeTab
              assets={assets}
              activeStaff={activeStaff}
              staffById={staffById}
              userProfile={userProfile}
              canWrite={canWrite}
            />
          )}
        </>
      )}
    </div>
  )
}
