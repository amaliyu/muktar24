import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { openingBalancesService } from '../services/financialService'

// ── Theme ─────────────────────────────────────────────────────────────
const theme = {
  bg: '#0f1117', surface: '#1a1d27', card: '#21263a', border: '#2e3452',
  accent: '#f5a623', green: '#2dd4a0', red: '#f06b6b', blue: '#5b8dee',
  text: '#e8eaf0', textMuted: '#7c839e',
}

// ── Helpers ───────────────────────────────────────────────────────────
const naira  = (n) => `₦${Math.round(Number(n) || 0).toLocaleString()}`
const num    = (n) => Number(n) || 0
const isoToday = () => new Date().toISOString().split('T')[0]
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

// Default fixed-asset rows (non-vehicle)
const FIXED_ASSET_DEFAULTS = [
  { account_name: 'Land & Building',         sub_category: 'fixed_asset_other' },
  { account_name: 'Plant & Machinery',        sub_category: 'fixed_asset_other' },
  { account_name: 'Furniture & Equipment',    sub_category: 'fixed_asset_other' },
  { account_name: 'Computer Equipment',       sub_category: 'fixed_asset_other' },
]
// Default current-asset rows
const CURRENT_ASSET_DEFAULTS = [
  { account_name: 'Cash on Hand',    sub_category: 'current_asset' },
  { account_name: 'Prepayments',     sub_category: 'current_asset' },
  { account_name: 'Other Current Assets', sub_category: 'current_asset' },
]
// Default current liability rows
const CURRENT_LIABILITY_DEFAULTS = [
  { account_name: 'VAT Payable',     sub_category: 'current_liability' },
  { account_name: 'Other Payables',  sub_category: 'current_liability' },
]
// Default long-term liability rows
const LT_LIABILITY_DEFAULTS = [
  { account_name: 'Long Term Loan',  sub_category: 'long_term_liability' },
]
// Default equity rows
const EQUITY_DEFAULTS = [
  { account_name: 'Share Capital',          sub_category: 'equity' },
  { account_name: 'Retained Earnings B/F',  sub_category: 'equity' },
]

// ── Shared UI Components ──────────────────────────────────────────────
const Label = ({ children }) => (
  <div style={{ fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
    {children}
  </div>
)

const StyledInput = ({ value, onChange, type = 'text', placeholder, disabled, style }) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: '6px',
      padding: '7px 10px',
      color: theme.text,
      fontSize: '13px',
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      ...style,
    }}
  />
)

