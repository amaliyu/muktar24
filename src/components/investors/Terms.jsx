import { useMemo, useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { lagosToday } from '../../services/siteContracts'
import { investorsService } from '../../services/investors'
import { hasRole } from '../../lib/roles'
import { validateTiers, tiersToJson, tiersPlainText, apclPct, feeText, termLabel } from '../../utils/investorPools'
import { theme, ui, Pill, fmtDate, ErrorBox, SkeletonRows, ConfirmDialog, StackTable } from '../site/siteUi'
import { POOL_READ_ROLES, PoolSitePicker, PageHeader, Field, Empty, useLoad, NoAccess } from './investorUi'

// Phase 7C — investor terms are data (term_templates), versioned. A version is
// never edited in place from the app: "New version" copies the current one
// with version + 1. The DB trigger validates the tiers and locks any version
// used by an approved month. Sites pick a version from a date (site_pool_terms).

export default function Terms({ userProfile }) {
  const canRead = hasRole(userProfile, ...POOL_READ_ROLES)
  const isMD = userProfile?.role === 'md'
  const { sites } = useSites()
  const [editor, setEditor] = useState(null)
  const [viewId, setViewId] = useState(null)
  const [siteId, setSiteId] = useState('')
  const [assign, setAssign] = useState(null)
  const [notice, setNotice] = useState(null)

  const [data, err, loading, reload] = useLoad(async () => {
    if (!canRead) return null
    const [terms, categories] = await Promise.all([investorsService.listTerms(), investorsService.listExpenseCategories()])
    return { terms, categories }
  }, [canRead])
  const [siteTerms, stErr, stLoading, reloadSiteTerms] = useLoad(async () => (canRead && siteId ? investorsService.listSiteTerms(siteId) : []), [canRead, siteId])

  // Group versions by name, newest version first.
  const groups = useMemo(() => {
    const by = new Map()
    for (const t of data?.terms || []) {
      if (!by.has(t.name)) by.set(t.name, [])
      by.get(t.name).push(t)
    }
    return [...by.entries()].map(([name, versions]) => ({ name, versions: versions.sort((a, b) => b.version - a.version) }))
  }, [data])

  if (!canRead) return <NoAccess />
  const viewed = viewId ? data?.terms.find(t => t.id === viewId) : null
  const catName = (id) => data?.categories.find(c => c.id === id)

  const newVersion = (t) => {
    const latest = groups.find(g => g.name === t.name)?.versions[0] || t
    setNotice(null)
    setEditor({ mode: 'version', from: latest, ...editorFrom(latest), name: latest.name, version: latest.version + 1 })
  }
  const newTerms = () => {
    setNotice(null)
    setEditor({
      mode: 'new', name: '', version: 1, term_years: '', management_fee_pct: '0', management_fee_basis: 'gross_receipts', notes: '',
      deductible: [], tiers: [{ from: '0', to: '', investor_pct: '' }],
    })
  }

  return (
    <div>
      <PageHeader title="Terms" subtitle="Profit-share tiers, term, fee and deductible expense categories. Changes are always a new version with a start date.">
        {isMD && <button type="button" style={ui.btn('primary')} onClick={newTerms}>New terms</button>}
      </PageHeader>
      <ErrorBox error={err && `Could not load terms: ${err.message}`} onRetry={reload} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}
      {loading ? <SkeletonRows rows={3} /> : !err && groups.length === 0 ? <Empty>No terms yet.</Empty> : !err && groups.map(g => (
        <div key={g.name} style={{ ...ui.panel, borderLeft: `2px solid ${theme.accent}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <div style={ui.section}>{g.name}</div>
            {isMD && <button type="button" style={ui.small(theme.accent)} onClick={() => newVersion(g.versions[0])}>New version</button>}
          </div>
          <StackTable headers={['Version', 'Tiers', 'Term', 'Fee', 'Created', '']}>
            {g.versions.map(t => (
              <tr key={t.id}>
                <td style={ui.td}><Pill label={`v${t.version}`} color={t === g.versions[0] ? theme.green : theme.textMuted} /></td>
                <td style={ui.td}>{(t.tiers || []).length} tier{(t.tiers || []).length === 1 ? '' : 's'}</td>
                <td style={ui.td}>{t.term_years ? `${t.term_years} years` : '—'}</td>
                <td style={ui.td}>{feeText(t)}</td>
                <td style={ui.td}>{fmtDate(String(t.created_at || '').slice(0, 10))}</td>
                <td style={ui.td}><button type="button" data-board-allow data-ico-allow style={ui.small()} onClick={() => setViewId(viewId === t.id ? null : t.id)}>{viewId === t.id ? 'Hide' : 'View'}</button></td>
              </tr>
            ))}
          </StackTable>
          {viewed && viewed.name === g.name && <TermView term={viewed} catName={catName} />}
        </div>
      ))}

      <div style={ui.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px' }}>
            <div style={ui.section}>Terms in force by site</div>
            <PoolSitePicker value={siteId} onChange={setSiteId} id="terms-site" />
          </div>
          {isMD && siteId && data && (
            <button type="button" style={{ ...ui.btn('secondary'), marginBottom: '12px' }}
              onClick={() => { setNotice(null); setAssign({ term_template_id: data.terms[0]?.id || '', effective_from: lagosToday().slice(0, 8) + '01', notes: '' }) }}>Set terms from date</button>
          )}
        </div>
        <ErrorBox error={stErr && `Could not load site terms: ${stErr.message}`} onRetry={reloadSiteTerms} />
        {stLoading ? <SkeletonRows rows={2} /> : !stErr && (siteTerms || []).length === 0 ? (
          <div style={ui.hint}>No terms set for {siteName(siteId, sites)}. A month cannot be computed until terms are set.</div>
        ) : !stErr && (
          <StackTable headers={['From', 'Terms', 'Notes', '']}>
            {siteTerms.map((st, i) => (
              <tr key={st.effective_from}>
                <td style={ui.td}>{fmtDate(st.effective_from)}</td>
                <td style={ui.td}>{termLabel(data?.terms.find(t => t.id === st.term_template_id))}</td>
                <td style={ui.td}>{st.notes || '—'}</td>
                <td style={ui.td}>{i === 0 && <Pill label="In force" color={theme.green} />}</td>
              </tr>
            ))}
          </StackTable>
        )}
      </div>

      {editor && data && (
        <TermEditor editor={editor} setEditor={setEditor} categories={data.categories} onClose={() => setEditor(null)}
          onSaved={async (msg) => { setEditor(null); setNotice(msg); await reload() }} />
      )}
      {assign && data && (
        <AssignDialog assign={assign} setAssign={setAssign} terms={data.terms} siteId={siteId} siteLabel={siteName(siteId, sites)}
          onClose={() => setAssign(null)} onSaved={async (msg) => { setAssign(null); setNotice(msg); await reloadSiteTerms() }} />
      )}
    </div>
  )
}

const editorFrom = (t) => ({
  term_years: t.term_years == null ? '' : String(t.term_years),
  management_fee_pct: String(t.management_fee_pct ?? 0),
  management_fee_basis: t.management_fee_basis || 'gross_receipts',
  notes: t.notes || '',
  deductible: [...(t.deductible_category_ids || [])],
  tiers: (t.tiers || []).map(x => ({ from: String(x.from), to: x.to == null ? '' : String(x.to), investor_pct: String(x.investor_pct) })),
})

function TermView({ term: t, catName }) {
  const cats = (t.deductible_category_ids || []).map(id => catName(id) || { id, name: 'Unknown category', is_active: false })
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '16px', background: theme.surface, marginTop: '12px' }}>
      <div style={{ ...ui.micro, marginBottom: '8px' }}>{termLabel(t)} in plain words</div>
      <ul style={{ margin: '0 0 12px', paddingLeft: '18px', fontSize: '14px', lineHeight: 1.6 }}>
        {tiersPlainText(t.tiers).map((line, i) => <li key={i}>{line}</li>)}
      </ul>
      <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
        <div>Term: {t.term_years ? `${t.term_years} years` : 'not set'}</div>
        <div>{feeText(t)}</div>
      </div>
      <div style={{ ...ui.micro, margin: '12px 0 6px' }}>Deductible site expense categories</div>
      {cats.length === 0 ? <div style={ui.hint}>None — no site expense is deducted.</div> : (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {cats.map(c => (
            <span key={c.id} style={{ fontSize: '12px', padding: '2px 8px', border: `1px solid ${theme.border}`, borderRadius: '4px' }}>
              {c.name}{c.is_active === false ? ' (inactive)' : ''}
            </span>
          ))}
        </div>
      )}
      {t.notes && <div style={{ ...ui.hint, marginTop: '12px', whiteSpace: 'pre-wrap' }}>{t.notes}</div>}
    </div>
  )
}

function TermEditor({ editor: ed, setEditor, categories, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setEditor(f => ({ ...f, [k]: e.target.value }))
  const setTier = (i, k) => (e) => setEditor(f => {
    const tiers = f.tiers.map((t, j) => (j === i ? { ...t, [k]: e.target.value } : t))
    // Keep the next tier starting where this one ends.
    if (k === 'to' && tiers[i + 1]) tiers[i + 1] = { ...tiers[i + 1], from: e.target.value }
    return { ...f, tiers }
  })
  const addTier = () => setEditor(f => {
    const tiers = [...f.tiers]
    const last = tiers[tiers.length - 1]
    return { ...f, tiers: [...tiers, { from: last?.to || '', to: '', investor_pct: '' }] }
  })
  const removeTier = (i) => setEditor(f => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }))
  const toggleCat = (id) => setEditor(f => ({ ...f, deductible: f.deductible.includes(id) ? f.deductible.filter(x => x !== id) : [...f.deductible, id] }))

  const tierProblem = validateTiers(ed.tiers)
  const fee = ed.management_fee_pct === '' ? 0 : Number(ed.management_fee_pct)
  const problem = !ed.name.trim() ? 'Enter a name for the terms.'
    : tierProblem
    || (ed.term_years !== '' && !(Number.isInteger(Number(ed.term_years)) && Number(ed.term_years) > 0) ? 'Term years must be a whole number above 0.' : null)
    || (!(fee >= 0 && fee <= 100) ? 'Management fee must be 0–100%.' : null)

  // Show the categories in use even when inactive.
  const shownCats = categories.filter(c => c.is_active || ed.deductible.includes(c.id))
  const unknown = ed.deductible.filter(id => !categories.some(c => c.id === id))

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const row = await investorsService.createTermVersion({
        name: ed.name.trim(), version: ed.version, tiers: tiersToJson(ed.tiers),
        term_years: ed.term_years === '' ? null : Number(ed.term_years),
        management_fee_pct: fee, management_fee_basis: ed.management_fee_basis,
        deductible_category_ids: ed.deductible, notes: ed.notes,
      })
      await onSaved(`${termLabel(row)} saved. Set it on a site from a date to use it.`)
    } catch (e) {
      setErr(e)   // trigger message, verbatim
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog title={ed.mode === 'version' ? `New version — ${ed.name} v${ed.version}` : 'New terms'}
      body={ed.mode === 'version' ? `Copied from v${ed.from.version}. The old version stays as it is; sites keep it until you set this one from a date.` : 'Starts at version 1.'}
      confirmLabel="Save version" busy={busy} confirmDisabled={!!problem} onCancel={onClose} onConfirm={save}>
      <div style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: '4px' }}>
        {ed.mode === 'new' && <Field id="te-name" label="Name *"><input id="te-name" style={ui.input} value={ed.name} onChange={set('name')} /></Field>}

        <div style={{ ...ui.micro, marginBottom: '6px' }}>Tiers (multiples of capital)</div>
        {ed.tiers.map((t, i) => {
          const last = i === ed.tiers.length - 1
          return (
            <div key={i} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', marginBottom: '8px', background: theme.surface }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px' }}>Tier {i + 1}</strong>
                {ed.tiers.length > 1 && <button type="button" style={ui.small(theme.red)} onClick={() => removeTier(i)}>Remove</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0 8px' }}>
                <Field id={`te-from-${i}`} label="From ×"><input id={`te-from-${i}`} type="number" inputMode="decimal" step="any" min="0" style={ui.input} value={t.from} onChange={setTier(i, 'from')} /></Field>
                <Field id={`te-to-${i}`} label={last ? 'To × (blank = open)' : 'To ×'}><input id={`te-to-${i}`} type="number" inputMode="decimal" step="any" min="0" style={ui.input} value={t.to} onChange={setTier(i, 'to')} /></Field>
                <Field id={`te-pct-${i}`} label="Investors %"><input id={`te-pct-${i}`} type="number" inputMode="decimal" step="any" min="0" max="100" style={ui.input} value={t.investor_pct} onChange={setTier(i, 'investor_pct')} /></Field>
                <Field id={`te-apcl-${i}`} label="APCL %"><div id={`te-apcl-${i}`} style={{ ...ui.input, display: 'flex', alignItems: 'center', background: 'transparent', color: theme.textMuted }}>{t.investor_pct === '' ? '—' : `${apclPct(t.investor_pct)}%`}</div></Field>
              </div>
            </div>
          )
        })}
        <button type="button" style={{ ...ui.small(theme.accent), marginBottom: '8px' }} onClick={addTier}>Add tier</button>
        {tierProblem ? <div style={ui.fieldError} role="alert">{tierProblem}</div> : (
          <ul style={{ margin: '4px 0 12px', paddingLeft: '18px', fontSize: '13px', lineHeight: 1.5 }}>
            {tiersPlainText(tiersToJson(ed.tiers)).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        <div style={{ ...ui.hint, marginBottom: '12px' }}>Start at 0, each tier starts where the previous ends, the last tier has no end.</div>

        <Field id="te-years" label="Term (years)"><input id="te-years" type="number" inputMode="numeric" step="1" min="1" style={ui.input} value={ed.term_years} onChange={set('term_years')} /></Field>
        <Field id="te-fee" label="Management fee %" hint="0 = no management fee. Term Sheet §10: never introduce a fee to suppress NDC.">
          <input id="te-fee" type="number" inputMode="decimal" step="any" min="0" max="100" style={ui.input} value={ed.management_fee_pct} onChange={set('management_fee_pct')} />
        </Field>
        <Field id="te-basis" label="Fee basis">
          <select id="te-basis" style={ui.input} value={ed.management_fee_basis} onChange={set('management_fee_basis')}>
            <option value="gross_receipts">Gross receipts</option>
            <option value="ndc_before_fee">NDC before the fee</option>
          </select>
        </Field>

        <div style={{ ...ui.micro, margin: '4px 0 6px' }}>Deductible site expense categories</div>
        <div style={{ display: 'grid', gap: '2px', marginBottom: '12px' }}>
          {shownCats.map(c => (
            <label key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', minHeight: '40px', fontSize: '14px' }}>
              <input type="checkbox" checked={ed.deductible.includes(c.id)} onChange={() => toggleCat(c.id)} style={{ width: '20px', height: '20px', flex: 'none' }} />
              <span>{c.name}{!c.is_active && <span style={{ color: theme.textMuted }}> (inactive)</span>}</span>
            </label>
          ))}
          {unknown.length > 0 && <div style={ui.hint}>{unknown.length} ticked categor{unknown.length === 1 ? 'y no longer exists' : 'ies no longer exist'} and will be kept.</div>}
        </div>
        <Field id="te-notes" label="Notes"><textarea id="te-notes" style={ui.textarea} value={ed.notes} onChange={set('notes')} /></Field>
        {problem && problem !== tierProblem && <div style={{ ...ui.hint, color: theme.accent }}>{problem}</div>}
        <ErrorBox error={err} />
      </div>
    </ConfirmDialog>
  )
}

function AssignDialog({ assign, setAssign, terms, siteId, siteLabel, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setAssign(a => ({ ...a, [k]: e.target.value }))
  const problem = !assign.term_template_id ? 'Choose the terms.' : !assign.effective_from ? 'Enter the date.' : null
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await investorsService.setSiteTerms({ siteId, effectiveFrom: assign.effective_from, termTemplateId: assign.term_template_id, notes: assign.notes })
      await onSaved(`${termLabel(terms.find(t => t.id === assign.term_template_id))} set for ${siteLabel} from ${fmtDate(assign.effective_from)}.`)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title={`Set terms — ${siteLabel}`} body="The terms apply to every month from this date. A start date cannot be changed once a month on or after it is approved."
      confirmLabel="Set terms" busy={busy} confirmDisabled={!!problem} onCancel={onClose} onConfirm={save}>
      <Field id="as-term" label="Terms version *">
        <select id="as-term" style={ui.input} value={assign.term_template_id} onChange={set('term_template_id')}>
          <option value="">Choose…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
        </select>
      </Field>
      <Field id="as-from" label="Effective from *"><input id="as-from" type="date" style={ui.input} value={assign.effective_from} onChange={set('effective_from')} /></Field>
      <Field id="as-notes" label="Notes"><textarea id="as-notes" style={ui.textarea} value={assign.notes} onChange={set('notes')} /></Field>
      <ErrorBox error={err} />
    </ConfirmDialog>
  )
}
