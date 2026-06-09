import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e',
}

const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`
const todayStr = () => new Date().toISOString().split('T')[0]

function getSaturday(dateStr) {
  const d = new Date(dateStr || todayStr())
  const day = d.getDay()
  const diff = day === 0 ? 6 : 6 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

const NIGERIAN_BANKS = [
  'Access Bank', 'First Bank of Nigeria', 'GTBank', 'UBA', 'Zenith Bank',
  'Fidelity Bank', 'FCMB', 'Union Bank', 'Sterling Bank', 'Wema Bank',
  'Polaris Bank', 'Keystone Bank', 'Ecobank Nigeria', 'Stanbic IBTC Bank',
  'Standard Chartered Bank', 'Citibank Nigeria', 'Heritage Bank', 'Unity Bank',
  'Providus Bank', 'SunTrust Bank', 'Kuda Bank', 'Opay', 'Palmpay', 'Moniepoint',
]

const CATEGORIES = ['daily', 'monthly_fixed', 'piece_rate']
const PAYMENT_TYPES = ['daily', 'monthly_fixed', 'piece_rate']
const BONUS_TYPES = ['per_day', 'per_block', 'none']

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
  td: { padding: '10px 12px', fontSize: '13px', borderBottom: `1px solid ${theme.border}22` },
  tab: (active) => ({ padding: '8px 18px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '700' : '400', background: active ? theme.accent + '22' : 'transparent', color: active ? theme.accent : theme.textMuted }),
  formGroup: { marginBottom: '14px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' },
  modal: { position: 'fixed', inset: 0, background: '#000000bb', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
  modalBox: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' },
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

const statusColor = (s) => {
  if (!s) return theme.textMuted
  const m = {
    draft:        theme.textMuted,
    submitted:    theme.blue,
    ico_approved: theme.green,
    ico_rejected: theme.red,
    md_approved:  theme.green,
    md_rejected:  theme.red,
    paid:         theme.green,
    unpaid:       theme.red,
    approved:     theme.green,
    rejected:     theme.red,
    pending:      '#f59e0b',
    ico_review:   theme.blue,
    md_review:    '#f59e0b',
  }
  return m[s] || theme.textMuted
}

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function getOrCreateCategory(name) {
  const { data } = await supabase.from('expense_categories').select('id').ilike('name', name).limit(1)
  if (data?.[0]?.id) return data[0].id
  const { data: c } = await supabase.from('expense_categories').insert({ name, is_active: true }).select('id').single()
  return c?.id
}

// ── LABOUR POOL TAB ──────────────────────────────────────────────────────────
function LabourPoolTab({ pool, roles, userProfile, onRefresh }) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editWorker, setEditWorker] = useState(null)
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [alert, setAlert] = useState(null)

  const filtered = pool.filter(w => {
    const q = search.toLowerCase()
    const matchSearch = !q || w.full_name?.toLowerCase().includes(q) || w.labour_number?.toLowerCase().includes(q)
    const matchCat = filterCat === 'all' || w.category === filterCat
    const matchRole = filterRole === 'all' || String(w.usual_role_id) === filterRole
    return matchSearch && matchCat && matchRole
  })

  const handleDeactivate = async (w) => {
    const { error } = await supabase.from('labour_pool').update({ is_active: !w.is_active }).eq('id', w.id)
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: `Worker ${w.is_active ? 'deactivated' : 'activated'}.`, type: 'success' }); onRefresh() }
  }

  if (selectedWorker) {
    return (
      <WorkerProfile
        worker={selectedWorker}
        roles={roles}
        onBack={() => setSelectedWorker(null)}
        onEdit={() => { setEditWorker(selectedWorker); setShowForm(true); setSelectedWorker(null) }}
        onDeactivate={() => { handleDeactivate(selectedWorker); setSelectedWorker(null) }}
      />
    )
  }

  if (showForm) {
    return (
      <WorkerForm
        worker={editWorker}
        roles={roles}
        userProfile={userProfile}
        onSave={() => { setShowForm(false); setEditWorker(null); onRefresh() }}
        onCancel={() => { setShowForm(false); setEditWorker(null) }}
      />
    )
  }

  return (
    <div>
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ ...styles.row, gap: '10px', flexWrap: 'wrap' }}>
          <input placeholder="Search name or number…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...styles.input, width: '220px' }} />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...styles.input, width: '160px' }}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...styles.input, width: '180px' }}>
            <option value="all">All Roles</option>
            {roles.map(r => <option key={r.id} value={String(r.id)}>{r.role_name}</option>)}
          </select>
        </div>
        <button style={styles.btn('primary')} onClick={() => { setEditWorker(null); setShowForm(true) }}>+ Add Worker</button>
      </div>

      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: theme.surface }}>
            <tr>
              {['Labour No', 'Name', 'Phone', 'Category', 'Usual Role', 'Bank', 'Status', 'Actions'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No workers found.</td></tr>
            )}
            {filtered.map(w => {
              const role = roles.find(r => r.id === w.usual_role_id)
              return (
                <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedWorker(w)}>
                  <td style={styles.td}><span style={{ fontFamily: 'monospace', color: theme.blue }}>{w.labour_number}</span></td>
                  <td style={styles.td}>{w.full_name}</td>
                  <td style={styles.td}>{w.phone || '—'}</td>
                  <td style={styles.td}><span style={styles.badge(theme.blue)}>{(w.category || '').replace('_', ' ')}</span></td>
                  <td style={styles.td}>{role?.role_name || '—'}</td>
                  <td style={styles.td}>{w.bank_name || '—'}</td>
                  <td style={styles.td}><span style={styles.badge(w.is_active ? theme.green : theme.red)}>{w.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={styles.td} onClick={e => e.stopPropagation()}>
                    <div style={styles.row}>
                      <button style={{ ...styles.btn('ghost'), padding: '5px 10px', fontSize: '12px' }} onClick={() => { setEditWorker(w); setShowForm(true) }}>Edit</button>
                      <button style={{ ...styles.btn('danger'), padding: '5px 10px', fontSize: '12px' }} onClick={() => handleDeactivate(w)}>{w.is_active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WorkerProfile({ worker, roles, onBack, onEdit, onDeactivate }) {
  const role = roles.find(r => r.id === worker.usual_role_id)
  return (
    <div>
      <div style={{ ...styles.row, marginBottom: '20px', gap: '12px' }}>
        <button style={styles.btn('ghost')} onClick={onBack}>← Back</button>
        <h2 style={{ margin: 0, fontSize: '18px', color: theme.text }}>{worker.full_name}</h2>
        <span style={styles.badge(worker.is_active ? theme.green : theme.red)}>{worker.is_active ? 'Active' : 'Inactive'}</span>
      </div>
      <div style={styles.grid2}>
        <div style={styles.card}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '14px' }}>Personal Details</div>
          {[
            ['Labour Number', worker.labour_number],
            ['Full Name', worker.full_name],
            ['Phone', worker.phone || '—'],
            ['Category', (worker.category || '').replace('_', ' ')],
            ['Usual Role', role?.role_name || '—'],
            ['Date Registered', worker.date_registered || '—'],
            ['Notes', worker.notes || '—'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${theme.border}22`, fontSize: '13px' }}>
              <span style={{ color: theme.textMuted }}>{l}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '14px' }}>Bank Details</div>
          {[
            ['Bank Name', worker.bank_name || '—'],
            ['Account Number', worker.bank_account_number || '—'],
            ['Account Name', worker.bank_account_name || '—'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${theme.border}22`, fontSize: '13px' }}>
              <span style={{ color: theme.textMuted }}>{l}</span>
              <span>{v}</span>
            </div>
          ))}
          <div style={{ ...styles.row, marginTop: '20px', gap: '10px' }}>
            <button style={styles.btn('primary')} onClick={onEdit}>Edit Worker</button>
            <button style={styles.btn('danger')} onClick={onDeactivate}>{worker.is_active ? 'Deactivate' : 'Activate'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkerForm({ worker, roles, userProfile, onSave, onCancel }) {
  const empty = { full_name: '', phone: '', category: 'daily', usual_role_id: '', bank_name: '', bank_account_number: '', bank_account_name: '', notes: '' }
  const [form, setForm] = useState(worker ? { ...empty, ...worker, usual_role_id: worker.usual_role_id || '' } : empty)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.full_name.trim()) return setErr('Full name is required.')
    setSaving(true); setErr('')
    const payload = { ...form, usual_role_id: form.usual_role_id || null }
    let error
    if (worker) {
      ;({ error } = await supabase.from('labour_pool').update(payload).eq('id', worker.id))
    } else {
      const { count } = await supabase.from('labour_pool').select('id', { count: 'exact', head: true })
      const num = String((count || 0) + 1).padStart(3, '0')
      payload.labour_number = `APC-LAB-${num}`
      payload.date_registered = todayStr()
      payload.is_active = true
      ;({ error } = await supabase.from('labour_pool').insert(payload))
    }
    setSaving(false)
    if (error) setErr(error.message)
    else onSave()
  }

  return (
    <div style={styles.card}>
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '18px' }}>
        <h3 style={{ margin: 0 }}>{worker ? 'Edit Worker' : 'Add Worker'}</h3>
        <button style={styles.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
      {err && <AlertBar msg={err} type="error" onClose={() => setErr('')} />}
      <div style={styles.grid2}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Full Name *</label>
          <input style={styles.input} value={form.full_name} onChange={set('full_name')} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Phone</label>
          <input style={styles.input} value={form.phone} onChange={set('phone')} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Category</label>
          <select style={styles.input} value={form.category} onChange={set('category')}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Usual Role</label>
          <select style={styles.input} value={form.usual_role_id} onChange={set('usual_role_id')}>
            <option value="">— Select Role —</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Bank Name</label>
          <select style={styles.input} value={form.bank_name} onChange={set('bank_name')}>
            <option value="">— Select Bank —</option>
            {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Account Number</label>
          <input style={styles.input} value={form.bank_account_number} onChange={set('bank_account_number')} maxLength={10} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Account Name</label>
          <input style={styles.input} value={form.bank_account_name} onChange={set('bank_account_name')} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Notes</label>
          <input style={styles.input} value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <div style={styles.row}>
        <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Worker'}</button>
        <button style={styles.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── DAILY ROSTER TAB ─────────────────────────────────────────────────────────
function DailyRosterTab({ pool, roles, userProfile }) {
  const [rosters, setRosters] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRoster, setSelectedRoster] = useState(null)
  const [editingRoster, setEditingRoster] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [alert, setAlert] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const loadRosters = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('daily_roster').select('*').order('roster_date', { ascending: false })
    setRosters(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadRosters() }, [loadRosters])

  const handleAction = async (roster, action, comment = '') => {
    let update = {}
    if (action === 'submit') update = { ico_status: 'submitted', submitted_by: userProfile?.full_name, submitted_date: todayStr() }
    else if (action === 'ico_approve') update = { ico_status: 'ico_approved', ico_approved_by: userProfile?.full_name, ico_approval_date: todayStr() }
    else if (action === 'ico_reject') update = { ico_status: 'ico_rejected', ico_approved_by: userProfile?.full_name, ico_approval_date: todayStr(), notes: comment }
    else if (action === 'md_approve') update = { md_status: 'approved', md_approved_by: userProfile?.full_name, md_approval_date: todayStr() }
    else if (action === 'md_reject') update = { md_status: 'rejected', md_approved_by: userProfile?.full_name, md_approval_date: todayStr(), notes: comment }
    else if (action === 'mark_paid') update = { payment_status: 'paid' }
    const { error } = await supabase.from('daily_roster').update(update).eq('id', roster.id)
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: 'Updated successfully.', type: 'success' }); loadRosters(); setSelectedRoster(r => r ? { ...r, ...update } : null) }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const icoSt = deleteTarget.ico_status || 'draft'
    const mdSt = deleteTarget.md_status || 'pending'
    const isApproved = ['ico_approved', 'md_approved'].includes(icoSt) || mdSt === 'approved'
    if (isApproved && !deleteReason.trim()) {
      setAlert({ msg: 'Please enter a reason for deletion.', type: 'error' })
      return
    }
    setDeleting(true)
    await supabase.from('daily_roster_entries').delete().eq('roster_id', deleteTarget.id)
    const { error } = await supabase.from('daily_roster').delete().eq('id', deleteTarget.id)
    if (error) { setAlert({ msg: error.message, type: 'error' }); setDeleting(false); return }
    if (isApproved) {
      try {
        await supabase.from('audit_log').insert({
          action: 'delete_roster', entity: 'daily_roster', entity_id: deleteTarget.id,
          performed_by: userProfile?.full_name, performed_at: new Date().toISOString(),
          reason: deleteReason, details: `Deleted approved roster for ${deleteTarget.roster_date}`,
        })
      } catch { /* audit_log table may not exist yet */ }
    }
    setDeleting(false)
    setDeleteTarget(null)
    setDeleteReason('')
    setAlert({ msg: 'Roster deleted.', type: 'success' })
    loadRosters()
  }

  const role = userProfile?.role

  if (viewMode === 'create') {
    return <RosterCreateForm pool={pool} roles={roles} userProfile={userProfile} onSave={() => { setViewMode('list'); loadRosters() }} onCancel={() => setViewMode('list')} />
  }
  if (viewMode === 'edit' && editingRoster) {
    return <RosterCreateForm pool={pool} roles={roles} userProfile={userProfile} editRoster={editingRoster} onSave={() => { setEditingRoster(null); setViewMode('list'); loadRosters() }} onCancel={() => { setEditingRoster(null); setViewMode('list') }} />
  }
  if (viewMode === 'detail' && selectedRoster) {
    return <RosterDetail roster={selectedRoster} roles={roles} pool={pool} userProfile={userProfile} onBack={() => { setSelectedRoster(null); setViewMode('list') }} onAction={handleAction} alert={alert} clearAlert={() => setAlert(null)} />
  }
  if (viewMode === 'weekly') {
    return <WeeklySummary rosters={rosters} onBack={() => setViewMode('list')} />
  }

  return (
    <div>
      {deleteTarget && (() => {
        const icoSt = deleteTarget.ico_status || 'draft'
        const mdSt = deleteTarget.md_status || 'pending'
        const isApproved = ['ico_approved', 'md_approved'].includes(icoSt) || mdSt === 'approved'
        return (
          <div style={styles.modal}>
            <div style={{ ...styles.modalBox, maxWidth: '440px' }}>
              <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '10px', color: theme.red }}>Delete Roster</div>
              {isApproved ? (
                <>
                  <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
                    This roster for <strong style={{ color: theme.text }}>{deleteTarget.roster_date}</strong> has been approved by ICO. Enter a reason for deletion:
                  </div>
                  <input style={styles.input} value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Reason for deletion…" autoFocus />
                </>
              ) : (
                <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
                  Delete roster for <strong style={{ color: theme.text }}>{deleteTarget.roster_date}</strong>? This cannot be undone.
                </div>
              )}
              {alert && <div style={{ marginTop: '10px' }}><AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} /></div>}
              <div style={{ ...styles.row, marginTop: '20px', justifyContent: 'flex-end' }}>
                <button style={styles.btn('ghost')} onClick={() => { setDeleteTarget(null); setDeleteReason(''); setAlert(null) }}>Cancel</button>
                <button style={styles.btn('danger')} onClick={handleDeleteConfirm} disabled={deleting}>
                  {deleting ? 'Deleting…' : isApproved ? 'Delete — MD Only' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={styles.row}>
          <button style={styles.tab(true)}>Roster List</button>
          <button style={styles.tab(false)} onClick={() => setViewMode('weekly')}>Weekly Summary</button>
        </div>
        {['production_manager', 'assistant_production_manager', 'hr_officer'].includes(role) && (
          <button style={styles.btn('primary')} onClick={() => setViewMode('create')}>+ Create Roster</button>
        )}
      </div>
      {alert && !deleteTarget && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {loading ? <Spinner /> : (
        <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: theme.surface }}>
              <tr>
                {['Date', 'Workers', 'Total Cost', 'Target Met', 'ICO Status', 'MD Status', 'Payment', 'Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rosters.length === 0 && <tr><td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No rosters yet.</td></tr>}
              {rosters.map(r => {
                const icoSt = r.ico_status || 'draft'
                const mdSt = r.md_status || 'pending'
                const paySt = r.payment_status || 'unpaid'
                const isPaid = paySt === 'paid'
                const isApproved = ['ico_approved', 'md_approved'].includes(icoSt) || mdSt === 'approved'
                const canEdit = !isPaid && (
                  (['production_manager', 'assistant_production_manager'].includes(role) && ['draft', 'submitted'].includes(icoSt)) ||
                  role === 'md'
                )
                const canDelete = !isPaid && (
                  (['production_manager', 'assistant_production_manager'].includes(role) && ['draft', 'submitted'].includes(icoSt)) ||
                  (role === 'md' && (!isApproved || role === 'md'))
                )
                return (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedRoster(r); setViewMode('detail') }}>
                    <td style={styles.td}>{r.roster_date}</td>
                    <td style={styles.td}>{r.worker_count ?? '—'}</td>
                    <td style={styles.td}>{naira(r.total_daily_cost)}</td>
                    <td style={styles.td}><span style={styles.badge(r.target_met ? theme.green : theme.red)}>{r.target_met ? 'Yes' : 'No'}</span></td>
                    <td style={styles.td}><span style={styles.badge(statusColor(icoSt))}>{icoSt.replace('_', ' ')}</span></td>
                    <td style={styles.td}><span style={styles.badge(statusColor(mdSt))}>{mdSt}</span></td>
                    <td style={styles.td}><span style={styles.badge(statusColor(paySt))}>{paySt}</span></td>
                    <td style={styles.td} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <button style={{ ...styles.btn('ghost'), padding: '4px 10px', fontSize: '12px' }} onClick={() => { setSelectedRoster(r); setViewMode('detail') }}>View</button>
                        {canEdit && (
                          <button style={{ ...styles.btn('blue'), padding: '4px 10px', fontSize: '12px' }} onClick={() => { setEditingRoster(r); setViewMode('edit') }}>Edit</button>
                        )}
                        {canDelete && (
                          <button style={{ ...styles.btn('danger'), padding: '4px 10px', fontSize: '12px' }} onClick={() => setDeleteTarget(r)}>Delete</button>
                        )}
                        {isPaid && (
                          <span title="Paid rosters cannot be deleted" style={{ fontSize: '14px', cursor: 'help', alignSelf: 'center' }}>🔒</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RosterCreateForm({ pool, roles, userProfile, editRoster, onSave, onCancel }) {
  const isEdit = !!editRoster
  const [date, setDate] = useState(editRoster?.roster_date || todayStr())
  const [targetMet, setTargetMet] = useState(editRoster?.target_met || false)
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const activePool = pool.filter(w => w.is_active)

  useEffect(() => {
    if (!editRoster) return
    supabase.from('daily_roster_entries').select('*').eq('roster_id', editRoster.id).then(({ data }) => {
      if (data) setEntries(data.map(e => ({
        labour_id: e.labour_id, role_id: e.role_id, base_rate: e.base_rate,
        attendance_type: e.attendance_type || 'full_day',
        manual_amount: e.manual_amount != null ? String(e.manual_amount) : '',
        bonus_applicable: e.bonus_applicable || false,
        bonus_amount: e.bonus_amount || 0,
        bonus_description: e.bonus_description || '',
        advance_amount: e.advance_amount || 0,
        deduction_amount: e.deduction_amount || 0,
        deduction_reason: e.deduction_reason || '',
        net_pay: e.net_pay || e.total_pay || 0,
        notes: e.notes || '',
      })))
    })
  }, [editRoster])

  const addRow = () => setEntries(e => [...e, { labour_id: '', role_id: '', base_rate: 0, attendance_type: 'full_day', manual_amount: '', bonus_applicable: false, bonus_amount: 0, bonus_description: '', advance_amount: 0, deduction_amount: 0, deduction_reason: '', net_pay: 0, notes: '' }])
  const removeRow = (i) => setEntries(e => e.filter((_, j) => j !== i))

  const updateRow = (i, field, value) => {
    setEntries(prev => {
      const next = [...prev]
      const row = { ...next[i], [field]: value }
      if (field === 'labour_id') {
        const worker = pool.find(w => String(w.id) === String(value))
        if (worker?.usual_role_id) {
          row.role_id = worker.usual_role_id
          const role = roles.find(r => r.id === worker.usual_role_id)
          row.base_rate = role?.base_rate || 0
          row.bonus_applicable = targetMet && role?.bonus_type !== 'none' && !!role?.target_bonus
          row.total_pay = Number(row.base_rate) + (row.bonus_applicable ? Number(role?.target_bonus || 0) : 0)
        }
      }
      if (field === 'role_id') {
        const role = roles.find(r => String(r.id) === String(value))
        row.base_rate = role?.base_rate || 0
        row.bonus_applicable = targetMet && role?.bonus_type !== 'none' && !!role?.target_bonus
        row.total_pay = Number(row.base_rate) + (row.bonus_applicable ? Number(role?.target_bonus || 0) : 0)
      }
      if (field === 'bonus_applicable') {
        const role = roles.find(r => String(r.id) === String(row.role_id))
        row.total_pay = Number(row.base_rate) + (value ? Number(role?.target_bonus || 0) : 0)
      }
      // recompute net pay
      let baseForNet = Number(row.base_rate) || 0
      if (row.attendance_type === 'half_day') baseForNet = baseForNet / 2
      if (row.attendance_type === 'absent') baseForNet = 0
      if (row.manual_amount !== '' && row.manual_amount != null && row.manual_amount !== undefined) baseForNet = Number(row.manual_amount) || 0
      row.net_pay = baseForNet + (Number(row.bonus_amount) || 0) - (Number(row.advance_amount) || 0) - (Number(row.deduction_amount) || 0)
      next[i] = row
      return next
    })
  }

  // Re-calc bonus when target_met changes
  useEffect(() => {
    setEntries(prev => prev.map(row => {
      const role = roles.find(r => String(r.id) === String(row.role_id))
      const ba = targetMet && role?.bonus_type !== 'none' && !!role?.target_bonus
      const total = Number(row.base_rate) + (ba ? Number(role?.target_bonus || 0) : 0)
      return { ...row, bonus_applicable: ba, total_pay: total }
    }))
  }, [targetMet, roles])

  const grandTotal = entries.reduce((s, e) => {
    let base = Number(e.base_rate) || 0
    if (e.attendance_type === 'half_day') base = base / 2
    if (e.attendance_type === 'absent') base = 0
    if (e.manual_amount !== '' && e.manual_amount != null) base = Number(e.manual_amount) || 0
    return s + base + (Number(e.bonus_amount) || 0) - (Number(e.advance_amount) || 0) - (Number(e.deduction_amount) || 0)
  }, 0)

  const totalGross = entries.reduce((s, e) => {
    if (e.attendance_type === 'absent') return s
    const base = e.manual_amount !== '' && e.manual_amount != null ? Number(e.manual_amount) || 0 : (e.attendance_type === 'half_day' ? (Number(e.base_rate) || 0) / 2 : Number(e.base_rate) || 0)
    return s + base
  }, 0)
  const totalBonuses = entries.reduce((s, e) => s + (Number(e.bonus_amount) || 0), 0)
  const totalAdvances = entries.reduce((s, e) => s + (Number(e.advance_amount) || 0), 0)
  const totalDeductions = entries.reduce((s, e) => s + (Number(e.deduction_amount) || 0), 0)
  const deferred = entries.reduce((s, e) => {
    const worker = pool.find(w => String(w.id) === String(e.labour_id))
    if (worker?.category !== 'monthly_fixed') return s
    const base = e.manual_amount !== '' && e.manual_amount != null ? Number(e.manual_amount) || 0 : (e.attendance_type === 'absent' ? 0 : e.attendance_type === 'half_day' ? (Number(e.base_rate) || 0) / 2 : Number(e.base_rate) || 0)
    return s + base + (Number(e.bonus_amount) || 0) - (Number(e.advance_amount) || 0) - (Number(e.deduction_amount) || 0)
  }, 0)
  const toBePaidThisWeek = grandTotal - deferred

  const handleSave = async (submit = false) => {
    if (!date) return setErr('Date is required.')
    if (entries.length === 0) return setErr('Add at least one worker.')
    for (const e of entries) {
      if (!e.labour_id || !e.role_id) return setErr('All rows must have a worker and role selected.')
    }
    setSaving(true); setErr('')
    const weekEnding = getSaturday(date)
    const entryRows = (rosterId) => entries.map(e => ({
      roster_id: rosterId, labour_id: e.labour_id, role_id: e.role_id,
      base_rate: e.base_rate,
      attendance_type: e.attendance_type || 'full_day',
      manual_amount: e.manual_amount !== '' ? Number(e.manual_amount) : null,
      target_bonus: (() => { const r = roles.find(x => String(x.id) === String(e.role_id)); return r?.target_bonus || 0 })(),
      bonus_applicable: e.bonus_applicable, bonus_amount: Number(e.bonus_amount) || 0,
      bonus_description: e.bonus_description || null,
      advance_amount: Number(e.advance_amount) || 0,
      deduction_amount: Number(e.deduction_amount) || 0,
      deduction_reason: e.deduction_reason || null,
      net_pay: (() => {
        let base = Number(e.base_rate) || 0
        if (e.attendance_type === 'half_day') base = base / 2
        if (e.attendance_type === 'absent') base = 0
        if (e.manual_amount !== '' && e.manual_amount != null) base = Number(e.manual_amount) || 0
        return base + (Number(e.bonus_amount) || 0) - (Number(e.advance_amount) || 0) - (Number(e.deduction_amount) || 0)
      })(),
      total_pay: Number(e.total_pay || e.net_pay || 0), notes: e.notes,
    }))

    if (isEdit) {
      const wasSubmitted = editRoster.ico_status === 'submitted'
      const { error: re } = await supabase.from('daily_roster').update({
        roster_date: date, target_met: targetMet, total_daily_cost: grandTotal,
        payment_week_ending: weekEnding, worker_count: entries.length,
        ico_status: submit ? 'submitted' : wasSubmitted ? 'draft' : (editRoster.ico_status || 'draft'),
        submitted_by: submit ? userProfile?.full_name : editRoster.submitted_by,
        submitted_date: submit ? todayStr() : editRoster.submitted_date,
      }).eq('id', editRoster.id)
      if (re) { setSaving(false); return setErr(re.message) }
      await supabase.from('daily_roster_entries').delete().eq('roster_id', editRoster.id)
      const { error: ee } = await supabase.from('daily_roster_entries').insert(entryRows(editRoster.id))
      setSaving(false)
      if (ee) setErr(ee.message)
      else onSave()
    } else {
      const { data: roster, error: re } = await supabase.from('daily_roster').insert({
        roster_date: date, target_met: targetMet, total_daily_cost: grandTotal,
        submitted_by: userProfile?.full_name, submitted_date: submit ? todayStr() : null,
        ico_status: submit ? 'submitted' : 'draft', md_status: 'pending',
        payment_week_ending: weekEnding, payment_status: 'unpaid', worker_count: entries.length,
      }).select('id').single()
      if (re) { setSaving(false); return setErr(re.message) }
      const { error: ee } = await supabase.from('daily_roster_entries').insert(entryRows(roster.id))
      setSaving(false)
      if (ee) setErr(ee.message)
      else onSave()
    }
  }

  return (
    <div style={styles.card}>
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '18px' }}>
        <h3 style={{ margin: 0 }}>{isEdit ? `Edit Roster — ${editRoster.roster_date}` : 'Create Daily Roster'}</h3>
        <button style={styles.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
      {err && <AlertBar msg={err} type="error" onClose={() => setErr('')} />}
      <div style={{ ...styles.row, gap: '20px', marginBottom: '18px', alignItems: 'center' }}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Roster Date</label>
          <input type="date" style={styles.input} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
          <input type="checkbox" id="targetMet" checked={targetMet} onChange={e => setTargetMet(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <label htmlFor="targetMet" style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>Production target met today?</label>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: theme.surface }}>
            <tr>
              {['Worker', 'Role', 'Attendance', 'Rate', 'Bonus (₦)', 'Advance (₦)', 'Deduction (₦)', 'Net Pay', 'Notes', ''].map(h => <th key={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {entries.map((row, i) => {
              const selectedRole = roles.find(r => String(r.id) === String(row.role_id))
              const baseForDisplay = row.attendance_type === 'absent' ? 0 : row.attendance_type === 'half_day' ? (Number(row.base_rate) || 0) / 2 : (Number(row.base_rate) || 0)
              const netPay = (() => {
                let base = row.manual_amount !== '' && row.manual_amount != null ? Number(row.manual_amount) || 0 : baseForDisplay
                return base + (Number(row.bonus_amount) || 0) - (Number(row.advance_amount) || 0) - (Number(row.deduction_amount) || 0)
              })()
              return (
                <tr key={i} style={{ background: row.attendance_type === 'absent' ? theme.red + '08' : 'transparent' }}>
                  <td style={styles.td}>
                    <select style={{ ...styles.input, width: '160px' }} value={row.labour_id} onChange={e => updateRow(i, 'labour_id', e.target.value)}>
                      <option value="">— Select —</option>
                      {activePool.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <select style={{ ...styles.input, width: '140px' }} value={row.role_id} onChange={e => updateRow(i, 'role_id', e.target.value)}>
                      <option value="">— Select —</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['full_day', 'half_day', 'absent'].map(at => (
                        <button key={at} type="button" onClick={() => updateRow(i, 'attendance_type', at)} style={{ padding: '4px 8px', fontSize: '11px', fontWeight: row.attendance_type === at ? '700' : '400', borderRadius: '5px', border: `1px solid ${row.attendance_type === at ? (at === 'absent' ? theme.red : at === 'half_day' ? theme.accent : theme.green) : theme.border}`, background: row.attendance_type === at ? (at === 'absent' ? theme.red + '22' : at === 'half_day' ? theme.accent + '22' : theme.green + '22') : theme.surface, color: row.attendance_type === at ? (at === 'absent' ? theme.red : at === 'half_day' ? theme.accent : theme.green) : theme.textMuted, cursor: 'pointer' }}>
                          {at === 'full_day' ? 'Full' : at === 'half_day' ? 'Half' : 'Absent'}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>{naira(baseForDisplay)}</div>
                    <input style={{ ...styles.input, width: '90px', marginTop: '4px', fontSize: '12px' }} placeholder="Override ₦" value={row.manual_amount} onChange={e => updateRow(i, 'manual_amount', e.target.value)} />
                  </td>
                  <td style={{ ...styles.td, color: theme.textMuted, fontSize: '12px' }}>{naira(baseForDisplay)}</td>
                  <td style={styles.td}>
                    <input style={{ ...styles.input, width: '80px', fontSize: '12px' }} placeholder="₦0" value={row.bonus_amount || ''} onChange={e => updateRow(i, 'bonus_amount', e.target.value)} />
                    <input style={{ ...styles.input, width: '100px', marginTop: '3px', fontSize: '11px' }} placeholder="Description" value={row.bonus_description} onChange={e => updateRow(i, 'bonus_description', e.target.value)} />
                  </td>
                  <td style={styles.td}>
                    <input style={{ ...styles.input, width: '80px', fontSize: '12px', color: theme.red }} placeholder="₦0" value={row.advance_amount || ''} onChange={e => updateRow(i, 'advance_amount', e.target.value)} />
                  </td>
                  <td style={styles.td}>
                    <input style={{ ...styles.input, width: '80px', fontSize: '12px', color: theme.red }} placeholder="₦0" value={row.deduction_amount || ''} onChange={e => updateRow(i, 'deduction_amount', e.target.value)} />
                    <input style={{ ...styles.input, width: '100px', marginTop: '3px', fontSize: '11px' }} placeholder="Reason" value={row.deduction_reason} onChange={e => updateRow(i, 'deduction_reason', e.target.value)} />
                  </td>
                  <td style={styles.td}><strong style={{ color: theme.green }}>{naira(netPay)}</strong></td>
                  <td style={styles.td}><input style={{ ...styles.input, width: '100px' }} value={row.notes} onChange={e => updateRow(i, 'notes', e.target.value)} /></td>
                  <td style={styles.td}><button style={{ ...styles.btn('danger'), padding: '4px 8px' }} onClick={() => removeRow(i)}>×</button></td>
                </tr>
              )
            })}
            {entries.length === 0 && <tr><td colSpan={10} style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No workers added yet.</td></tr>}
          </tbody>
          <tfoot>
            <tr style={{ background: theme.surface }}>
              <td colSpan={7} style={{ ...styles.td, fontWeight: '700', textAlign: 'right' }}>Grand Total (Net Pay)</td>
              <td style={{ ...styles.td, fontWeight: '700', color: theme.accent }}>{naira(grandTotal)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {entries.length > 0 && (
        <div style={{ marginTop: '16px', background: theme.surface, borderRadius: '10px', padding: '16px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Weekly Pay Summary</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[
              { label: 'Total Gross Pay', value: naira(totalGross), color: theme.text },
              { label: 'Bonuses', value: naira(totalBonuses), color: theme.green },
              { label: 'Advances', value: naira(totalAdvances), color: theme.red },
              { label: 'Deductions', value: naira(totalDeductions), color: theme.red },
              { label: 'Deferred (Monthly Fixed)', value: naira(deferred), color: theme.textMuted },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: '1', minWidth: '130px', background: theme.card, borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: theme.textMuted, fontWeight: '600', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color }}>{value}</div>
              </div>
            ))}
            <div style={{ flex: '1', minWidth: '160px', background: theme.accent + '18', border: `1px solid ${theme.accent}55`, borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', color: theme.accent, fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>TO BE PAID THIS WEEK</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: theme.accent }}>{naira(toBePaidThisWeek)}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...styles.row, marginTop: '14px', justifyContent: 'space-between' }}>
        <button style={{ ...styles.btn('ghost'), border: `1px dashed ${theme.border}` }} onClick={addRow}>+ Add Worker Row</button>
        <div style={styles.row}>
          <button style={styles.btn('ghost')} onClick={() => handleSave(false)} disabled={saving}>{isEdit ? 'Save Changes (Draft)' : 'Save as Draft'}</button>
          <button style={styles.btn('primary')} onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save & Re-submit' : 'Submit for ICO Review'}</button>
        </div>
      </div>
    </div>
  )
}

function RosterDetail({ roster, roles, pool, userProfile, onBack, onAction, alert, clearAlert }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    supabase.from('daily_roster_entries').select('*').eq('roster_id', roster.id).then(({ data }) => {
      setEntries(data || [])
      setLoading(false)
    })
  }, [roster.id])

  const doAction = async (action) => {
    setActioning(true)
    await onAction(roster, action, comment)
    setActioning(false)
    setComment('')
  }

  const role = userProfile?.role
  const icoStatus = roster.ico_status || 'draft'
  const mdStatus = roster.md_status || 'pending'
  const payStatus = roster.payment_status || 'unpaid'

  return (
    <div>
      <button style={{ ...styles.btn('ghost'), marginBottom: '16px' }} onClick={onBack}>← Back to List</button>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={clearAlert} />}

      <div style={{ ...styles.row, gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={styles.card}>
          <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Date</div>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{roster.roster_date}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Total Cost</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: theme.accent }}>{naira(roster.total_daily_cost)}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Target Met</div>
          <span style={styles.badge(roster.target_met ? theme.green : theme.red)}>{roster.target_met ? 'YES' : 'NO'}</span>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>ICO Status</div>
          <span style={styles.badge(statusColor(icoStatus))}>{icoStatus.replace('_', ' ')}</span>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>MD Status</div>
          <span style={styles.badge(statusColor(mdStatus))}>{mdStatus}</span>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Payment</div>
          <span style={styles.badge(statusColor(payStatus))}>{payStatus}</span>
          {payStatus === 'paid' && roster.payment_date && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>{fmtDate(roster.payment_date)}</div>}
        </div>
      </div>

      {/* Approval Journey */}
      {(() => {
        const steps = [
          { label: 'Production', sub: icoStatus === 'draft' ? 'Draft' : 'Created', done: true, current: icoStatus === 'draft', rejected: false },
          { label: 'ICO Review', sub: icoStatus === 'submitted' ? 'Awaiting' : icoStatus === 'ico_approved' ? 'Approved' : icoStatus === 'ico_rejected' ? 'Rejected' : 'Pending', done: icoStatus === 'ico_approved', current: icoStatus === 'submitted', rejected: icoStatus === 'ico_rejected' },
          { label: 'MD Approval', sub: mdStatus === 'pending' ? 'Awaiting' : mdStatus === 'approved' ? 'Approved' : mdStatus === 'rejected' ? 'Rejected' : 'Pending', done: mdStatus === 'approved', current: icoStatus === 'ico_approved' && mdStatus !== 'approved' && mdStatus !== 'rejected', rejected: mdStatus === 'rejected' },
          { label: 'Accountant', sub: payStatus === 'paid' ? 'Done' : mdStatus === 'approved' ? 'Awaiting' : 'Pending', done: payStatus === 'paid', current: mdStatus === 'approved' && payStatus !== 'paid', rejected: false },
          { label: 'Paid', sub: payStatus === 'paid' ? '✓' : '', done: payStatus === 'paid', current: false, rejected: false },
        ]
        return (
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '14px', letterSpacing: '0.06em' }}>Approval Journey</div>
            <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto' }}>
              {steps.map((step, i) => {
                const color = step.rejected ? theme.red : step.done ? theme.green : step.current ? theme.blue : theme.textMuted
                return (
                  <React.Fragment key={step.label}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '72px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: color + '20', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color, fontWeight: '700' }}>
                        {step.rejected ? '✕' : step.done ? '✓' : String(i + 1)}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color, marginTop: '5px', textAlign: 'center', lineHeight: 1.3 }}>{step.label}</div>
                      <div style={{ fontSize: '9px', color: theme.textMuted, textAlign: 'center', marginTop: '2px' }}>{step.sub}</div>
                    </div>
                    {i < steps.length - 1 && (
                      <div style={{ flex: 1, height: '2px', background: steps[i + 1].done || steps[i + 1].current ? color : theme.border, minWidth: '16px', margin: '0 2px', marginBottom: '18px' }} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )
      })()}

      {loading ? <Spinner /> : (
        <div style={{ ...styles.card, padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: theme.surface }}>
              <tr>{['Worker', 'Role', 'Base Rate', 'Bonus', 'Bonus Applicable', 'Total Pay', 'Notes'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const worker = pool.find(w => w.id === e.labour_id)
                const r = roles.find(x => x.id === e.role_id)
                return (
                  <tr key={e.id}>
                    <td style={styles.td}>{worker?.full_name || '—'}</td>
                    <td style={styles.td}>{r?.role_name || '—'}</td>
                    <td style={styles.td}>{naira(e.base_rate)}</td>
                    <td style={styles.td}>{naira(e.target_bonus)}</td>
                    <td style={styles.td}><span style={styles.badge(e.bonus_applicable ? theme.green : theme.textMuted)}>{e.bonus_applicable ? 'Yes' : 'No'}</span></td>
                    <td style={{ ...styles.td, fontWeight: '700', color: theme.accent }}>{naira(e.total_pay)}</td>
                    <td style={styles.td}>{e.notes || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.card}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>Actions</div>
        {(role === 'ico' || role === 'md') && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Comment</label>
            <input style={styles.input} value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional rejection reason…" />
          </div>
        )}
        <div style={styles.row}>
          {['production_manager', 'assistant_production_manager'].includes(role) && icoStatus === 'draft' && (
            <button style={styles.btn('primary')} onClick={() => doAction('submit')} disabled={actioning}>Submit for ICO Review</button>
          )}
          {role === 'ico' && icoStatus === 'submitted' && (
            <>
              <button data-ico-allow style={styles.btn('success')} onClick={() => doAction('ico_approve')} disabled={actioning}>Approve</button>
              <button data-ico-allow style={styles.btn('danger')} onClick={() => doAction('ico_reject')} disabled={actioning}>Reject</button>
            </>
          )}
          {role === 'md' && icoStatus === 'ico_approved' && mdStatus !== 'approved' && (
            <>
              <button style={styles.btn('success')} onClick={() => doAction('md_approve')} disabled={actioning}>MD Approve</button>
              <button style={styles.btn('danger')} onClick={() => doAction('md_reject')} disabled={actioning}>MD Reject</button>
            </>
          )}
          {role === 'accountant' && mdStatus === 'approved' && payStatus !== 'paid' && (
            <button style={styles.btn('success')} onClick={() => doAction('mark_paid')} disabled={actioning}>Mark as Paid</button>
          )}
        </div>
      </div>
    </div>
  )
}

function WeeklySummary({ rosters, onBack }) {
  const groups = {}
  rosters.forEach(r => {
    const key = r.payment_week_ending || 'Unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  })

  return (
    <div>
      <button style={{ ...styles.btn('ghost'), marginBottom: '16px' }} onClick={onBack}>← Back to List</button>
      <h3 style={{ color: theme.text, marginBottom: '16px' }}>Weekly Summary</h3>
      {Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([week, weekRosters]) => {
        const weekTotal = weekRosters.reduce((s, r) => s + Number(r.total_daily_cost || 0), 0)
        const targetDays = weekRosters.filter(r => r.target_met).length
        return (
          <div key={week} style={styles.card}>
            <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '15px' }}>Week ending {week}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>{weekRosters.length} days · {targetDays} target-met days</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: '700', fontSize: '18px', color: theme.accent }}>{naira(weekTotal)}</div>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Date', 'Workers', 'Daily Total', 'Target Met', 'Status'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {weekRosters.map(r => (
                  <tr key={r.id} style={{ background: r.target_met ? theme.green + '08' : 'transparent' }}>
                    <td style={styles.td}>{r.roster_date}</td>
                    <td style={styles.td}>{r.worker_count || '—'}</td>
                    <td style={{ ...styles.td, color: theme.accent, fontWeight: '600' }}>{naira(r.total_daily_cost)}</td>
                    <td style={styles.td}><span style={styles.badge(r.target_met ? theme.green : theme.textMuted)}>{r.target_met ? 'Yes' : 'No'}</span></td>
                    <td style={styles.td}><span style={styles.badge(statusColor(r.ico_status))}>{r.ico_status || 'draft'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ── TRUCK LOADING TAB ────────────────────────────────────────────────────────
function TruckLoadingTab({ pool, userProfile }) {
  const [subTab, setSubTab] = useState('assignments')
  const [vehicles, setVehicles] = useState([])
  const [assignments, setAssignments] = useState([])
  const [logs, setLogs] = useState([])
  const [waybills, setWaybills] = useState([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [showLogForm, setShowLogForm] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [vRes, aRes, lRes, wRes] = await Promise.all([
      supabase.from('vehicles').select('id, vehicle_number, vehicle_name').order('vehicle_number'),
      supabase.from('truck_loader_assignments').select('*, labour:labour_pool(id, full_name, labour_number)').eq('is_active', true),
      supabase.from('truck_loading_log').select('*, loaders:truck_loading_loaders(labour_id, labour:labour_pool(full_name))').order('created_at', { ascending: false }),
      supabase.from('waybills').select('id, waybill_number, waybill_date, quantity_loaded, block_type, receiver_name').order('waybill_date', { ascending: false }).limit(100),
    ])
    setVehicles(vRes.data || [])
    setAssignments(aRes.data || [])
    setLogs(lRes.data || [])
    setWaybills(wRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleRemoveAssignment = async (id) => {
    const { error } = await supabase.from('truck_loader_assignments').update({ is_active: false, removed_date: todayStr() }).eq('id', id)
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: 'Assignment removed.', type: 'success' }); loadData() }
  }

  return (
    <div>
      <div style={{ ...styles.row, gap: '4px', marginBottom: '16px' }}>
        {['assignments', 'loading_log', 'weekly_summary'].map(t => (
          <button key={t} style={styles.tab(subTab === t)} onClick={() => setSubTab(t)}>
            {t === 'assignments' ? 'Assignments' : t === 'loading_log' ? 'Loading Log' : 'Weekly Summary'}
          </button>
        ))}
      </div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      {loading ? <Spinner /> : (
        <>
          {subTab === 'assignments' && (
            <div>
              {userProfile?.role !== 'ico' && (
                <div style={{ textAlign: 'right', marginBottom: '14px' }}>
                  <button style={styles.btn('primary')} onClick={() => setShowAssignForm(true)}>+ Assign Loader</button>
                </div>
              )}
              {showAssignForm && (
                <AssignLoaderForm vehicles={vehicles} pool={pool} onSave={() => { setShowAssignForm(false); loadData() }} onCancel={() => setShowAssignForm(false)} />
              )}
              {vehicles.map(v => {
                const va = assignments.filter(a => a.vehicle_id === v.id)
                if (va.length === 0) return null
                return (
                  <div key={v.id} style={styles.card}>
                    <div style={{ fontWeight: '700', marginBottom: '10px', color: theme.blue }}>{v.vehicle_number} — {v.vehicle_name}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['Labour No', 'Name', 'Assigned Date', ''].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {va.map(a => (
                          <tr key={a.id}>
                            <td style={styles.td}><span style={{ fontFamily: 'monospace', color: theme.blue }}>{a.labour?.labour_number}</span></td>
                            <td style={styles.td}>{a.labour?.full_name}</td>
                            <td style={styles.td}>{a.assigned_date}</td>
                            <td style={styles.td}>{userProfile?.role !== 'ico' && <button style={{ ...styles.btn('danger'), padding: '4px 10px', fontSize: '12px' }} onClick={() => handleRemoveAssignment(a.id)}>Remove</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}

          {subTab === 'loading_log' && (
            <div>
              {userProfile?.role !== 'ico' && (
                <div style={{ textAlign: 'right', marginBottom: '14px' }}>
                  <button style={styles.btn('primary')} onClick={() => setShowLogForm(true)}>+ Record Loading</button>
                </div>
              )}
              {showLogForm && (
                <LoadingLogForm waybills={waybills} pool={pool} userProfile={userProfile} onSave={() => { setShowLogForm(false); loadData() }} onCancel={() => setShowLogForm(false)} />
              )}
              <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: theme.surface }}>
                    <tr>{['Waybill No', 'Blocks Loaded', 'Rate/Block', 'Total', 'Loaders', 'Split Each', 'Week Ending', 'Status'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && <tr><td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No loading logs.</td></tr>}
                    {logs.map(l => {
                      const loaderNames = (l.loaders || []).map(x => x.labour?.full_name).filter(Boolean).join(', ')
                      return (
                        <tr key={l.id}>
                          <td style={styles.td}>{l.waybill_id || '—'}</td>
                          <td style={styles.td}>{l.blocks_loaded}</td>
                          <td style={styles.td}>{naira(l.rate_per_block)}</td>
                          <td style={{ ...styles.td, color: theme.accent, fontWeight: '600' }}>{naira(l.total_amount)}</td>
                          <td style={styles.td}>{loaderNames || '—'}</td>
                          <td style={styles.td}>{naira(l.split_per_loader)}</td>
                          <td style={styles.td}>{l.payment_week_ending || '—'}</td>
                          <td style={styles.td}><span style={styles.badge(statusColor(l.payment_status))}>{l.payment_status || 'unpaid'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {subTab === 'weekly_summary' && (
            <LoadingWeeklySummary logs={logs} pool={pool} userProfile={userProfile} onRefresh={loadData} />
          )}
        </>
      )}
    </div>
  )
}

function AssignLoaderForm({ vehicles, pool, onSave, onCancel }) {
  const [vehicleId, setVehicleId] = useState('')
  const [labourId, setLabourId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const activePool = pool.filter(w => w.is_active)

  const handleSave = async () => {
    if (!vehicleId || !labourId) return setErr('Vehicle and worker are required.')
    setSaving(true)
    const { error } = await supabase.from('truck_loader_assignments').insert({ vehicle_id: vehicleId, labour_id: labourId, assigned_date: todayStr(), is_active: true })
    setSaving(false)
    if (error) setErr(error.message)
    else onSave()
  }

  return (
    <div style={{ ...styles.card, marginBottom: '16px' }}>
      {err && <AlertBar msg={err} type="error" onClose={() => setErr('')} />}
      <div style={styles.grid2}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Vehicle</label>
          <select style={styles.input} value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
            <option value="">— Select Vehicle —</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number} — {v.vehicle_name}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Worker</label>
          <select style={styles.input} value={labourId} onChange={e => setLabourId(e.target.value)}>
            <option value="">— Select Worker —</option>
            {activePool.map(w => <option key={w.id} value={w.id}>{w.full_name} ({w.labour_number})</option>)}
          </select>
        </div>
      </div>
      <div style={styles.row}>
        <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Assign'}</button>
        <button style={styles.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function LoadingLogForm({ waybills, pool, userProfile, onSave, onCancel }) {
  const [waybillId, setWaybillId] = useState('')
  const [blocksLoaded, setBlocksLoaded] = useState('')
  const [ratePerBlock] = useState(8)
  const [selectedLoaders, setSelectedLoaders] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const activePool = pool.filter(w => w.is_active)

  const selectedWaybill = waybills.find(w => String(w.id) === String(waybillId))

  const handleWaybillSelect = (id) => {
    setWaybillId(id)
    const w = waybills.find(x => String(x.id) === String(id))
    if (w?.quantity_loaded) setBlocksLoaded(String(w.quantity_loaded))
  }
  const total = Number(blocksLoaded || 0) * ratePerBlock
  const split = selectedLoaders.length > 0 ? total / selectedLoaders.length : 0

  const toggleLoader = (id) => {
    setSelectedLoaders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSave = async () => {
    if (!waybillId || !blocksLoaded) return setErr('Waybill and blocks loaded are required.')
    if (selectedLoaders.length === 0) return setErr('Select at least one loader.')
    setSaving(true)
    const weekEnding = getSaturday(selectedWaybill?.waybill_date || todayStr())
    const { data: log, error: le } = await supabase.from('truck_loading_log').insert({
      waybill_id: waybillId, blocks_loaded: Number(blocksLoaded), rate_per_block: ratePerBlock,
      total_amount: total, split_per_loader: split, payment_week_ending: weekEnding,
      payment_status: 'unpaid', submitted_by: userProfile?.full_name,
    }).select('id').single()
    if (le) { setSaving(false); return setErr(le.message) }
    const loaderRows = selectedLoaders.map(lid => ({ loading_log_id: log.id, labour_id: lid }))
    const { error: le2 } = await supabase.from('truck_loading_loaders').insert(loaderRows)
    setSaving(false)
    if (le2) setErr(le2.message)
    else onSave()
  }

  return (
    <div style={{ ...styles.card, marginBottom: '16px' }}>
      <h4 style={{ margin: '0 0 14px' }}>Record Loading</h4>
      {err && <AlertBar msg={err} type="error" onClose={() => setErr('')} />}
      <div style={styles.grid2}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Waybill</label>
          <select style={styles.input} value={waybillId} onChange={e => handleWaybillSelect(e.target.value)}>
            <option value="">— Select Waybill —</option>
            {waybills.map(w => (
              <option key={w.id} value={w.id}>
                {w.waybill_number} — {w.receiver_name || '—'} — {w.quantity_loaded || 0} blocks — {fmtDate(w.waybill_date)}
              </option>
            ))}
          </select>
          {selectedWaybill && (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
              {selectedWaybill.block_type} · {selectedWaybill.receiver_name || 'No customer'}
            </div>
          )}
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Blocks Loaded</label>
          <input type="number" style={styles.input} value={blocksLoaded} onChange={e => setBlocksLoaded(e.target.value)} placeholder={selectedWaybill?.quantity_loaded ? `Waybill qty: ${selectedWaybill.quantity_loaded}` : 'Enter quantity'} />
        </div>
      </div>
      <div style={{ ...styles.row, gap: '20px', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px' }}>Rate: <strong style={{ color: theme.accent }}>{naira(ratePerBlock)}/block</strong></div>
        <div style={{ fontSize: '13px' }}>Total: <strong style={{ color: theme.accent }}>{naira(total)}</strong></div>
        <div style={{ fontSize: '13px' }}>Split ({selectedLoaders.length} loaders): <strong style={{ color: theme.green }}>{naira(split)}</strong> each</div>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Select Loaders (multi-select)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {activePool.map(w => (
            <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: '5px 10px', borderRadius: '6px', background: selectedLoaders.includes(w.id) ? theme.blue + '22' : theme.surface, border: `1px solid ${selectedLoaders.includes(w.id) ? theme.blue : theme.border}`, fontSize: '13px' }}>
              <input type="checkbox" checked={selectedLoaders.includes(w.id)} onChange={() => toggleLoader(w.id)} />
              {w.full_name}
            </label>
          ))}
        </div>
      </div>
      <div style={styles.row}>
        <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Record Loading'}</button>
        <button style={styles.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function LoadingWeeklySummary({ logs, pool, userProfile, onRefresh }) {
  const [alert, setAlert] = useState(null)
  const [filter, setFilter] = useState('all_unpaid')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [existingPayrolls, setExistingPayrolls] = useState({})

  useEffect(() => {
    const weeks = [...new Set(logs.map(l => l.payment_week_ending).filter(Boolean))]
    if (weeks.length === 0) { setExistingPayrolls({}); return }
    supabase.from('weekly_labour_payroll')
      .select('week_ending, status, id')
      .eq('payroll_type', 'loading')
      .in('week_ending', weeks)
      .then(({ data, error }) => {
        if (error) return
        const map = {}
        ;(data || []).forEach(p => { map[p.week_ending] = p })
        setExistingPayrolls(map)
      })
  }, [logs])

  const todaySat = getSaturday(todayStr())
  const lastSat = (() => {
    const d = new Date(todaySat)
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })()

  const filteredLogs = logs.filter(l => {
    const week = l.payment_week_ending || ''
    if (filter === 'all_unpaid') return l.payment_status === 'unpaid'
    if (filter === 'this_week') return week === todaySat
    if (filter === 'last_week') return week === lastSat
    if (filter === 'custom') {
      if (customFrom && week < customFrom) return false
      if (customTo && week > customTo) return false
      return true
    }
    return true
  })

  const groups = {}
  filteredLogs.forEach(l => {
    const key = l.payment_week_ending || 'Unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(l)
  })

  const canSubmit = ['production_manager', 'assistant_production_manager', 'hr_officer', 'accountant', 'logistics_manager', 'md'].includes(userProfile?.role)

  const handleSubmitPayment = async (week) => {
    const weekLogs = logs.filter(l => l.payment_week_ending === week && l.payment_status === 'unpaid')
    if (weekLogs.length === 0) return
    const total = weekLogs.reduce((s, l) => s + Number(l.total_amount || 0), 0)
    const { data: inserted, error } = await supabase.from('weekly_labour_payroll').insert({
      week_ending: week, payroll_type: 'loading', total_amount: total,
      worker_count: weekLogs.length, status: 'draft', prepared_by: userProfile?.full_name,
    }).select('week_ending, status, id').single()
    if (error) setAlert({ msg: error.message, type: 'error' })
    else if (inserted) {
      setExistingPayrolls(prev => ({ ...prev, [week]: inserted }))
      setAlert({ msg: 'Loading payroll submitted for approval.', type: 'success' })
      if (onRefresh) onRefresh()
    }
  }

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}
      <div style={{ ...styles.row, marginBottom: '16px', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'all_unpaid', label: 'All Unpaid' },
          { id: 'this_week', label: 'This Week' },
          { id: 'last_week', label: 'Last Week' },
          { id: 'custom', label: 'Custom Range' },
        ].map(f => (
          <button key={f.id} style={styles.tab(filter === f.id)} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
        {filter === 'custom' && (
          <>
            <input type="date" style={{ ...styles.input, width: '140px' }} value={customFrom} onChange={e => setCustomFrom(e.target.value)} placeholder="From" />
            <input type="date" style={{ ...styles.input, width: '140px' }} value={customTo} onChange={e => setCustomTo(e.target.value)} placeholder="To" />
          </>
        )}
      </div>
      {Object.keys(groups).length === 0 && (
        <div style={{ ...styles.card, textAlign: 'center', color: theme.textMuted }}>No loading records match this filter.</div>
      )}
      {Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([week, weekLogs]) => {
        const loaderTotals = {}
        weekLogs.forEach(l => {
          const loaderCount = l.loaders?.length || 1
          const split = Number(l.total_amount || 0) / loaderCount
          ;(l.loaders || []).forEach(x => {
            const lid = x.labour_id
            const worker = pool.find(w => w.id === lid)
            if (!loaderTotals[lid]) loaderTotals[lid] = { name: worker?.full_name || '?', bank: worker?.bank_name || '—', account: worker?.account_number || '—', blocks: 0, earned: 0 }
            loaderTotals[lid].blocks += Number(l.blocks_loaded || 0) / loaderCount
            loaderTotals[lid].earned += split
          })
        })
        const weekTotal = weekLogs.reduce((s, l) => s + Number(l.total_amount || 0), 0)
        const unpaid = weekLogs.some(l => l.payment_status === 'unpaid')

        return (
          <div key={week} style={styles.card}>
            <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '15px' }}>Week ending {week}</div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>{weekLogs.length} trips</div>
              </div>
              <div style={{ ...styles.row, gap: '12px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '700', fontSize: '18px', color: theme.accent }}>{naira(weekTotal)}</div>
                </div>
                {existingPayrolls[week] ? (
                  <span style={styles.badge(statusColor(existingPayrolls[week].status))}>{existingPayrolls[week].status}</span>
                ) : (
                  unpaid && canSubmit && (
                    <button style={styles.btn('primary')} onClick={() => handleSubmitPayment(week)}>Submit for Approval</button>
                  )
                )}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Loader Name', 'Bank', 'Account No.', 'Total Blocks', 'Total Earned'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {Object.values(loaderTotals).map((lt, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{lt.name}</td>
                    <td style={styles.td}>{lt.bank}</td>
                    <td style={styles.td}>{lt.account}</td>
                    <td style={styles.td}>{Math.round(lt.blocks)}</td>
                    <td style={{ ...styles.td, color: theme.accent, fontWeight: '600' }}>{naira(lt.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ── PAYROLL TAB ──────────────────────────────────────────────────────────────
function generatePayrollPDF(payrollType, weekEnding, workers, totalAmount, payroll) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('ABUJA PRECAST CONCRETE LIMITED', 105, 18, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('1, Dutse Alhaji, Behind Tipper Garage, Off Bwari Expressway, Abuja', 105, 25, { align: 'center' })
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`LABOUR PAYROLL — WEEK ENDING ${weekEnding}`, 105, 34, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Type: ${payrollType === 'production' ? 'Production Labour' : 'Loading Labour'}   |   Total Workers: ${workers.length}   |   Total Amount: ₦${Math.round(totalAmount).toLocaleString()}`, 105, 42, { align: 'center' })

  const tableRows = workers.map(w => [
    w.name, w.role || '—', w.days_or_blocks || '—',
    `₦${Math.round(w.base_rate || 0).toLocaleString()}`,
    `₦${Math.round(w.bonus || 0).toLocaleString()}`,
    `₦${Math.round(w.total_pay || 0).toLocaleString()}`,
    w.bank || '—', w.account || '—',
  ])
  tableRows.push(['', '', '', '', 'GRAND TOTAL', `₦${Math.round(totalAmount).toLocaleString()}`, '', ''])

  autoTable(doc, {
    head: [['Name', 'Role', 'Days/Blocks', 'Base Rate', 'Bonus', 'Total Pay', 'Bank', 'Account No']],
    body: tableRows,
    startY: 48,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 35, 60] },
  })

  const finalY = doc.lastAutoTable.finalY + 14
  doc.setFontSize(9)
  doc.text(`Approved by ICO: ___________________________`, 20, finalY)
  doc.text(`Approved by MD: ___________________________`, 120, finalY)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 20, finalY + 10)

  doc.save(`Payroll_${payrollType}_${weekEnding}.pdf`)
}

