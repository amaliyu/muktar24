## Result
All six Audit 2B screen groups use the shared delivered-revenue accounting basis. Cash is shown separately; customer credits become deposits; approved expenses alone enter profit; failed financial sources abort their statement instead of becoming zeros.

## Base and branch
- Repository: amaliyu/muktar24 (private).
- Existing branch: `audit2b/accounting-basis`, continued from `384114836038f245b126ad8bc6c2e626048a3890`.
- Current main/base: `c1d7f4f5ef69a47563083e8f722877e07e84bf6b`.
- Merging current main at the start returned “Already up to date”: main was already an ancestor. Main was fetched again before submission and remained at this commit.
- All continuation commits use `audit2b:`. No SQL was written, no migrations or protected planning/spec documents were changed, and the PR is not merged.

## Shared rules and consumers
- `src/services/accountingBasis.js`: checked, paginated reads; income, positions, supplier ledger, historical stock/bank snapshots, cash flow and dashboard metrics.
- `src/utils/accountingBasis.js`: R1–R9 calculations and shared statement presentation; supplier totals delegate to `src/utils/supplierBalance.js`.
- Accounting P&L, Management Accounts and Bookkeeping summary in `src/App.jsx` use `AccountingSummary.jsx`.
- Financial Statements Income Statement, Balance Sheet, Cash Flow and Management Accounts in `src/components/FinancialStatements.jsx`; `financialService.js` delegates statement reads to the shared service.
- Reports P&L, Balance Sheet, Cash Flow, cash/delivered revenue, AR aging reconciliation, approved Expense Report, and Production Cost Analysis in `src/components/Reports.jsx`. PDF/Excel use shared totals.
- `src/components/BoardDashboard.jsx` and `src/components/KPIDashboard.jsx`: shared delivered revenue, profit, positions and defined collection rate; BDM gets no expense/profit/margin views or exports.
- Main Dashboard in `src/App.jsx`: Cash received and Delivered (revenue) for the same range, plus unpriced-delivery details.

### Site sources (MD clarification, 11 November 2026)
Orders’ site_id is a customer delivery address and is never used for production-site accounting. All order-system sales/payments/waybills belong to DUTSE. Kado/Life Camp use accepted or deemed_accepted block_handovers at their site_contracts opening rates or fee_per_block, non-void site_receipts, and site-tagged expenses. Client positions are per site. Company source totals add all three. Rejected/pending handovers and voided receipts are excluded.

Manual adjustments have no site_id in the verified schema. They are explicitly company-only/unallocated, rather than repeated in each site. Thus company operating totals equal the sites’ sum; company profit additionally includes any unallocated income adjustment.

## September 2026 mocked before/after
Reproducible in `src/utils/accountingBasis.sites.test.js`, with fixtures in `src/test/accountingFixtures.js`. These are synthetic values, not live database balances.

| Metric | Before | After |
|---|---:|---:|
| Revenue | ₦1,100 | ₦3,600 |
| Cash received | ₦1,100 | ₦3,700 |
| Profit | ₦150 | ₦2,700 |
| Trade receivables | ₦200 | ₦900 |
| Customer deposits | ₦100 | ₦1,000 |

“Before” reproduces the old accounting summary’s cash-based revenue/pending-inclusive costs, invoice-net receivables, and the old report’s period-receipts-minus-deliveries deposit heuristic. Client ledgers were absent from those totals. “After” uses shared delivery/customer rules and approved costs. The test also verifies company totals equal the three site totals, and a separate test isolates company-only manual adjustments.

## Validation
- Baseline at current main: `npm test -- --run`: **326 passed**.
- Final: `npm test -- --run`: **377 passed**.
- `npm run build`: passed. Existing bundle-size warnings remain.
- Mock browser QA at 360px: 17 screen/tab views; every document width = 360px, no visible control below 44px, no browser runtime errors. Includes P&L, Management summary, Bookkeeping, Main Dashboard, Board, KPI tabs, BDM, all Financial Statement tabs and Reports.
- Regression coverage includes R1–R8, supplier returns, latest-three-production-month costing, historical stock reversal, cash reconciliation, all financial-source failures, pagination, customer deposits, BDM hiding, management breakdowns/errors, unpriced stock, and PDF statement totals/red Unreconciled styling.
- The Windows environment required an untracked local Vite config-loader workaround in node_modules (config supplied as stdin after an OS parent-directory read failure). No dependency, lockfile or application configuration change was committed. Baseline and final tests used that same runner.

