import { supabase } from '../lib/supabase'

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
    const { error } = await supabase
      .from('opening_balances')
      .delete()
      .eq('id', id)
    if (error) throw error
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
    const { error } = await supabase
      .from('financial_adjustments')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}

// ============================================================
// Balance Sheet
// ============================================================

export const balanceSheetService = {
  /**
   * Gather all data sources needed to render the balance sheet.
   * Each source is fetched with an individual try/catch so that a missing
   * table or permission error on one source never silences the others.
   *
   * @param {string} asAtDate - ISO date string (YYYY-MM-DD), used for context
   * @returns {object} Keyed data map; failed sources return [] or 0.
   */
  async getData(asAtDate) {
    const result = {
      openingBalances:  [],
      vehicles:         [],
      bankAccounts:     [],
      finishedGoods:    [],
      products:         [],
      inventoryItems:   [],
      receivables:      0,    // total accounts receivable (numeric)
      supplierPayables: 0,    // total accounts payable   (numeric)
      adjustments:      [],
    }

    // Opening balances
    try {
      result.openingBalances = await openingBalancesService.getAll()
    } catch (_) { /* non-fatal */ }

    // Vehicles (for fleet / fixed asset section)
    try {
      const { data } = await supabase
        .from('vehicles')
        .select('id, vehicle_number, vehicle_name, status')
      result.vehicles = data || []
    } catch (_) { /* non-fatal */ }

    // Bank accounts (cash & bank balances)
    try {
      const { data } = await supabase
        .from('bank_accounts')
        .select('id, account_name, current_balance')
        .order('account_name', { ascending: true })
      result.bankAccounts = data || []
    } catch (_) { /* non-fatal */ }

    // Finished goods stock in yard
    try {
      const { data } = await supabase
        .from('finished_goods_stock')
        .select('block_type, quantity_in_yard')
      result.finishedGoods = data || []
    } catch (_) { /* non-fatal */ }

    // Product unit prices (to value finished goods)
    try {
      const { data } = await supabase
        .from('products')
        .select('name, unit_price')
      result.products = data || []
    } catch (_) { /* non-fatal */ }

    // Raw material / consumable inventory
    try {
      const { data } = await supabase
        .from('inventory_items')
        .select('name, current_stock, unit_cost')
      result.inventoryItems = data || []
    } catch (_) { /* non-fatal */ }

    // Accounts receivable — sum of (invoice total − confirmed payments).
    // Drafts (quotations) and cancelled invoices are NOT receivables.
    try {
      const { data } = await supabase
        .from('invoices')
        .select('total_amount, payments(amount_paid, status)')
        .not('status', 'in', '("draft","cancelled")')

      if (data) {
        result.receivables = data.reduce((total, invoice) => {
          const confirmed = (invoice.payments || [])
            .filter(p => p.status === 'confirmed')
            .reduce((s, p) => s + Number(p.amount_paid || 0), 0)
          return total + (Number(invoice.total_amount || 0) - confirmed)
        }, 0)
      }
    } catch (_) { /* non-fatal */ }

    // Supplier payables — purchase adds, payment/return subtracts
    try {
      const { data } = await supabase
        .from('supplier_transactions')
        .select('transaction_type, amount')

      if (data) {
        result.supplierPayables = data.reduce((total, t) => {
          const amt = Number(t.amount || 0)
          if (t.transaction_type === 'purchase') return total + amt
          if (t.transaction_type === 'payment' || t.transaction_type === 'return') return total - amt
          return total
        }, 0)
      }
    } catch (_) { /* non-fatal */ }

    // Manual balance-sheet adjustments
    try {
      result.adjustments = await financialAdjustmentsService.getAll('balance_sheet')
    } catch (_) { /* non-fatal */ }

    return result
  },
}

// ============================================================
// Income Statement
// ============================================================