function WeeklyPayrollTab({ pool, roles, userProfile }) {
  const [subTab, setSubTab] = useState('production')
  const [weekEnding, setWeekEnding] = useState(getSaturday(todayStr()))
  const [rosters, setRosters] = useState([])
  const [loadingLogs, setLoadingLogs] = useState([])
  const [payrollRecords, setPayrollRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [actioning, setActioning] = useState(false)

  const loadWeekData = useCallback(async () => {
    if (!weekEnding) return
    setLoading(true)
    const [rRes, lRes, pRes] = await Promise.all([
      supabase.from('daily_roster').select('*, entries:daily_roster_entries(*)').eq('payment_week_ending', weekEnding),
      supabase.from('truck_loading_log').select('*, loaders:truck_loading_loaders(labour_id)').eq('payment_week_ending', weekEnding),
      supabase.from('weekly_labour_payroll').select('*').eq('week_ending', weekEnding),
    ])
    setRosters(rRes.data || [])
    setLoadingLogs(lRes.data || [])
    setPayrollRecords(pRes.data || [])
    setLoading(false)
  }, [weekEnding])

  useEffect(() => { loadWeekData() }, [loadWeekData])

  // Aggregate production workers from rosters
  const productionWorkers = (() => {
    const map = {}
    rosters.forEach(r => {
      ;(r.entries || []).forEach(e => {
        const worker = pool.find(w => w.id === e.labour_id)
        const role = roles.find(x => x.id === e.role_id)
        if (!map[e.labour_id]) map[e.labour_id] = { id: e.labour_id, name: worker?.full_name || '?', role: role?.role_name || '?', days: 0, base_rate: e.base_rate, bonus: 0, total_pay: 0, bank: worker?.bank_name || '—', account: worker?.bank_account_number || '—' }
        map[e.labour_id].days += 1
        map[e.labour_id].bonus += e.bonus_applicable ? Number(e.target_bonus || 0) : 0
        map[e.labour_id].total_pay += Number(e.total_pay || 0)
      })
    })
    return Object.values(map)
  })()

  // Aggregate loading workers
  const loadingWorkers = (() => {
    const map = {}
    loadingLogs.forEach(l => {
      const loaderCount = l.loaders?.length || 1
      const split = Number(l.total_amount || 0) / loaderCount
      ;(l.loaders || []).forEach(x => {
        const worker = pool.find(w => w.id === x.labour_id)
        if (!map[x.labour_id]) map[x.labour_id] = { id: x.labour_id, name: worker?.full_name || '?', role: 'Truck Loader', days_or_blocks: 0, base_rate: 8, bonus: 0, total_pay: 0, bank: worker?.bank_name || '—', account: worker?.bank_account_number || '—' }
        map[x.labour_id].days_or_blocks += Number(l.blocks_loaded || 0) / loaderCount
        map[x.labour_id].total_pay += split
      })
    })
    return Object.values(map)
  })()

  const prodPayroll = payrollRecords.find(p => p.payroll_type === 'production')
  const loadPayroll = payrollRecords.find(p => p.payroll_type === 'loading')
  const workers = subTab === 'production' ? productionWorkers : loadingWorkers
  const currentPayroll = subTab === 'production' ? prodPayroll : loadPayroll
  const totalAmount = workers.reduce((s, w) => s + Number(w.total_pay || 0), 0)

  const handleGeneratePayroll = async () => {
    if (workers.length === 0) return setAlert({ msg: 'No workers found for this week.', type: 'error' })
    setActioning(true)
    const { error } = await supabase.from('weekly_labour_payroll').insert({
      week_ending: weekEnding, payroll_type: subTab, total_amount: totalAmount,
      worker_count: workers.length, status: 'draft', prepared_by: userProfile?.full_name,
    })
    setActioning(false)
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: 'Payroll generated.', type: 'success' }); loadWeekData() }
  }

  const handlePayrollAction = async (action, comment = '') => {
    if (!currentPayroll) return
    setActioning(true)
    let update = {}
    if (action === 'ico_approve') update = { status: 'ico_approved', ico_approved_by: userProfile?.full_name }
    else if (action === 'md_approve') update = { status: 'md_approved', md_approved_by: userProfile?.full_name }
    else if (action === 'recall') update = { status: 'draft', ico_approved_by: null, md_approved_by: null }
    else if (action === 'mark_paid') {
      update = { status: 'paid', payment_date: todayStr() }
      const catId = await getOrCreateCategory('Labour Wages')
      if (catId) {
        await supabase.from('expenses').insert({
          category_id: catId,
          description: `${subTab === 'production' ? 'Production' : 'Loading'} Labour Payroll — Week ending ${weekEnding}`,
          amount: totalAmount, expense_date: todayStr(), status: 'approved', vendor: 'Labour Pool',
        })
      }
    }
    const { error } = await supabase.from('weekly_labour_payroll').update(update).eq('id', currentPayroll.id)
    setActioning(false)
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: action === 'recall' ? 'Payroll recalled to draft — corrections can now be made.' : 'Updated.', type: 'success' }); loadWeekData() }
  }

  return (
    <div>
      <div style={{ ...styles.row, gap: '4px', marginBottom: '16px' }}>
        {['production', 'loading'].map(t => (
          <button key={t} style={styles.tab(subTab === t)} onClick={() => setSubTab(t)}>
            {t === 'production' ? 'Production Payroll' : 'Loading Payroll'}
          </button>
        ))}
      </div>

      <div style={{ ...styles.row, marginBottom: '16px', gap: '12px' }}>
        <div>
          <label style={styles.label}>Week Ending (Saturday)</label>
          <input type="date" style={styles.input} value={weekEnding} onChange={e => setWeekEnding(getSaturday(e.target.value))} />
        </div>
        <button style={{ ...styles.btn('ghost'), marginTop: '18px' }} onClick={loadWeekData}>Load Week</button>
      </div>

      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {loading ? <Spinner /> : (
        <>
          <div style={{ ...styles.row, gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ ...styles.card, minWidth: '160px', marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Workers</div>
              <div style={{ fontSize: '22px', fontWeight: '700' }}>{workers.length}</div>
            </div>
            <div style={{ ...styles.card, minWidth: '160px', marginBottom: 0 }}>
              <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Total Amount</div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: theme.accent }}>{naira(totalAmount)}</div>
            </div>
            {currentPayroll && (
              <div style={{ ...styles.card, minWidth: '160px', marginBottom: 0 }}>
                <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' }}>Payroll Status</div>
                <span style={styles.badge(statusColor(currentPayroll.status))}>{currentPayroll.status}</span>
              </div>
            )}
          </div>

          <div style={{ ...styles.card, padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: theme.surface }}>
                <tr>{['Name', 'Role', subTab === 'production' ? 'Days' : 'Blocks', 'Base Rate', 'Bonus', 'Total Pay', 'Bank', 'Account'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {workers.length === 0 && <tr><td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No workers for this week.</td></tr>}
                {workers.map((w, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{w.name}</td>
                    <td style={styles.td}>{w.role}</td>
                    <td style={styles.td}>{subTab === 'production' ? w.days : Math.round(w.days_or_blocks || 0)}</td>
                    <td style={styles.td}>{naira(w.base_rate)}</td>
                    <td style={styles.td}>{naira(w.bonus || 0)}</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: theme.accent }}>{naira(w.total_pay)}</td>
                    <td style={styles.td}>{w.bank}</td>
                    <td style={styles.td}>{w.account}</td>
                  </tr>
                ))}
                {workers.length > 0 && (
                  <tr style={{ background: theme.surface }}>
                    <td colSpan={5} style={{ ...styles.td, fontWeight: '700', textAlign: 'right' }}>Grand Total</td>
                    <td style={{ ...styles.td, fontWeight: '700', color: theme.accent }}>{naira(totalAmount)}</td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ ...styles.row, gap: '8px', flexWrap: 'wrap' }}>
            {!currentPayroll && workers.length > 0 && ['production_manager','assistant_production_manager','hr_officer','md'].includes(userProfile?.role) && (
              <button style={styles.btn('primary')} onClick={handleGeneratePayroll} disabled={actioning}>Generate Payroll</button>
            )}
            {currentPayroll?.status === 'draft' && userProfile?.role === 'ico' && (
              <button data-ico-allow style={styles.btn('success')} onClick={() => handlePayrollAction('ico_approve')} disabled={actioning}>ICO Approve</button>
            )}
            {currentPayroll?.status === 'ico_approved' && userProfile?.role === 'md' && (
              <button style={styles.btn('success')} onClick={() => handlePayrollAction('md_approve')} disabled={actioning}>MD Approve</button>
            )}
            {currentPayroll?.status === 'md_approved' && userProfile?.role === 'accountant' && (
              <button style={styles.btn('success')} onClick={() => handlePayrollAction('mark_paid')} disabled={actioning}>Mark as Paid + Create Expense</button>
            )}
            {currentPayroll && currentPayroll.status !== 'paid' && ['production_manager','assistant_production_manager','logistics_manager','hr_officer','ico','md'].includes(userProfile?.role) && (
              <button data-ico-allow style={{ ...styles.btn('danger'), opacity: 0.85 }} onClick={() => handlePayrollAction('recall')} disabled={actioning}>Recall to Draft</button>
            )}
            {currentPayroll?.status === 'paid' && (
              <button style={styles.btn('blue')} onClick={() => {
                const pdfWorkers = workers.map(w => ({ ...w, days_or_blocks: subTab === 'production' ? w.days : Math.round(w.days_or_blocks || 0) }))
                generatePayrollPDF(subTab, weekEnding, pdfWorkers, totalAmount, currentPayroll)
              }}>Download PDF</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── MONTHLY FIXED TAB ────────────────────────────────────────────────────────

function MonthlyFixedTab({ pool, roles, userProfile }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [payrollRecords, setPayrollRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const [actioning, setActioning] = useState(false)
  const [rentalVehicles, setRentalVehicles] = useState([])

  useEffect(() => {
    supabase.from('vehicles').select('id, vehicle_name, vehicle_number, monthly_rental_amount, owner_name, owner_phone')
      .eq('vehicle_type', 'Rental')
      .then(({ data }) => setRentalVehicles(data || []))
  }, [])

  // Build fixed workers dynamically from labour_pool (category = monthly_fixed)
  const fixedWorkers = pool
    .filter(w => w.category === 'monthly_fixed' && w.is_active !== false)
    .map(w => {
      const role = roles.find(r => r.id === w.usual_role_id)
      return {
        id: w.id,
        label: w.full_name,
        roleName: role?.role_name || '—',
        amount: Number(role?.base_rate || 0),
        bank: w.bank_name || '—',
        account: w.bank_account_number || '—',
        accountName: w.bank_account_name || '—',
      }
    })
  const totalFixed = fixedWorkers.reduce((s, w) => s + w.amount, 0)

  const loadData = useCallback(async () => {
    if (!month) return
    setLoading(true)
    const { data } = await supabase.from('weekly_labour_payroll').select('*').eq('payroll_type', 'monthly_fixed').ilike('week_ending', `${month}%`)
    setPayrollRecords(data || [])
    setLoading(false)
  }, [month])

  useEffect(() => { loadData() }, [loadData])

  const existingPayroll = payrollRecords[0]

  const handleGenerate = async () => {
    if (fixedWorkers.length === 0) return setAlert({ msg: 'No monthly fixed workers in Labour Pool. Add workers with category "monthly_fixed" first.', type: 'error' })
    setActioning(true)
    const weekEnding = `${month}-28`
    const { error } = await supabase.from('weekly_labour_payroll').insert({
      week_ending: weekEnding, payroll_type: 'monthly_fixed', total_amount: totalFixed,
      worker_count: fixedWorkers.length, status: 'draft', prepared_by: userProfile?.full_name,
    })
    setActioning(false)
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: 'Monthly fixed payroll created.', type: 'success' }); loadData() }
  }

  const handleAction = async (action) => {
    if (!existingPayroll) return
    setActioning(true)
    let update = {}
    if (action === 'ico_approve') update = { status: 'ico_approved', ico_approved_by: userProfile?.full_name }
    else if (action === 'md_approve') update = { status: 'md_approved', md_approved_by: userProfile?.full_name }
    else if (action === 'recall') update = { status: 'draft', ico_approved_by: null, md_approved_by: null }
    else if (action === 'mark_paid') {
      update = { status: 'paid', payment_date: todayStr() }
      const catId = await getOrCreateCategory('Labour Wages')
      if (catId) {
        await supabase.from('expenses').insert({
          category_id: catId,
          description: `Monthly Fixed Labour — ${month}`,
          amount: totalFixed, expense_date: todayStr(), status: 'approved', vendor: 'Labour Pool',
        })
      }
    }
    const { error } = await supabase.from('weekly_labour_payroll').update(update).eq('id', existingPayroll.id)
    setActioning(false)
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: action === 'recall' ? 'Payroll recalled to draft.' : 'Updated.', type: 'success' }); loadData() }
  }

  const handlePDF = () => {
    const pdfWorkers = fixedWorkers.map(w => ({
      name: w.label, role: w.roleName, days_or_blocks: '1 month',
      base_rate: w.amount, bonus: 0, total_pay: w.amount,
      bank: w.bank, account: w.account,
    }))
    generatePayrollPDF('monthly_fixed', `${month} (Monthly)`, pdfWorkers, totalFixed, existingPayroll)
  }

  return (
    <div>
      <div style={{ ...styles.row, marginBottom: '20px', gap: '12px' }}>
        <div>
          <label style={styles.label}>Month</label>
          <input type="month" style={styles.input} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <button style={{ ...styles.btn('ghost'), marginTop: '18px' }} onClick={loadData}>Load</button>
      </div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {fixedWorkers.length === 0 ? (
        <div style={{ ...styles.card, color: theme.textMuted, textAlign: 'center', padding: '32px' }}>
          No monthly fixed workers found. Add workers to the Labour Pool with category set to <strong>monthly_fixed</strong>.
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ ...styles.row, gap: '12px', flexWrap: 'wrap' }}>
            {fixedWorkers.map(w => (
              <div key={w.id} style={{ ...styles.card, flex: '1', minWidth: '200px', marginBottom: 0, borderLeft: `4px solid ${theme.blue}` }}>
                <div style={{ fontSize: '13px', fontWeight: '700' }}>{w.label}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>{w.roleName}</div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: theme.accent, marginTop: '6px' }}>{naira(w.amount)}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Monthly Fixed</div>
                {existingPayroll && <span style={{ ...styles.badge(statusColor(existingPayroll.status)), marginTop: '8px', display: 'inline-block' }}>{existingPayroll.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {rentalVehicles.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Rental Vehicles — Deferred (Paid Monthly)</div>
          <div style={{ ...styles.row, gap: '12px', flexWrap: 'wrap' }}>
            {rentalVehicles.map(v => (
              <div key={v.id} style={{ ...styles.card, flex: '1', minWidth: '200px', marginBottom: 0, borderLeft: `4px solid ${theme.accent}` }}>
                <div style={{ fontSize: '13px', fontWeight: '700' }}>{v.vehicle_name || v.vehicle_number}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>{v.vehicle_number} • Rental Vehicle</div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: theme.accent, marginTop: '6px' }}>{naira(Number(v.monthly_rental_amount) || 0)}</div>
                {v.owner_name && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Owner: {v.owner_name}{v.owner_phone ? ` • ${v.owner_phone}` : ''}</div>}
                <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>Monthly Rental — Process separately via Accounting</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...styles.card, borderTop: `2px solid ${theme.accent}` }}>
        <div style={{ ...styles.row, justifyContent: 'space-between' }}>
          <div style={{ fontSize: '16px', fontWeight: '700' }}>Total Monthly Fixed Labour ({fixedWorkers.length} worker{fixedWorkers.length !== 1 ? 's' : ''})</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.accent }}>{naira(totalFixed)}</div>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ ...styles.row, gap: '8px', flexWrap: 'wrap' }}>
          {!existingPayroll && ['production_manager','assistant_production_manager','hr_officer','md'].includes(userProfile?.role) && (
            <button style={styles.btn('primary')} onClick={handleGenerate} disabled={actioning}>Create Payroll for {month}</button>
          )}
          {existingPayroll?.status === 'draft' && userProfile?.role === 'ico' && (
            <button data-ico-allow style={styles.btn('success')} onClick={() => handleAction('ico_approve')} disabled={actioning}>ICO Approve</button>
          )}
          {existingPayroll?.status === 'ico_approved' && userProfile?.role === 'md' && (
            <button style={styles.btn('success')} onClick={() => handleAction('md_approve')} disabled={actioning}>MD Approve</button>
          )}
          {existingPayroll?.status === 'md_approved' && userProfile?.role === 'accountant' && (
            <button style={styles.btn('success')} onClick={() => handleAction('mark_paid')} disabled={actioning}>Mark as Paid + Create Expense</button>
          )}
          {existingPayroll && existingPayroll.status !== 'paid' && ['production_manager','assistant_production_manager','logistics_manager','hr_officer','ico','md'].includes(userProfile?.role) && (
            <button data-ico-allow style={{ ...styles.btn('danger'), opacity: 0.85 }} onClick={() => handleAction('recall')} disabled={actioning}>Recall to Draft</button>
          )}
          {existingPayroll?.status === 'paid' && (
            <button style={styles.btn('blue')} onClick={handlePDF}>Download PDF</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── LABOUR RATES TAB ─────────────────────────────────────────────────────────
function LabourRatesTab({ roles, userProfile, onRefresh }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showProposeForm, setShowProposeForm] = useState(false)
  const [alert, setAlert] = useState(null)
  const [commentMap, setCommentMap] = useState({})
  const [actioning, setActioning] = useState({})

  const loadRequests = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('labour_rate_change_requests').select('*').order('requested_date', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  const handleAction = async (req, action, comment) => {
    setActioning(a => ({ ...a, [req.id]: true }))
    let update = {}
    const role = userProfile?.role
    if (action === 'ico_approve') update = { ico_status: 'approved', ico_reviewed_by: userProfile?.full_name, ico_review_date: todayStr(), ico_comments: comment, overall_status: 'md_review' }
    else if (action === 'ico_reject') update = { ico_status: 'rejected', ico_reviewed_by: userProfile?.full_name, ico_review_date: todayStr(), ico_comments: comment, overall_status: 'rejected' }
    else if (action === 'md_approve') {
      update = { md_status: 'approved', md_approved_by: userProfile?.full_name, md_approval_date: todayStr(), md_comments: comment, overall_status: 'approved', effective_date: req.effective_date || todayStr() }
      // Auto-update labour_roles
      await supabase.from('labour_roles').update({ base_rate: req.proposed_rate, target_bonus: req.proposed_bonus, effective_date: req.effective_date || todayStr(), approved_by: userProfile?.full_name }).eq('id', req.role_id)
    }
    else if (action === 'md_reject') update = { md_status: 'rejected', md_approved_by: userProfile?.full_name, md_approval_date: todayStr(), md_comments: comment, overall_status: 'rejected' }

    const { error } = await supabase.from('labour_rate_change_requests').update(update).eq('id', req.id)
    setActioning(a => ({ ...a, [req.id]: false }))
    if (error) setAlert({ msg: error.message, type: 'error' })
    else { setAlert({ msg: 'Updated.', type: 'success' }); loadRequests(); onRefresh() }
  }

  const pendingRequests = requests.filter(r => ['pending', 'ico_review', 'md_review'].includes(r.overall_status))
  const historyRequests = requests.filter(r => ['approved', 'rejected'].includes(r.overall_status))

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Current Labour Rates</h3>
        {userProfile?.role === 'production_manager' && (
          <button style={styles.btn('primary')} onClick={() => setShowProposeForm(true)}>+ Propose Rate Change</button>
        )}
      </div>

      {showProposeForm && (
        <ProposeRateForm roles={roles} userProfile={userProfile} onSave={() => { setShowProposeForm(false); loadRequests() }} onCancel={() => setShowProposeForm(false)} />
      )}

      <div style={{ ...styles.card, padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: theme.surface }}>
            <tr>{['Role Name', 'Payment Type', 'Base Rate', 'Target Bonus', 'Bonus Type', 'Effective Date', 'Approved By', 'Status'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {roles.length === 0 && <tr><td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: theme.textMuted }}>No roles defined.</td></tr>}
            {roles.map(r => (
              <tr key={r.id}>
                <td style={styles.td}>{r.role_name}</td>
                <td style={styles.td}><span style={styles.badge(theme.blue)}>{(r.payment_type || '').replace('_', ' ')}</span></td>
                <td style={{ ...styles.td, color: theme.accent, fontWeight: '700' }}>{naira(r.base_rate)}</td>
                <td style={styles.td}>{r.target_bonus ? naira(r.target_bonus) : '—'}</td>
                <td style={styles.td}>{r.bonus_type || '—'}</td>
                <td style={styles.td}>{r.effective_date || '—'}</td>
                <td style={styles.td}>{r.approved_by || '—'}</td>
                <td style={styles.td}><span style={styles.badge(r.is_active ? theme.green : theme.red)}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>Pending Rate Change Requests</div>
          {loading ? <Spinner /> : pendingRequests.map(req => {
            const role = roles.find(r => r.id === req.role_id)
            return (
              <div key={req.id} style={{ ...styles.card, borderLeft: `4px solid ${theme.accent}` }}>
                <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontWeight: '700' }}>{role?.role_name || `Role #${req.role_id}`}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Requested by {req.requested_by} on {req.requested_date}</div>
                  </div>
                  <span style={styles.badge(statusColor(req.overall_status))}>{req.overall_status}</span>
                </div>
                <div style={styles.grid3}>
                  <div style={{ fontSize: '13px' }}>Current Rate: <strong style={{ color: theme.red }}>{naira(req.current_rate)}</strong></div>
                  <div style={{ fontSize: '13px' }}>Proposed Rate: <strong style={{ color: theme.green }}>{naira(req.proposed_rate)}</strong></div>
                  <div style={{ fontSize: '13px' }}>Effective: <strong>{req.effective_date || '—'}</strong></div>
                </div>
                {req.reason && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>Reason: {req.reason}</div>}

                {userProfile?.role === 'ico' && req.overall_status === 'pending' && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>ICO Comment</label>
                      <input style={styles.input} value={commentMap[req.id] || ''} onChange={e => setCommentMap(m => ({ ...m, [req.id]: e.target.value }))} placeholder="Optional comment…" />
                    </div>
                    <div style={styles.row}>
                      <button data-ico-allow style={styles.btn('success')} onClick={() => handleAction(req, 'ico_approve', commentMap[req.id] || '')} disabled={actioning[req.id]}>Approve</button>
                      <button data-ico-allow style={styles.btn('danger')} onClick={() => handleAction(req, 'ico_reject', commentMap[req.id] || '')} disabled={actioning[req.id]}>Reject</button>
                    </div>
                  </div>
                )}

                {userProfile?.role === 'md' && req.overall_status === 'md_review' && (
                  <div style={{ marginTop: '12px' }}>
                    {req.ico_comments && <div style={{ fontSize: '12px', color: theme.blue, marginBottom: '8px' }}>ICO: {req.ico_comments}</div>}
                    <div style={styles.formGroup}>
                      <label style={styles.label}>MD Comment</label>
                      <input style={styles.input} value={commentMap[req.id] || ''} onChange={e => setCommentMap(m => ({ ...m, [req.id]: e.target.value }))} placeholder="Optional comment…" />
                    </div>
                    <div style={styles.row}>
                      <button style={styles.btn('success')} onClick={() => handleAction(req, 'md_approve', commentMap[req.id] || '')} disabled={actioning[req.id]}>MD Approve</button>
                      <button style={styles.btn('danger')} onClick={() => handleAction(req, 'md_reject', commentMap[req.id] || '')} disabled={actioning[req.id]}>MD Reject</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {historyRequests.length > 0 && (
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>Rate Change History</div>
          <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: theme.surface }}>
                <tr>{['Role', 'Old Rate', 'New Rate', 'Old Bonus', 'New Bonus', 'Requested By', 'Date', 'Status', 'Effective Date'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {historyRequests.map(req => {
                  const role = roles.find(r => r.id === req.role_id)
                  return (
                    <tr key={req.id}>
                      <td style={styles.td}>{role?.role_name || '—'}</td>
                      <td style={styles.td}>{naira(req.current_rate)}</td>
                      <td style={styles.td}>{naira(req.proposed_rate)}</td>
                      <td style={styles.td}>{naira(req.current_bonus)}</td>
                      <td style={styles.td}>{naira(req.proposed_bonus)}</td>
                      <td style={styles.td}>{req.requested_by}</td>
                      <td style={styles.td}>{req.requested_date}</td>
                      <td style={styles.td}><span style={styles.badge(statusColor(req.overall_status))}>{req.overall_status}</span></td>
                      <td style={styles.td}>{req.effective_date || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ProposeRateForm({ roles, userProfile, onSave, onCancel }) {
  const [roleId, setRoleId] = useState('')
  const [proposedRate, setProposedRate] = useState('')
  const [proposedBonus, setProposedBonus] = useState('')
  const [reason, setReason] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const selectedRole = roles.find(r => String(r.id) === String(roleId))

  const handleSave = async () => {
    if (!roleId || !proposedRate) return setErr('Role and proposed rate are required.')
    if (!reason.trim()) return setErr('Please provide a reason.')
    setSaving(true)
    const { error } = await supabase.from('labour_rate_change_requests').insert({
      role_id: roleId, current_rate: selectedRole?.base_rate || 0,
      proposed_rate: Number(proposedRate), current_bonus: selectedRole?.target_bonus || 0,
      proposed_bonus: Number(proposedBonus || 0), reason, requested_by: userProfile?.full_name,
      requested_date: todayStr(), overall_status: 'pending', ico_status: 'pending', md_status: 'pending',
      effective_date: effectiveDate,
    })
    setSaving(false)
    if (error) setErr(error.message)
    else onSave()
  }

  return (
    <div style={{ ...styles.card, marginBottom: '20px', borderLeft: `4px solid ${theme.accent}` }}>
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '14px' }}>
        <h4 style={{ margin: 0 }}>Propose Rate Change</h4>
        <button style={styles.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
      {err && <AlertBar msg={err} type="error" onClose={() => setErr('')} />}
      <div style={styles.grid2}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Role</label>
          <select style={styles.input} value={roleId} onChange={e => setRoleId(e.target.value)}>
            <option value="">— Select Role —</option>
            {roles.filter(r => r.is_active).map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Current Rate (read-only)</label>
          <input style={{ ...styles.input, background: theme.bg, color: theme.textMuted }} value={selectedRole ? naira(selectedRole.base_rate) : '—'} readOnly />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Proposed New Rate (₦)</label>
          <input type="number" style={styles.input} value={proposedRate} onChange={e => setProposedRate(e.target.value)} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Current Bonus (read-only)</label>
          <input style={{ ...styles.input, background: theme.bg, color: theme.textMuted }} value={selectedRole ? naira(selectedRole.target_bonus || 0) : '—'} readOnly />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Proposed New Bonus (₦)</label>
          <input type="number" style={styles.input} value={proposedBonus} onChange={e => setProposedBonus(e.target.value)} placeholder="0" />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Effective Date</label>
          <input type="date" style={styles.input} value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
        </div>
        <div style={{ ...styles.formGroup, gridColumn: 'span 2' }}>
          <label style={styles.label}>Reason *</label>
          <input style={styles.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain reason for rate change…" />
        </div>
      </div>
      <div style={styles.row}>
        <button style={styles.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Submitting…' : 'Submit for Review'}</button>
        <button style={styles.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Labour({ userProfile }) {
  const [activeTab, setActiveTab] = useState(userProfile?.role === 'logistics_manager' ? 'truck' : 'pool')
  const [roles, setRoles] = useState([])
  const [pool, setPool] = useState([])
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(null)

  const loadSharedData = useCallback(async () => {
    setLoading(true)
    const [rRes, pRes] = await Promise.all([
      supabase.from('labour_roles').select('*').order('role_name'),
      supabase.from('labour_pool').select('*').order('full_name'),
    ])
    setRoles(rRes.data || [])
    setPool(pRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadSharedData() }, [loadSharedData])

  const isLogistics = userProfile?.role === 'logistics_manager'
  const TABS = isLogistics
    ? [{ key: 'truck', label: 'Truck Loading' }]
    : [
      { key: 'pool', label: 'Labour Pool' },
      { key: 'roster', label: 'Daily Roster' },
      { key: 'truck', label: 'Truck Loading' },
      { key: 'payroll', label: 'Payroll' },
      { key: 'monthly', label: 'Monthly Fixed' },
      { key: 'rates', label: 'Labour Rates' },
    ]

  return (
    <div style={styles.page}>
      <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: theme.text }}>Labour Management</h1>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>Abuja Precast Concrete Limited</div>
        </div>
        <div style={{ fontSize: '12px', color: theme.textMuted }}>
          {userProfile?.full_name} · <span style={{ color: theme.accent }}>{userProfile?.role}</span>
        </div>
      </div>

      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      <div style={{ ...styles.row, gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} style={styles.tab(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {activeTab === 'pool' && <LabourPoolTab pool={pool} roles={roles} userProfile={userProfile} onRefresh={loadSharedData} />}
          {activeTab === 'roster' && <DailyRosterTab pool={pool} roles={roles} userProfile={userProfile} />}
          {activeTab === 'truck' && <TruckLoadingTab pool={pool} userProfile={userProfile} />}
          {activeTab === 'payroll' && <WeeklyPayrollTab pool={pool} roles={roles} userProfile={userProfile} />}
          {activeTab === 'monthly' && <MonthlyFixedTab pool={pool} roles={roles} userProfile={userProfile} />}
          {activeTab === 'rates' && <LabourRatesTab roles={roles} userProfile={userProfile} onRefresh={loadSharedData} />}
        </>
      )}
    </div>
  )
}
