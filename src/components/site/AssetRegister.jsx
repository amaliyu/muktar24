import { withPhase7Touch } from './siteUi'
import { useEffect, useMemo, useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { lagosToday } from '../../services/siteContracts'
import { assetsService, assetTypeFor, ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_STATUSES } from '../../services/assets'
import { investorsService } from '../../services/investors'
import { generatePlantOnSitePDF } from '../../utils/generatePlantOnSitePDF'
import { hasRole } from '../../lib/roles'
import { theme, ui, Pill, fmtQty, fmtNaira, fmtDate, fmtDateTime, ErrorBox, SkeletonRows, ConfirmDialog, StackTable, useIsMobile } from './siteUi'
import { Z } from '../../lib/zIndex'

// Phase 7B-2 — capital asset register. Reads v_site_asset_register; moves go
// through the move_asset RPC only (a direct site change is blocked by
// trg_assets_site_guard). DB messages are shown verbatim.

export const ASSET_READ_ROLES = ['md', 'board_member', 'ico', 'accountant', 'production_manager', 'assistant_production_manager', 'logistics_manager', 'store_officer']
const ASSET_WRITE_ROLES = ['md', 'production_manager', 'assistant_production_manager', 'logistics_manager']
// Who sees acquisition cost — same split as Site Contracts / AMOUNT_ROLES.
const MONEY_ROLES = ['md', 'accountant', 'ico', 'board_member']
// Who may enter a cost. The accountant has no write on assets (RLS
// assets_write), so in practice this is the MD; the check stays explicit.
const COST_ENTRY_ROLES = ['md', 'accountant']

const FLEET = 'Fleet (no fixed site)'
const UNASSIGNED = 'Unassigned'
const CONDITION_COLOR = { good: theme.green, fair: theme.accent, needs_repair: theme.red, out_of_service: theme.red }
const STATUS_COLOR = { active: theme.green, down: theme.red, maintenance: theme.accent, retired: theme.textMuted }
const label = (s) => (s ? String(s).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : '—')

function AssetRegister({ userProfile }) {
  const canRead = hasRole(userProfile, ...ASSET_READ_ROLES)
  const canWrite = hasRole(userProfile, ...ASSET_WRITE_ROLES)
  const seeMoney = hasRole(userProfile, ...MONEY_ROLES)
  const canCost = canWrite && hasRole(userProfile, ...COST_ENTRY_ROLES)
  // Only the MD sets the funding investor (picked from the investor register).
  const canInvestor = userProfile?.role === 'md'
  const { sites, error: sitesErr } = useSites()
  const isMobile = useIsMobile()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [siteFilter, setSiteFilter] = useState('')       // a site_name
  const [catFilter, setCatFilter] = useState('')
  const [form, setForm] = useState(null)                 // add / edit
  const [move, setMove] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [pdfErr, setPdfErr] = useState(null)

  // Investor names are shown to the money roles (who can read the register).
  const [investors, setInvestors] = useState([])
  const load = async () => {
    if (!canRead) { setLoading(false); return }
    setLoading(true); setErr(null)
    try {
      const [reg, links, invs] = await Promise.all([
        assetsService.listRegister(),
        seeMoney ? assetsService.listInvestorLinks() : [],
        seeMoney ? investorsService.listInvestors() : [],
      ])
      const byId = Object.fromEntries(links.map(l => [l.id, l.investor_id]))
      setRows(reg.map(r => ({ ...r, investor_id: byId[r.asset_id] || null })))
      setInvestors(invs)
    } catch (e) {
      setErr(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [canRead])

  // Group order: factory, client sites, Fleet, Unassigned.
  const groups = useMemo(() => {
    const rank = (r) => (r.site_type === 'factory' ? 0 : r.site_type === 'client_site' ? 1 : r.site_name === FLEET ? 2 : 3)
    const by = new Map()
    for (const r of rows) {
      const k = r.site_name || UNASSIGNED
      if (!by.has(k)) by.set(k, { name: k, siteId: r.site_id, siteType: r.site_type, rank: rank(r), items: [] })
      by.get(k).items.push(r)
    }
    return [...by.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
  }, [rows])

  const shownGroups = groups
    .filter(g => !siteFilter || g.name === siteFilter)
    .map(g => ({ ...g, items: g.items.filter(r => !catFilter || r.category === catFilter) }))
    .filter(g => g.items.length > 0)

  const detail = detailId ? rows.find(r => r.asset_id === detailId) : null
  const investorOf = (r) => (r.investor_id ? investors.find(i => i.id === r.investor_id)?.name || 'Investor not found' : null)

  const exportPlant = async (g) => {
    setPdfErr(null)
    try {
      await generatePlantOnSitePDF({ siteName: g.name, date: lagosToday(), assets: g.items })
    } catch (e) {
      setPdfErr(e)
    }
  }

  if (!canRead) return <div style={ui.panel}>You do not have access to the asset register.</div>

  return (
    <div>
      <div style={ui.header}>
        <div>
          <div style={ui.title}>Asset Register</div>
          <div style={ui.subtitle}>Machines, generators, moulds, pallets and other plant, by site. Every move is logged.</div>
        </div>
        {canWrite && <button type="button" style={ui.btn('primary')} onClick={() => setForm(blankForm())}>Add asset</button>}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {[{ k: '', l: 'All sites' }, ...groups.map(g => ({ k: g.name, l: g.name }))].map(x => (
          <button key={x.k || 'all'} type="button" data-board-allow data-ico-allow onClick={() => setSiteFilter(x.k)}
            style={{ ...ui.small(siteFilter === x.k ? theme.accent : theme.textMuted), minHeight: '40px' }}>{x.l}</button>
        ))}
      </div>
      <div style={{ maxWidth: '260px', marginBottom: '16px' }}>
        <label style={ui.label} htmlFor="ar-cat">Category</label>
        <select id="ar-cat" data-board-allow data-ico-allow style={ui.input} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{label(c)}</option>)}
        </select>
      </div>

      {sitesErr && <ErrorBox error={`Could not load sites: ${sitesErr.message}`} />}
      <ErrorBox error={err && `Could not load the asset register: ${err.message}`} onRetry={load} />
      <ErrorBox error={pdfErr && `Could not create the PDF: ${pdfErr.message}`} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}

      {loading ? <SkeletonRows rows={5} /> : !err && shownGroups.length === 0 ? (
        <div style={{ ...ui.panel, color: theme.textMuted, fontSize: '13px' }}>
          No assets{catFilter ? ` in ${label(catFilter)}` : ''}{siteFilter ? ` at ${siteFilter}` : ''}.
          {canWrite && <button type="button" style={{ ...ui.small(theme.accent), marginLeft: '12px' }} onClick={() => setForm(blankForm())}>Add asset</button>}
        </div>
      ) : !err && shownGroups.map(g => (
        <SiteGroup key={g.name} group={g} seeMoney={seeMoney} canWrite={canWrite} isMobile={isMobile} investorOf={investorOf}
          onExport={g.siteType === 'client_site' ? () => exportPlant(g) : null}
          onDetail={(r) => setDetailId(r.asset_id)}
          onEdit={(r) => setForm(formFrom(r))}
          onMove={(r) => setMove({ asset: r, toSiteId: '', quantity: String(r.quantity), date: lagosToday(), reason: '' })} />
      ))}

      {form && (
        <AssetForm form={form} setForm={setForm} sites={sites} canCost={canCost} canInvestor={canInvestor} investors={investors}
          onClose={() => setForm(null)}
          onSaved={async (msg) => { setForm(null); setNotice(msg); await load() }} />
      )}
      {move && (
        <MoveDialog move={move} setMove={setMove} sites={sites}
          onClose={() => setMove(null)}
          onMoved={async (msg) => { setMove(null); setNotice(msg); await load() }} />
      )}
      {detail && (
        <DetailDrawer asset={detail} rows={rows} sites={sites} seeMoney={seeMoney} isMobile={isMobile} investorOf={investorOf}
          onOpen={(id) => setDetailId(id)} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}

// ── one site group ───────────────────────────────────────────
function SiteGroup({ group: g, seeMoney, canWrite, isMobile, investorOf, onExport, onDetail, onEdit, onMove }) {
  const qtyByCat = {}
  for (const r of g.items) qtyByCat[r.category] = (qtyByCat[r.category] || 0) + Number(r.quantity || 0)
  const split = (src) => g.items.filter(r => r.funding_source === src)
  const costOf = (list) => list.reduce((s, r) => s + Number(r.acquisition_cost || 0), 0)
  const uncosted = g.items.filter(r => r.acquisition_cost == null).length
  const headers = ['Code', 'Name', 'Category', 'Qty', 'Serial / tag', 'Condition', 'Status', 'Funding', 'Acquired', 'Last moved', ...(seeMoney ? ['Cost'] : []), '']
  const rightCols = seeMoney ? [3, 10] : [3]

  return (
    <div style={{ ...ui.panel, borderLeft: `2px solid ${theme.accent}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '17px', fontWeight: '700', color: theme.text }}>{g.name}</div>
          <div style={ui.hint}>{g.items.length} record{g.items.length === 1 ? '' : 's'}</div>
        </div>
        {onExport && (
          <button type="button" data-board-allow data-ico-allow style={ui.btn('secondary')} onClick={onExport}>Plant on site (PDF)</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '12px', ...ui.num }}>
        <Fact label="Items" value={fmtQty(g.items.length)} sub={`APCL ${split('apcl').length} · Investor ${split('investor').length}`} />
        <Fact label="Total quantity" value={fmtQty(g.items.reduce((s, r) => s + Number(r.quantity || 0), 0))}
          sub={`APCL ${fmtQty(split('apcl').reduce((s, r) => s + Number(r.quantity || 0), 0))} · Investor ${fmtQty(split('investor').reduce((s, r) => s + Number(r.quantity || 0), 0))}`} />
        {seeMoney && (
          <Fact label="Acquisition cost" value={fmtNaira(costOf(g.items))}
            sub={`APCL ${fmtNaira(costOf(split('apcl')))} · Investor ${fmtNaira(costOf(split('investor')))}${uncosted ? ` · ${uncosted} without cost` : ''}`} />
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {Object.entries(qtyByCat).sort().map(([c, q]) => (
          <span key={c} style={{ fontSize: '12px', padding: '2px 8px', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textMuted, ...ui.num }}>
            {label(c)} <strong style={{ color: theme.text }}>{fmtQty(q)}</strong>
          </span>
        ))}
      </div>

      <StackTable headers={headers} rightCols={rightCols}>
        {g.items.map(r => (
          <tr key={r.asset_id}>
            <td style={ui.td}>{r.code || '—'}</td>
            <td style={ui.td}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              {r.parent_asset_id && <div style={ui.hint}>split record</div>}
            </td>
            <td style={ui.td}>{label(r.category)}</td>
            <td style={{ ...ui.td, ...ui.right, fontWeight: 700 }}>{fmtQty(r.quantity)}</td>
            <td style={ui.td}>{r.serial_or_tag || '—'}</td>
            <td style={ui.td}><Pill label={label(r.condition)} color={CONDITION_COLOR[r.condition]} /></td>
            <td style={ui.td}><Pill label={label(r.status)} color={STATUS_COLOR[r.status]} /></td>
            <td style={ui.td}>
              <Pill label={r.funding_source === 'investor' ? 'Investor' : 'APCL'} color={r.funding_source === 'investor' ? theme.accent : theme.blue} />
              {seeMoney && investorOf(r) && <div style={ui.hint}>{investorOf(r)}</div>}
            </td>
            <td style={ui.td}>{fmtDate(r.acquired_on)}</td>
            <td style={ui.td}>{fmtDate(r.last_moved_on)}</td>
            {seeMoney && <td style={{ ...ui.td, ...ui.right }}>{fmtNaira(r.acquisition_cost)}</td>}
            <td style={ui.td}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                <button type="button" data-board-allow data-ico-allow style={ui.small()} onClick={() => onDetail(r)}>Details</button>
                {canWrite && <button type="button" style={ui.small()} onClick={() => onEdit(r)}>Edit</button>}
                {canWrite && r.status !== 'retired' && <button type="button" style={ui.small(theme.accent)} onClick={() => onMove(r)}>Move</button>}
              </div>
            </td>
          </tr>
        ))}
      </StackTable>
    </div>
  )
}

const Fact = ({ label: l, value, sub }) => (
  <div>
    <div style={ui.micro}>{l}</div>
    <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text, marginTop: '2px', ...ui.num }}>{value}</div>
    {sub && <div style={ui.hint}>{sub}</div>}
  </div>
)

// ── add / edit ───────────────────────────────────────────────
const blankForm = () => ({
  mode: 'add', name: '', code: '', category: '', quantity: '1', serial_or_tag: '', acquired_on: '',
  acquisition_cost: '', funding_source: 'apcl', investor_id: '', investment_pool_ref: '', condition: 'good', status: 'active', notes: '', site_id: '',
})
const formFrom = (r) => ({
  mode: 'edit', id: r.asset_id, siteLabel: r.site_name,
  name: r.name || '', code: r.code || '', category: r.category || '', quantity: String(r.quantity ?? 1),
  serial_or_tag: r.serial_or_tag || '', acquired_on: r.acquired_on || '',
  acquisition_cost: r.acquisition_cost == null ? '' : String(r.acquisition_cost),
  funding_source: r.funding_source || 'apcl', investor_id: r.investor_id || '', investment_pool_ref: r.investment_pool_ref || '',
  condition: r.condition || 'good', status: r.status || 'active', notes: r.notes || '',
})

function AssetForm({ form, setForm, sites, canCost, canInvestor, investors = [], onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const problem = !form.name.trim() ? 'Enter a name.'
    : !form.category ? 'Choose a category.'
    : !(Number.isInteger(Number(form.quantity)) && Number(form.quantity) >= 1) ? 'Quantity must be a whole number, 1 or more.'
    : (canCost && form.acquisition_cost !== '' && !(Number(form.acquisition_cost) >= 0)) ? 'Cost cannot be negative.' : null

  const save = async () => {
    setBusy(true); setErr(null)
    const payload = {
      name: form.name.trim(), code: form.code.trim() || null, category: form.category,
      quantity: Number(form.quantity), serial_or_tag: form.serial_or_tag.trim() || null,
      acquired_on: form.acquired_on || null, funding_source: form.funding_source,
      condition: form.condition, status: form.status, notes: form.notes.trim() || null,
      acquisition_cost: form.acquisition_cost === '' ? null : Number(form.acquisition_cost),
      investor_id: form.investor_id || null,
    }
    try {
      if (form.mode === 'add') {
        await assetsService.createAsset({ ...payload, site_id: form.site_id || null }, { canCost, canInvestor })
        await onSaved(`${payload.name} added${form.site_id ? ` at ${siteName(form.site_id, sites)}` : ''}.`)
      } else {
        await assetsService.updateAsset(form.id, payload, { canCost, canInvestor })
        await onSaved(`${payload.name} saved.`)
      }
    } catch (e) {
      setErr(e)   // includes the site-guard message, verbatim
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog title={form.mode === 'add' ? 'Add asset' : `Edit ${form.name || 'asset'}`}
      confirmLabel={form.mode === 'add' ? 'Add asset' : 'Save'} busy={busy} confirmDisabled={!!problem}
      onCancel={onClose} onConfirm={save}>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
        <Field id="af-name" label="Name *"><input id="af-name" style={ui.input} value={form.name} onChange={set('name')} /></Field>
        <Field id="af-code" label="Code (optional)"><input id="af-code" style={ui.input} value={form.code} onChange={set('code')} /></Field>
        <Field id="af-cat" label="Category *">
          <select id="af-cat" style={ui.input} value={form.category} onChange={set('category')}>
            <option value="">Choose…</option>
            {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
        <Field id="af-type" label="Asset type">
          <div id="af-type" style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent', color: theme.textMuted }}>
            {form.category ? label(assetTypeFor(form.category)) : '—'}
          </div>
          <div style={ui.hint}>Set from the category.</div>
        </Field>
        <Field id="af-qty" label="Quantity *"><input id="af-qty" type="number" inputMode="numeric" min="1" step="1" style={ui.input} value={form.quantity} onChange={set('quantity')} /></Field>
        <Field id="af-tag" label="Serial / tag"><input id="af-tag" style={ui.input} value={form.serial_or_tag} onChange={set('serial_or_tag')} /></Field>
        <Field id="af-acq" label="Acquired on"><input id="af-acq" type="date" style={ui.input} value={form.acquired_on} onChange={set('acquired_on')} /></Field>
        {canCost && (
          <Field id="af-cost" label="Acquisition cost (₦)"><input id="af-cost" type="number" inputMode="decimal" min="0" step="any" style={ui.input} value={form.acquisition_cost} onChange={set('acquisition_cost')} /></Field>
        )}
        <Field id="af-fund" label="Funding source">
          <select id="af-fund" style={ui.input} value={form.funding_source} onChange={set('funding_source')}>
            <option value="apcl">APCL</option>
            <option value="investor">Investor</option>
          </select>
        </Field>
        {canInvestor && form.funding_source === 'investor' && (
          <Field id="af-investor" label="Investor">
            <select id="af-investor" style={ui.input} value={form.investor_id} onChange={set('investor_id')}>
              <option value="">Not set</option>
              {investors.filter(i => i.kind !== 'apcl' && (i.is_active || i.id === form.investor_id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <div style={ui.hint}>From the investor register.</div>
          </Field>
        )}
        {canInvestor && form.investment_pool_ref && (
          <Field id="af-pool" label="Pool ref (legacy)">
            <div id="af-pool" style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent', color: theme.textMuted }}>{form.investment_pool_ref}</div>
          </Field>
        )}
        <Field id="af-cond" label="Condition">
          <select id="af-cond" style={ui.input} value={form.condition} onChange={set('condition')}>
            {ASSET_CONDITIONS.map(c => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
        <Field id="af-status" label="Status">
          <select id="af-status" style={ui.input} value={form.status} onChange={set('status')}>
            {ASSET_STATUSES.map(c => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
        {form.mode === 'add' ? (
          <Field id="af-site" label="Site">
            <select id="af-site" style={ui.input} value={form.site_id} onChange={set('site_id')}>
              <option value="">No fixed site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field id="af-site-ro" label="Site">
            <div id="af-site-ro" style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent', color: theme.textMuted }}>{form.siteLabel || '—'}</div>
            <div style={ui.hint}>Use Move to change the site — every move is logged.</div>
          </Field>
        )}
        <Field id="af-notes" label="Notes"><textarea id="af-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} /></Field>
        {problem && <div style={ui.hint}>{problem}</div>}
        <ErrorBox error={err} />
      </div>
    </ConfirmDialog>
  )
}

const Field = ({ id, label: l, children }) => (
  <div style={ui.field}>
    <label style={ui.label} htmlFor={id}>{l}</label>
    {children}
  </div>
)

// ── move ─────────────────────────────────────────────────────
function MoveDialog({ move, setMove, sites, onClose, onMoved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const a = move.asset
  const total = Number(a.quantity)
  const q = Number(move.quantity)
  const dests = sites.filter(s => s.id !== a.site_id)
  const set = (k) => (e) => setMove(m => ({ ...m, [k]: e.target.value }))
  const problem = !move.toSiteId ? 'Choose a destination.'
    : !(Number.isInteger(q) && q >= 1 && q <= total) ? `Quantity must be between 1 and ${total}.`
    : !move.date ? 'Enter the date.'
    : !move.reason.trim() ? 'Give a reason for the move.' : null

  const run = async () => {
    setBusy(true); setErr(null)
    try {
      const newId = await assetsService.moveAsset({ assetId: a.asset_id, toSiteId: move.toSiteId, quantity: q, movedOn: move.date, reason: move.reason.trim() })
      const dest = siteName(move.toSiteId, sites)
      const msg = q === total
        ? `${a.name}: all ${fmtQty(q)} now at ${dest}.`
        : `${a.name}: ${fmtQty(q)} now at ${dest} (new record${newId ? ` ${String(newId).slice(0, 8)}` : ''}); ${fmtQty(total - q)} stay at ${a.site_name}.`
      await onMoved(msg)
    } catch (e) {
      setErr(e)   // move_asset's message, verbatim
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog title={`Move ${a.name}`} body={`Now at ${a.site_name}. Quantity on this record: ${fmtQty(total)}.`}
      confirmLabel="Move asset" busy={busy} confirmDisabled={!!problem} onCancel={onClose} onConfirm={run}>
      <Field id="mv-to" label="Destination *">
        <select id="mv-to" style={ui.input} value={move.toSiteId} onChange={set('toSiteId')}>
          <option value="">Choose…</option>
          {dests.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field id="mv-qty" label="Quantity *">
        <input id="mv-qty" type="number" inputMode="numeric" min="1" max={total} step="1" style={ui.input} value={move.quantity} onChange={set('quantity')} />
        {Number.isInteger(q) && q >= 1 && q < total && (
          <div style={{ ...ui.hint, color: theme.accent }}>This splits the record: {fmtQty(q)} move, {fmtQty(total - q)} stay</div>
        )}
      </Field>
      <Field id="mv-date" label="Date *"><input id="mv-date" type="date" style={ui.input} value={move.date} onChange={set('date')} /></Field>
      <Field id="mv-reason" label="Reason *"><textarea id="mv-reason" style={ui.textarea} value={move.reason} onChange={set('reason')} /></Field>
      {problem && <div style={ui.hint}>{problem}</div>}
      <ErrorBox error={err} />
    </ConfirmDialog>
  )
}

// ── detail drawer ────────────────────────────────────────────
function DetailDrawer({ asset: a, rows, sites, seeMoney, isMobile, investorOf, onOpen, onClose }) {
  const [moves, setMoves] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => {
    setErr(null); setMoves(null)
    assetsService.listMovements(a.asset_id).then(setMoves).catch(setErr)
  }
  useEffect(load, [a.asset_id])
  const parent = a.parent_asset_id ? rows.find(r => r.asset_id === a.parent_asset_id) : null
  const children = rows.filter(r => r.parent_asset_id === a.asset_id)
  const where = (id) => (id ? siteName(id, sites) : 'No fixed site')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: Z.modal }} onClick={onClose}>
      <div role="dialog" aria-label={`${a.name} details`} onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '100%' : '440px', background: theme.card, borderLeft: `1px solid ${theme.border}`, padding: '16px', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{a.name}</div>
            <div style={ui.hint}>{a.code || 'no code'} · {a.site_name}</div>
          </div>
          <button type="button" data-board-allow data-ico-allow style={ui.btn('secondary')} onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <Pill label={label(a.condition)} color={CONDITION_COLOR[a.condition]} />
          <Pill label={label(a.status)} color={STATUS_COLOR[a.status]} />
          <Pill label={a.funding_source === 'investor' ? 'Investor' : 'APCL'} color={a.funding_source === 'investor' ? theme.accent : theme.blue} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <Fact label="Category" value={label(a.category)} />
          <Fact label="Quantity" value={fmtQty(a.quantity)} />
          <Fact label="Serial / tag" value={a.serial_or_tag || '—'} />
          <Fact label="Acquired" value={fmtDate(a.acquired_on)} />
          {seeMoney && <Fact label="Acquisition cost" value={fmtNaira(a.acquisition_cost)} />}
          {seeMoney && investorOf(a) && <Fact label="Investor" value={investorOf(a)} />}
          {seeMoney && a.investment_pool_ref && <Fact label="Pool ref (legacy)" value={a.investment_pool_ref} />}
        </div>
        {a.notes && <div style={{ ...ui.hint, marginBottom: '16px', whiteSpace: 'pre-wrap' }}>{a.notes}</div>}
        {a.parent_asset_id && (
          <div style={{ marginBottom: '16px', fontSize: '13px' }}>
            Split from{' '}
            {parent
              ? <button type="button" data-board-allow data-ico-allow style={ui.small()} onClick={() => onOpen(parent.asset_id)}>{parent.name} at {parent.site_name}</button>
              : <span style={{ color: theme.textMuted }}>a record no longer in the register</span>}
          </div>
        )}
        {children.length > 0 && (
          <div style={{ marginBottom: '16px', fontSize: '13px' }}>
            <div style={ui.micro}>Split off this record</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {children.map(c => (
                <button key={c.asset_id} type="button" data-board-allow data-ico-allow style={ui.small()} onClick={() => onOpen(c.asset_id)}>
                  {fmtQty(c.quantity)} at {c.site_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={ui.section}>Movement history</div>
        <ErrorBox error={err && `Could not load movements: ${err.message}`} onRetry={load} />
        {!moves && !err ? <SkeletonRows rows={2} /> : moves && moves.length === 0 ? <div style={ui.hint}>No moves recorded.</div> : moves && (
          <div style={{ borderLeft: `2px solid ${theme.border}`, paddingLeft: '12px' }}>
            {moves.map(m => (
              <div key={m.id} style={{ marginBottom: '12px', fontSize: '13px', ...ui.num }}>
                <div style={{ color: theme.textMuted, fontSize: '12px' }}>{fmtDate(m.moved_on)} · {m.moved_by_name || 'unknown'} · logged {fmtDateTime(m.created_at)}</div>
                <div style={{ color: theme.text }}>
                  {where(m.from_site_id)} → {where(m.to_site_id)} · <strong>{fmtQty(m.quantity)}</strong>
                  {m.split_from_asset_id && m.asset_id !== a.asset_id ? ' (split off to another record)' : m.split_from_asset_id ? ' (split from the original record)' : ''}
                </div>
                {m.reason && <div style={ui.hint}>{m.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default withPhase7Touch(AssetRegister)