export const incomeStatementService = {
  /**
   * Gather all revenue and expense sources for a date range.
   * Each source is individually guarded so a missing table never aborts
   * the whole fetch (payroll in particular may not exist yet).
   *
   * @param {string} fromDate - ISO date string (YYYY-MM-DD)
   * @param {string} toDate   - ISO date string (YYYY-MM-DD)
   * @returns {object}
   */
  async getData(fromDate, toDate) {
    const result = {
      payments:      [],
      incomeRecords: [],
      expenses:      [],
      payroll:       [],
      adjustments:   [],
    }

    // Confirmed payment receipts with order line details (for revenue breakdown).
    // Exclude payments tied to draft/cancelled invoices so revenue never counts
    // a quotation or a cancelled sale. !inner drops rows whose invoice is
    // filtered out; every payment has an invoice_id (verified), so nothing
    // legitimate is lost.
    try {
      const { data } = await supabase
        .from('payments')
        .select('amount_paid, invoice:invoice_id!inner(status, order:order_id(order_items(block_type, quantity, unit_price)))')
        .eq('status', 'confirmed')
        .not('invoice.status', 'in', '("draft","cancelled")')
        .gte('payment_date', fromDate)
        .lte('payment_date', toDate)
      result.payments = data || []
    } catch (_) { /* non-fatal */ }

    // Miscellaneous income records (non-invoice revenue)
    try {
      const { data } = await supabase
        .from('income_records')
        .select('amount, source')
        .gte('record_date', fromDate)
        .lte('record_date', toDate)
      result.incomeRecords = data || []
    } catch (_) { /* non-fatal */ }

    // Approved / pending expenses (exclude rejected)
    try {
      const { data } = await supabase
        .from('expenses')
        .select('amount, category:category_id(name, parent_category)')
        .neq('status', 'rejected')
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate)
      result.expenses = data || []
    } catch (_) { /* non-fatal */ }

    // Payroll runs that overlap the period (table may not exist yet)
    try {
      const { data } = await supabase
        .from('payroll_runs')
        .select('total_amount, period_from, period_to')
        .gte('period_from', fromDate)
        .lte('period_to', toDate)
      result.payroll = data || []
    } catch (_) {
      // Silently ignore — payroll table is optional
    }

    // Manual income-statement adjustments
    try {
      result.adjustments = await financialAdjustmentsService.getAll('income')
    } catch (_) { /* non-fatal */ }

    return result
  },
}

// ============================================================
// Cash Flow Statement
// ============================================================

export const cashFlowService = {
  /**
   * Gather all data needed to build the cash flow statement.
   *
   * Net profit is derived by running the income statement and computing:
   *   revenue (confirmed payments + other income) − expenses − payroll
   *
   * @param {string} fromDate - ISO date string (YYYY-MM-DD)
   * @param {string} toDate   - ISO date string (YYYY-MM-DD)
   * @returns {object}
   */
  async getData(fromDate, toDate) {
    const result = {
      netProfit:      0,
      openingBalances: [],
      adjustments:    [],
      bankStart:      [],   // [{ account_id, account_name, opening_balance }]
      bankEnd:        [],   // [{ account_id, account_name, current_balance }]
    }

    // ---- Net profit from income statement ----
    try {
      const incomeData = await incomeStatementService.getData(fromDate, toDate)

      const totalRevenue =
        incomeData.payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0) +
        incomeData.incomeRecords.reduce((s, r) => s + Number(r.amount || 0), 0)

      const totalExpenses =
        incomeData.expenses.reduce((s, e) => s + Number(e.amount || 0), 0)

      const totalPayroll =
        incomeData.payroll.reduce((s, pr) => s + Number(pr.total_amount || 0), 0)

      const adjustmentNet =
        incomeData.adjustments.reduce((s, adj) => s + Number(adj.amount || 0), 0)

      result.netProfit = totalRevenue - totalExpenses - totalPayroll + adjustmentNet
    } catch (_) { /* leave as 0 */ }

    // ---- Opening balances (for non-cash working capital adjustments) ----
    try {
      result.openingBalances = await openingBalancesService.getAll()
    } catch (_) { /* non-fatal */ }

    // ---- Manual cash-flow adjustments ----
    try {
      result.adjustments = await financialAdjustmentsService.getAll('cashflow')
    } catch (_) { /* non-fatal */ }

    // ---- Bank accounts — opening (earliest transaction in period) & closing ----
    try {
      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('id, account_name, current_balance')
        .order('account_name', { ascending: true })

      if (accounts && accounts.length > 0) {
        result.bankEnd = accounts.map(acc => ({
          account_id:      acc.id,
          account_name:    acc.account_name,
          current_balance: Number(acc.current_balance || 0),
        }))

        // For each account find the earliest running balance recorded in the period
        const bankStartRows = await Promise.all(
          accounts.map(async acc => {
            try {
              const { data: txRows } = await supabase
                .from('bank_transactions')
                .select('balance, transaction_date')
                .eq('bank_account_id', acc.id)
                .gte('transaction_date', fromDate)
                .lte('transaction_date', toDate)
                .order('transaction_date', { ascending: true })
                .limit(1)

              const opening = txRows && txRows.length > 0
                ? Number(txRows[0].balance || 0)
                : Number(acc.current_balance || 0)

              return {
                account_id:      acc.id,
                account_name:    acc.account_name,
                opening_balance: opening,
              }
            } catch (_) {
              return {
                account_id:      acc.id,
                account_name:    acc.account_name,
                opening_balance: Number(acc.current_balance || 0),
              }
            }
          })
        )
        result.bankStart = bankStartRows
      }
    } catch (_) { /* non-fatal */ }

    return result
  },
}
