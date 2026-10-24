import { withPhase7Touch } from './siteUi'
import { useEffect, useMemo, useState } from 'react'
import SitePicker, { useSites } from '../SitePicker'
import { DUTSE_SITE_ID, siteName } from '../../services/sites'
import { siteContractsService, lagosToday } from '../../services/siteContracts'
import { hasRole } from '../../lib/roles'
import { compressImage } from '../../utils/compressImage'
import { buildRejectionNoticeText } from '../../utils/siteNotices'
import { theme, ui, Pill, fmtDec, fmtDate, ErrorBox, SkeletonRows, PhotoLink, CopyButton, ConfirmDialog, StackTable } from './siteUi'

// Phase 7B-1 — every material delivery checked on arrival. Writes go through
// the record_material_receipt RPC, which adds ONLY the accepted quantity to
// stock; corrections are void + re-record (void_material_receipt adds an
// offsetting 'out' movement — receipts are never edited).

export const RECEIVING_WRITE_ROLES = ['md', 'store_officer', 'production_manager', 'assistant_production_manager']
export const RECEIVING_VOID_ROLES = ['md', 'store_officer']

const toNum = (v) => (v === '' || v == null ? NaN : Number(v))

// Why the form can't be submitted yet, or null when it can. The DB enforces
// the same rules; this keeps the button honest.
export function receiptFormProblem(form, item) {
  if (!item) return 'Choose the item delivered.'
  const del = toNum(form.delivered)
  const acc = toNum(form.accepted === '' ? form.delivered : form.accepted)
  if (!(del > 0)) return 'Enter the delivered quantity.'
  if (!(acc >= 0) || acc > del) return 'Accepted must be between 0 and the delivered quantity.'
  if (acc < del && !form.reason.trim()) return 'Give a reason for the rejected quantity.'
  if (!form.receivedOn) return 'Enter the date received.'
  return null
}

const emptyForm = () => ({ itemId: '', receivedOn: lagosToday(), delivered: '', accepted: '', unit: 'kg', reason: '', supplier: '', ref: '', notes: '', photo: null })

