import { useEffect, useState } from 'react'
import { Pencil, RefreshCw } from 'lucide-react'
import { useSites } from './SitePicker'
import { hasRole } from '../lib/roles'
import { loadDustStandards, saveDustStandard } from '../services/productionMaterials'
import { ConfirmDialog, StackTable, theme, ui, withPhase7Touch } from './site/siteUi'

const extraFields = [
  ['chippings_kg_per_block', '3/8 per block (kg, part of the total)'],
  ['blocks_per_bag', 'Blocks per bag of cement'],
  ['diesel_l_per_1000', 'Diesel L per 1,000 blocks'],
]

function DustStandardsSettings({ userProfile }) {
  const { sites } = useSites()
  const isMD = hasRole(userProfile, 'md')
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')
  const [extra, setExtra] = useState({})
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const load = async () => {
    setError(null)
    try { setRows(await loadDustStandards()) }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  const requestSave = () => {
    const kg = Number(value)
    if (!value.trim() || !Number.isFinite(kg) || kg <= 0 || kg > 60) {
      setError('Dust per block must be greater than 0 and at most 60 kg')
      return
    }
    if (extra.chippings_kg_per_block !== '' && Number(extra.chippings_kg_per_block) > kg) {
      setError('3/8 per block must be no more than the total dust + 3/8 per block.')
      return
    }
    if (extraFields.some(([key]) => extra[key] !== '' && (!Number.isFinite(Number(extra[key])) || Number(extra[key]) < 0))) {
      setError('Enter a non-negative number or leave the optional field empty.')
      return
    }
    setError(null)
    setConfirm(true)
  }
  const save = async () => {
    setBusy(true); setError(null); setSuccess(null)
    try {
      const values = Object.fromEntries(extraFields.map(([key]) => [key, extra[key] === '' ? null : Number(extra[key])]))
      await saveDustStandard({ ...editing, ...values, dust_kg_per_block: Number(value) }, userProfile?.full_name)
      setConfirm(false); setEditing(null)
      await load()
      setSuccess('Dust standard updated.')
    } catch (e) { setConfirm(false); setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <section className="phase7-touch" style={{ ...ui.panel, marginBottom: 20, maxWidth: '100%', minWidth: 0 }}>
      <div style={{ ...ui.header, marginBottom: 10 }}>
        <div>
          <div style={ui.section}>Dust + 3/8 per block</div>
          <div style={ui.hint}>Site-specific combined dust and 3/8 standards in kg per gross block produced. Only the MD can change them.</div>
        </div>
        <button type="button" data-ico-allow data-board-allow style={{ ...ui.btn('secondary'), minHeight: 44 }} onClick={load} aria-label="Refresh dust standards"><RefreshCw size={16} /> Refresh</button>
      </div>
      {error && <div role="alert" style={{ color: theme.red, marginBottom: 10 }}>{error}</div>}
      {success && <div role="status" style={{ color: theme.green, marginBottom: 10 }}>{success}</div>}
      <StackTable headers={['Site', 'Block type', 'Dust + 3/8 per block (kg)', ...extraFields.map(([, label]) => label), 'Set by', 'Set on', '']}>
        {rows.map(row => {
          const key = row.site_id + ':' + row.block_type
          const selected = editing?.site_id === row.site_id && editing?.block_type === row.block_type
          return <tr key={key}>
            <td style={ui.td}>{sites.find(s => s.id === row.site_id)?.name || row.site_id}</td>
            <td style={{ ...ui.td, overflowWrap: 'anywhere' }}>{row.block_type}</td>
            <td style={ui.td}>{selected ? <input aria-label="Dust kilograms per block" style={{ ...ui.input, width: 95, minHeight: 44 }} type="number" min="0.001" max="60" step="any" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /> : row.dust_kg_per_block}</td>
            {extraFields.map(([key, label]) => <td key={key} style={ui.td}>{selected ?
              <input aria-label={label} style={{ ...ui.input, width: 85, minHeight: 44 }} type="number" min="0" step="any"
                value={extra[key]} onChange={e => setExtra(previous => ({ ...previous, [key]: e.target.value }))} /> : row[key] ?? '—'}</td>)}
            <td style={ui.td}>{row.set_by_name || '—'}</td>
            <td style={ui.td}>{row.set_at ? new Date(row.set_at).toLocaleDateString('en-NG') : '—'}</td>
            <td style={ui.td}>{isMD && (selected
              ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={{ ...ui.btn('primary'), minHeight: 44 }} onClick={requestSave}>Save</button>
                  <button type="button" style={{ ...ui.btn('secondary'), minHeight: 44 }} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              : <button type="button" style={{ ...ui.btn('secondary'), minHeight: 44 }} onClick={() => { setEditing(row); setValue(String(row.dust_kg_per_block)); setExtra(Object.fromEntries(extraFields.map(([key]) => [key, row[key] == null ? '' : String(row[key])]))); setSuccess(null) }}><Pencil size={16} /> Edit</button>)}</td>
          </tr>
        })}
      </StackTable>
      {!rows.length && !error && <div style={ui.hint}>No site dust standards configured.</div>}
      {confirm && <ConfirmDialog title="Change dust per block?" body={`Update ${editing?.block_type} at ${sites.find(s => s.id === editing?.site_id)?.name || 'this site'} from ${editing?.dust_kg_per_block} to ${value} kg per block? This changes future production calculations.`} confirmLabel="Confirm change" busy={busy} onCancel={() => setConfirm(false)} onConfirm={save} />}
    </section>
  )
}
export default withPhase7Touch(DustStandardsSettings)
