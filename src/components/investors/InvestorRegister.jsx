import { withPhase7Touch } from './investorUi'
import { useMemo, useState } from 'react'
import { useSites } from '../SitePicker'
import { siteName } from '../../services/sites'
import { investorsService } from '../../services/investors'
import { hasRole } from '../../lib/roles'
import { fmtNaira2 } from '../../utils/investorPools'
import { theme, ui, Pill, ErrorBox, SkeletonRows, ConfirmDialog, StackTable } from '../site/siteUi'
import { POOL_READ_ROLES, PageHeader, Field, Empty, useLoad, NoAccess } from './investorUi'

// Phase 7C — investor register. md adds and edits; md, accountant, ico and
// board read. Investors are deactivated, never deleted. The APCL row (kind
// 'apcl') keeps its kind and is never deactivated.

function InvestorRegister({ userProfile }) {
  const canRead = hasRole(userProfile, ...POOL_READ_ROLES)
  const isMD = userProfile?.role === 'md'
  const { sites } = useSites()
  const [form, setForm] = useState(null)
  const [confirm, setConfirm] = useState(null)   // { investor, active }
  const [link, setLink] = useState(null)         // { investor, userId }
  const [notice, setNotice] = useState(null)

  const [data, err, loading, reload] = useLoad(async () => {
    if (!canRead) return { investors: [], positions: [] }
    const [investors, positions] = await Promise.all([investorsService.listInvestors(), investorsService.listPositions()])
    return { investors, positions }
  }, [canRead])

  const rows = useMemo(() => {
    if (!data) return []
    return data.investors.map(i => {
      const pos = data.positions.filter(p => p.investor_id === i.id)
      return {
        ...i,
        capital: pos.reduce((s, p) => s + Number(p.capital_net || 0), 0),
        sites: pos.filter(p => Number(p.capital_net) !== 0).map(p => siteName(p.site_id, sites)),
      }
    })
  }, [data, sites])

  if (!canRead) return <NoAccess />

  const done = async (msg) => { setForm(null); setConfirm(null); setLink(null); setNotice(msg); await reload() }

  return (
    <div>
      <PageHeader title="Investor Register" subtitle="Everyone who funds a site pool, including APCL as a contributor. Investors are deactivated, never deleted.">
        {isMD && <button type="button" style={ui.btn('primary')} onClick={() => { setNotice(null); setForm({ mode: 'add', name: '', phone: '', email: '', notes: '', is_active: true }) }}>Add investor</button>}
      </PageHeader>
      <ErrorBox error={err && `Could not load the investor register: ${err.message}`} onRetry={reload} />
      {notice && <div style={ui.ok} role="status">{notice}</div>}
      {loading ? <SkeletonRows rows={4} /> : !err && rows.length === 0 ? (
        <Empty>No investors yet.{isMD && ' Use Add investor.'}</Empty>
      ) : !err && (
        <div style={ui.panel}>
          <StackTable headers={['Name', 'Kind', 'Phone', 'Email', 'Active', 'Total capital', 'Sites', '']} rightCols={[5]}>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={ui.td}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  {r.user_id && <div style={ui.hint}>Login linked</div>}
                </td>
                <td style={ui.td}><Pill label={r.kind === 'apcl' ? 'APCL' : 'External'} color={r.kind === 'apcl' ? theme.blue : theme.accent} /></td>
                <td style={ui.td}>{r.phone || '—'}</td>
                <td style={{ ...ui.td, overflowWrap: 'anywhere' }}>{r.email || '—'}</td>
                <td style={ui.td}><Pill label={r.is_active ? 'Active' : 'Inactive'} color={r.is_active ? theme.green : theme.textMuted} /></td>
                <td style={{ ...ui.td, ...ui.right, fontWeight: 700 }}>{fmtNaira2(r.capital)}</td>
                <td style={ui.td}>{r.sites.length ? r.sites.join(', ') : '—'}</td>
                <td style={ui.td}>
                  {isMD && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button type="button" style={ui.small()} onClick={() => { setNotice(null); setForm({ mode: 'edit', id: r.id, isApcl: r.kind === 'apcl', name: r.name, phone: r.phone || '', email: r.email || '', notes: r.notes || '', is_active: r.is_active }) }}>Edit</button>
                      {r.kind !== 'apcl' && (
                        <button type="button" style={ui.small(r.is_active ? theme.red : theme.green)} onClick={() => setConfirm({ investor: r, active: !r.is_active })}>{r.is_active ? 'Deactivate' : 'Reactivate'}</button>
                      )}
                      <button type="button" style={ui.small(theme.accent)} onClick={() => setLink({ investor: r, userId: r.user_id || '' })}>{r.user_id ? 'Change login' : 'Link login'}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </StackTable>
          <div style={{ ...ui.hint, marginTop: '8px' }}>Total capital is the net of contributions, bridges, refunds and corrections recorded at each site.</div>
        </div>
      )}
      {form && <InvestorForm form={form} setForm={setForm} onClose={() => setForm(null)} onSaved={done} />}
      {confirm && <ActiveDialog {...confirm} onClose={() => setConfirm(null)} onDone={done} />}
      {link && <LinkDialog link={link} setLink={setLink} onClose={() => setLink(null)} onDone={done} />}
    </div>
  )
}

function InvestorForm({ form, setForm, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const problem = !form.name.trim() ? 'Enter the investor name.' : null
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      if (form.mode === 'add') {
        await investorsService.createInvestor(form)
        await onSaved(`${form.name.trim()} added to the register.`)
      } else {
        await investorsService.updateInvestor(form.id, form, { isApcl: form.isApcl })
        await onSaved(`${form.name.trim()} saved.`)
      }
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title={form.mode === 'add' ? 'Add investor' : `Edit ${form.name || 'investor'}`}
      confirmLabel={form.mode === 'add' ? 'Add investor' : 'Save'} busy={busy} confirmDisabled={!!problem} onCancel={onClose} onConfirm={save}>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
        <Field id="inv-name" label="Name *"><input id="inv-name" style={ui.input} value={form.name} onChange={set('name')} /></Field>
        <Field id="inv-phone" label="Phone"><input id="inv-phone" type="tel" inputMode="tel" style={ui.input} value={form.phone} onChange={set('phone')} /></Field>
        <Field id="inv-email" label="Email"><input id="inv-email" type="email" style={ui.input} value={form.email} onChange={set('email')} /></Field>
        <Field id="inv-notes" label="Notes"><textarea id="inv-notes" style={ui.textarea} value={form.notes} onChange={set('notes')} /></Field>
        {form.isApcl ? (
          <div style={ui.hint}>This is APCL's own contributor record. It stays APCL and stays active.</div>
        ) : (
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', minHeight: '44px', fontSize: '14px' }}>
            <input type="checkbox" checked={!!form.is_active} onChange={set('is_active')} style={{ width: '20px', height: '20px' }} /> Active
          </label>
        )}
        {problem && <div style={ui.hint}>{problem}</div>}
        <ErrorBox error={err} />
      </div>
    </ConfirmDialog>
  )
}

function ActiveDialog({ investor, active, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const run = async () => {
    setBusy(true); setErr(null)
    try {
      await investorsService.setInvestorActive(investor.id, active)
      await onDone(`${investor.name} ${active ? 'reactivated' : 'deactivated'}.`)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title={`${active ? 'Reactivate' : 'Deactivate'} ${investor.name}?`}
      body={active ? 'They can be picked again for new capital entries.' : 'They stay in the register and in past months, but can no longer be picked for new capital entries.'}
      confirmLabel={active ? 'Reactivate' : 'Deactivate'} danger={!active} busy={busy} onCancel={onClose} onConfirm={run}>
      <ErrorBox error={err} />
    </ConfirmDialog>
  )
}

function LinkDialog({ link, setLink, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [users, usersErr, usersLoading, reloadUsers] = useLoad(() => investorsService.listInvestorLogins(), [])
  const inv = link.investor
  const run = async () => {
    setBusy(true); setErr(null)
    try {
      await investorsService.linkLogin(inv.id, link.userId || null)
      const u = (users || []).find(x => x.id === link.userId)
      await onDone(link.userId ? `${inv.name} linked to ${u?.full_name || u?.email || 'the login'}.` : `${inv.name} unlinked from its login.`)
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title={`Login for ${inv.name}`}
      body="The linked login sees only this investor's sites, approved months and own payments (My Investment). Only users with the Investor role are listed — create the user first in User Management."
      confirmLabel={link.userId ? 'Link login' : 'Remove link'} busy={busy} confirmDisabled={usersLoading || (link.userId || '') === (inv.user_id || '')}
      onCancel={onClose} onConfirm={run}>
      <ErrorBox error={usersErr && `Could not load users: ${usersErr.message}`} onRetry={reloadUsers} />
      <Field id="inv-login" label="Investor login">
        <select id="inv-login" style={ui.input} value={link.userId} onChange={e => setLink(l => ({ ...l, userId: e.target.value }))}>
          <option value="">No login</option>
          {(users || []).map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}{u.email && u.full_name ? ` — ${u.email}` : ''}{u.is_active ? '' : ' (inactive)'}</option>)}
        </select>
      </Field>
      {users && users.length === 0 && <div style={ui.hint}>No users have the Investor role yet.</div>}
      <ErrorBox error={err} />
    </ConfirmDialog>
  )
}

export default withPhase7Touch(InvestorRegister)
