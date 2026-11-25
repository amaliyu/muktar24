import { supabase } from '../lib/supabase'
const rpc = async (name, args) => { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data }
export const clientFunds = {
  summary: site => rpc('client_fund_summary', { p_site_id: site }),
  statement: (site, fund) => rpc('client_fund_statement', { p_site_id: site, p_fund: fund }),
  setRequestFund: (id, fund) => rpc('set_payment_request_client_fund', { p_payment_request_id: id, p_fund: fund || null }),
  void: (id, reason) => rpc('void_client_fund_entry', { p_id: id, p_reason: reason.trim() }),
  record: (site, f) => rpc('record_client_fund', { p_site_id: site, p_fund: f.fund, p_kind: f.kind, p_date: f.date, p_amount: Number(f.amount), p_bank_account_id: f.bankAccountId || null, p_reference: f.reference?.trim() || null, p_note: f.note?.trim() || null, p_requisition_id: f.requisitionId || null, p_proof_path: f.proofPath || null }),
  async accounts() { const { data, error } = await supabase.from('bank_accounts').select('id, account_name').eq('is_active', true); if (error) throw error; return data },
}
export function statementBalances(rows) {
  let balance = 0
  return [...rows].sort((a, b) => a.date.localeCompare(b.date)).map(row => {
    if (!row.voided) {
      if (row.kind === 'received' || row.kind === 'adjustment') balance += Number(row.amount)
      if (row.kind === 'spent') balance -= Number(row.amount)
    }
    return { ...row, balance }
  })
}
