import { useEffect, useMemo, useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { productsService } from '../../services/products'
import { siteContractsService, lagosToday } from '../../services/siteContracts'
import { hasRole } from '../../lib/roles'
import { compressImage } from '../../utils/compressImage'
import { handoverYardWarning } from '../../utils/handoverYard'
import { theme, ui, Pill, fmtQty, fmtDate, countdown, daysFrom, ErrorBox, SkeletonRows, PhotoLink, ConfirmDialog, StackTable } from './siteUi'

// Phase 7B-1 — blocks handed to the client and the client's verdict.
// status, deemed_accept_due and rectify_due are computed by the DB trigger and
// shown read-only. Sequoia deemed acceptance is applied by the nightly job,
// never from the UI.

export const HANDOVER_WRITE_ROLES = ['md', 'production_manager', 'assistant_production_manager', 'store_officer']

const emptyForm = (siteId = '') => ({ siteId, date: lagosToday(), blockType: '', qty: '', clientRep: '', notes: '', photo: null })

export default function Handovers({ userProfile }) {
  const canWrite = hasRole(userProfile, ...HANDOVER_WRITE_ROLES)
  const isMD = userProfile?.role === 'md'
  const today = lagosToday()
  const { sites, error: sitesErr } = useSites()
  const clientSites = sites.filter(s => s.site_type === 'client_site')
  const [siteFilter, setSiteFilter] = useState('')
  const [rows, setRows] = useState([])
  const [yard, setYard] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState(null)
  const [ok, setOk] = useState('')
  const [verdict, setVerdict] = useState(null)   // { row, accepted, rejected, reason, date }
  const [rectify, setRectify] = useState(null)   // { row, date, notes }
  const [delTarget, setDelTarget] = useState(null)
  const [dlgBusy, setDlgBusy] = useState(false)
  const [dlgErr, setDlgErr] = useState(null)
  const [yardConfirm, setYardConfirm] = useState(null)   // warning text awaiting "Save anyway"

  useEffect(() => {
    productsService.getActive().then(p => setProducts(p.filter(x => x.is_own_production !== false))).catch(e => setFormErr(e))
  }, [])
  useEffect(() => {
    if (!form.siteId && clientSites.length) setForm(f => ({ ...f, siteId: clientSites[0].id }))
  }, [clientSites.length])

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const [h, y] = await Promise.all([
        siteContractsService.listHandovers({ siteId: siteFilter || null }),
        siteContractsService.listYard(null),
      ])
      setRows(h); setYard(y)
    } catch (e) {
      setErr(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [siteFilter])

  const isFullSupply = (siteId) => sites.find(s => s.id === siteId)?.contract_model === 'full_supply'
  const yardFor = (siteId, blockType) => yard.find(y => y.site_id === siteId && y.block_type === blockType)
  const shownYard = yard.filter(y => !siteFilter || y.site_id === siteFilter)
  const formYard = form.blockType ? yardFor(form.siteId, form.blockType) : null
  const overYard = formYard && Number(form.qty) > Number(formYard.in_yard)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const formProblem = !form.siteId ? 'Choose the site.' : !form.blockType ? 'Choose the block type.' : !(Number(form.qty) > 0) ? 'Enter the quantity handed over.' : !form.date ? 'Enter the date.' : null

  const submit = (e) => {
    e.preventDefault()
    if (formProblem || busy) return
    // Compare with the yard balance first; a missing yard row means 0 in the
    // yard. If the yard did not load, there is nothing to compare against.
    const warning = handoverYardWarning({
      qty: form.qty,
      balance: err || loading ? null : (formYard ? formYard.in_yard : 0),
      blockType: form.blockType,
      siteName: siteName(form.siteId, sites),
    })
    if (warning) { setYardConfirm(warning); return }
    save()
  }

  const save = async () => {
    setBusy(true); setFormErr(null); setOk('')
    let photoPath = null
    let photoWarn = ''
    try {
      if (form.photo) {
        try {
          const site = sites.find(s => s.id === form.siteId)
          photoPath = await siteContractsService.uploadPhoto({ siteCode: site?.code, kind: 'handovers', date: form.date, file: await compressImage(form.photo) })
        } catch (pe) {
          photoWarn = ` The photo did not upload (${pe.message}); the handover was saved without it.`
        }
      }
      await siteContractsService.createHandover({
        site_id: form.siteId, handover_date: form.date, block_type: form.blockType,
        qty_handed_over: Math.round(Number(form.qty)), client_rep: form.clientRep.trim() || null,
        photo_path: photoPath, notes: form.notes.trim() || null,
      })
      setOk(`Handover recorded: ${fmtQty(form.qty)} ${form.blockType}.${photoWarn}`)
      setForm(f => ({ ...emptyForm(f.siteId), date: f.date }))
      await load()
    } catch (e2) {
      setFormErr(e2)
    } finally {
      setBusy(false)
    }
  }

  const verdictProblem = useMemo(() => {
    if (!verdict) return null
    const a = Number(verdict.accepted || 0), r = Number(verdict.rejected || 0)
    if (a < 0 || r < 0) return 'Quantities cannot be negative.'
    if (a + r === 0) return 'Enter the accepted and/or rejected quantity.'
    if (a + r > verdict.row.qty_handed_over) return `Accepted + rejected cannot exceed ${fmtQty(verdict.row.qty_handed_over)} handed over.`
    if (r > 0 && !verdict.reason.trim()) return 'Give the rejection reason.'
    if (!verdict.date) return 'Enter the verdict date.'
    return null
  }, [verdict])

  const runDialog = async (fn) => {
    setDlgBusy(true); setDlgErr(null)
    try {
      await fn()
      setVerdict(null); setRectify(null); setDelTarget(null)
      await load()
    } catch (e) {
      setDlgErr(e)
    } finally {
      setDlgBusy(false)
    }
  }

  return (
    <div>
      <div style={ui.header}>
        <div>
          <div style={ui.title}>Block Handovers</div>
          <div style={ui.subtitle}>Blocks handed to the client, the client's verdict, and the rectification clock.</div>
        </div>
      </div>
      <ErrorBox error={sitesErr && `Could not load sites: ${sitesErr.message}`} />

      {/* Yard balance per block type */}
      <div style={ui.panel}>
        <div style={ui.section}>Site yard balance</div>
        {loading ? <SkeletonRows rows={1} /> : shownYard.length === 0 ? (
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>No batches or handovers at client sites yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {shownYard.map(y => (
              <div key={`${y.site_id}-${y.block_type}`} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', background: theme.surface }}>
                <div style={ui.micro}>{y.site_name} · {y.block_type}</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: Number(y.in_yard) < 0 ? theme.red : theme.text, ...ui.num, marginTop: '4px' }}>{fmtQty(y.in_yard)}</div>
                <div style={ui.hint}>in yard · {fmtQty(y.batched)} batched − {fmtQty(y.damaged_after_batch)} damaged − {fmtQty(y.handed_over)} handed over</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canWrite && (
        <form style={ui.panel} onSubmit={submit} aria-label="Record a handover">
          <div style={ui.section}>Record a handover</div>
          <ErrorBox error={formErr} />
          {ok && <div style={ui.ok}>{ok}</div>}
          <div style={ui.formGrid}>
            <div style={ui.field}>
              <label style={ui.label} htmlFor="ho-site">Site *</label>
              <select id="ho-site" style={ui.input} value={form.siteId} onChange={set('siteId')}>
                {clientSites.length === 0 && <option value="">No client sites</option>}
                {clientSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={ui.field}>
              <label style={ui.label} htmlFor="ho-date">Handover date *</label>
              <input id="ho-date" type="date" style={ui.input} value={form.date} onChange={set('date')} />
            </div>
            <div style={ui.field}>
              <label style={ui.label} htmlFor="ho-type">Block type *</label>
              <select id="ho-type" style={ui.input} value={form.blockType} onChange={set('blockType')}>
                <option value="">— Select —</option>
                {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div style={ui.field}>
              <label style={ui.label} htmlFor="ho-qty">Quantity handed over *</label>
              <input id="ho-qty" type="number" inputMode="numeric" min="1" step="1" style={ui.input} value={form.qty} onChange={set('qty')} />
              {formYard && <div style={ui.hint}>In yard: {fmtQty(formYard.in_yard)}</div>}
              {overYard && <div style={{ ...ui.fieldError, color: theme.accent }}>More than the {fmtQty(formYard.in_yard)} recorded in the yard. Check batches and damages — you can still save.</div>}
            </div>
            <div style={ui.field}>
              <label style={ui.label} htmlFor="ho-rep">Client representative</label>
              <input id="ho-rep" style={ui.input} value={form.clientRep} onChange={set('clientRep')} />
            </div>
            <div style={ui.field}>
              <label style={ui.label} htmlFor="ho-photo">Photo</label>
              <input id="ho-photo" type="file" accept="image/*" capture="environment" style={{ ...ui.input, paddingTop: '10px' }} onChange={e => setForm(f => ({ ...f, photo: e.target.files?.[0] || null }))} />
            </div>
          </div>
          <div style={ui.field}>
            <label style={ui.label} htmlFor="ho-notes">Notes</label>
            <textarea id="ho-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} />
          </div>
          <button type="submit" style={{ ...ui.btn('primary', !!formProblem || busy), width: '100%', minHeight: '52px' }} disabled={!!formProblem || busy}>
            {busy ? 'Saving…' : 'Record handover'}
          </button>
        </form>
      )}

      <div style={ui.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div style={{ ...ui.section, marginBottom: 0 }}>Handovers</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[{ id: '', name: 'All sites' }, ...clientSites].map(s => (
              <button key={s.id || 'all'} data-board-allow data-ico-allow type="button" onClick={() => setSiteFilter(s.id)}
                style={{ ...ui.small(siteFilter === s.id ? theme.accent : theme.textMuted), minHeight: '36px' }}>{s.name}</button>
            ))}
          </div>
        </div>
        <ErrorBox error={err && `Could not load handovers: ${err.message}`} onRetry={load} />
        {loading ? <SkeletonRows /> : !err && rows.length === 0 ? (
          <div style={{ color: theme.textMuted, fontSize: '13px', padding: '12px 0' }}>No handovers recorded yet.</div>
        ) : !err && (
          <div>
            <StackTable headers={['Date', 'Site', 'Block type', 'Handed', 'Accepted', 'Rejected', 'Status', 'Clock', 'Rep / notes', 'Photo', '']} rightCols={[3, 4, 5]}>
                {rows.map(r => {
                  const fullSupply = isFullSupply(r.site_id)
                  const openRejection = r.qty_rejected > 0 && !r.rectified_on
                  const rectOverdue = openRejection && daysFrom(today, r.rectify_due) < 0
                  return (
                    <tr key={r.id}>
                      <td style={ui.td}>{fmtDate(r.handover_date)}</td>
                      <td style={ui.td}>{siteName(r.site_id, sites)}</td>
                      <td style={ui.td}>{r.block_type}</td>
                      <td style={{ ...ui.td, ...ui.right }}>{fmtQty(r.qty_handed_over)}</td>
                      <td style={{ ...ui.td, ...ui.right }}>{fmtQty(r.qty_accepted)}</td>
                      <td style={{ ...ui.td, ...ui.right, color: r.qty_rejected > 0 ? theme.red : theme.text }}>{fmtQty(r.qty_rejected)}</td>
                      <td style={ui.td}>
                        <Pill status={r.status} />
                        {r.verdict_on && <div style={ui.hint}>verdict {fmtDate(r.verdict_on)}</div>}
                        {r.rejection_reason && <div style={ui.hint}>{r.rejection_reason}</div>}
                      </td>
                      <td style={ui.td}>
                        {r.status === 'pending' && fullSupply && r.deemed_accept_due && (
                          <div style={{ color: theme.accent, fontSize: '12px' }}>Deemed accepted after {fmtDate(r.deemed_accept_due)} ({countdown(today, r.deemed_accept_due)})</div>
                        )}
                        {openRejection && (
                          <div style={{ color: rectOverdue ? theme.red : theme.accent, fontSize: '12px', fontWeight: rectOverdue ? 700 : 400 }}>
                            {rectOverdue ? 'OVERDUE — ' : ''}Rectify by {fmtDate(r.rectify_due)} ({countdown(today, r.rectify_due)})
                          </div>
                        )}
                        {r.rectified_on && <div style={{ color: theme.green, fontSize: '12px' }}>Rectified {fmtDate(r.rectified_on)}{r.rectification_notes ? ` — ${r.rectification_notes}` : ''}</div>}
                        {r.deemed && <div style={ui.hint}>Applied by the nightly job</div>}
                      </td>
                      <td style={ui.td}>{r.client_rep || '—'}{r.notes && <div style={ui.hint}>{r.notes}</div>}</td>
                      <td style={ui.td}><PhotoLink path={r.photo_path} /></td>
                      <td style={ui.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                          {canWrite && r.status === 'pending' && (
                            <button type="button" style={ui.small()} onClick={() => { setDlgErr(null); setVerdict({ row: r, accepted: String(r.qty_handed_over), rejected: '0', reason: '', date: today }) }}>Verdict</button>
                          )}
                          {canWrite && openRejection && (
                            <button type="button" style={ui.small(theme.green)} onClick={() => { setDlgErr(null); setRectify({ row: r, date: today, notes: '' }) }}>Rectified</button>
                          )}
                          {isMD && (
                            <button type="button" style={ui.small(theme.red)} onClick={() => { setDlgErr(null); setDelTarget(r) }}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </StackTable>
          </div>
        )}
      </div>

      {verdict && (
        <ConfirmDialog
          title={`Client verdict — ${fmtQty(verdict.row.qty_handed_over)} ${verdict.row.block_type}`}
          body={`Handed over ${fmtDate(verdict.row.handover_date)} at ${siteName(verdict.row.site_id, sites)}. A rejection opens a 2-day rectification clock.`}
          confirmLabel="Save verdict" busy={dlgBusy} confirmDisabled={!!verdictProblem}
          onCancel={() => setVerdict(null)}
          onConfirm={() => runDialog(() => siteContractsService.recordVerdict(verdict.row.id, {
            qty_accepted: Math.round(Number(verdict.accepted || 0)), qty_rejected: Math.round(Number(verdict.rejected || 0)),
            rejection_reason: Number(verdict.rejected) > 0 ? verdict.reason.trim() : null, verdict_on: verdict.date,
          }))}
        >
          <div style={ui.field}><label style={ui.label} htmlFor="v-acc">Accepted</label>
            <input id="v-acc" type="number" inputMode="numeric" min="0" style={ui.input} value={verdict.accepted} onChange={e => setVerdict(v => ({ ...v, accepted: e.target.value }))} /></div>
          <div style={ui.field}><label style={ui.label} htmlFor="v-rej">Rejected</label>
            <input id="v-rej" type="number" inputMode="numeric" min="0" style={ui.input} value={verdict.rejected} onChange={e => setVerdict(v => ({ ...v, rejected: e.target.value }))} /></div>
          <div style={ui.field}><label style={ui.label} htmlFor="v-reason">Rejection reason {Number(verdict.rejected) > 0 ? '*' : ''}</label>
            <input id="v-reason" style={ui.input} value={verdict.reason} disabled={!(Number(verdict.rejected) > 0)} onChange={e => setVerdict(v => ({ ...v, reason: e.target.value }))} /></div>
          <div style={ui.field}><label style={ui.label} htmlFor="v-date">Verdict date *</label>
            <input id="v-date" type="date" style={ui.input} value={verdict.date} onChange={e => setVerdict(v => ({ ...v, date: e.target.value }))} /></div>
          {verdictProblem && <div style={ui.hint}>{verdictProblem}</div>}
          <ErrorBox error={dlgErr} />
        </ConfirmDialog>
      )}

      {rectify && (
        <ConfirmDialog
          title={`Rectification — ${fmtQty(rectify.row.qty_rejected)} rejected ${rectify.row.block_type}`}
          body={`Rejected ${fmtDate(rectify.row.verdict_on)}: ${rectify.row.rejection_reason}. Due by ${fmtDate(rectify.row.rectify_due)}.`}
          confirmLabel="Save rectification" busy={dlgBusy} confirmDisabled={!rectify.date}
          onCancel={() => setRectify(null)}
          onConfirm={() => runDialog(() => siteContractsService.recordRectification(rectify.row.id, { rectified_on: rectify.date, rectification_notes: rectify.notes.trim() }))}
        >
          <div style={ui.field}><label style={ui.label} htmlFor="r-date">Rectified on *</label>
            <input id="r-date" type="date" style={ui.input} value={rectify.date} onChange={e => setRectify(v => ({ ...v, date: e.target.value }))} /></div>
          <div style={ui.field}><label style={ui.label} htmlFor="r-notes">What was done</label>
            <textarea id="r-notes" style={ui.textarea} value={rectify.notes} onChange={e => setRectify(v => ({ ...v, notes: e.target.value }))} /></div>
          <ErrorBox error={dlgErr} />
        </ConfirmDialog>
      )}

      {yardConfirm && (
        <ConfirmDialog
          title="Yard balance too low"
          body={yardConfirm}
          confirmLabel="Save anyway"
          onCancel={() => setYardConfirm(null)}
          onConfirm={() => { setYardConfirm(null); save() }}
        />
      )}

      {delTarget && (
        <ConfirmDialog
          title={`Delete handover of ${fmtQty(delTarget.qty_handed_over)} ${delTarget.block_type} on ${fmtDate(delTarget.handover_date)}?`}
          body={`At ${siteName(delTarget.site_id, sites)}. The blocks return to the site yard balance. This cannot be undone.`}
          confirmLabel="Delete handover" danger busy={dlgBusy}
          onCancel={() => setDelTarget(null)}
          onConfirm={() => runDialog(() => siteContractsService.deleteHandover(delTarget.id))}
        >
          <ErrorBox error={dlgErr} />
        </ConfirmDialog>
      )}
    </div>
  )
}