const Btn = ({ children, onClick, variant = 'secondary', small, disabled, style }) => {
  const colors = {
    primary:   { bg: theme.accent,   color: '#1a0e00', border: theme.accent },
    secondary: { bg: theme.surface,  color: theme.text, border: theme.border },
    danger:    { bg: '#3d1515',      color: theme.red,  border: theme.red },
    ghost:     { bg: 'transparent',  color: theme.textMuted, border: theme.border },
  }
  const c = colors[variant] || colors.secondary
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '5px 12px' : '8px 16px',
        borderRadius: '7px',
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: disabled ? theme.textMuted : c.color,
        fontWeight: '600',
        fontSize: small ? '11px' : '13px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

const Toast = ({ msg, type }) => {
  if (!msg) return null
  const isSuccess = type === 'success'
  return (
    <div style={{
      position: 'fixed', top: '20px', right: '24px', zIndex: 9999,
      padding: '12px 18px', borderRadius: '8px', maxWidth: '380px',
      background: (isSuccess ? theme.green : theme.red) + '22',
      border: `1px solid ${(isSuccess ? theme.green : theme.red)}55`,
      color: isSuccess ? theme.green : theme.red,
      fontSize: '13px', fontWeight: '600', fontFamily: "'DM Sans','Segoe UI',sans-serif",
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {msg}
    </div>
  )
}

// ── Accordion Section ─────────────────────────────────────────────────
const AccordionSection = ({ title, badge, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', marginBottom: '14px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: theme.text }}>{title}</span>
          {badge != null && (
            <span style={{ fontSize: '11px', fontWeight: '700', background: theme.accent + '22', color: theme.accent, padding: '2px 8px', borderRadius: '4px' }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{ color: theme.textMuted, fontSize: '16px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-section header ────────────────────────────────────────────────
const SubHeader = ({ children }) => (
  <div style={{ fontSize: '11px', fontWeight: '700', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', marginTop: '4px' }}>
    {children}
  </div>
)

// ── Row: view or edit mode ────────────────────────────────────────────
const BalanceRow = ({
  row, isVehicle, editingId, editForm, setEditForm,
  onEdit, onSave, onCancel, onDelete, saving, userProfile,
}) => {
  const isEditing = editingId === row.id
  const nbv = isVehicle
    ? num(isEditing ? editForm.amount : row.amount) - num(isEditing ? editForm.depreciation_amount : row.depreciation_amount)
    : null

  const cellStyle = { padding: '10px 8px', borderBottom: `1px solid ${theme.border}22`, color: theme.text, fontSize: '13px', verticalAlign: 'middle' }

  return (
    <tr>
      {/* Account name */}
      <td style={cellStyle}>
        {isEditing && !row.vehicle_id && !isVehicle ? (
          <StyledInput
            value={editForm.account_name}
            onChange={e => setEditForm(f => ({ ...f, account_name: e.target.value }))}
          />
        ) : (
          <div>
            <div style={{ fontWeight: isVehicle ? '600' : '400' }}>{row.account_name}</div>
            {isVehicle && row.vehicle_number && (
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{row.vehicle_number}</div>
            )}
          </div>
        )}
      </td>

      {/* Cost / Amount */}
      <td style={{ ...cellStyle, textAlign: 'right' }}>
        {isEditing ? (
          <StyledInput
            type="number"
            value={editForm.amount}
            onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
            style={{ textAlign: 'right', width: '140px' }}
          />
        ) : (
          <span style={{ color: theme.text }}>{naira(row.amount)}</span>
        )}
      </td>

      {/* Depreciation (fixed assets only) */}
      {isVehicle && (
        <td style={{ ...cellStyle, textAlign: 'right' }}>
          {isEditing ? (
            <StyledInput
              type="number"
              value={editForm.depreciation_amount}
              onChange={e => setEditForm(f => ({ ...f, depreciation_amount: e.target.value }))}
              style={{ textAlign: 'right', width: '140px' }}
            />
          ) : (
            <span style={{ color: theme.textMuted }}>{naira(row.depreciation_amount)}</span>
          )}
        </td>
      )}

      {/* NBV (fixed assets only) */}
      {isVehicle && (
        <td style={{ ...cellStyle, textAlign: 'right', fontWeight: '700', color: nbv >= 0 ? theme.text : theme.red }}>
          {naira(nbv)}
        </td>
      )}

      {/* Notes */}
      <td style={{ ...cellStyle, maxWidth: '180px' }}>
        {isEditing ? (
          <StyledInput
            value={editForm.notes}
            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
          />
        ) : (
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{row.notes || ''}</span>
        )}
      </td>

      {/* Last edited */}
      <td style={{ ...cellStyle, fontSize: '11px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
        {row.last_edited_by ? (
          <div>
            <div>{row.last_edited_by}</div>
            <div>{fmtDateTime(row.last_edited_at)}</div>
          </div>
        ) : '—'}
      </td>

      {/* Actions */}
      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
        {isEditing ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <Btn variant="primary" small onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Btn>
            <Btn variant="ghost" small onClick={onCancel}>Cancel</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px' }}>
            <Btn variant="ghost" small onClick={() => onEdit(row)}>Edit</Btn>
            {!row.vehicle_id && !isVehicle && (
              <Btn variant="danger" small onClick={() => onDelete(row.id)}>×</Btn>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Table wrapper ────────────────────────────────────────────────────
const BalanceTable = ({ rows, isVehicle, editingId, editForm, setEditForm, onEdit, onSave, onCancel, onDelete, saving, userProfile }) => {
  const headers = isVehicle
    ? ['Account / Vehicle', 'Cost (₦)', 'Acc. Depreciation (₦)', 'NBV (₦)', 'Notes', 'Last Edited', '']
    : ['Account', 'Amount (₦)', 'Notes', 'Last Edited', '']

  return (
    <div style={{ overflowX: 'auto', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ textAlign: h.includes('₦') || h === 'NBV (₦)' ? 'right' : 'left', padding: '10px 8px', fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap', background: theme.surface }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{ padding: '20px 8px', color: theme.textMuted, fontSize: '13px', textAlign: 'center' }}>No entries</td>
            </tr>
          )}
          {rows.map(row => (
            <BalanceRow
              key={row.id}
              row={row}
              isVehicle={isVehicle}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              onEdit={onEdit}
              onSave={onSave}
              onCancel={onCancel}
              onDelete={onDelete}
              saving={saving}
              userProfile={userProfile}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────
export default function OpeningBalances({ userProfile }) {
  const [balances, setBalances]   = useState([])
  const [vehicles, setVehicles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [asAtDate, setAsAtDate]   = useState(isoToday())
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({ amount: '', depreciation_amount: '', notes: '', account_name: '' })
  const [toast, setToast]         = useState({ msg: '', type: '' })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: '' }), 3000)
  }

  // ── Load data ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [balRes, vehRes] = await Promise.allSettled([
        openingBalancesService.getAll(),
        supabase.from('vehicles').select('id, vehicle_number, vehicle_name').order('vehicle_number'),
      ])

      const allBalances = balRes.status === 'fulfilled' ? (balRes.value || []) : []
      const allVehicles = vehRes.status === 'fulfilled' ? (vehRes.value.data || []) : []

      setVehicles(allVehicles)

      // Auto-seed missing vehicle rows
      const existingVehicleIds = new Set(allBalances.filter(b => b.vehicle_id).map(b => b.vehicle_id))
      const toSeed = allVehicles.filter(v => !existingVehicleIds.has(v.id))

      if (toSeed.length > 0) {
        const seeds = toSeed.map(v => ({
          category:             'asset',
          sub_category:         'fixed_asset_vehicle',
          account_name:         v.vehicle_name || v.vehicle_number,
          vehicle_id:           v.id,
          amount:               0,
          depreciation_amount:  0,
          notes:                '',
        }))
        try {
          const { data: seeded } = await supabase
            .from('opening_balances')
            .upsert(seeds, { onConflict: 'vehicle_id' })
            .select()
          if (seeded) {
            const freshRes = await openingBalancesService.getAll()
            setBalances(freshRes || [])
            return
          }
        } catch (_) { /* non-fatal */ }
      }

      // Also auto-seed missing default rows (non-vehicle)
      const existingNames = new Set(allBalances.map(b => b.account_name))
      const allDefaults = [
        ...FIXED_ASSET_DEFAULTS.map(d => ({ ...d, category: 'asset' })),
        ...CURRENT_ASSET_DEFAULTS.map(d => ({ ...d, category: 'asset' })),
        ...CURRENT_LIABILITY_DEFAULTS.map(d => ({ ...d, category: 'liability' })),
        ...LT_LIABILITY_DEFAULTS.map(d => ({ ...d, category: 'liability' })),
        ...EQUITY_DEFAULTS.map(d => ({ ...d, category: 'equity' })),
      ]
      const missingDefaults = allDefaults.filter(d => !existingNames.has(d.account_name))
      if (missingDefaults.length > 0) {
        try {
          await supabase.from('opening_balances').upsert(
            missingDefaults.map(d => ({ ...d, amount: 0, depreciation_amount: 0 }))
          )
          const freshRes = await openingBalancesService.getAll()
          setBalances(freshRes || [])
          return
        } catch (_) { /* non-fatal */ }
      }

      setBalances(allBalances)
    } catch (err) {
      console.error('OpeningBalances load error:', err)
      showToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter helpers ────────────────────────────────────────────────
  const bySubCat = (subCat) => balances.filter(b => b.sub_category === subCat)
  const vehicleRows = balances.filter(b => b.sub_category === 'fixed_asset_vehicle')
  const fixedOtherRows = balances.filter(b => b.sub_category === 'fixed_asset_other')
  const currentAssetRows = balances.filter(b => b.sub_category === 'current_asset')
  const currentLiabRows = balances.filter(b => b.sub_category === 'current_liability')
  const ltLiabRows = balances.filter(b => b.sub_category === 'long_term_liability')
  const equityRows = balances.filter(b => b.sub_category === 'equity')

  // ── Totals ───────────────────────────────────────────────────────
  const vehicleNBV        = vehicleRows.reduce((s, r) => s + Math.max(0, num(r.amount) - num(r.depreciation_amount)), 0)
  const fixedOtherNBV     = fixedOtherRows.reduce((s, r) => s + Math.max(0, num(r.amount) - num(r.depreciation_amount)), 0)
  const totalFixedAssets  = vehicleNBV + fixedOtherNBV
  const totalCurrentAssets = currentAssetRows.reduce((s, r) => s + num(r.amount), 0)
  const totalAssets       = totalFixedAssets + totalCurrentAssets

  const totalCurrentLiab  = currentLiabRows.reduce((s, r) => s + num(r.amount), 0)
  const totalLTLiab       = ltLiabRows.reduce((s, r) => s + num(r.amount), 0)
  const totalLiabilities  = totalCurrentLiab + totalLTLiab

  const totalEquity       = equityRows.reduce((s, r) => s + num(r.amount), 0)
  const balanceDiff       = totalAssets - (totalLiabilities + totalEquity)
  const isBalanced        = Math.abs(balanceDiff) < 1

  // ── Edit / Save / Delete ─────────────────────────────────────────
  const startEdit = (row) => {
    setEditingId(row.id)
    setEditForm({
      amount:               String(row.amount || 0),
      depreciation_amount:  String(row.depreciation_amount || 0),
      notes:                row.notes || '',
      account_name:         row.account_name || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ amount: '', depreciation_amount: '', notes: '', account_name: '' })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      const row = balances.find(b => b.id === editingId)
      if (!row) throw new Error('Row not found')
      await openingBalancesService.update(
        editingId,
        {
          amount:              num(editForm.amount),
          depreciation_amount: num(editForm.depreciation_amount),
          notes:               editForm.notes || null,
          account_name:        editForm.account_name || row.account_name,
        },
        userProfile?.full_name || userProfile?.email || 'Unknown',
        'Manual update via Opening Balances screen',
        num(row.amount),
        num(row.depreciation_amount),
      )
      showToast('Balance updated successfully', 'success')
      cancelEdit()
      await load()
    } catch (err) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this entry?')) return
    try {
      await openingBalancesService.delete(id)
      showToast('Entry deleted', 'success')
      await load()
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error')
    }
  }

  // ── Add a new custom row ─────────────────────────────────────────
  const addRow = async (category, sub_category, defaultName = '') => {
    const name = window.prompt('Account name:', defaultName)
    if (!name || !name.trim()) return
    try {
      const { data, error } = await supabase
        .from('opening_balances')
        .insert({ category, sub_category, account_name: name.trim(), amount: 0, depreciation_amount: 0 })
        .select()
        .single()
      if (error) throw error
      showToast('Row added', 'success')
      await load()
    } catch (err) {
      showToast(err.message || 'Failed to add row', 'error')
    }
  }

  // ── Common table props ────────────────────────────────────────────
  const tableProps = {
    editingId, editForm, setEditForm,
    onEdit: startEdit, onSave: saveEdit, onCancel: cancelEdit, onDelete: deleteRow,
    saving, userProfile,
  }

  // ── Summary card ─────────────────────────────────────────────────
  const SummaryRow = ({ label, value, bold, indent, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: indent ? '6px 0 6px 20px' : '8px 0', borderBottom: bold ? `1px solid ${theme.border}` : 'none', marginBottom: bold ? '4px' : 0 }}>
      <span style={{ fontSize: '13px', fontWeight: bold ? '700' : '400', color: color || (bold ? theme.text : theme.textMuted) }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: bold ? '700' : '600', color: color || theme.text }}>{naira(value)}</span>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        Loading opening balances…
      </div>
    )
  }

  const lastEdited = balances
    .filter(b => b.last_edited_at)
    .sort((a, b) => b.last_edited_at.localeCompare(a.last_edited_at))[0]

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'DM Sans','Segoe UI',sans-serif", color: theme.text, maxWidth: '1200px', margin: '0 auto' }}>
      <Toast msg={toast.msg} type={toast.type} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: theme.text }}>Opening Balances</div>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
            Manage balance sheet opening entries for all asset, liability and equity accounts.
          </div>
          {lastEdited && (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px' }}>
              Last edited by <strong style={{ color: theme.text }}>{lastEdited.last_edited_by}</strong> on {fmtDateTime(lastEdited.last_edited_at)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <Label>As At Date</Label>
            <StyledInput
              type="date"
              value={asAtDate}
              onChange={e => setAsAtDate(e.target.value)}
              style={{ width: '160px' }}
            />
          </div>
        </div>
      </div>

      {/* ── SECTION 1: Fixed Assets ─────────────────────────────── */}
      <AccordionSection title="1. Fixed Assets" badge={naira(totalFixedAssets)} defaultOpen>

        <SubHeader>Motor Vehicles</SubHeader>
        <div style={{ marginBottom: '4px', fontSize: '12px', color: theme.textMuted }}>
          Auto-populated from the Vehicles module. Edit cost and accumulated depreciation; Net Book Value (NBV) is calculated automatically.
        </div>
        <div style={{ marginBottom: '16px' }}>
          <BalanceTable rows={vehicleRows} isVehicle={true} {...tableProps} />
        </div>
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
          <span>Total Vehicle NBV: <strong style={{ color: theme.text }}>{naira(vehicleNBV)}</strong></span>
        </div>

        <SubHeader>Other Fixed Assets</SubHeader>
        <div style={{ marginBottom: '16px' }}>
          <BalanceTable rows={fixedOtherRows} isVehicle={true} {...tableProps} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <Btn variant="ghost" small onClick={() => addRow('asset', 'fixed_asset_other', 'Custom Fixed Asset')}>
            + Add Custom Fixed Asset
          </Btn>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            Total Other Fixed Assets NBV: <strong style={{ color: theme.text }}>{naira(fixedOtherNBV)}</strong>
          </span>
        </div>
      </AccordionSection>

      {/* ── SECTION 2: Current Assets ────────────────────────────── */}
      <AccordionSection title="2. Current Assets" badge={naira(totalCurrentAssets)}>
        <div style={{ marginBottom: '8px', padding: '10px 14px', background: theme.blue + '11', border: `1px solid ${theme.blue}33`, borderRadius: '7px', fontSize: '12px', color: theme.blue }}>
          Note: Bank balances are auto-pulled from the Bank Accounts module and are not entered here.
        </div>
        <div style={{ marginBottom: '16px' }}>
          <BalanceTable rows={currentAssetRows} isVehicle={false} {...tableProps} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Btn variant="ghost" small onClick={() => addRow('asset', 'current_asset', 'Other Current Asset')}>
            + Add Row
          </Btn>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            Total Current Assets: <strong style={{ color: theme.text }}>{naira(totalCurrentAssets)}</strong>
          </span>
        </div>
      </AccordionSection>

      {/* ── SECTION 3: Current Liabilities ───────────────────────── */}
      <AccordionSection title="3. Current Liabilities" badge={naira(totalCurrentLiab)}>
        <div style={{ marginBottom: '8px', padding: '10px 14px', background: theme.blue + '11', border: `1px solid ${theme.blue}33`, borderRadius: '7px', fontSize: '12px', color: theme.blue }}>
          Note: Trade payables are auto-calculated from Supplier transactions.
        </div>
        <div style={{ marginBottom: '16px' }}>
          <BalanceTable rows={currentLiabRows} isVehicle={false} {...tableProps} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Btn variant="ghost" small onClick={() => addRow('liability', 'current_liability', 'Short Term Loan')}>
            + Add Row
          </Btn>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            Total Current Liabilities: <strong style={{ color: theme.text }}>{naira(totalCurrentLiab)}</strong>
          </span>
        </div>
      </AccordionSection>

      {/* ── SECTION 4: Long Term Liabilities ─────────────────────── */}
      <AccordionSection title="4. Long Term Liabilities" badge={naira(totalLTLiab)}>
        <div style={{ marginBottom: '16px' }}>
          <BalanceTable rows={ltLiabRows} isVehicle={false} {...tableProps} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Btn variant="ghost" small onClick={() => addRow('liability', 'long_term_liability', 'Long Term Loan')}>
            + Add Row
          </Btn>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            Total Long Term Liabilities: <strong style={{ color: theme.text }}>{naira(totalLTLiab)}</strong>
          </span>
        </div>
      </AccordionSection>

      {/* ── SECTION 5: Equity ────────────────────────────────────── */}
      <AccordionSection title="5. Equity" badge={naira(totalEquity)}>
        <div style={{ marginBottom: '16px' }}>
          <BalanceTable rows={equityRows} isVehicle={false} {...tableProps} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Btn variant="ghost" small onClick={() => addRow('equity', 'equity', 'Other Equity')}>
            + Add Row
          </Btn>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            Total Equity: <strong style={{ color: theme.text }}>{naira(totalEquity)}</strong>
          </span>
        </div>
      </AccordionSection>

      {/* ── Balance Summary ──────────────────────────────────────── */}
      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', marginTop: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text, marginBottom: '18px' }}>Balance Sheet Summary — As At {fmtDate(asAtDate)}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          {/* Assets column */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Assets</div>
            <SummaryRow label="Fixed Assets (NBV)"    value={totalFixedAssets}    indent />
            <SummaryRow label="Current Assets"         value={totalCurrentAssets}  indent />
            <SummaryRow label="Total Assets"           value={totalAssets}         bold />
          </div>

          {/* Liabilities + Equity column */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: theme.red, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Liabilities & Equity</div>
            <SummaryRow label="Current Liabilities"     value={totalCurrentLiab}   indent />
            <SummaryRow label="Long Term Liabilities"   value={totalLTLiab}        indent />
            <SummaryRow label="Total Liabilities"       value={totalLiabilities}   bold />
            <SummaryRow label="Total Equity"            value={totalEquity}        bold />
            <div style={{ borderTop: `2px solid ${theme.border}`, marginTop: '8px', paddingTop: '8px' }}>
              <SummaryRow label="Total Liabilities + Equity" value={totalLiabilities + totalEquity} bold />
            </div>
          </div>
        </div>

        {/* Balance check */}
        <div style={{
          marginTop: '20px',
          padding: '14px 18px',
          borderRadius: '8px',
          background: isBalanced ? theme.green + '15' : theme.red + '15',
          border: `1px solid ${(isBalanced ? theme.green : theme.red)}44`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isBalanced ? theme.green : theme.red, flexShrink: 0 }} />
          {isBalanced ? (
            <span style={{ fontSize: '13px', fontWeight: '600', color: theme.green }}>
              Balanced — Assets equal Liabilities + Equity
            </span>
          ) : (
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: theme.red }}>
                Out of Balance — Difference: {naira(Math.abs(balanceDiff))}
              </div>
              <div style={{ fontSize: '11px', color: theme.red + 'bb', marginTop: '2px' }}>
                {balanceDiff > 0
                  ? 'Assets exceed Liabilities + Equity. Check for missing liabilities or over-stated assets.'
                  : 'Liabilities + Equity exceed Assets. Check for missing assets or over-stated liabilities.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