export function ReceivingForm({ onSaved }) {
  const { sites } = useSites()
  const [siteId, setSiteId] = useState(DUTSE_SITE_ID)
  const [items, setItems] = useState([])
  const [itemsErr, setItemsErr] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState('')

  useEffect(() => {
    let alive = true
    setItems([]); setItemsErr(null)
    setForm(f => ({ ...f, itemId: '' }))
    siteContractsService.listSiteItems(siteId)
      .then(r => { if (alive) setItems(r) })
      .catch(e => { if (alive) setItemsErr(e) })
    return () => { alive = false }
  }, [siteId])

  const item = items.find(i => i.id === form.itemId)
  const isKg = item?.unit === 'kg'
  const factor = isKg && form.unit === 'tonnes' ? 1000 : 1
  const accRaw = form.accepted === '' ? form.delivered : form.accepted
  const rejected = (toNum(form.delivered) || 0) - (toNum(accRaw) || 0)
  const problem = receiptFormProblem(form, item)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (problem || busy) return
    setBusy(true); setErr(null); setOk('')
    let photoPath = null
    let photoWarn = ''
    try {
      if (form.photo) {
        try {
          const site = sites.find(s => s.id === siteId)
          const file = await compressImage(form.photo)
          photoPath = await siteContractsService.uploadPhoto({ siteCode: site?.code, kind: 'receipts', date: form.receivedOn, file })
        } catch (pe) {
          photoWarn = ` The photo did not upload (${pe.message}); the delivery was saved without it.`
        }
      }
      await siteContractsService.recordReceipt({
        itemId: form.itemId,
        receivedOn: form.receivedOn,
        qtyDelivered: Number(form.delivered) * factor,
        qtyAccepted: Number(accRaw) * factor,
        rejectionReason: rejected > 0 ? form.reason.trim() : null,
        supplier: form.supplier.trim(),
        ref: form.ref.trim(),
        photoPath,
        notes: form.notes.trim(),
      })
      setOk(`Delivery recorded. ${fmtDec(Number(accRaw) * factor)} ${item.unit} added to ${item.name} stock.${photoWarn}`)
      setForm(f => ({ ...emptyForm(), receivedOn: f.receivedOn }))
      const fresh = await siteContractsService.listSiteItems(siteId).catch(() => null)
      if (fresh) setItems(fresh)
      onSaved?.()
    } catch (e2) {
      setErr(e2)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form style={ui.panel} onSubmit={submit} aria-label="Record a delivery">
      <div style={ui.section}>Record a delivery</div>
      <ErrorBox error={err} />
      {ok && <div style={ui.ok}>{ok}</div>}
      <div style={ui.formGrid}>
        <div style={ui.field}>
          <label style={ui.label}>Site</label>
          <SitePicker value={siteId} onChange={setSiteId} style={ui.input} />
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-item">Item *</label>
          <select id="rcv-item" style={ui.input} value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value, unit: 'kg' }))}>
            <option value="">— Select item —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit}){i.owner === 'client' ? ' · Client-owned' : ''}</option>)}
          </select>
          {itemsErr && <div style={ui.fieldError}>Could not load this site's items: {itemsErr.message}</div>}
          {!itemsErr && items.length === 0 && <div style={ui.hint}>No stock items at this site yet.</div>}
          {item?.owner === 'client' && <div style={{ marginTop: '6px' }}><Pill label="Client-owned" color={theme.blue} /> <span style={ui.hint}>Not APCL stock or cost.</span></div>}
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-date">Date received *</label>
          <input id="rcv-date" type="date" style={ui.input} value={form.receivedOn} onChange={set('receivedOn')} />
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-del">Delivered *</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input id="rcv-del" type="number" inputMode="decimal" min="0" step="any" style={{ ...ui.input, flex: 1 }} value={form.delivered} onChange={set('delivered')} />
            {isKg ? (
              <select aria-label="Unit" style={{ ...ui.input, width: '104px' }} value={form.unit} onChange={set('unit')}>
                <option value="kg">kg</option>
                <option value="tonnes">tonnes</option>
              </select>
            ) : <span style={{ ...ui.input, width: '104px', display: 'flex', alignItems: 'center', color: theme.textMuted, background: 'transparent' }}>{item?.unit || '—'}</span>}
          </div>
          {isKg && form.unit === 'tonnes' && form.delivered !== '' && <div style={ui.hint}>= {fmtDec(Number(form.delivered) * 1000)} kg will be stored</div>}
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-acc">Accepted *</label>
          <input id="rcv-acc" type="number" inputMode="decimal" min="0" step="any" style={ui.input} value={form.accepted} placeholder={form.delivered || 'same as delivered'} onChange={set('accepted')} />
          <div style={{ ...ui.hint, color: rejected > 0 ? theme.red : theme.textMuted, fontWeight: rejected > 0 ? 700 : 400 }} data-testid="rejected-live">
            Rejected: {fmtDec(Math.max(rejected, 0))} {isKg ? form.unit : (item?.unit || '')}
          </div>
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-reason">Rejection reason {rejected > 0 ? '*' : ''}</label>
          <input id="rcv-reason" style={{ ...ui.input, borderColor: rejected > 0 && !form.reason.trim() ? theme.red : theme.border }} value={form.reason} onChange={set('reason')} disabled={!(rejected > 0)} placeholder={rejected > 0 ? 'e.g. caked bags, wet dust' : 'Only when some is rejected'} />
          {rejected > 0 && !form.reason.trim() && <div style={ui.fieldError}>Required when anything is rejected.</div>}
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-sup">Supplier / source</label>
          <input id="rcv-sup" style={ui.input} value={form.supplier} onChange={set('supplier')} />
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-ref">Truck / waybill ref</label>
          <input id="rcv-ref" style={ui.input} value={form.ref} onChange={set('ref')} />
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="rcv-photo">Photo</label>
          <input id="rcv-photo" type="file" accept="image/*" capture="environment" style={{ ...ui.input, paddingTop: '10px' }} onChange={e => setForm(f => ({ ...f, photo: e.target.files?.[0] || null }))} />
        </div>
      </div>
      <div style={ui.field}>
        <label style={ui.label} htmlFor="rcv-notes">Notes</label>
        <textarea id="rcv-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} />
      </div>
      {problem && form.delivered !== '' && <div style={{ ...ui.hint, marginBottom: '8px' }}>{problem}</div>}
      <button type="submit" style={{ ...ui.btn('primary', !!problem || busy), width: '100%', minHeight: '52px' }} disabled={!!problem || busy}>
        {busy ? 'Saving…' : 'Record delivery'}
      </button>
    </form>
  )
}

