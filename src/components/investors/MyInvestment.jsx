import { useState } from 'react'
import { myInvestmentService } from '../../services/investors'
import { fmtNaira2, monthLabel, buildInvestorStatement, tierForMultiple } from '../../utils/investorPools'
import { generateInvestorStatementPDF } from '../../utils/generateInvestorStatementPDF'
import { theme, ui, Pill, fmtDate, ErrorBox, SkeletonRows, StackTable } from '../site/siteUi'
import { PageHeader, Fact, FactGrid, Empty, useLoad } from './investorUi'

// Phase 7C — read-only portal for a login linked to an investor
// (investors.user_id = auth.uid()). It reads only that investor's own rows
// (myInvestmentService); RLS limits each read further. It never calls
// fn_site_capital_on or lists other investors.

export default function MyInvestment({ userProfile }) {
  const [pdfErr, setPdfErr] = useState(null)
  const [data, err, loading, reload] = useLoad(async () => {
    const me = await myInvestmentService.myInvestor(userProfile.id)
    if (!me) return { me: null }
    const [positions, dists] = await Promise.all([myInvestmentService.myPositions(me.id), myInvestmentService.myDistributions(me.id)])
    const own = dists.filter(d => d.investor_id === me.id && d.share_type === 'investor_portion')
    const periods = await myInvestmentService.periods([...new Set(own.map(d => d.period_id))])
    const siteIds = [...new Set([...positions.map(p => p.site_id), ...periods.map(p => p.site_id)])]
    const [terms, siteRows] = await Promise.all([
      myInvestmentService.terms([...new Set(periods.map(p => p.term_template_id).filter(Boolean))]),
      myInvestmentService.siteNames(siteIds),
    ])
    const history = own.filter(d => periods.some(p => p.id === d.period_id))
      .map(d => ({ ...d, period_month: periods.find(p => p.id === d.period_id).period_month }))
    return { me, positions, periods, terms, siteRows, history }
  }, [userProfile?.id])

  if (loading) return <div><PageHeader title="My Investment" /><SkeletonRows rows={4} /></div>
  if (err) return <div><PageHeader title="My Investment" /><ErrorBox error={`Could not load your investment: ${err.message}`} onRetry={reload} /></div>
  if (!data?.me) {
    return (
      <div>
        <PageHeader title="My Investment" />
        <Empty>Your login is not linked to an investor record yet — contact APCL.</Empty>
      </div>
    )
  }

  const siteLabel = (id) => data.siteRows.find(s => s.id === id)?.name || 'Site'
  const siteIds = [...new Set([...data.positions.map(p => p.site_id), ...data.periods.map(p => p.site_id)])]

  const download = async (site, period) => {
    setPdfErr(null)
    try {
      const capital = data.positions.filter(p => p.site_id === site).reduce((s, p) => s + Number(p.capital_net || 0), 0)
      const term = data.terms.find(t => t.id === period.term_template_id)
      const model = buildInvestorStatement({
        investor: data.me, siteName: siteLabel(site), period,
        distributions: data.history.filter(d => d.period_id === period.id),
        history: data.history.filter(d => d.site_id === site), capital, tiers: term?.tiers || [], term,
      })
      await generateInvestorStatementPDF(model)
    } catch (e) { setPdfErr(e) }
  }

  return (
    <div>
      <PageHeader title="My Investment" subtitle={`${data.me.kind === 'apcl' ? 'APCL (as contributor)' : data.me.name} — your capital, approved months and payments, by site.`} />
      <ErrorBox error={pdfErr && `Could not create the PDF: ${pdfErr.message}`} />
      {siteIds.length === 0 && <Empty>No capital is recorded for you at any site yet.</Empty>}
      {siteIds.map(site => {
        const capital = data.positions.filter(p => p.site_id === site).reduce((s, p) => s + Number(p.capital_net || 0), 0)
        const months = data.periods.filter(p => p.site_id === site).sort((a, b) => b.period_month.localeCompare(a.period_month))
        const rows = data.history.filter(d => d.site_id === site)
        const paid = rows.filter(d => d.paid_on).reduce((s, d) => s + Number(d.amount || 0), 0)
        const due = rows.filter(d => !d.paid_on).reduce((s, d) => s + Number(d.amount || 0), 0)
        const multiple = capital > 0 ? paid / capital : 0
        const latestTerm = months[0] ? data.terms.find(t => t.id === months[0].term_template_id) : null
        const tier = tierForMultiple(latestTerm?.tiers || [], multiple)
        return (
          <div key={site} style={{ ...ui.panel, borderLeft: `2px solid ${theme.accent}` }}>
            <div style={{ fontSize: '17px', fontWeight: '700', marginBottom: '12px' }}>{siteLabel(site)}</div>
            <FactGrid>
              <Fact label="Your capital" value={fmtNaira2(capital)} />
              <Fact label="Paid to you" value={fmtNaira2(paid)} sub={due > 0 ? `${fmtNaira2(due)} approved, not yet paid` : null} />
              <Fact label="Multiple of capital received" value={`${multiple.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`} />
              <Fact label="Current tier" value={tier ? `Tier ${tier.index + 1}` : '—'} sub={tier?.text} />
            </FactGrid>
            {months.length === 0 ? <div style={ui.hint}>No approved months yet.</div> : (
              <StackTable headers={['Month', 'Your amount', 'Paid', '']} rightCols={[1]}>
                {months.map(p => {
                  const mine = rows.filter(d => d.period_id === p.id)
                  const amount = mine.reduce((s, d) => s + Number(d.amount || 0), 0)
                  const isPaid = mine.length > 0 && mine.every(d => d.paid_on)
                  return (
                    <tr key={p.id}>
                      <td style={{ ...ui.td, fontWeight: 600 }}>{monthLabel(p.period_month)}</td>
                      <td style={{ ...ui.td, ...ui.right, fontWeight: 700 }}>{fmtNaira2(amount)}</td>
                      <td style={ui.td}>
                        <Pill label={isPaid ? 'Paid' : 'Not yet paid'} color={isPaid ? theme.green : theme.accent} />
                        {isPaid && <div style={ui.hint}>{fmtDate(mine.map(d => d.paid_on).sort().pop())}</div>}
                      </td>
                      <td style={ui.td}><button type="button" style={ui.small()} onClick={() => download(site, p)}>Statement PDF</button></td>
                    </tr>
                  )
                })}
              </StackTable>
            )}
          </div>
        )
      })}
      <div style={ui.hint}>Only amounts actually paid count toward the tier thresholds. Questions: contact APCL.</div>
    </div>
  )
}
