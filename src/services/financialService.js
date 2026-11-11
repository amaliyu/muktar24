import { accountingBasisService } from './accountingBasis'
import { supabase } from '../lib/supabase'
import { deleteById } from '../utils/checkedDelete'

// ============================================================
// Opening Balances
// ============================================================

export const openingBalancesService = {
  /**
   * Fetch all opening balance entries ordered by category hierarchy.
   */
  async getAll() {
    const { data, error } = await supabase
      .from('opening_balances')
      .select('*')
      .order('category',     { ascending: true })
      .order('sub_category', { ascending: true })
      .order('account_name', { ascending: true })
    if (error) throw error
    return data || []
  },

  /**
   * Fetch opening balances filtered by top-level category
   * ('asset', 'liability', or 'equity').
   */
  async getByCategory(category) {
    const { data, error } = await supabase
      .from('opening_balances')
      .select('*')
      .eq('category', category)
      .order('sub_category', { ascending: true })
      .order('account_name', { ascending: true })
    if (error) throw error
    return data || []
  },

  /**
   * Fetch only entries that are linked to a vehicle.
   */
  async getVehicleEntries() {
    const { data, error } = await supabase
      .from('opening_balances')
      .select('*')
      .not('vehicle_id', 'is', null)
      .order('account_name', { ascending: true })
    if (error) throw error
    return data || []
  },

  /**
   * Insert a new row or update an existing one (matched on id).
   * Supply `row.id` to update; omit it to insert.
   * Returns the saved row.
   */
  async upsert(row) {
    const { data, error } = await supabase
      .from('opening_balances')
      .upsert(row)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Update an existing opening balance, recording the old values in the
   * audit history table before applying the change.
   *
   * @param {string}  id               - UUID of the row to update
   * @param {object}  updates          - Partial column values to apply
   * @param {string}  changedBy        - Username / email of the editor
   * @param {string}  reason           - Human-readable reason for the change
   * @param {number}  oldAmount        - Previous amount value (for history)
   * @param {number}  oldDepreciation  - Previous depreciation value (for history)
   * @returns {object} The updated opening_balances row
   */
  async update(id, updates, changedBy, reason, oldAmount, oldDepreciation) {
    // 1. Write audit history row first so it always precedes the live change
    const { error: histError } = await supabase
      .from('opening_balance_history')
      .insert({
        opening_balance_id: id,
        old_amount:          oldAmount        ?? null,
        new_amount:          updates.amount   ?? null,
        old_depreciation:    oldDepreciation  ?? null,
        new_depreciation:    updates.depreciation_amount ?? null,
        changed_by:          changedBy        || null,
        reason:              reason           || null,
      })
    if (histError) throw histError

    // 2. Apply the update and stamp the editor metadata
    const { data, error } = await supabase
      .from('opening_balances')
      .update({
        ...updates,
        last_edited_by: changedBy || null,
        last_edited_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Permanently delete an opening balance entry.
   * The cascade on opening_balance_history will remove its history rows too.
   */
  async delete(id) {
    return deleteById(supabase, 'opening_balances', id)
  },
}

// ============================================================
// Financial Adjustments
// ============================================================

export const financialAdjustmentsService = {
  /**
   * Fetch adjustments, optionally filtered to a single statement type.
   * @param {string|null} statementType - 'balance_sheet' | 'income' | 'cashflow' | null
   */
  async getAll(statementType) {
    let q = supabase
      .from('financial_adjustments')
      .select('*')
      .order('adjustment_date', { ascending: false })

    if (statementType) {
      q = q.eq('statement_type', statementType)
    }

    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  /**
   * Insert a new financial adjustment.
   * @param {object} adj - Adjustment fields (statement_type, account_name, amount, …)
   * @returns {object} The inserted row
   */
  async create(adj) {
    const { data, error } = await supabase
      .from('financial_adjustments')
      .insert(adj)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Permanently delete a financial adjustment by id.
   */
  async delete(id) {
    return deleteById(supabase, 'financial_adjustments', id)
  },
}

// All financial screens use the audited basis; errors abort the statement.
export const incomeStatementService = { getData: (from, to) => accountingBasisService.income(from, to) }
export const balanceSheetService = { getData: date => accountingBasisService.snapshot(date) }
export const cashFlowService = { getData: (from, to) => accountingBasisService.cashflow(from, to) }