function MaterialReceiving({ userProfile }) {
  const canWrite = hasRole(userProfile, ...RECEIVING_WRITE_ROLES)
  const canVoid = hasRole(userProfile, ...RECEIVING_VOID_ROLES)
  const { sites } = useSites()
  const [filter, setFilter] = useState({ siteId: '', from: '', to: '', itemId: '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const [voidErr, setVoidErr] = useState(null)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      setRows(await siteContractsService.listReceipts(filter))
    } catch (e) {
      setErr(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [filter.siteId, filter.from, filter.to, filter.itemId])

  // Item filter options come from what has been received, so the list only
  // offers items that can match.
  const itemOptions = useMemo(() => {
    const m = new Map()
    rows.forEach(r => { if (!m.has(r.item_id)) m.set(r.item_id, `${r.item?.name || 'Item'} · ${siteName(r.site_id, sites)}`) })
    return [...m.entries()]
  }, [rows, sites])

  const doVoid = async () => {
    setVoidBusy(true); setVoidErr(null)
    try {
      await siteContractsService.voidReceipt(voidTarget.id, voidReason.trim())
      setVoidTarget(null); setVoidReason('')
      await load()
    } catch (e) {
      setVoidErr(e)
    } finally {
      setVoidBusy(false)
    }
  }

  return (
    <div>
      <div style={ui.header}>
        <div>
          <div style={ui.title}>Material Receiving</div>
          <div style={ui.subtitle}>Every delivery checked on arrival. Only the accepted quantity goes into stock. To correct a record, void it and record it again.</div>
        </div>
      </div>

      {canWrite && <ReceivingForm onSaved={load} />}

      <div style={ui.panel}>
        <div style={ui.section}>Deliveries</div>
        <div style={{ ...ui.formGrid, marginBottom: '8px' }}>
          <div style={ui.field}><label style={ui.label}>Site</label><SitePicker allowAll value={filter.siteId} onChange={v => setFilter(f => ({ ...f, siteId: v, itemId: '' }))} style={ui.input} /></div>
          <div style={ui.field}><label style={ui.label}>From</label><input data-board-allow type="date" style={ui.input} value={filter.from} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} /></div>
          <div style={ui.field}><label style={ui.label}>To</label><input data-board-allow type="date" style={ui.input} value={filter.to} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} /></div>
          <div style={ui.field}>
            <label style={ui.label}>Item</label>
            <select data-board-allow style={ui.input} value={filter.itemId} onChange={e => setFilter(f => ({ ...f, itemId: e.target.value }))}>
              <option value="">All items</option>
              {itemOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
        </div>
        <ErrorBox error={err && `Could not load deliveries: ${err.message}`} onRetry={load} />
        {loading ? <SkeletonRows /> : !err && rows.length === 0 ? (
          <div style={{ color: theme.textMuted, fontSize: '13px', padding: '12px 0' }}>No deliveries recorded for this filter.{canWrite ? ' Use the form above to record one.' : ''}</div>
        ) : !err && (
          <div>
            <StackTable headers={['Date', 'Site', 'Item', 'Delivered', 'Accepted', 'Rejected', 'Reason', 'Supplier / ref', 'Photo', '']} rightCols={[3, 4, 5]}>
                {rows.map(r => {
                  const unit = r.item?.unit || ''
                  const rej = Number(r.qty_rejected || 0)
                  const site = siteName(r.site_id, sites)
                  return (
                    <tr key={r.id} style={r.voided ? { opacity: 0.6 } : undefined}>
                      <td style={ui.td}>{fmtDate(r.received_on)}<div style={ui.hint}>{r.received_by_name || ''}</div></td>
                      <td style={ui.td}>{site}</td>
                      <td style={ui.td}>
                        {r.item?.name || '—'}
                        {r.item?.owner === 'client' && <div style={{ marginTop: '4px' }}><Pill label="Client-owned" color={theme.blue} /></div>}
                        {r.voided && <div style={{ marginTop: '4px' }}><Pill status="voided" label="Voided" /><div style={ui.hint}>{r.void_reason}</div></div>}
                      </td>
                      <td style={{ ...ui.td, ...ui.right }}>{fmtDec(r.qty_delivered)} {unit}</td>
                      <td style={{ ...ui.td, ...ui.right }}>{fmtDec(r.qty_accepted)} {unit}</td>
                      <td style={{ ...ui.td, ...ui.right, color: rej > 0 ? theme.red : theme.text, fontWeight: rej > 0 ? 700 : 400 }}>{fmtDec(rej)} {unit}</td>
                      <td style={ui.td}>{r.rejection_reason || '—'}</td>
                      <td style={ui.td}>{r.supplier_or_source || '—'}<div style={ui.hint}>{r.truck_or_waybill_ref || ''}</div></td>
                      <td style={ui.td}><PhotoLink path={r.photo_path} /></td>
                      <td style={{ ...ui.td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                          {rej > 0 && r.item?.owner === 'client' && !r.voided && (
                            <CopyButton label="Copy rejection notice" text={buildRejectionNoticeText({
                              siteName: site, receivedOn: r.received_on, qtyRejected: rej, unit, itemName: r.item?.name,
                              ref: r.truck_or_waybill_ref, reason: r.rejection_reason, hasPhoto: !!r.photo_path,
                            })} />
                          )}
                          {canVoid && !r.voided && (
                            <button type="button" style={ui.small(theme.red)} onClick={() => { setVoidTarget(r); setVoidReason(''); setVoidErr(null) }}>Void</button>
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

      {voidTarget && (
        <ConfirmDialog
          title={`Void delivery of ${voidTarget.item?.name || 'item'} on ${fmtDate(voidTarget.received_on)}?`}
          body={`This removes ${fmtDec(voidTarget.qty_accepted)} ${voidTarget.item?.unit || ''} from stock with an offsetting entry. The record stays, marked void. Record the delivery again if it needs correcting.`}
          confirmLabel="Void delivery" danger busy={voidBusy} confirmDisabled={!voidReason.trim()}
          onCancel={() => setVoidTarget(null)} onConfirm={doVoid}
        >
          <label style={ui.label} htmlFor="void-reason">Reason *</label>
          <input id="void-reason" style={ui.input} value={voidReason} onChange={e => setVoidReason(e.target.value)} autoFocus />
          <div style={{ marginTop: '8px' }}><ErrorBox error={voidErr} /></div>
        </ConfirmDialog>
      )}
    </div>
  )
}

export default withPhase7Touch(MaterialReceiving)