## Standards review
Two independent read-only review axes ran. Standards findings about failed-source zeros, management expense shapes and cash-labelled-as-revenue were fixed. Follow-up sign preservation and exported warning colouring were fixed.

## Spec review
Findings about valuation/history notes, cash-on-hand consistency, company-only adjustments, cost-centre classification, adjustment IDs and unpriced dashboard deliveries were fixed and covered by regression tests.

## Not verified / explicit limits
- Client-site figures are **unverified against live data**: block_handovers and site_receipts currently have zero rows. Accepted/deemed/rejected/void cases use mocks.
- No authenticated live MD/BDM/Kado preview session was available. Live per-role RLS/PostgREST behavior and real September balances remain for MD preview.
- Live table columns/constraints were inspected using read-only Supabase metadata, without SQL. The delivered-revenue view definition/order_id was cross-checked against the existing migration/source; its live authenticated result was not fetched.
- Production costing keeps Production Cost Analysis’s material estimates (cement ₦5,000/bag; dust/chippings ₦50/kg; diesel ₦750/litre), adds approved labour and uses the latest three producing months per type. No selling-price fallback. Unknown costs display quantities as “not valued.”
- Raw-material unit costs have no historical price ledger. Batch acceptance uses date_cured; edits/deletions do not have immutable movement history. These limitations are shown on statements. Finished-goods valuation covers the Dutse yard; client-site finished-stock history is unavailable and labelled.
- Bank opening cash is inferred from the first available transaction’s running balance and its credit/debit, then only transactions through the cutoff are applied. Accounts without usable transaction history and register-only Cash on Hand are explicitly labelled “current figure — history not available.”
- Balance adjustments inherit an exact matching opening account’s section; unmatched accounts appear explicitly in equity. Derived balances replace matching static opening lines to avoid double-counting.
- Cash flow shows any difference between opening cash + computed movement and closing cash as red “Unreconciled”; it does not force reconciliation or invent investing/financing activity.
- No live records were created or changed.

## MD preview checklist (LIVE database — only open screens)
- [ ] Accounting → P&L for September 2026: Revenue (delivered) and Cash received shown separately.
- [ ] Financial Statements → Balance Sheet: Customer deposits line appears; stock is valued at cost (or “not valued”).
- [ ] Cash Flow: opening + change = closing, or a red “Unreconciled” line.
- [ ] KPI Dashboard with Kado selected: cash and costs are Kado’s only.

## PR #134 review fixes (12 November 2026)

- Production costing now uses exact APCL Stock Registry unit costs (`CEMENT`, `DUST`, `CHIPPINGS 3/8`, `DIESEL`) in both balance-sheet finished-goods valuation and the Production Cost Analysis report. Kado/Sequoia inventory items are never matched. Missing or zero prices leave affected block types not valued and name the missing material in the stock note; no estimate fallback remains.
- Partly rejected handovers now count `qty_accepted`; pending and rejected handovers remain excluded.
- New mocked tests cover the live material prices, missing-price not-valued behavior, exact item matching, and 3,000 handed over / 2,800 accepted partly-rejected behavior.
- Validation after these fixes: 379 tests pass (377 existing plus 2 review-fix tests); the production build passes.

## PR #134 review round 2 fix (12 November 2026)

- Bank balances now pass through a pure statement-integrity helper before any historical rebuild. It rejects running-balance mismatches and any single credit/debit above ₦1bn, then uses the recorded `bank_accounts.current_balance` with a red history note for unreliable accounts.
- Reliable statements rebuild only through their last transaction date. Later as-at dates use the recorded current balance with a statement-end note; accounts without transactions retain the existing history-unavailable note.
- Cash-flow opening and closing snapshots use the same bank helper, so reconciliation reflects the guarded balances.
- Added tests for phone-number credits, running-balance mismatch, stale statement end, clean in-range rebuild, no transactions, and cash-flow snapshot usage.
- Full validation: baseline before this round was 379 tests; final is 384 passing tests. `npm run build` passes with the existing bundle-size warning.
- Vercel preview Balance Sheet verification was blocked in this environment because the Windows browser bridge could not determine the active browser URL safely; the requested three live bank lines remain for manual preview verification.
