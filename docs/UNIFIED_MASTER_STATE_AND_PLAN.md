# APC MANAGER — UNIFIED MASTER STATE & PLAN
**Single source of truth. Supersedes all prior handoffs on points of conflict.**

Repo: `amaliyu/muktar24` (PRIVATE) · Prod branch: `main` · Stack: React 18 + Vite 5 + Supabase (PostgreSQL, RLS) + Vercel
App: APC Manager — internal ERP for Abuja Precast Concrete Limited
**Updated: 2026-08-07 (Session 23 — Phase 6A maintenance + 6B curing sign-off, accounting-report rebuild, data-integrity fixes, multi-role access control; PRs #92–#110). Session 22 (2026-07-14) was the Phase 6 design-lock, planning-only — see §9.** All DB state verified by live query, not memory.
**Status: BETA. A physical/manual backup system runs in parallel — NO downtime pressure.**
**Operating mode: SLOW AND VERIFIED — fix on a branch → test on the branch's Vercel preview AS THE AFFECTED ROLE → confirm with own eyes → MD merges → re-verify production.**

---

## 0. HOW THIS DOCUMENT IS USED
- This is the master. On conflict: **live DB facts win**, then this doc.
- Repo is private → planning chats (Claude.ai) have NO GitHub access unless the repo is public. (Repo is currently PUBLIC as of Session 6 — planning chat could read it directly; revert to private when convenient and brief via this file.)
- Division of labour: **Claude Code writes code/SQL files & opens PRs; the MD merges. Migrations are applied from the planning chat via the Supabase connector using `apply_migration` (tracked), with before/after verification.**
- Preview = branch code against the PRODUCTION database (one Supabase project). So test data created on a preview is REAL data and must be cleaned.

---

## 1. SESSION HISTORY (most recent first)

### ✅ SESSION 23 (2026-07-15 → 2026-08-07) — PHASE 6A/6B BUILD + ACCOUNTING-REPORT REBUILD + DATA-INTEGRITY FIXES + MULTI-ROLE ACCESS
**PRs: #92–#110 (19 PRs), all merged. This is the first build session after the Phase 6 design-lock (Session 22, §9). It combines the first two Phase 6 sub-phases (6A maintenance, 6B curing sign-off) with a large, unplanned accounting-report and data-integrity clean-up that surfaced while building — several confidently-"done" earlier features were found silently broken on inspection (see the recurring bug patterns catalogued in §10). No DB migrations were applied from this window; the few schema touches these PRs relied on (production_log audit columns, inventory unit fields) are noted per-PR and were applied via planning-chat where required.**

**Session-numbering note:** Session 21 and Session 22 are BOTH dated 2026-07-14 and are distinct — S21 was the build session (PRs #84–#88, logged in §1 above); S22 was a design-only Phase 6 planning session (see the S22 entry below and §9), landed via docs-only PR #91. S22 previously had no §1 entry (only the §9 planning section, mirroring how Session 13's Phase 5 re-plan carries both a §1 stub and §8); that stub is now added below. This build session is therefore Session 23.

**A. Phase 6A — Maintenance & downtime (PRs #92, #93)**
- **Maintenance page (PR #92):** new Maintenance section — per-asset PM checklist (daily/weekly/monthly/annual items with assigned role and completion logging) plus a downtime log capturing every machine/truck stoppage with start/end, reason category (breakdown, changeover, power outage, material shortage, awaiting parts), and resolver. This is the top-priority Phase 6 sub-phase per the §9 research report — it is what makes a real, measured OEE figure possible instead of the current ~35–50% estimate.
- **Staff-picker team filter (PR #93):** the maintenance staff/assignee picker was listing all staff; fixed to show only the asset's own team by filtering on `reports_to_staff_id` (the reporting-line FK), so a PM assigning a checklist sees only their own crew rather than the whole company.

**B. Phase 6B — Curing sign-off (PRs #94, #95, #96)**
- **Batches product + curing sign-off (PR #94):** the Batches form gained a product dropdown writing `product_id` (previously free-text block type only), an explicit "Batch Date" field, and an advisory curing sign-off — a Store Officer "ripe for picking" affirmation shown against the batch's age. Advisory-only at this stage (no hard block), the groundwork for the §9 6B minimum-curing-age check.
- **Role-gating (PR #95, branch `claude/batches-product-curing-signoff`, stacked on #94):** Batches Edit/Delete were ungated in the UI while the DB RLS restricted them; the client now gates those actions to the same roles RLS enforces, so the buttons no longer appear for roles whose writes would silently fail.
- **Process recovery (PR #96):** commit `b9f06d6` (part of the #95 work) landed on the #94 branch rather than a fresh branch off main. Rather than rewrite history, PR #96 opened a new PR from that branch (`claude/batches-product-curing-signoff`) against main to re-land the change cleanly. #95's content effectively re-landed as #96. Recorded as a process lesson, not a code defect.

**C. Data-integrity incident — production/roster (PRs #97, #98, #99 + follow-up `fbdad15`)**
- **Production edit audit trail + duplicate warning (PR #97):** production-log edits now stamp `updated_at`/`updated_by`; the entry form warns when a same-day, same-product row already exists (duplicate-entry guard). Bug caught pre-merge: `onClick={handleSave}` passed the React event object as the `skipDupCheck` argument — fixed to `onClick={() => handleSave()}`.
- **Auto-deduct dust/chippings fix (PR #98):** `autoDeductProduction` matched inventory items by keyword (`find('granite')`), which never matched the real item named "DUST" — so dust and chippings consumption was never deducted from stock on production. Fixed to match the actual item records; the form field and column were wired through so the deduction fires. This is the "keyword-match inventory lookup" bug class (see §10).
- **Roster upsert-dedupe (PR #99 + follow-up `fbdad15`):** roster edits used delete-then-reinsert, but the DELETE RLS policy was narrower than the INSERT policy — the delete silently no-op'd for some roles and duplicate worker rows accumulated. Replaced with `upsert(rows, { onConflict })` plus a duplicate-worker guard. Follow-up commit `fbdad15` fixed a PostgREST `NOT IN` filter that broke on unquoted hyphenated UUIDs by quoting each value (`"uuid1","uuid2"`). The removed-worker row count could not be empirically re-confirmed from this window (no credentialed preview / REST access — see method note in §6); the DB-level logic was verified via service-role round-trip and disclosed in the PR.

**D. Messaging nav + notification states (PR #100)**
- Messages had become unreachable for some roles because it was missing from their `ROLE_PAGES` entries; the page was re-added to the affected roles. The notification bell's empty/blank states were fixed so an empty inbox renders a proper "no notifications" state rather than a blank dropdown.

**E. Inventory & production stock-event correctness (PRs #101, #102, #105)**
- **Production-delete inventory reversal (PR #101):** deleting a production entry did not reverse the stock it had consumed/produced; `deleteEntry` now reverses the linked inventory movement so stock returns to its pre-entry level.
- **Inventory kg/tonnes toggle + recorder (PR #102):** inventory movement entry gained a kg⇄tonnes unit toggle (storing a consistent canonical unit) and a read-only "Recorded By" field showing who logged the movement.
- **editMovement double-deduct + role-gate (PR #105):** editing an inventory movement re-applied the deduction using the *new* movement type instead of reversing the *old* one first, double-counting stock; fixed to reverse using `oldMovement.movement_type` before applying the edit. The movement action buttons were also role-gated to match who may write.

**F. Payment-request attachment read-back (PR #103)**
- Attachments uploaded to a payment request were not shown back on the request after save (write-only). The detail view now reads back and lists the stored attachment(s) so reviewers can open the evidence they were asked to check.

**G. Accounting audit — six financial reports rebuilt (PRs #104, #106, #107)**
- **Reports date-column + error-swallow fix (PR #104):** `fetchExpensesRange` filtered on a non-existent `date` column instead of `expenses.expense_date`, so expense reports over any range returned nothing; fixed. Separately, 13 report fetchers used the `const { data } = await q; return data || []` pattern, swallowing every PostgREST error into an empty result (a report that failed looked identical to a report with no data). All 13 now surface the error instead of hiding it. This is the "swallowed-error" bug class (see §10).
- **P&L accrual rebuild (PR #106):** the Profit & Loss report was rebuilt as a proper accrual income statement (revenue earned vs. expenses incurred in the period), replacing the earlier cash-mixed logic.
- **Expense/supplier/cash-flow/balance-sheet rebuild (PR #107):** the remaining statements were rebuilt with every column re-verified against `information_schema.columns` first (per the rule in §6). Column traps fixed and catalogued in §10 — notably `expenses.expense_date` (not `date`), `expenses` has no `category`/`subcategory` text column (join `category_id`), `supplier_transactions.transaction_date`, and `suppliers.company_name` (not `name`) — while confirming that `production_log`/`damage_log`/`attendance`/`stock_movements`/`vehicle_fuel_log` genuinely do have a `date` column and must NOT be "fixed."

**H. Edit-freedom / payroll-lock gating (PRs #108, #109)**
- **Roster/loading payroll-lock gating (PR #108):** roster and truck-loading rows Edit/Delete are now gated on the linked payroll's status — rows belonging to a payroll that has advanced past draft (approved/paid) are locked to protect payroll integrity; unlinked or draft-linked rows stay editable.
- **Truck Loading date-range filter (PR #109):** the Truck Loading log gained a from/to date-range filter and a null-date toggle (to surface undated legacy rows), plus a signpost pointing to the payroll flow — reusing the range-picker pattern built for payroll in Session 20.

**I. Multi-role access control (PR #110)**
- Introduced effective-roles: a user's primary role plus any active (non-revoked, non-expired) grants, returned by the `my_effective_roles()` RPC and attached to the profile via `attachEffectiveRoles`. New `src/lib/roles.js` exports `effectiveRolesOf(userProfile)` (falls back to `[userProfile.role]`) and `hasRole(userProfile, ...roles)` (checks primary OR grant — for *delegatable* permissions only).
- Nav is now the UNION of the pages allowed by every effective role; the ICO/BOARD read-only CSS masks are relaxed on `grantedPages`. New MD-only `RoleGrantsManager` screen (list/grant/revoke, with a `check_role_conflict` separation-of-duties warning) backed by `authService.listActiveGrants/checkRoleConflict/grantRole/revokeRole`.
- **Deliberately left as PRIMARY-role checks (NOT converted to `hasRole`):** MD-only authority, the approval-chain actor gates, and the button-level checks in four files (Labour, Reports, Maintenance, FinancialStatements). These were itemised in the PR as intentionally deferred so a granted role cannot silently inherit money-authority; converting them is a future scoped task (see §4).

---

### 🔵 SESSION 22 (2026-07-14) — PHASE 6 DESIGN-LOCK: OPERATIONAL EXCELLENCE (PLANNING ONLY, PR #91)
**No code/schema. Design only. Full locked design in §9. Landed via docs-only PR #91 (adds §9 to this document).**
- Out of an MD-commissioned external benchmarking pass (precast operation vs. global/Nigerian standards — OEE/TPM, NIS 87, imported-parts lead times, Abuja demand), the MD ratified a five-sub-phase Phase 6 roadmap (6A maintenance/downtime, 6B curing enforcement, 6C spare parts, 6D fleet status, 6E role-KPI dashboard/reminders) with a priority-ordered sequencing keyed to the report's own gap ranking. Enforcement/penalty design and the "phase 3" scorecard are explicitly out of scope for this phase.
- Numbered as its own session (like Session 13's Phase 5 re-plan) because it is a distinct, MD-ratified design event even though it shipped no code. Build began the following session (Session 23, PRs #92 onward).

---

### ✅ SESSION 21 (2026-07-14) — DEAD TABLE CLEANUP + LABOUR DASHBOARD + STAFF MESSAGING + NOTIFICATION BELL
**PRs: #84 (dead deliveries table cleanup), #85 (labour & loading dashboard widget), #86 (staff messaging system), #87 (notification bell), #88 (messages shortcut button). All merged. DB changes applied via planning-chat migrations (deliveries table drop; messaging schema; notifications schema + triggers; user_profiles_directory is_active column; fn_is_conversation_participant SECURITY DEFINER function; fn_resolve_user_by_name helper).**

**A. Dead deliveries table cleanup (PR #84 + planning-chat DB migration)**
- `Reports.jsx`'s damage report section was querying `delivery:delivery_id(waybill_number)` — a PostgREST embed through the legacy `deliveries` table using a `damage_log.delivery_id` FK. The `deliveries` table had zero rows and no `waybill_number` column at all (structurally stale, not merely empty), so this query silently returned null for every waybill number on every damage row. The actual waybill linkage — `damage_log.waybill_id` pointing directly to `waybills.id` — was added in Session 18 and had 5 populated rows, but was never wired into the query. Fixed to use `waybill:waybill_id(waybill_number)` — 5 damage rows now show real waybill numbers instead of null.
- `deliveriesService` export removed from `src/services/deliveries.js` (26 lines confirmed dead: zero call sites found anywhere in the app via global search before deletion). The co-located `waybillsService` in the same file was not touched — it remains in active use throughout the codebase.
- After the code PR merged: planning-chat applied a DB migration dropping `damage_log.delivery_id`, `waybills.delivery_id`, and the `deliveries` table itself. The §4 and §7 "known dead table" item is now fully closed.

**B. Labour & Loading dashboard widget (PR #85)**
- Four new `StatCard` elements added to the main `Dashboard` component in `src/App.jsx`, forming a "Labour & Loading" section below the existing stat rows:
  - **Blocks Loaded This Week** — total `quantity_loaded` from `truck_loading_log` for the current Sunday–Saturday week (week convention: most recent Sunday via `d.setDate(d.getDate() - d.getDay())`, consistent with Labour.jsx's existing convention).
  - **Active Loaders Today** — distinct `labour_id` values from `truck_loading_loaders` joins on today's loading log rows.
  - **Pending Payroll** — count of `weekly_labour_payroll` rows in `['draft', 'ico_approved', 'md_approved']` states. Card is clickable (wrapper div `onClick` — `StatCard` has no `onClick` prop); navigates to the Labour page.
  - **Roster Headcount Today** — count of `daily_roster_entries` rows for today's `daily_roster` date. DB structure verified before implementation: `daily_roster` is one aggregate header row per date; per-worker detail lives in `daily_roster_entries` (confirmed live query before approving the PR).
- All four cards gated to `production_manager, assistant_production_manager, logistics_manager, hr_officer, ico, md, board_member`. The section is hidden entirely for roles outside this list. Data fetched in parallel via `Promise.all` inside the existing dashboard stats load effect, guarded by `can(...)` before the fetch.

**C. Staff messaging system (PR #86 + two DB-only fix rounds)**
- New messaging schema (applied via planning-chat before PR): `conversations` (id, is_group, name, created_by), `conversation_participants` (conversation_id, user_id, last_read_at — per-participant read tracking, not per-message), `messages` (id, conversation_id, sender_id, body, created_at). Supports both 1:1 DMs and named group threads. Open messaging: any staff member can message any other, confirmed with MD before build.
- Design note: an earlier 1:1-only schema using `sender_id`/`recipient_id` directly on `messages` was redesigned (before any app code was written against it) once group messaging was raised as a requirement.
- **New files:** `src/services/messages.js` (7 methods: `getAllUsers`, `getInbox`, `getTotalUnread`, `getMessages`, `sendMessage`, `markAsRead`, `findExistingDM`, `createDM`, `createGroup`) and `src/components/Messages.jsx` (full messaging UI: inbox list, thread view, new-conversation modal for DM and group creation). Registered in `App.jsx` nav (Account section) and pages map; unread badge in sidebar via `unreadMsgCount` state polled every 30s.
- **Bug caught before merge (RLS):** the initial implementation resolved names via PostgREST FK embeds through `user_profiles` and queried `user_profiles` directly in `getAllUsers`. `user_profiles` is RLS-restricted to `id = auth.uid() OR role = 'md'`, making the feature functional only for the md role — all other roles would see empty pickers, "Unknown" for every inbox conversation partner, and no sender names in threads. Fixed by routing all cross-user name lookups through `user_profiles_directory` (the established RLS-unrestricted view used throughout the app for exactly this case) with a batched `.in()` resolve-and-merge pattern. PostgREST FK embeds removed entirely for name fields (views do not carry FK metadata for auto-embedding).
- **Follow-up (user_profiles_directory is_active):** after the RLS fix, the user picker still showed deactivated staff (confirmed: EMMANUEL IGBUDU, deactivated). `user_profiles_directory` was extended via planning-chat migration to expose `is_active`; `.eq('is_active', true)` filter added to `getAllUsers()`.
- **Two post-merge DB-only fixes (no app code changes):**
  - (1) Infinite recursion in `conversation_participants` RLS policy: the SELECT policy subqueried `conversation_participants` from within a policy on that same table, causing Postgres to re-apply the policy to its own subquery indefinitely. Fixed via a `SECURITY DEFINER` helper function `fn_is_conversation_participant(conv_id, uid)` that runs outside RLS, used in the SELECT policies for all three tables (`conversations`, `conversation_participants`, `messages`).
  - (2) A conversation creator could not see their own freshly-created conversation immediately after insert: PostgREST's insert-then-select-back pattern failed RLS on `conversations` because the `conversation_participants` row (which the SELECT policy checked) did not exist yet at insert time. Fixed by adding `created_by = auth.uid()` as an alternative allowed condition in the `conversations` SELECT policy, so the creator sees the row before their participant row is written.

**D. Notification system — Phase 2 of 3 (PRs #87 + #88)**
- DB schema (applied via planning-chat before PR #87): `notifications` table (`id, recipient_id, type, title, body, related_table, related_id, read_at, created_at`) with RLS restricting each user to their own rows and a trigger blocking all column updates except `read_at` (prevents notifications from being altered after delivery).
- Event triggers wired into four existing approval chains, firing on status transitions:
  - `payment_requests`: notifies the next actor's role on each status advance (e.g. md when ICO approves), and the original requester on terminal outcomes (disbursed, queried, recalled, rejected). `requested_by` on this table is a UUID, resolved directly.
  - `weekly_labour_payroll`: notifies on status transitions through the approval chain plus the requester on paid/rejected outcomes.
  - `lpo_orders`: notifies the MD on submission (INSERT), and the submitter on the MD's decision (approved/rejected). `submitted_by` is a text name, resolved via `fn_resolve_user_by_name`.
  - `delivery_schedules`: notifies the schedule-approvals role on submission, the requester on approval/rejection.
- **`fn_resolve_user_by_name` helper:** three of the four tables (`lpo_orders.submitted_by`, `weekly_labour_payroll.prepared_by`, `delivery_schedules.created_by`) store the requester as a text name rather than a UUID. The helper does a case-insensitive `full_name` lookup in `user_profiles_directory`, returns `null` on zero or ambiguous matches, and the trigger silently skips the recipient notification rather than risk notifying the wrong person. All triggers verified live with real insert/transition tests before the UI spec was written.
- **PR #87 — notification bell (`src/services/notifications.js` + `src/components/NotificationBell.jsx`):** fixed-position bell icon (top-right, desktop `right: 28px` / mobile `right: 12px`; `zIndex: 400`) with red unread count badge. Polls unread count every 45s. Dropdown shows most recent 30 notifications, colour-coded by type (`action_required` amber / `approved` green / `rejected` red / `info` blue), with relative timestamps, 2-line body clamp, and a "Mark all read" shortcut. Clicking a notification marks it read and navigates to the relevant page: `payment_requests → payment_requests`, `weekly_labour_payroll → labour`, `lpo_orders → lpo_approvals`, `delivery_schedules → schedule_approvals`. Navigation is page-level only — no deep-link to a specific record (none of the four target pages support selected-record routing yet; noted in PR description rather than built around).
- **PR #88 — messages shortcut button (`src/components/MessagesBell.jsx`):** fixed-position chat icon button immediately left of the notification bell (`right: 74px` desktop / `right: 56px` mobile — 36px button + 10px/8px gap from the bell's right edge). Same visual language as `NotificationBell` (36×36px surface button, identical badge pill). Badge shows `unreadMsgCount` if > 0 — reuses the existing state already powering the sidebar Messages badge; no new polling, no new service calls. Click navigates to the messages page via the same `onNavigate` handler. Does not replace the sidebar nav item or its badge — this is an additive quick-access shortcut.
- **Phases 1 and 3 explicitly discussed and deferred:** Phase 1 (role-responsibility reminders — nudge each role when items are overdue for their action) and Phase 3 (performance tracking dashboards from notification data) were both raised and parked. Phase 1 needs a real, agreed definition of expected response times per role and per notification type before building — guessing wrong risks notification fatigue and the feature being disabled entirely. Phase 3 needs real usage data from the running Phase 2 system first. Both recorded as forward goals in §4 (not resolved, explicitly parked).

---

### ✅ SESSION 20 (2026-07-13) — SIDEBAR REGROUP + PAYROLL RANGE/DRAFT REBUILD + PAYMENT-REQUEST FILTER + CURING DAMAGE TRACKING
**PRs: #78 (sidebar-regroup, docs-only nav change), #79 (payroll-week-nav), #80 (payroll-range-picker), #81 (payment-requests-status-filter), #82 (curing-damage-kpi-and-batches). All merged. DB changes applied via planning-chat migrations: weekly_labour_payroll period columns + payroll_id FKs (PR #80 schema); damage_log curing stage + batch_id FK (PR #82 schema); advance_weekly_payroll() cascade + backfill (PR #80 follow-up).**

**A. Sidebar navigation regroup (PR #78)**
- The old Operations section had grown to 11 unrelated items. Restructured `navItems` into five domain sections: Overview / Production / Logistics / HR & Workforce / Finance (Sales/Approvals/Analytics unchanged).
- Every `id`, `label`, and `icon` value is byte-identical to before — pure regroup with zero logic change. `ROLE_PAGES` is keyed on `id` so all role-visibility rules were unaffected.
- Staff, Labour, Disciplinary, Attendance Kiosk, Attendance Flags, Leave Requests, Salary Advances all moved under **HR & Workforce**. Advances and Leave moved from Finance. Finance retains Accounting and Payment Requests.

**B. Payroll week navigation UX (PR #79)**
- Added `shiftWeek(dateStr, weeks)` helper function in `src/components/Labour.jsx` near the other date helpers: shifts a Saturday date string by `weeks × 7` days, returns `YYYY-MM-DD`.
- `WeeklyPayrollTab` date-selector row gained **prev (‹) / next (›) buttons** flanking the date input. Each calls `setWeekEnding(shiftWeek(weekEnding, ±1))`; the existing `useEffect` on `loadWeekData` fires automatically.
- **Status badge** shown inline after "Load Week", derived from `payrollRecords` filtered to the current `subTab` payroll_type. States: No payroll (gray) / Draft (amber) / Paid (green) / verbatim fallthrough for other real states (ico_approved, md_approved, etc.).

**C. Flexible date-range payroll selection, production + loading (PR #80; DB via planning-chat migration)**
This was the major build item of the session.

*Schema changes (applied via planning-chat before PR merge):*
- `weekly_labour_payroll` gained `period_start date` and `period_end date` columns (additive; `week_ending` is still populated as `period_end` for backward compatibility with PDF/XLSX/status-board code that reads it).
- `UNIQUE(week_ending, payroll_type)` constraint on `weekly_labour_payroll` was dropped — custom date ranges can share a Saturday week_ending.
- `daily_roster.payroll_id uuid FK → weekly_labour_payroll.id` and `truck_loading_log.payroll_id uuid FK → weekly_labour_payroll.id` added as the real "already linked to a payroll" guard, replacing week-bucket matching.

*UI rebuild (PR #80):*
- `WeeklyPayrollTab` rebuilt with a **date-range picker** (From / To date inputs replacing the single week-ending input), prev/next buttons shifting both ends by 7 days, and a "Load Range" button.
- **Row-level checkbox selection:** all `daily_roster` / `truck_loading_log` rows in the fetched range are shown in a source-rows table above the worker summary. Unassigned rows (`payroll_id IS NULL`) pre-selected; rows linked to the current draft pre-selected + badged "This Draft"; rows in other payrolls dimmed + checkbox disabled + badged "Other". Select-all checkbox in header; worker aggregation recomputes live from checked rows only.
- **Draft-edit mode:** if a `weekly_labour_payroll` draft record is detected, the "Generate Payroll" button becomes **"Update Draft"** — saves recalculated totals to the existing record without creating a new INSERT. A "— editing draft" indicator shown next to the status badge. This allows adding or removing rows from an existing draft rather than starting over.
- **Generate Payroll:** staleness guard re-fetches `payroll_id` on selected rows before inserting; aborts if any were claimed since page load. On success: INSERTs `weekly_labour_payroll` with `period_start`, `period_end`, `week_ending = rangeTo`; UPDATEs each selected `daily_roster` / `truck_loading_log` row to set `payroll_id = newId`.
- **Recent Payrolls list:** "Period" column now shows `period_start – period_end` range for new records; falls back to `week_ending` for old ones. `openPayroll()` from the list restores `rangeFrom` / `rangeTo` from the clicked record.
- **Historical badge on `RosterCreateForm`** date input: amber "Historical" badge when the selected roster date is before today.

*Bug caught and fixed before merge:*
- Initial implementation detected an existing draft using `.eq('week_ending', rangeTo)` — still week-bucket matching, defeating the feature for the most common real case (widening a draft's range after creation). Fixed to two-step detection: (1) fetch `daily_roster` / `truck_loading_log` rows for the range; (2) collect distinct `payroll_id` values from those rows; (3) fetch `weekly_labour_payroll` by `.in('id', linkedIds)`. A visible warning is surfaced if a range spans multiple distinct draft payrolls for the same type (edge case; admin resolution required).

*Follow-up DB fix (planning-chat, after PR merge):*
- `advance_weekly_payroll()` RPC previously never cascaded a payroll reaching `paid` status to the linked `daily_roster` / `truck_loading_log` rows' own `payment_status` column — those rows stayed `'unpaid'` regardless of their payroll's status.
- Fixed inside the RPC: when a payroll is marked paid, it now updates `payment_status = 'paid'` on all rows whose `payroll_id` matches.
- Backfilled: 17 rows (5 `daily_roster`, 12 `truck_loading_log`) whose payrolls were already paid but hadn't inherited the status.

**D. Payment request status filter + Outstanding Disbursement card (PR #81)**
- **Full 7-status filter bar** (`draft` / `ico_approved` / `md_approved` / `funded` / `disbursed` / `queried` / `closed`) added for every role, including initiators — who previously had no filtering at all. Filter takes precedence over the existing Action Queue / All / Queried 3-way toggle when active; selecting "All" restores the toggle's normal behavior. The existing toggle is not modified.
- Each status button shows a count badge for non-zero statuses. Empty-state message is status-aware ("No ico_approved requests." instead of the generic queue message) when a filter is active.
- **Outstanding Disbursement stat card** showing total ₦ sum + request count whenever `status = 'funded'` requests exist. Positioned between the page header and the create/backfill forms. Scoped automatically: initiators see `listMine()` results (their own funded-but-undisbursed total with "(your requests)" label); reviewer roles see company-wide. Interpretation: `funded` = accountant has run `mark_funded`, money is committed, `mark_disbursed` has not yet been called — flagged in PR description for MD confirmation.
- `recalled` and `cancelled` statuses visible in `statusColor` map but not confirmed as live state machine values — left out of the filter buttons, accessible under "All".

**E. Trading Margin Report ICO access — decision only, no code change**
- Confirmed: ICO stays excluded from `get_order_trading_margin()`. Current RLS/RPC already reflects this (gated to `bdm`, `md`, `accountant`, `board_member` only). Open S17 decision item closed with no migration or code change required.

**F. KPI stacking-stage split + curing damage entry (PR #82; DB via planning-chat migration)**

*Schema changes (applied via planning-chat before PR):*
- `damage_log.stage` CHECK constraint gained a `'curing'` value: Store Officer custody window (from batch handover through curing/picking/loading until they sign the waybill). `'stacking'` now means specifically pre-handover, PM/Assistant PM custody only.
- `damage_log.batch_id uuid FK → batches.id` added for curing-stage entries. `production_log_id` left unchanged for production/stacking-stage entries.
- 7 existing `damage_log` rows reclassified from `'stacking'` to `'curing'` (those logged after their batch's `created_at` = the handover moment). Done; no further data action required.
- `damage_log.recorded_by` FK retargeted from `staff(id)` to `user_profiles(id)` — the app only has `userProfile.id` (auth UUID from `user_profiles`) on hand at runtime; `staff.id` is a separate UUID in this schema and would have been a dangling reference. Confirmed zero existing rows had `recorded_by` populated, so no migration of existing data was needed.

*KPIDashboard.jsx fix (PR #82):*
- Damage aggregation previously only recognized `['production','stacking']` and `'delivery'` stages — curing-stage rows were silently invisible in all KPI totals, including the 7 newly reclassified rows.
- Added `dmgCuring = dmgLog.filter(d => d.stage === 'curing').reduce(...)`. `dmgProduction` definition left exactly as-is (PM/APM combined total, still correct).
- New **"Curing/Yard Damage (Store Officer)"** KPICard in the Production tab's Damage Analysis section (purple accent, % of produced sub-text). Grid widened from 3 to 4 columns.
- Added to PDF export table under PRODUCTION alongside the existing Production Damage row.

*New Batches page feature (PR #82):*
- `Batches` component now receives `userProfile` prop; render call updated accordingly.
- **"Log Damage" button** added per active batch row — visible only when `['store_officer', 'md'].includes(userProfile?.role)`. Role casing confirmed `'store_officer'` (lowercase underscore) from `ROLE_PAGES` at line 136, consistent with all other role checks in the file. Button hidden on exhausted batches (no remaining stock to deduct from).
- Opens a **modal** with: quantity damaged (required), date (defaults to today, amber "Historical" badge if backdated — same pattern as `RosterCreateForm`), optional notes.
- On submit: `productionService.logDamage({ stage: 'curing', batch_id, block_type, quantity_damaged, date, notes, recorded_by: userProfile.id })` — no `production_log_id` set on this path; calls `batchesService.reduceStock(batch.id, qty)` (existing service method that decrements `qty_remaining`, clamps at 0, flips status to `exhausted` when zero — same code path used by waybill/delivery picking); calls `finishedGoodsService.decrease(block_type, qty)` (fire-and-forget pattern already used by batch edit and delete in the same component).

---

### ✅ SESSION 19 (2026-07-13) — DELETION AUDIT TRAIL + TRUCK LOADING CLEANUP + LOADING/WAYBILL REDESIGN
**PRs: #71 (invoice-and-order-delete), #72 (truck-loading-cleanup), #74 (truck-loading-features), #75 (store-officer-dropdown-fix), #76 (waybill-driver-filter). DB-only changes applied via planning-chat migration: deletion_log table + triggers; duplicate truck_loading_log row cleanup + UNIQUE INDEX on waybill_id; '9 Inch 3 Hole Block' product split + loading rate. PR #73 was docs-only (partial S19 notes, superseded by this entry).**

**A. Deletion audit trail (DB — planning-chat migration; code via PR #71)**
- `deletion_log` table: captures deleted-row snapshots for invoices, payments, orders, waybills, and truck_loading_log. Columns: table_name, record_id, snapshot (jsonb), deleted_by, deleted_at.
- Trigger fires on DELETE from each covered table and writes a row to `deletion_log` before the row is removed — durable audit record without relying on application logic.
- All triggers (covering all five tables) were applied via planning-chat migrations — entirely DB-only work, separate from PR #71's app-code changes.

**B. Invoice deletion + order deletion (PR #71)**
- Single-invoice delete added (MD-only, confirm-gated). Guard: if the invoice has any linked payments, deletion is blocked with a clear message — must clear or void payments first.
- Order deletion added with the same payment-guard on both the client side (UI blocks before submit) and DB side (enforced even on direct API calls).
- Before this PR, the only removal path was deleting the whole parent order — cascading all other invoices, payments, and waybills on the order. A targeted single-invoice delete resolves that.

**C. Truck loading duplicate cleanup + unique index (DB — planning-chat migration)**
- 9 waybills had duplicate `truck_loading_log` rows: the S18 waybill→loading sync trigger ran against pre-existing waybills that already had a manual log entry, creating one extra row per affected waybill.
- Duplicate rows posed ~₦28,800 in phantom payroll exposure — loaders would have been paid twice for those trips on the next loading payroll run.
- Duplicates cleared; `UNIQUE INDEX` added on `truck_loading_log(waybill_id)` to prevent recurrence. Any future INSERT that would create a second log row for the same waybill surfaces as Postgres error 23505 — caught in the TruckLoadingPage UI with a clear message (PR #74).
- Live verification: zero duplicate rows post-cleanup; unique constraint proven by attempted duplicate INSERT.
- **Also confirmed via this audit:** zero duplicate active rows exist in `truck_loader_assignments` — the S18 URGENT flag for BWR-100XB is fully closed (see §4).

**D. Dead code removal + rates-tab crash fix (PR #72)**
- `TruckLoadingTab`, `AssignLoaderForm`, `LoadingLogForm`, `LoadingWeeklySummary` and their render branch removed from `src/components/Labour.jsx` (~443 lines). These components had been unreachable since the S17 payroll consolidation (PR #68) and contained a hardcoded ₦8/block rate predating the per-product rate table.
- Rates tab crash fixed: `truckLoadingService.getRates()` called `.order('created_at')` — `truck_loading_rates` has no `created_at` column (only `updated_at`). Fixed to `.order('updated_at')`.

**E. '9 Inch 3 Hole Block' product split (DB — planning-chat migration)**
- New product record created for '9 Inch 3 Hole Block', separated from '9 Inch (Nigeria Standard)' (the local-resale catalog entry from the S17 naming-collision fix). Own truck loading rate configured.
- No app-code change required — the product appears in all product dropdowns via the existing products table query.

**F. Loading/waybill redesign (PR #74)**
- **Loader picker on Waybills form:** searchable multi-select. On vehicle selection, auto-populates loaders from `truck_loader_assignments` (standing crew for that vehicle). Per-trip override: any user change triggers `truckLoadingService.syncLoaders()` after save. Semantics: `waybillLoaders = null` = don't override the S18 trigger's auto-population; any array (even empty) = explicit selection, sync after save.
- **`signed_by_name` field:** free-text "Receiver's Signature (Name)" — the person who physically signed at the delivery site; distinct from `receiver_name` (the customer's registered name). Writes to `waybills.signed_by_name`.
- **Store officer FK:** replaced the old free-text `store_officer` field with a `store_officer_id` FK dropdown bound to `staff.id`.
- **Edit action on loading log entries:** edit form on TruckLoadingPage. Blocked when `payment_status = 'paid'` — paid entries locked to protect payroll integrity, consistent with the S18 trigger's paid-entry lock.
- **Waybill picker + backfill mode:** log form on TruckLoadingPage gains a waybill selector, filtered to waybills not yet linked to any existing log entry (client-side Set lookup on `waybill_id`). Backfill toggle allows logging a historical trip not auto-created by the S18 trigger. Postgres 23505 on duplicate waybill_id surfaces as a clear UI message.

**G. Store officer and driver dropdown fixes (PRs #75, #76)**
- Both dropdowns were listing all staff unfiltered. Root cause: `staff.role` stores `'Store Officer'` and `'Driver'` (capitalized, space-separated) but the filter code compared against lowercase enum-style values — returning no matches.
- Fix: `staff.filter(s => s.role?.trim().toLowerCase() === 'store officer')` and `=== 'driver'` respectively. Case-insensitive match against the actual stored string, same pattern used throughout the codebase for role filters.
- PR #75 also relabeled the waybill field from "Signed By (On-Site)" → "Receiver's Signature (Name)" and updated the placeholder. PR #76 dropped the `({s.role})` suffix from driver option labels (redundant once the list is role-filtered).
- Both PRs merged.

**H. KPI tracking goal — chain of custody (recorded, not yet built)**
- Goal: tie block breakage to whoever had custody at the time. Chain per MD: Production Manager/Assistant PM (batching through yard stacking count) → Store Officer (from batch-number handover through supervising loading, until they sign the waybill) → Driver (from waybill signature through delivery, until customer sign-off).
- Stacking-stage attribution gap: `damage_log.stage = 'stacking'` conflates two different custody holders (pre-handover PM/APM vs. post-handover Store Officer) into one label. Needs either a split stage value or a handover timestamp before any KPI can attribute stacking-stage damage correctly. See §4 for detail.
- Not yet scoped as a build item.

---

### ✅ SESSION 18 (2026-07-12) — WAYBILL→TRUCK LOADING SYNC + TRANSIT-DAMAGE DRIVER LINKAGE (DB ONLY)
**No code PRs — all changes applied directly by the planning chat via `apply_migration`. No app code changed.**

**A. Waybill → Truck Loading sync trigger**
- New trigger function `fn_sync_waybill_to_truck_loading()` on the `waybills` table (fires on INSERT, UPDATE, DELETE).
- On INSERT/UPDATE: auto-generates or refreshes a `truck_loading_log` row for the waybill, sourcing the crew list from `truck_loader_assignments` (active assignments for the vehicle at the time of the waybill). Also writes the corresponding `truck_loading_loaders` rows.
- On DELETE: removes the linked `truck_loading_log` row (and its loader rows via cascade) unless the log entry has already been included in a paid payroll run — paid entries are locked from overwrite/deletion to protect payroll integrity.
- Helper function `apc_map_block_type_to_product_id()` maps block type strings to `products.id` for the log insert.
- **Effect:** every waybill save now automatically keeps truck loading records in sync without manual double-entry.

**B. FK fix — `truck_loading_log.waybill_id` ON DELETE action**
- The foreign key `truck_loading_log_waybill_id_fkey` was missing an `ON DELETE` clause (defaulted to RESTRICT), which would have blocked deletion of any waybill that had a linked loading log row.
- Fixed to `ON DELETE SET NULL` — waybill deletion now nulls the `waybill_id` on the loading log rather than being blocked.

**C. Transit-damage driver linkage**
- Added `damage_log.waybill_id` column — a proper FK to `waybills` (nullable; not all damage is transit damage).
- Backfilled 5 existing delivery-stage damage records against their respective waybills.
- New trigger `fn_autolink_delivery_damage()` on `damage_log` (INSERT): inspects the `notes` text for a waybill reference and auto-populates `waybill_id` on future transit-damage entries.
- **Effect:** driver-level damage reporting is now possible via the join chain `damage_log → waybills → driver_id → staff`. Previously there was no programmatic link between a transit-damage record and the driver who made the delivery.

**D. Known issues logged (not yet fixed)**
- **Duplicate active row in `truck_loader_assignments`** for one loader on vehicle BWR-100XB — this loader would receive double credit on any loading payroll run that covers that vehicle. Other trucks have not been audited for the same pattern. Needs an audit query and dedup before the next payroll cycle that touches BWR-100XB.
- **`damage_log.delivery_id` / `deliveries` table confirmed dead** — `deliveries` has 0 rows; the `delivery_id` FK on `damage_log` is a legacy column from an earlier design that was never used. Candidate for cleanup in a future housekeeping pass.

### ✅ SESSION 17 (2026-07-10/11) — PHASE 5b/5c COMPLETE + TRUCK LOADING REBUILD + HISTORICAL BACKFILL
**PRs: #59 (payment-requests-history), #60 (payment-request-edit), #61 (payment-request-closure), #62 (truck-loading-page — initial standalone build), #63 (bank-statement-reconciliation), #64 (pr-bank-matching), #65 (disbursement-source-account), #66 (backfill-payment-requests), #67 (trading-margin-report), #68 (truck-loading-consolidation — final rebuild). All merged. DB changes applied via planning-chat migrations as usual.**

**A. Phase 5b closure logic (PRs #59–61)**
- `advance_payment_request` now handles `close` and `override_close` actions.
- Closure is evidence-gated per category's `closure_mechanism`: stock-movement link required for `stock` category; vehicle-log link for `vehicle`; truck-loading-log link for `loading`; external-haulage-log link for `haulage`; receipt attachment for `receipt`. Service/cash categories expect a receipt — policy-based, not a hard block.
- Override close is a dual-actor mechanism (accountant OR MD); each override is logged with actor so accountant-overrides-own-disbursement is visually distinguished (self-review mitigation, per Decision 13).
- A self-review override reporting view (`payment_request_override_report` or equivalent) surfaces all logged overrides to MD/ICO.
- **History view (PR #59):** the payment-request detail modal gains a full audit trail (status transitions, actors, timestamps) — same pattern as payroll/advance/disciplinary audit tables.
- **Edit-while-draft (PR #60):** initiators can edit a payment request while it is in `draft` status; edit is locked once it moves to ICO review.

**B. Truck loading rates + payroll — built, then partially rebuilt (PRs #62, #68)**
- **Initial build (PR #62, Stage B):** Per-product trip-tiered rate table (`truck_loading_rates`) added, fixing a flat hard-coded ₦8/bag rate that had left the feature unused since beta. A new dedicated payroll-approval table (`truck_loading_payroll`) and its RPCs (`generate_truck_loading_payroll`, `advance_truck_loading_payroll`) were built and the Payroll tab wired up in the standalone TruckLoadingPage.
- **Redundancy identified same session:** The new payroll table duplicated a proven, already-in-use mechanism — `weekly_labour_payroll` with `payroll_type='loading'`, with 4 completed real cycles pre-existing and correctly used by the existing `WeeklyPayrollTab` in `Labour.jsx`. Critically, the existing P&L and cost-per-unit reports already read from `weekly_labour_payroll` specifically; the new table would have been invisible to cost reporting if left in place.
- **Consolidation (PR #68):** New redundant payroll table, its RPCs, and the old broken `TruckLoadingTab` entry-logging UI in `Labour.jsx` all removed. Rate/pricing logic and the standalone `TruckLoadingPage` kept. All payroll flow consolidated onto the one proven `weekly_labour_payroll` path via `WeeklyPayrollTab`. Delete capability added for initiators (entry deletion is blocked once a payroll run covering it has moved past draft). Historical-entry badge added: if `log.date < log.created_at.split('T')[0]` the row is flagged amber "Historical" — confirms a back-entered trip rather than a same-day punch.

**C. Phase 5c — bank reconciliation (PRs #63, #64)**
- **Account hygiene (DB — planning-chat migration):** duplicate bank account records removed; real Moniepoint account number recorded in `bank_accounts`. Live account count now correct.
- **Match-state machine (RPC-guarded — planning-chat migration):** `suggested` → `confirmed` / `rejected` with full audit trail. The existing client-side unguarded writes to `bank_transactions` are replaced by `suggest_bank_match(p_bank_transaction_id, p_matched_to_type, p_matched_to_id)` and `confirm_bank_match(p_bank_transaction_id, p_action, p_reason)` RPCs. A confirmed match cannot be re-matched without a reject first.
- **Whole-file reconciliation gate on statement import (PR #63):** opening + credits − debits = closing, verified before the import batch is written. Prefers the bank's own stated totals over row-summation when present (Moniepoint header totals; Taj TRANS SUMMARY). If the check cannot run at all (data missing), the user receives an explicit acknowledgment prompt — never silently skips. Any arithmetic mismatch rejects the entire file; partial ingestion is forbidden.
- **Reference-based auto-matching (PR #64):** `APC-PR-#####` embedded in bank narrations is matched against `payment_requests`. **Amount-agreement gate is strict:** a reference match with a mismatched amount is flagged as a discrepancy, never auto-confirmed. Matching creates a `suggested` match; accountant confirms. UI surfaces all suggested matches in a review queue.
- **`payment_requests.bank_account_id` required on non-cash disbursement (PR #65):** the disbursement modal now requires selecting the source bank account before the `disbursed` action can be submitted. `advance_payment_request` receives `p_bank_account_id` and records it on the request row.

**D. Historical backfill (PR #66)**
- `payment_requests.transaction_date` column added — the actual date money moved, separate from `created_at` (when the digital record was entered).
- `backfill_payment_request()` RPC: lands directly in `disbursed` status (skips the live approval chain, since real approval already happened informally before the system existed). Open to initiator roles + md. A mandatory historical note field is required on every backfill submission.
- `query` and `resolve_query` actions on `advance_payment_request`: ICO or accountant can flag a backfilled entry for correction without triggering a live dispute; the initiator can submit a corrected note/amount; the querying role resolves. Keeps back-data corrections auditable without a full re-submission cycle.
- On-behalf-of user picker uses `user_profiles_directory` (the RLS-safe view accessible to all authenticated roles), not the raw `user_profiles` table which is restricted to HR/MD.

**E. Trading/resale corrections (DB — planning-chat migrations)**
- "9 Inch" product (leftover test-data debris, not a real product) renamed to "9 Inch (Nigeria Standard)" and repurposed as the actual local/Nigeria-standard resale catalog entry — resolves the S16 naming-collision deferral.
- A real live order (APC-INV-2026-2381) found mis-tagged as `source_type='manufactured'` when it was actually a resale order — corrected.
- `order_items.cost_basis` auto-sync trigger: whenever a linked Trading Purchases payment request reaches `disbursed`, its `amount` is added to (not overwrites) `cost_basis` on the linked `order_item`. Accumulates across partial/installment payments — supporting the 50%-now-50%-on-delivery pattern.

**F. Full landed-cost margin — resolves S16 deferral (PR #67)**
- `order_trading_margin` view + `get_order_trading_margin(p_order_id uuid DEFAULT NULL)` RPC (role-gated: `bdm`, `md`, `accountant`, `board_member`). Attributes fuel and loading costs to a specific order via the existing `waybills → vehicle_fuel_log / truck_loading_log` link (no new columns on waybills). External-haulage cases use `external_haulage_log.order_id` (new column).
- **TradingMarginReport UI in `App.jsx`:** gross margin (sale − purchase_cost) vs. true margin (sale − landed_cost) side by side. RPC returns raw cost columns only; all derived fields (`gross_margin`, `landed_cost`, `true_margin`) computed client-side at `setRows` using stable aliased names — prevents repeated field-name divergence across components.

**G. Miscellaneous real fixes (DB — planning-chat migrations)**
- **`suppliers_select` RLS widened:** initiator roles (production_manager, logistics_manager, bdm, hr_officer) were unable to see any active vendors at all when creating a payment request — oversight-role-only was an oversight in the original policy. Fixed to grant `status='active'` vendor SELECT to all authenticated roles (the payee's company name and bank details are not sensitive).
- **Staff self-service ID card download:** `staff_photos_read` only ever covered oversight roles (HR/MD) reading others' photos; staff accessing their own photo for their own ID card download were blocked. Self-access rule added (`auth.uid() = owner`-style) so any linked employee can download their own ID card without HR having to do it.
- **NULL-role-bypass security sweep:** A pattern where `get_user_role() NOT IN ('list', 'of', 'roles')` silently evaluates to TRUE when the role resolves to NULL (unauthenticated/broken profile), found first in `get_kiosk_pin_sync` during an earlier fix that itself introduced the same bug. Swept across the entire schema — 9 pre-existing functions had the same latent vulnerability; all patched to `get_user_role() IS NOT NULL AND get_user_role() NOT IN (...)` or equivalent safe guard. Verified clean.
- **`reconcile_attendance_punches` access tightened:** the RPC was callable by any `authenticated` user, not just the pg_cron service role. `REVOKE EXECUTE FROM authenticated` applied; `service_role` retains access for the nightly job.

### 🔵 SESSION 16 (2026-07-09) — PHASE 5a BUILD: EXPENSE CATEGORIES + PAYMENT REQUESTS + TRADING/RESALE
**PRs: #51 (docs — Decision 10 Moniepoint empirics), #52 (docs — Decision 11 initiator roles), #53 (Phase 5a payment-request lifecycle frontend), #54 (trading/resale order items). Code PRs carry no DB changes. All DB changes applied via planning-chat migrations.**

*(Pre-note: S15 closed all four §8 pre-schema verification items — real Moniepoint xlsx empirics confirming both bulk-single-debit and per-beneficiary patterns + partial BULK_TRF_RFD refund edge case (Decision 10 updated); MD's initiator-roles ruling (Decision 11 recorded). Docs PRs #51/#52 merged against main after PR #50 landed. S16 is the first Phase 5a build session.)*

**A. expense_categories restructure (DB — planning-chat migration)**
- Cost-centre grouping: parent/group rows added to `expense_categories` so categories are organised by domain in the payment-request creation form.
- **Labour/Salaries deactivated** (`is_active = false`) — payroll and labour outflows are Decision 4 boundary items, governed by their own state machines; they must never appear as user-selectable options in the payment-request form. ICO/MD can reactivate if the boundary rule changes.
- New categories seeded consistent with the §8 Seeds list; notably **Trading Purchases** as the anchor category for resale cost links (§C below).
- Closure mechanism: the existing `is_active` flag (Decision 5) is the instrument; this restructure applies it to the Labour/Salaries group and documents the deactivation convention going forward — any category that falls inside an existing state-machine flow must be deactivated here, not deleted.

**B. Payee/vendor system (DB already live before S16; frontend — PR #56, separate from Phase 5a lifecycle PR #53)**
- `payment_requests.supplier_id` / `payee_name` / `payee_bank_name` / `payee_account_number` / `payee_account_name` / `category_other_note` columns live on DB. `create_supplier_from_payment_request(p_company_name, p_bank_name, p_bank_account_number, p_bank_account_name, p_contact_person, p_phone)` RPC live.
- **Save-as-vendor flow:** the creation form toggles between "Existing Vendor" (dropdown of `status='active'` suppliers, sets `supplier_id`) and "New Payee" (free-text payee fields). In New Payee mode a "Save as vendor for next time" checkbox calls the RPC on submit → new `suppliers` row created with `status='pending_verification'`, returned ID used as `supplier_id` on the request instead of free-text fields.
- **pending_verification gate:** pending vendors are surfaced in a "Pending Vendors" section within PaymentRequestsPage (md/ico/accountant only); approve button flips `status` to `active`. Pending vendors are excluded from the active-vendor dropdown but the payment request itself is not blocked — gate is on vendor promotion, not submission.
- **Others category note:** when the "Others" expense category is selected, a required free-text "Please describe" field bound to `category_other_note` is shown; client-side validation blocks submission without it.
- **Blocking issue (S16):** the DB constraint requiring `supplier_id IS NOT NULL OR payee_name IS NOT NULL` was live before the frontend shipped it — every submission through PR #53's form was failing. PR #56 is the unblocking fix.

**C. Trading/resale order items (DB already live before S16; frontend — PR #54)**
- `order_items.source_type` (text, NOT NULL, default `'manufactured'`; values `'manufactured'` | `'resale'`) — distinguishes APCL-produced stock from blocks bought in from a third-party partner for resale.
- `order_items.cost_basis` (numeric, nullable) — what APCL pays the partner for the resale item. Captures purchase cost only; full landed-cost margin deliberately deferred (see §4).
- `payment_requests.order_item_id` (uuid, nullable FK to `order_items`) — links a Trading Purchases payment request to the specific order item being funded, enabling future cost reconciliation.
- **Frontend (PR #54):** source-type toggle (Mfg / Resale) on every line item in the new-order and order-edit forms; resale rows highlighted amber; order detail shows a `Resale` badge with cost basis where set. BDM payment-request creation form surfaces an optional order → order-item linking panel when "Trading Purchases" is selected — order dropdown (all orders with resale items) filters to a per-order item sub-dropdown. Both dropdowns are optional; a Trading Purchases request can be submitted without an order link.
- `paymentRequestsService.create()` updated to thread `order_item_id` through to the insert.

**Two items explicitly deferred — not built, recorded in §4 to prevent re-invention:**
- Products table naming collision: "9 Inch" ambiguity between APCL-manufactured and local/Nigeria-standard resale variant (not yet a distinct product record).
- Full landed-cost margin on resale trades: delivery logistics cost attribution to a specific trade is wanted but deliberately not built — `cost_basis` is the foundation; the link to a waybill/delivery for freight attribution is the remaining piece.

### ✅ SESSION 14 (2026-07-07) — STORAGE-POLICY CLEANUP (planning-chat SQL, no code PR)
**Scope: storage-policy cleanup only. Phase 5 schema is the thread after this one — not started here.**

**Kiosk fix verified live (first check this session):** newest `attendance_punches` row (2026-07-06 05:11:06) has `photo_storage_path` populated (`has_photo = true`); the four rows immediately before it (2026-07-04, pre-fix) are null. Confirms the camera-capture fix from the attendance kiosk work is landing correctly in production, not a fluke.

**Storage RLS cleanup — replaced 4 permissive `public_*` policies + 3 receipts-specific leftovers with per-bucket role-scoped policies, one bucket at a time, additive-then-tighten (S6 pattern):**
- Bucket-level state checked first: all 5 target buckets (`receipts`, `lpo-documents`, `supplier-documents`, `vehicle-documents`, `attendance-photos`) were already `public: false` — no unauthenticated exposure at the bucket level. The gap was entirely at the `storage.objects` RLS layer: `public_insert` had **zero bucket restriction at all** (any authenticated user could write to any bucket, including `staff-documents`), and `public_select`/`update`/`delete` excluded only `staff-documents` — meaning any authenticated user (driver, marketer, etc.) could read/write/delete receipts, LPO docs, supplier docs, and vehicle docs directly via the storage API, bypassing the app UI entirely.
- Role scoping — corrected via planning-chat follow-up after initial migration (marketer/MD-write on LPO were confirmed by MD; two SELECT gaps found and fixed — bdm/accountant couldn't view supplier-documents after uploading, logistics_manager same on vehicle-documents):
  - `receipts` → write+delete md/accountant (ALL), view +ico/board_member
  - `lpo-documents` → write/update md/bdm/marketer, view +ico/accountant/board_member (same as write roles), delete md-only
  - `supplier-documents` → write/update md/bdm/accountant, view same three +ico/board_member, delete md-only
  - `vehicle-documents` → write/update md/logistics_manager, view same two +ico/board_member, delete md-only
  - `attendance-photos` → md/hr_officer (ALL), no other viewer
  - Deletion on lpo/supplier/vehicle is MD-only by design — an MD-confirmation request workflow (non-MD roles request, MD approves) was discussed and explicitly deferred, not built; flag as a future scoped feature if needed, not assumed.
- **Side-effect finding:** dropping the four generic policies also closed two loopholes on buckets outside this scope — `staff-documents`' own folder-ownership INSERT policy and `staff-photos`' own role-scoped policies were both being silently bypassed by the generic `public_insert`/`select`/`update`/`delete` (the former excluded `staff-documents` for 3 of 4 ops but not INSERT; the latter never excluded `staff-photos` at all). Both buckets already had complete, correct dedicated policies — removing the generic override was sufficient, no new policies needed for them.
- **Verification method:** live DB, not a browser session (container has no Supabase credentials to log in as each role). Instead: (1) isolated the exact role-matching boolean logic per bucket and checked it against real `user_profiles` rows for all 8 app roles; (2) after dropping the generic policies, ran real `SELECT`/`INSERT` queries against `storage.objects` inside rolled-back transactions, switching to the `authenticated` Postgres role and setting `request.jwt.claim.sub` per simulated user (the same GUC `auth.uid()` reads) — confirmed the full 8-role × 7-bucket SELECT matrix matches design exactly (e.g. `driver` = 0 rows on every bucket; `bdm` = access to `lpo-documents` only; `hr_officer` = access to `attendance-photos`/`staff-photos`/`staff-documents` only), plus a positive INSERT (accountant → receipts, succeeds) and negative INSERT (driver → receipts, throws `new row violates row-level security policy`).
- Applied as tracked migration `storage_policy_cleanup_role_scoped_buckets` (20260707185124) via `apply_migration`, idempotent (`DROP POLICY IF EXISTS` + `CREATE POLICY` pairs) so the migration history matches the already-verified live state exactly.
- **Stale doc item closed:** the §7 "Receipts storage bucket PUBLIC" row (open since S13) is now fully resolved — bucket flipped private (PR #44), extended to the other 3 doc buckets (PR #45), and the RLS layer tightened this session. See updated §7 row.

### 🔵 SESSION 13 (2026-07-03) — PHASE 5 RE-PLAN (payment-request + ingestion) — DESIGN LOCKED
**No code/schema this session — design only. Full locked design in §8. Schema NOT started (blocked on §8 Pre-schema verification).**
- MD ratified 13 decisions + a 5-sub-phase map (5a–5e) for the EXPENDITURE-side payment-request + statement-ingestion engine. Revenue matching is committed as **5d** (not a deferral). Old §3 "(revenue)" label was stale — Phase 5 is expenditure-first.
- **WR#1 gate satisfied:** the audit Category-4 code PR (#41, role-exemption fixes) is **merged** — Phase 5 is unblocked to begin scheduling.
- **Pre-schema verification (WR#8):** items 1 & 2 discharged by Claude Code this session (live column shapes for `stock_movements`/`staging_transactions`; Phase 0 parser wiring in App.jsx — see §8). Items 3 (accountant posting-behaviour reconfirm) & 4 (real Moniepoint xlsx through SheetJS) remain open — need a human/the file. Schema session stays blocked until all four close.
- Live-DB re-verified this session (matches §8 claims exactly): `bank_accounts`=4 (dedupe pending), `bank_transactions`=1,277, `expenses`=43, `expense_categories`=13, `expenses` guard trigger=**0** (confirms it is a soft-status column, not a state machine).

### ✅ SESSION 12 (2026-07-02) — BACKEND AUDIT (pre-#5) + AUDIT CODE FIXES
**PRs merged: #39 (audit report + anon-view REVOKE), #40 (My HR scoping filters, Cat-3), #41 (role-exemption gaps, Cat-4). Audit stream CLOSED.**
- Executed the five-category backend audit (see §3 scope). Report: `docs/BACKEND_AUDIT_PRE5.md`.
- **1 confirmed unauthenticated exposure fixed on discovery:** `order_items_delivery` (postgres-owned view, bypassed RLS) was anon-selectable — REVOKEd (also `disciplinary_self`); recorded in migration `audit_s12_revoke_anon_order_items_delivery`.
- **DB fixes applied** (migration `audit_s12_disposition_db_fixes`): `staff_leave_balances` `'hr'`→`'hr_officer'`; `weekly_payroll_audit` read restricted to management; anon EXECUTE revoked across 15 SECURITY DEFINER funcs (now zero). **LPO approval MD-only** now DB-enforced via `trg_guard_lpo_md_decision` (migration `audit_s12_lpo_md_only_decision_guard`).
- **Code fixes:** Cat-3 My HR scoping (PR #40 — `advancesService.listMine`/`leaveService.listMine`/`getMyAttendance(staffId,…)`); Cat-4 role-exemption gaps (PR #41 — shared `ICO_EXEMPT_PAGES`/`BOARD_EXEMPT_PAGES` constants + 8 button/exemption fixes).
- **MD rulings recorded:** marketer dashboard all-orders visibility = INTENDED; LPO approval = MD-only (DB-enforced).

### ✅ SESSION 11 (2026-07-01/02) — LEAVE YEAR-END CONTROLS + ATTENDANCE KIOSK (Phase 4d) + FIXES
**PRs merged: #33 (year-end controls), #34 (docs revert), #35 (attendance kiosk), #37 (leave-balance scoping fix). #36 closed UNMERGED (stale base — see near-miss note below). Frontend only — DB is fully live.**

**Leave year-end controls (PR #33, merged):**
- `src/services/leaveBalance.js`: added `runRollover(fromYear)` → RPC `run_annual_leave_rollover(p_from_year)` and `expireCarryover(year)` → RPC `expire_annual_carryover(p_year)`.
- `src/components/StaffHR.jsx` (`LeaveBalancesTab`): MD-only "Year-end Controls" card — `runRollover` button (confirm-gate) + `expireCarryover` button (confirm-gate), same pattern as existing Activate/Deactivate.

**Attendance kiosk — Phase 4d (merged: PR #34 revert + PR #35 kiosk):**

**Scope:** Permanent/salaried staff only. Daily workers remain fully manual/analog — this system does not touch Labour.jsx or labour payroll in any way.

**DB (already live — no DB changes this session):**
- `attendance_punches` table: staff_id, punch_time, punch_type (IN/OUT), verification_method, photo_storage_path, device_source, recorded_by_user; deduplicated via `punch_minute` column (trigger-populated).
- `staff_pin_cache`: staff_id, pin_hash (SHA-256 hex), is_active. Partial unique index on `pin_hash WHERE is_active = true` prevents duplicate PINs across active staff — both set-PIN RPCs surface this as a clear error.
- `attendance` table: existing table extended with flagged, flag_reason, flag_response, flag_responded_at.
- RPCs:
  - `get_kiosk_pin_sync()` — returns staff_id, employee_number, pin_hash for all active staff (used by kiosk on startup/sync)
  - `reconcile_attendance_punches(date)` — **RESOLVED: pg_cron job `reconcile-attendance-punches-nightly` runs nightly at 20:00 UTC (21:00 WAT)**
  - `submit_attendance_flag_response(p_attendance_id, p_response)` — employee submits explanation
  - `set_staff_pin(p_staff_id, p_pin)` — HR-managed PIN assignment (md/hr_officer); validates 4–6 digits, hashes server-side
  - `set_my_kiosk_pin(p_pin)` — self-service PIN; resolves caller's own staff_id server-side; same validation
- `attendance-photos` storage bucket: live.
- **pgcrypto schema note:** On this project, pgcrypto lives in the `extensions` schema (not `public`). Any future SECURITY DEFINER function using `digest()` or `crypt()` must include `SET search_path = public, extensions` in its definition or it will throw "function digest() does not exist". Both set-PIN RPCs already handle this.

**Identification method:** The existing staff ID card barcode (CODE128, encodes `employee_number`) is the primary punch method — no new badges required. PIN is the fallback when the barcode is unavailable or the BarcodeDetector API is not supported.

**Frontend (this session):**
- `src/services/kioskService.js` (new): 7 methods — `syncPins`, `uploadPunches`, `uploadPhoto`, `getFlagged`, `resolveFlag`, `getMyAttendance`, `submitFlagResponse`.
- `src/components/AttendanceKiosk.jsx` (new): full offline-first kiosk component.
  - IndexedDB (`apc_kiosk_v1`): `staff_cache` (keyPath: staff_id) + `punch_queue` (autoIncrement local_id).
  - SHA-256 offline PIN verification via Web Crypto API (`crypto.subtle.digest`). `pin_hash` is confirmed stored as SHA-256 hex.
  - BarcodeDetector API (CODE128, `{ formats: ['code_128'] }`) in rAF scan loop. Falls back to PIN pad if API unavailable.
  - Front-camera (`facingMode: 'user'`), photo captured via canvas-toBlob (JPEG 75%) on each punch.
  - Photo stored in IDB with punch; uploaded to `attendance-photos/punches/{staff_id}/{punch_time}.jpg` on flush.
  - Sync: `online` event + `visibilitychange` + 5-min `setInterval` poll; IDB queue accumulates offline punches.
  - HR manual override (hr_officer/md): fetches live `staff_public`, submits directly online; `recorded_by_user = userProfile.id`, `verification_method = 'hr_manual_override'`.
  - Toast overlay (2.5s auto-dismiss, green/red).
  - Status bar: online/offline indicator, queue count, last-sync time, manual sync button.
  - Debounce: 3s between barcode detections (same physical scan).
  - PIN pad: 4–6 digit entry; dots display; SHA-256 checked at ≥4 digits; accepts up to 6 before clearing with error.
- `src/components/StaffHR.jsx`: "Set PIN" button added to Staff Directory Actions column (md/hr_officer only). Opens modal calling `set_staff_pin(p_staff_id, p_pin)` — numeric-only, 4–6 digits, Enter-key support, auto-close on success. Recovery path for staff who forget their PIN and cannot self-service a reset.
- `src/App.jsx`:
  - Imports: `kioskService`, `AttendanceKiosk`.
  - ROLE_PAGES: `attendance_kiosk` + `attendance_flags` added to `hr_officer`; `attendance_flags` added to `production_manager` + `assistant_production_manager`; `md` gets both via `'all'`.
  - Nav: two new items under Operations — "Attendance Kiosk" and "Attendance Flags".
  - `AttendanceFlagsPage` (inline): HR management view of flagged attendance (last 60 days); resolve with `hours_worked` + `present` fields; shows employee response if submitted. Flag resolution: staff explanation via self-service is optional — HR/MD can resolve regardless of whether a response was submitted. No new approval state machine.
  - `MyHRPage`: "My Attendance (Last 30 Days)" table (flagged-row response textarea → `submitFlagResponse`); "Kiosk PIN" card — self-service PIN set/reset via `set_my_kiosk_pin(p_pin)`, numeric input, 4–6 digits, hashed server-side. ICO users can fully use this page (leave, advance, Kiosk PIN — see ICO fix below).
  - Page routing: `attendance_kiosk` → `<AttendanceKiosk>`, `attendance_flags` → `<AttendanceFlagsPage>`.
  - **ICO read-only fix (pre-existing gap, surfaced during kiosk testing):** The `data-ico-view` CSS mask and the read-only banner never exempted `my_hr`, locking ICO out of their own leave/advance/self-service page. Fixed by adding `my_hr` to both exemption lists (same pattern already used for `advances` and `leave`). This is a pre-existing bug unrelated to the kiosk feature.

**Constraints honoured:** DO NOT touch Labour.jsx / payrollService labour.js. DO NOT touch disciplinary module. Frontend only — no DB changes applied. MD merges.

**My HR leave-balance scoping fix (PR #37, merged):**
- Bug: `getMyBalance(year)` in `src/services/leaveBalance.js` filtered only by `leave_year` — no `staff_id` filter. RLS correctly grants md/ico/accountant (plus hr) global read on `staff_leave_balances` (needed for the management-side all-staff balance table), so the app-level filter was the only guard — and it wasn't there. Result: My HR "My Leave Balance" showed EVERY staff member's balance rows in a repeated grid for those roles.
- Fix: `getMyBalance(staffId, year)` with `.eq('staff_id', staffId)`; call site in `MyHRPage.loadAll()` guards on `staff?.id` and passes it.
- **Bug class: missing scoping filter — second occurrence.** First: `getMyStaff()` `.limit(1)` bug (S9, PR #30). This class is now audit category (3) in the Full backend audit stream (§3).

**PR #36 — closed UNMERGED (near-miss, process lesson):**
- The same fix was first built on a stale branch base forked from main at `07df8b3` — before PRs #34/#35 merged. Merging it would have deleted the entire kiosk feature (946 deletions).
- Caught by diffing the PR against current main before merge. Rebuilt clean as PR #37 on a fresh branch off current main (2 files, 15 lines).
- **LESSON (now Working Rule #9):** every PR must be diffed against current main before MD review — branch base verified, not assumed.

**Data hygiene (live DB, S11):**
- `date_hired` gaps resolved: EMP-017 (Boniface) corrected to 2026-03-18; the other flagged records confirmed correct by MD.
- "Demo hr" test staff record deleted from live DB with all child rows (onboarding checklist, advance requests, leave requests, leave balances, user profile).

### ✅ SESSION 10 (2026-06-30) — HR 4c DISCIPLINARY / QUERY MODULE
**HR 4c declared COMPLETE. PR #32 merged (with fix-commit).**

**DB (migration `hr4c_disciplinary_module`, applied before PR):**
- Tables: `disciplinary_cases` (management-facing, includes `management_review_notes`) + `disciplinary_audit` (action, actor_role, note, created_at).
- View: `disciplinary_self` (employee-safe; hides `management_review_notes`; orders by `issued_at`).
- RPCs: `issue_disciplinary_case` (p_staff_id, p_type, p_title, p_allegation, p_incident_date, p_response_deadline) + `advance_disciplinary` (p_case_id, p_action, p_text, p_sanction).
- Status-guard trigger blocks invalid state transitions.
- RLS: md + hr_officer read/write `disciplinary_cases`; employee reads own cases via `disciplinary_self` only; no other role sees any row.

**Lifecycle:**
- `formal_query`: `issued → responded → reviewed → closed`. Respond = subject via My HR; Review = md/hr_officer; Close = MD-only with sanction selection.
- `verbal_warning_log` / `written_warning`: logged straight to `closed` (no response phase). Employee acknowledges in My HR.
- Sanctions (5): none / verbal_warning / written_warning / final_warning / termination. **Wall: sanction is RECORDED only — never changes `employment_status`, `is_active`, or payroll.** Proven live (closed case, written_warning sanction, subject remained active).

**Frontend (PR #32 + fix-commit):**
- `src/services/disciplinary.js`: listAll (staff_public join), getMine (disciplinary_self, ordered by issued_at), getAudit, issue, advance.
- `DisciplinaryPage`: issue form (response_deadline conditional on formal_query), case list with status badges, inline Review/Close action panels, expandable audit trail (actor_role · action · note · date).
- "Queries & Warnings" section added to `MyHRPage`: respond textarea for formal_query at `issued`; Acknowledge button for any case without `acknowledged_at`.
- Verified end-to-end in production preview.

**Open items (as of S10):** B-2 carry-over automation + future-hire pro-ration deferred. (`date_hired` gaps RESOLVED in S11 — see Session 11 data-hygiene note and §4.)

### ✅ SESSION 9 (2026-06-28) — HR BUG-FIX PACK + SELF-SERVICE ROLLOUT
**PRs #20–#25 all confirmed merged. HR 4b Phase B declared COMPLETE (B-2 activation live-proven).**

**HR bug-fix pack (PR #30, merged):**
- ICO read-only CSS mask (`[data-ico-view] button:not([data-ico-allow]) { display:none }`) now exempts `advances` and `leave` pages — ICO Approve/Reject buttons are no longer hidden there.
- `advancesService.list()` and `leaveService.list()`: replaced PostgREST `staff:staff_id(full_name)` embed with a separate `staff_public` query joined in JS — ico and accountant now see staff names on request lists.
- `meService.getMyStaff()`: replaced `.limit(1)` with a lookup via `auth.getUser()` → `user_profiles.staff_id` → `staff.id` — MD now sees their own profile in My HR, not a random colleague. Null guard added: accounts with no linked staff record see "No staff profile is linked to this account."

**Self-service rollout (PR #31, merged):**
- `canSee('my_hr')` decoupled from role — now gated on `!!userProfile.staff_id`. Any employee-linked account (any role: store_officer, driver, logistics_manager, production_manager, etc.) sees "My HR" in the sidebar and can file their own leave/advance requests.
- Unlinked accounts (board chairman intentionally unlinked) do not see My HR.
- `staff` role added to `APP_ROLES` dropdown for the add/edit-user modal. `ROLE_PAGES.staff` (`['my_hr','my_profile']`) was already present.
- `user_profiles.staff_id` link status: 10 of 11 accounts linked. MD → APC-EMP-001 and logistics_manager → APC-EMP-015 linked this session. Board chairman intentionally unlinked.

**Pending:**
- `date_hired` missing for APC-EMP-015, 016, 019, 006.
- Deferred B-2 items: carry-over automation (Jan boundary) + future-hire pro-ration.
- HR 4c — disciplinary/query module. Open decision: do employees see their own queries in My HR?

### ✅ SESSION 8 (2026-06-26) — HR 4b PHASE B: PAYROLL DEDUCTIONS + LEAVE-BALANCE UI
**Scope: B-1 (payroll deductions) complete; B-2 (leave-balance tracking) underway this session.**
- **Migration 1 (applied before PR-1):** Added `payroll_lines.advance_deduction numeric not null default 0`; backfilled from `deductions`.
- **Migration 2 (applied before PR-2):** Switched `realize_advance_repayments` to read `advance_deduction` — advance settlement ignores leave withholding.
- **PR-1 (PR #26, merged):** `handleCalculate` sets `advance_deduction = installment`; `handleApprove` persists it.
- **PR-2 (PR #27, merged):** Unpaid-leave deduction on calendar-day basis. `deductions = advance_deduction + leaveDeduction`; breakdown shown in step-2 review and payment table.
- **B-2 Migration (applied before PR-3):** Inert leave-balance ledger — `leave_policy_settings` (active=false), `staff_leave_balances`, RLS, `seed_leave_balances_draft`, `set_leave_entitlement`, `set_leave_policy_active` RPCs, `md_approved` trigger (no-ops while active=false).
- **PR-3 (this PR — `claude/b2-leave-balances`):** `src/services/leaveBalance.js` wraps the six DB objects. `LeaveBalancesTab` added to StaffHR: MD policy panel (status, Seed Draft, editable entitlement table, Activate/Deactivate confirm); manager read-only balance table (entitled/used/balance, overdraw ⚠ flag — visual only, never blocks). `MyHRPage` gains "My Leave Balance" card: annual + sick entitled/used/balance, or "Leave balances not yet activated" if inactive or no row. Payroll handleCalculate/handleApprove untouched.
- **MD activation complete:** `set_leave_policy_active(true)` triggered; 38 rows seeded (19 annual @15 days / 19 sick @12 days). End-to-end proven: an `md_approved` annual leave request decremented the ledger correctly.
- **Deferred — carry-over automation:** Year-boundary carry-over script and future-hire pro-ration not yet built.

### ✅ SESSION 7 (2026-06-26) — PAYROLL STATE MACHINE, ADVANCES, LEAVE, SELF-SERVICE FOUNDATION
- **Staff payroll (`payroll_runs`) state machine (PR #20).** draft → ico_approved → md_approved → paid (+recall) via `advance_staff_payroll` SECURITY DEFINER RPC + `trg_staff_payroll_guard` + `staff_payroll_audit`. UI gates per role: accountant creates (draft), ICO approves, MD approves, accountant/MD records payments. Net-pay default fixed (PR #22): `openRun` now pre-fills `amount_paid` as `max(0, amount_due − deductions)` so advance deductions are not double-counted; payment table shows read-only Deduction column.
- **Salary advances — HR 4b-i (PR #21).** `salary_advances` table: `requested → ico_approved → md_approved → disbursed → settled` + `rejected` / `cancelled`. State machine via `advance_salary_advance` RPC + guard trigger + audit table. Repayment: `payroll_lines.deductions` column + AFTER-paid trigger `realize_advance_repayments` auto-settles on `mark_paid`. One outstanding disbursed advance per staff enforced by guard. Chain: HR officer/accountant/MD records request → ICO approves → MD approves → accountant/MD disburses. `AdvancesPage` in App.jsx; `src/services/advances.js`.
- **Leave requests — HR 4b-ii (PR #23).** `leave_requests` table: `requested → ico_approved → md_approved` + `rejected` / `cancelled`. State machine via `advance_leave_request` RPC + guard + audit. Types: annual/sick/unpaid/compassionate/maternity; `is_paid` per request. Chain: HR/MD records → ICO approves → MD approves. `LeavePage` in App.jsx; `src/services/leave.js`. Attendance/payroll integration (Phase B — auto-deduct from salary on leave days, carry-over balance tracking) deferred.
- **Self-service foundation (PR #24).** `user_profiles.staff_id` is the employee link; `current_staff_id()` resolver. Self-scoped RLS on `salary_advances` / `leave_requests` / `staff` (own-row SELECT + self-INSERT) — verified: own rows visible, others blocked. `on_auth_user_created` defaults new logins to role `staff`. `MyHRPage` (self-service, no staff picker, no approve buttons): profile header with name/title/employee number, ID Card + Business Card download, Request Advance form, Request Leave form, own advances and leave lists (all RLS-scoped). `src/services/me.js` (`getMyStaff()` via RLS). Role `staff` now routes to `my_hr` as landing page. Scope: permanent/salaried staff; daily workers remain HR-mediated.
- **Also completed this session:** receipts UNIQUE + retry (PR #16), number-generator sweep (PR #15), `supabase.js` fail-loud on missing env vars (PR #18), LPO partial-state hardening (PR #17), invoices/payments amount leak (PR #14).
- **Decisions recorded:** self-service for permanent staff only; logins tied to employee via `user_profiles.staff_id`; FUTURE: replace the 7 working role logins with official `@abujaprecast.com` manager emails (MD/ICO/BDM/logistics/production/store).

### ✅ SESSION 6 (2026-06-25) — SECURITY LEAK CLOSURES + LATENT-BUG GENERATOR SWEEP
A focused hardening session executing the §4 latent-bug sweep and closing two RLS leaks the plan had not known about. All items per-role verified; DB changes applied via `apply_migration`.

**A. Staff-PII leak closed (PR #12 + earlier-session migrations).** A permissive `staff_select` exposed salary/bank/NIN/addresses to all 12 authenticated roles. Created definer views `staff_public` (safe columns, all authenticated) and `staff_payroll` (finance-only); repointed every non-HR staff read to `staff_public`; tightened `staff_select` to `md`/`hr_officer`. Verified per-role (hr_officer reads 19; accountant/logistics base 0, safe views full).

**B. LPO invoice number + ICO empty staff page (PR #13).** LPO auto-invoice used an in-memory `count+1` for a separate `APC-LPO-` series with no retry. Repointed to `invoicesService.getNextNumber()` + 23505 retry, unified to the `APC-INV-` series. Removed `'staff'` from `ico`/`operations` `ROLE_PAGES` (would render an empty Staff page after the staff RLS tighten).

**C. Invoices/payments amount leak closed (PR #14 + migrations).** `invoices_select`/`payments_select` were `USING(true)` — every role (incl. driver/marketer) saw revenue and payment amounts. Created money-free definer views `invoices_safe`/`payments_safe` (exclude `total_amount`/`amount_paid` AND `pdf_url`/`proof_url` — the documents carry the amount). UI-gated the Customers-screen money figures behind `canSeeAmounts` (md/accountant/ico/board_member/bdm/marketer), then tightened both policies to that set. Verified per-role: amount roles read 28/20; logistics/hr_officer read 0 but safe views still serve (Customers screen keeps working money-free).

**D. Number-generator collision sweep (PR #15).** waybill/batch/supplier/employee inserts used last-row-max on UNIQUE columns with no retry. Added regenerate-and-retry to all four (employee via the `get_next_employee_number` RPC at save).

**E. Receipts integrity (PR #16 + migration).** Added a 23505 retry to `receiptsService.upload()` FIRST, then added `receipts_receipt_number_key UNIQUE` (0 duplicates confirmed before applying).

**F. LPO partial-state hardening (PR #17).** `handleDecide` now creates the invoice BEFORE advancing the order to `in_progress`; a non-23505 invoice failure stops with an actionable message instead of leaving an approved-but-uninvoiced order.

**Sweep result — generator audit COMPLETE.** The only number generators in the app are invoice, waybill, receipt, supplier, batch, employee. No quote/proforma/PO generator exists. All now have collision handling.

**Process notes.** (i) The repo default branch was wrongly set to a stale `claude/*` branch, mis-basing PRs and producing phantom merge conflicts — switched default to `main`. (ii) Vercel occasionally does not auto-deploy a merge whose tree matches an already-built preview; a manual "Promote to Production" fixes it.

### ✅ SESSION 5 (2026-06-18) — PHASE 4D CARDS, INVOICE FIX, LOGISTICS ACCESS
A long, multi-workstream session. All items below tested and merged unless noted.

**A. Phase 4D — Staff ID cards, business cards, photo upload (PR #7, merged).**
- Photo upload to private `staff-photos` bucket; `staff.photo_path`; uploading marks the 'photo' checklist item complete.
- ID card (front+back) and business card (front+back) generated as PDFs from live staff data.
- Incomplete-profile flag (DERIVED, not stored): warns when job_title, photo_path, or phone is missing; self-clears.
- Bugs fixed during 4d: (i) staff INSERT was sending `is_active: true` to the GENERATED column — removed; (ii) `job_title` not saving — fixed + trimmed; (iii) ID card sidebar job_title not rendering — fixed with role fallback.

**B. Card visual polish (PR #10 / branch claude/card-design-polish).**
- Root-caused a BLANK-CARD regression: an async logo-crop helper (`fetchLogoIconAsDataUrl`) rejected on load failure and threw through the await, drawing only the card background. Fix: helper never rejects (returns null on error/timeout), logo placement guarded, content renders regardless.
- Replaced fragile runtime logo-cropping with a pre-made ICON-ONLY logo file (`public/logo-icon.png`, no text/RC number) — permanently ends the RC-text-bleed on cards.
- Iterated layout toward the reference samples (name colour dark-navy for readability, name larger than role on business card, grey→blue divider, header sizing). Cards are functional/professional; final pixel polish accepted as "close enough."

**C. Invoice numbering duplicate-key bug (PR #8, merged).**
- `invoice_number` is UNIQUE; the generator derived the next number from a row count, colliding with existing numbers (two inconsistent series existed: APC-INV-2026-0xx and -23xx).
- Fix: `invoicesService.getNextNumber()` queries the live DB, parses the NUMERIC max suffix across all APC-INV numbers, increments (4-digit suffix going forward), with a 23505 unique-violation retry. Verified live: generates APC-INV-2026-2362+ cleanly. Existing 22 numbers left untouched. (Session 6 added the same retry to the LPO path, which had been bypassing this service.)

**D. Logistics-manager delivery access + waybill loophole (PR #9, merged).**
- Bug: logistics_manager couldn't create waybills ("No customers with active invoices") because `ordersService.getAll()` joined raw `order_items(*)` and the role lacked SELECT on `orders`/`order_items`; the failing query was silently swallowed.
- Requirement: logistics sees DELIVERY details only (NO money), sees new orders/approved LPOs, customer records & statements; CANNOT write invoices or receipts; CANNOT approve LPOs (only views approved ones); generates waybills/statements.
- Fix (DB): created money-free view `order_items_delivery` (id, order_id, block_type, quantity, created_at — NO unit_price/subtotal); added logistics_manager + store_officer to `orders_select` (orders has no money columns); logistics NOT added to raw order_items (money stays hidden). Frontend routes logistics to the view.
- Waybill loophole closed: removed the broad `waybills_write` FOR ALL policy that OR'd ico/production_manager/bdm into write access. Waybill write is now md/logistics_manager/store_officer only (insert/update), md-only delete.
- Verified: truck/loading-labour functions (truck_loading_log, truck_loading_loaders, truck_loader_assignments, delivery_schedules, delivery_schedule_items) all confirmed INTACT for logistics_manager.

**E. Housekeeping.** Test staff repeatedly created during preview testing were cleaned (rows + cascaded checklist; photo files in storage must be cleared via Supabase dashboard — SQL delete is blocked). Staff settled at 19 (18 active + RANSOM ABANG OSANG APC-EMP-018 correctly in 'onboarding' pending activation).

**LESSONS (carried forward):**
- Multiple LATENT bugs surfaced this session (invoice numbering, orders_select auth.users from Session 4, logistics RLS gaps). The app has a backlog of these from earlier dev; expect more to surface. (Session 6 executed the recommended sweep — see §4.)
- When an error names a specific Postgres table, trust that over env/build theories.
- Claude Code's in-chat "test render" is NOT the real app — only the Vercel preview in a browser is proof.
- Several confident fix proposals this session rested on unverified DB assumptions that were FALSE; DB verification from the planning chat caught each. Keep verifying before applying.
- Per-role testing (Working Rule #7) is the cheapest catch for RLS bugs.

### ✅ SESSION 4 (2026-06-16) — PHASE 4A FRONTEND + PRODUCTION OUTAGE FIX
- Phase 4a frontend merged (onboarding defaults, OnboardingTab, status badges, eligibility-error handling).
- Production outage fixed: `orders_select` RLS referenced `auth.users` (unreadable by `authenticated`), throwing "permission denied for table users" across many screens. Rewrote to resolve staff id via `user_profiles`. Migration `fix_orders_select_auth_users_perm`. (Note: Session 5's logistics work later replaced orders_select again — current version includes logistics_manager + store_officer.)

### ✅ SESSION 3 (2026-06-15) — PHASE 4A DB LAYER
- `staff.employment_status` NOT NULL + CHECK (onboarding|active|suspended|terminated); `is_active` now GENERATED.
- `onboarding_checklist_templates` (now 7 items incl. 'photo') + `staff_onboarding_checklist`.
- Eligibility triggers on attendance + payroll_lines; onboarding gate trigger on staff.

### ✅ SESSION 2 (2026-06-15) — PAYROLL
- `advance_weekly_payroll` RPC cutover, live-proven (first ICO approval by Kayode Ojo). Dedupe + UNIQUE(week_ending,payroll_type). RLS sweep: dropped 26 `allow all` overrides.

### ✅ SESSION 1 (2026-06-11/12) — SECURITY BASELINE
- RLS to authenticated; storage locked; role write policies; staff-documents bucket private.

---

## 2. VERIFIED LIVE STATE

### Snapshot 2026-07-27 (latest — planning-chat live query)
- **Schema scale:** 99 tables. **325 RLS policies, of which 234 are multi-role-aware** (post PR #110 effective-roles rollout — a policy is "multi-role-aware" when it admits a set of roles rather than a single hard-coded role).
- **Expenses:** 456 expense records totalling **₦15,811,143**.
- **⚠️ TOTALS ARE IN FLUX — HISTORICAL BACKFILL TO JANUARY IN PROGRESS.** Inventory and financial totals (expenses, P&L, balance sheet, cash flow, stock levels) are being back-populated with real Jan–2026-onward data and are **not yet a settled opening position**. Do NOT treat any inventory or financial aggregate as final, and do NOT "reconcile to zero" or raise discrepancy alarms off these figures until the backfill is declared complete and a physical count has been taken (see §3 queue item 1 and §5). Reports built this session (P&L/balance-sheet/cash-flow/supplier/expense — PRs #104/#106/#107) are structurally correct but read from data that is still moving.
- All financial reports now surface PostgREST errors instead of swallowing them (PR #104) — an empty report now reliably means "no data," not "the query silently failed."

### Snapshot 2026-06-25 (baseline)
- Staff: 19 (18 active, 1 onboarding — Ransom APC-EMP-018). Invoices: 28. Payments: 20. Receipts: 8.
- **0 policies reference auth.users. 0 allow-all overrides.**
- **Staff PII:** `staff_select` = md/hr_officer only. Definer views `staff_public` (all authenticated), `staff_payroll` (finance-only) live.
- **Invoice/payment money:** `invoices_select` / `payments_select` restricted to `md,accountant,ico,board_member,bdm,marketer`. Definer views `invoices_safe` / `payments_safe` (no amounts, no document URLs) serve all authenticated.
- **Number integrity:** UNIQUE on invoice_number, waybill_number, supplier_number, batch_number, employee_number, and NEW `receipts_receipt_number_key`. All generators have 23505 regenerate-and-retry.
- Money-free `order_items_delivery` view: live. Waybills: insert/update md+logistics+store, delete md. No `waybills_write` loophole.
- Payroll engine intact (trg_weekly_payroll_guard enabled, advance_weekly_payroll RPC, weekly_payroll_audit RPC-write-only).
- Card support: `staff.job_title`, `staff.photo_path`, private `staff-photos` bucket, `public/logo-icon.png` (icon-only logo).

### ⚠️ ARCHITECTURE NOTE
`weekly_labour_payroll` is a status header only (one row per week_ending+payroll_type). Worker lists/amounts come from daily tables joined by week+type: production `daily_roster_entries`; loading `truck_loading_log`/`truck_loading_loaders`. The `attendance` table is for STAFF attendance; daily-labour attendance lives in roster/loading tables.

### Migrations (tracked)
- **Session 6:** staff-PII views/policy (`staff_public`, `staff_payroll`, `staff_select` tighten); `add_money_free_invoice_payment_views` (`invoices_safe`, `payments_safe`); `restrict_invoices_payments_select_to_amount_roles`; `add_receipts_receipt_number_unique`.
- **Session 5:** `logistics_delivery_view_and_orders_read`, `waybills_remove_broad_write_loophole`.
- Plus Session 3 staff/onboarding migrations, Session 4 `fix_orders_select_auth_users_perm`, Session 2 dedupe/sweep, Session 1 baseline.

---

## 3. UNIFIED PRIORITY ORDER
| # | Work | State |
|---|---|---|
| 0 | Payroll RPC + state machine | ✅ COMPLETE & live-proven |
| 1 | G.1 quick-fixes | ✅ COMPLETE |
| 2 | Payroll client cutover | ✅ COMPLETE |
| 3 | RLS for remaining tables | ✅ baseline complete; **2 deeper leaks (staff-PII, invoices/payments) found & CLOSED in Session 6** |
| 4 | HR modules | ✅ **CLOSED** — 4a ✅ (S3/S4), 4b ✅ incl. B-1/B-2 (S7/S8), 4c ✅ (S10, PR #32), 4d ✅ cards (S5) + attendance kiosk (S11, PRs #34/#35). Remaining HR-adjacent deferrals are standalone line items in §4, not under this stream |
| 4.5 | **Full backend audit (pre-#5)** | ✅ **CLOSED (S12)** — executed, report `docs/BACKEND_AUDIT_PRE5.md`; all fixes applied (PRs #39/#40/#41 merged + DB migrations). See audit scope below. |
| 5 | **Payment-request (EXPENDITURE) + ingestion engine** | **5a/5b/5c ✅ live (S17).** 5d (revenue matching) + 5e (treasury funding) queued per §8. **5c ingestion engine is deliberately LAST in the current queue (below) — parked behind the backfill/costing work.** |
| 6 | **Phase 6 — Operational Excellence (6A–6E)** | **DESIGN LOCKED (S22, §9). BUILD STARTED (S23):** 6A maintenance/downtime ✅ (PR #92/#93), 6B curing sign-off ✅ advisory (PR #94/#95/#96). 6C spares, 6D fleet, 6E role-KPI dashboard/reminders NOT started. |

### Current work queue (as of 2026-08-07 — supersedes the abstract table above for day-to-day priority)
Closed/settled and NOT in the active queue: payroll RPC cutover (#0/#2), RLS baseline rollout (#3), the whole HR module stream (#4). The active queue, in order:
1. **Physical count reconciliation (post-backfill)** — once the historical backfill to January (see §2 warning) is declared complete, take a real physical inventory count and reconcile it against the system's computed stock. Nothing downstream that depends on true stock levels is trustworthy until this is done. **Blocks item 2.**
2. **WAC (weighted-average-cost) costing → cost per 1,000 blocks** — implement weighted-average unit costing on inventory consumption to produce a real cost-per-1,000-blocks figure. **Blocked on (1)** — WAC is meaningless on stock quantities/values that are still being backfilled and not yet physically verified.
3. **Waybill → order linkage** — close the remaining gap tying a waybill (delivery) back to its originating order, so delivery/fulfilment can be reconciled against what was sold.
4. **Bank statement parser** — the Taj-PDF / Moniepoint-Excel parser hardening (the single-point-of-failure Taj parser flagged in §8) as the practical next step toward real statement ingestion.
5. **Opening-balance reconciliation with DOXIX** — reconcile the opening balances against the external DOXIX figures; specifically explain the ~₦147.8m opening-balance gap (₦233m fixed assets recorded vs. zero recorded debt) — see §5.
6. **Ingestion engine (Phase 5c continuation) — LAST / parked** — the full statement-ingestion + match-state-machine build stays at the back of the queue behind the backfill, costing, and reconciliation work above.

### Phase 4 sub-roadmap — ✅ STREAM CLOSED (S11)
All four sub-phases shipped. HR-adjacent deferrals moved to standalone line items in §4 (carry-over automation, future-hire pro-ration, EMP-018 activation, orphaned photo cleanup, card header polish).
- 4a lifecycle/onboarding — ✅ DONE.
- 4d ID + business cards + photo — ✅ DONE (merged, S5). Attendance kiosk (barcode + PIN) — ✅ DONE (merged, S11, PRs #34/#35).
- 4b leave & salary-advance requests — ✅ **COMPLETE** (Session 7–8). B-1 unpaid-leave payroll deduction live. B-2 leave-balance ledger live (38 rows, activation proven end-to-end).
- 4c disciplinary/queries + staff self-service portal — ✅ **COMPLETE (Session 10, PR #32).** Self-service rollout (S9, PR #31) + disciplinary/query module (S10): issue_disciplinary_case RPC, advance_disciplinary RPC, guard trigger, disciplinary_self view, DisciplinaryPage (md/hr_officer), "Queries & Warnings" in My HR (employee responds/acknowledges). Decision resolved: employees see own cases via disciplinary_self (safe view, no management_review_notes).

### Full backend audit (pre-#5) — scope (S11)
Bounded audit, five categories:
1. **All RLS policies vs the role matrix** — every table's policies checked against who should read/write.
2. **All SECURITY DEFINER function grants** — check for anon/PUBLIC EXECUTE grants.
3. **Frontend queries for missing scoping filters** — the PR #37 bug class (query relies on RLS that is intentionally permissive for some roles; app-level filter absent).
4. **Role-exemption lists for missing pages** — the ICO `my_hr` bug class (page added but never added to a role's mask/banner exemption list).
5. **State-machine guard coverage on money/HR tables** — every table holding money or HR state has a guard trigger or RPC-only write path.

**Out of scope:** runtime/UI behavior — covered separately by the MD role-based smoke test.
**Method:** findings are collected into a single report for MD decision — EXCEPT confirmed security exposures (data leak / unauthenticated access), which are fixed on discovery **by the planning chat** (the discovering window reports the exposure; the planning chat executes the DB fix via `apply_migration`) and reported after. _Clarified after S12: the S12 `order_items_delivery` anon REVOKE was applied directly via the Supabase connector from the discovering window — this stays consistent with Working Rules #2/#4, which reserve DB changes for the planning chat. Discover-and-report in the window; planning chat applies._
**Position:** runs BEFORE #5 scoping. #5 and all downstream roadmap items get re-planned after audit close. **✅ Done — audit closed S12; #5 re-planned S13 (see §8).**

---

## 4. KNOWN GAPS / FORWARD ITEMS

**— Session 23 additions —**
- **⚠️ Interlock/kerb curing standard NOT set (Phase 6B open).** The curing sign-off (PR #94) is advisory only and has no configured minimum curing age for interlock and kerb products — the NIS 87-derived default the §9 6B design calls for has not been entered/ratified. Until the MD confirms the interlock/kerb curing days, the sign-off cannot become a real system check (it stays a judgment prompt). See §5.
- **truck_loading_log auto-expense trigger fires on the WRONG fields.** The trigger that projects a truck-loading row into an expense fires on changes to `total_amount` / `blocks_loaded`, NOT on `date`. Consequence: back-dating or correcting a loading row's `date` does not refresh the linked expense's effective period, so a corrected date can leave the expense sitting in the wrong reporting period. Flagged, not yet fixed — needs a planning-chat trigger change; do not "fix" in app code.
- **Multi-role button-level conversions deferred in 4 files (PR #110).** The button/action gates in **Labour.jsx, Reports.jsx, Maintenance, and FinancialStatements** were deliberately left as PRIMARY-role checks rather than converted to `hasRole()` — so a *granted* (non-primary) role does not silently inherit those actions. Converting them (where safe and delegatable) is a future scoped task; MD-only authority and approval-chain actor gates should stay primary-role forever.
- **36 unvalued deliveries.** 36 delivery/waybill rows carry no value (no price/cost attached), so any margin or fulfilment-value report understates by those rows. Part of the same data-completeness stream as the January backfill (§2) — likely closes as the backfill and waybill→order linkage (§3 queue item 3) proceed. Do not treat delivery-value totals as complete until these are valued.
- ✅ **Phase 6A maintenance/downtime — DONE (S23, PR #92/#93).** Maintenance page (PM checklists + downtime log) live; staff-picker filtered to the asset's team via `reports_to_staff_id`. First real OEE data source now exists. Real-world usage check worth doing once crews start logging.
- ✅ **Phase 6B curing sign-off — PARTIAL (S23, PR #94/#95/#96).** Product dropdown + `product_id`, Batch Date, and advisory Store-Officer curing sign-off live; Edit/Delete role-gated to match RLS. **Remaining:** wire the sign-off to a configured minimum curing age once the interlock/kerb standard is set (item above) to make it an enforceable check rather than advisory.
- **Phase 6C spare-parts register — NOT started (§9).** Critical-spares register with criticality tier, on-hand qty, reorder threshold, Turkish-parts lead time, reorder alerts.
- **Phase 6D fleet status tracking — NOT started (§9).** Active/down per truck (extends `vehicles`), repair log + expected-return date; closes the "2 of 4 trucks down with no system-visible capacity impact" blind spot.
- **Phase 6E role-KPI dashboard + reminders — NOT started (§9).** Depends on 6A–6D data; this is where the parked Session-21 "phase 1" role-responsibility reminders become concretely buildable.

**— Standing items —**
- ✅ **Latent-bug sweep — DONE (Session 6).** All six number generators (invoice/waybill/receipt/supplier/batch/employee) audited and given collision handling; no quote/proforma/PO generator exists. Two RLS leaks (staff-PII, invoices/payments) found and closed. Per-role RLS verified for each.
- ✅ **Silent Supabase client fallback — DONE (PR #18, Session 6/7).** `src/lib/supabase.js` now throws immediately on missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` instead of falling back to placeholder.
- ✅ **Staff payroll state machine — DONE (PR #20, Session 7).** `advance_staff_payroll` RPC + `trg_staff_payroll_guard` + `staff_payroll_audit`. Approval chain: accountant creates (draft) → ICO → MD → accountant/MD marks paid. Advance deductions integrated into `payroll_lines.deductions`; net-pay fix in `openRun`.
- **HR 4b Phase B — COMPLETE.** B-1 (unpaid-leave deduction, `advance_deduction` column) and B-2 (leave-balance ledger, 38 rows, activation trigger proven) both live.
- **Carry-over automation (Jan year-boundary roll)** — deferred; standalone item (HR stream #4 is closed; formerly under 4b).
- **Future-hire leave pro-ration** — deferred; standalone item (formerly under 4b).
- **Card header polish** — optional visual nit; standalone item (formerly under 4d cards).
  - Deleted branch `claude/card-design-polish-hgb4r1` held commits debef70/7063d56; if revived, rebuild on fresh branch, cherry-pick cardGenerator.js visuals only, redo StaffHR.jsx by hand against current main.
- ✅ **`date_hired` gaps — RESOLVED (S11).** EMP-017 (Boniface) corrected to 2026-03-18; the other flagged records confirmed correct by MD. "Demo hr" test staff record and all child rows (onboarding checklist, advance/leave requests, balances, user profile) deleted from live DB.
- ✅ **Disciplinary/query module (HR 4c) — COMPLETE (S10, PR #32).** Full lifecycle live. Sanction wall enforced by convention (DB trigger does not auto-update employment_status; that step remains manual/HR-mediated).
- ✅ **Leave year-end controls — COMPLETE (S11, PR #33).** `run_annual_leave_rollover` and `expire_annual_carryover` RPCs wired to MD-only buttons in StaffHR LeaveBalancesTab.
- ✅ **Attendance kiosk — Phase 4d (S11, merged: PR #34 revert + PR #35 kiosk).** `src/services/kioskService.js` + `src/components/AttendanceKiosk.jsx` + App.jsx plumbing (flags page, My HR attendance+PIN sections, ICO exemption fix). DB fully live. pg_cron resolved: `reconcile-attendance-punches-nightly` runs at 20:00 UTC. `pin_hash` confirmed SHA-256 hex. No outstanding items.
- **Manager email migration (future).** Current manager logins use personal emails. Planned: replace 7 role accounts with official `@abujaprecast.com` addresses (MD/ICO/BDM/logistics/production/store/HR).
- ✅ **Products naming collision — RESOLVED (S17, item E).** "9 Inch" ambiguous product renamed "9 Inch (Nigeria Standard)" and repurposed as the real local-block catalog entry. The live mis-tagged order (APC-INV-2026-2381) corrected.
- ✅ **Full landed-cost margin on resale trades — RESOLVED (S17, item F).** `order_trading_margin` view + `get_order_trading_margin()` RPC live. TradingMarginReport UI in App.jsx shows gross and true (landed-cost) margins side by side. See item F above.
- ✅ **Stock movement linkage — RESOLVED (S18, item A).** Investigation confirmed Waybills already correctly decrements stock via `quantity_loaded`. The actual gap was Truck Loading non-adoption (broken ₦8 flat rate, fixed S17). The S18 waybill→truck_loading sync trigger closes the loop: every waybill save auto-generates the corresponding loading log entry. No manual double-entry required; no stock event missing.
- ✅ **Duplicate active loader assignment — BWR-100XB (RESOLVED — S19).** Verified this session: zero duplicate active rows exist in `truck_loader_assignments`. The S19 audit also added a `UNIQUE INDEX` on `truck_loading_log(waybill_id)` to prevent the related double-log issue. No action required before next payroll.
- ✅ **`damage_log.delivery_id` / `deliveries` table dead (S18 open item, RESOLVED — S21, PR #84 + DB).** `damage_log.delivery_id`, `waybills.delivery_id`, and the `deliveries` table itself all dropped via planning-chat migration after PR #84 merged. `Reports.jsx` damage query fixed to use `damage_log.waybill_id` (the real S18 relationship) instead — 5 rows now show actual waybill numbers.
- **Dashboard widget for labour/loading activity (NEW — S17).** No existing connection to preserve; would be a new addition to the KPI/dashboard aggregations pulling from `daily_roster_entries` and `truck_loading_log`.
- ✅ **Invoice deletion — RESOLVED (S19, PR #71).** Single-invoice delete added (MD-only, confirm-gated, payment-guarded). Order deletion added with the same guard (client + DB-side). `deletion_log` audit trail captures all deleted invoice/order/payment rows.
- **Payroll week navigation UX (NEW — S17).** `WeeklyPayrollTab` has only a raw date picker — no prev/next buttons, no status badge on the selector showing whether the week has a payroll and what state it is in. Flagged as the concrete answer to a real "labour tabs are hard to use" complaint. Not yet built.
- **Payment request list filtering (NEW — S17).** Status grouping (pending vs actioned vs disbursed) and an outstanding-disbursement summary are not yet built in the PaymentRequestsPage list view.
- ✅ **Trading Margin Report access for ICO (NEW — S17, CLOSED — S20).** ICO stays excluded from `get_order_trading_margin()`. MD confirmed: current gating (`bdm`, `md`, `accountant`, `board_member` only) is correct. Existing RLS/RPC already reflects this; no migration or code change was needed. Decision item closed.
- **HANDOFF.md accuracy (NEW — S17).** During S17, at least two items claimed outstanding in `HANDOFF.md` were already live in the DB — the SQL blocks listed as pending had already been applied. `HANDOFF.md` needs a pass to re-sync with actual current DB state rather than just the plan document's outstanding list. (Note: `APP_FULL_DOC.md` was updated in the S17 docs round-up session — the accuracy gap is specifically in `HANDOFF.md`.)
- **Orphaned staff photo files** in `staff-photos` bucket from deleted test staff — harmless; clear via Supabase dashboard (SQL delete blocked).
- **Ransom (APC-EMP-018)** in onboarding — HR to complete checklist + activate when ready.
- Original payroll trigger/RPC/audit objects not in tracked migration history (pre-discipline). Live & verified. Optional: capture as no-op migration.
- ✅ **KPI tracking — stacking-stage split (S19 goal, RESOLVED — S20 DB + PR #82).** The `damage_log.stage = 'stacking'` conflation (pre-handover PM/APM vs. post-handover Store Officer in one label) has been resolved by adding a `'curing'` stage value and retargeting 7 existing rows. `damage_log.batch_id` added for curing entries. KPIDashboard.jsx now tracks `dmgCuring` as its own KPI metric with a dedicated card and PDF export row. The broader goal — attributing damage to specific custody holders via dashboards, scorecards, or HR/disciplinary flows — is not yet scoped; the schema split is the foundation.
  - **⚠️ New entry point worth real-world validation (S20):** The "Log Damage" button in Batches is the first time a store_officer has an interface for this. It has not been used in production yet — worth a check next session that (a) the role gate works as tested, (b) `qty_remaining` deduction is visible and correct, and (c) the KPI card reflects new curing-stage entries promptly. Flag this rather than assuming it's fully bedded in until a real entry has been made and verified end-to-end.
- **Waybill schema additions (S19, DB — planning-chat migration, no PR).** `waybills.signed_by_name` (on-site signer at delivery, distinct from `receiver_name` which is the customer's registered name) and `waybills.store_officer_id` (FK → `staff.id`, replacing free-text `store_officer`) — both live.
- **Notification Phase 1 — role-responsibility reminders (NEW — S21, explicitly parked).** Goal: proactively nudge each role when items are overdue for their action (e.g. ICO has a payment request awaiting approval for 48h). Parked because this requires a real, agreed definition of expected response times and duty scope per role and notification type before building — guessing wrong risks notification fatigue and the feature being disabled. Pre-requisite: MD defines and ratifies per-role SLAs before implementation begins.
- **Notification Phase 3 — performance tracking (NEW — S21, explicitly parked).** Goal: dashboards and reporting derived from notification/response-time data (e.g. median approval lag per role, overdue-action rates). Explicitly deferred until Phase 2 (event-driven notifications from approval chains, now live via PR #87) has produced enough real usage data to build meaningful metrics from. Not a near-term item.

---

## 5. DECISIONS / MILESTONES PENDING (MD)

**— Open, needs an MD decision (Session 23) —**
- ⬜ **Deactivate Peter Gomina's staff record.** Confirmed as a record to be deactivated (no longer active); awaiting MD go-ahead to flip `employment_status`/`is_active`. Deactivation only — not a delete (preserve history/child rows).
- ⬜ **Confirm interlock & kerb curing days.** Phase 6B's curing sign-off (PR #94) cannot become an enforceable check until the MD confirms the minimum curing age for interlock and kerb products (NIS 87 gives a default, but the MD-configurable value must be ratified). Blocks the §4 Phase-6B remaining item.
- ⬜ **DOXIX opening-balance reconciliation — explain the ~₦147.8m gap.** The opening position carries **₦233m in fixed assets recorded against zero recorded debt**, an implausible combination that needs explaining before opening balances can be trusted. MD/DOXIX to reconcile: either the debt side is un-recorded (liabilities missing) or the asset valuation needs revisiting. This is §3 queue item 5 and gates any final financial-statement sign-off.

**— Settled / historical —**
- ✅ **Staff-payroll approval chain — DECIDED & BUILT (Session 7).** accountant creates (draft) → ICO approves → MD approves → accountant/MD marks paid + records per-line amounts.
- Go-live data re-entry milestone (parked) — clean opening balances; resolves dust kg→tons (~16.3t) gap & beta errors.
- Correction-as-adjustment-movement rule (LOCKED) — corrections are new logged offsetting entries, never silent edits.
- ✅ **Attendance kiosk — merged (PR #34 revert + PR #35 kiosk, S11).** Offline-first barcode + PIN kiosk with IDB queue, front-camera photo, sync triggers. pg_cron decision RESOLVED: `reconcile-attendance-punches-nightly` runs nightly at 20:00 UTC (21:00 WAT). Note: face-as-token (enrolled photo match) was descoped; ID-card barcode + PIN covers the MVP.
- ✅ **Leave year-end controls — BUILT (S11, PR #33).**

---

## 6. WORKING RULES (binding)
1. One session = one scope = one branch off `main`. Keep unrelated fixes on separate branches/PRs.
2. Claude Code writes code + SQL files; does NOT apply migrations.
3. Migrations applied from the planning chat via `apply_migration` (tracked), before/after verified.
4. No window changes bucket visibility / RLS / DB config except via the planning chat.
5. Test on preview before merge. **MD merges — no self-merge to main by Claude Code.** MD's live test counts as review.
6. End every session by updating THIS document.
7. After any RLS/policy change, smoke-test the app AS EACH affected role before promoting.
8. Verify fix proposals against the live DB before applying — several "confident" diagnoses have been wrong on the facts.
9. Every PR must be diffed against current main before MD review — branch base verified, not assumed. (Added after the PR #36 near-miss: a fix built on a stale pre-#34/#35 base would have deleted the entire kiosk feature — 946 deletions — if merged.)
10. **Never trust a "done" claim — verify by inspection, both sides.** A feature described as working may be silently broken. Before treating anything as done: (a) diff the actual PR/code against current main, and (b) verify behaviour against the live DB by querying — do not rely on the plan doc, a commit message, or a prior "✅". Session 23 alone found dust deduction that never fired (PR #98), roster deletes that silently no-op'd (PR #99), expense reports filtering a non-existent column (PR #104), and 13 report fetchers swallowing every error (PR #104) — all previously "done." See §10 for the recurring patterns.
11. **Verify every column against `information_schema.columns` before writing a query.** Do not assume a column name from convention or another table. Confirm the exact name/type in the target table first. This rule exists because assumed column names caused real production bugs (`expenses.date` did not exist; the real column is `expense_date`). Corollary: some tables genuinely DO have a `date` column (`production_log`, `damage_log`, `attendance`, `stock_movements`, `vehicle_fuel_log`) — verifying protects against "fixing" those by mistake too. Full trap catalogue in §10.

**Method note — verification access from the coding window (Session 23):** This window can verify DB-level facts (schema, RLS logic, row round-trips) via the Supabase connector, **but that connector runs as the service role — it bypasses RLS and PostgREST parsing**, so it cannot prove how a query behaves *as a specific role through the app*. There is also **no credentialed Vercel-preview login** available here and the agent proxy blocks direct REST/curl to the Supabase host. Net effect: role-scoped, end-to-end "as the affected role in the browser" testing (Working Rule #7) cannot be fully executed from this window. Where a claim could only be proven that way, it was verified as far as possible via service-role round-trips and **the residual gap was disclosed in the PR body** rather than overstated (e.g. the removed-worker row-count re-check in PR #99). MD's live per-role test remains the authoritative check.

---

## 7. STATUS BOARD
| Stream | State | Next |
|---|---|---|
| Payroll RPC (#0/#2) | ✅ live-proven | — |
| RLS sweep (#3) | ✅ complete + 2 leaks closed | — |
| Staff-PII leak | ✅ closed & verified (S6) | — |
| Invoices/payments money leak | ✅ closed & verified (S6) | — |
| Number-generator sweep | ✅ complete (S6) | — |
| Receipts integrity | ✅ retry + UNIQUE (S6) | — |
| LPO partial-state | ✅ hardened (S6) | — |
| HR 4a lifecycle | ✅ live | — |
| HR 4d cards/photo | ✅ merged | optional header-size polish |
| HR 4b advances | ✅ DB+UI (S7, PR #21/#22) | — |
| HR 4b leave | ✅ DB+UI (S7, PR #23) | — |
| HR 4b Phase B-1 (unpaid deduction) | ✅ live (S8, PR #26/#27) | — |
| HR 4b Phase B-2 (leave-balance ledger) | ✅ live + activated (S8, PR #29; 38 rows proven) | carry-over automation + future-hire pro-ration deferred |
| HR bug-fix pack | ✅ merged (S9, PR #30) | — |
| HR 4c self-service rollout | ✅ merged (S9, PR #31) — any linked employee gets My HR | — |
| HR 4c disciplinary/query module | ✅ COMPLETE (S10, PR #32) — full lifecycle, sanction wall proven | — |
| Leave year-end controls | ✅ COMPLETE (S11, PR #33) — rollover + expire-carryover MD buttons | — |
| Attendance kiosk (Phase 4d) | ✅ MERGED (S11, PR #34 revert + PR #35 kiosk) — barcode+PIN, IDB offline, photos, flags page, My HR attendance+PIN self-service, ICO exemption fix. pg_cron live (20:00 UTC nightly); pin_hash confirmed SHA-256 | — |
| My HR leave-balance scoping (PR #37) | ✅ MERGED (S11) — getMyBalance now staff_id-scoped; PR #36 predecessor closed unmerged (stale base near-miss → Working Rule #9) | — |
| **HR modules stream (#4)** | ✅ **CLOSED** — 4a, 4b (incl. B-1/B-2), 4c, 4d all shipped; deferrals moved to standalone §4 items | — |
| **Full backend audit (pre-#5)** | ✅ COMPLETE — DB fixes S12; Category-4 code fixes merged as PR #41 | — |
| Invoice/logistics/waybill | ✅ fixed & live | — |
| Silent supabase fallback | ✅ fixed (PR #18) | — |
| Staff-payroll state machine | ✅ live (S7, PR #20) | — |
| expense_categories restructure (S16) | ✅ DONE — cost-centre grouping, Labour/Salaries deactivated, Trading Purchases + seeds seeded per §8 | — |
| Payee/vendor system (S16, PR #56) | ✅ MERGED — `supplier_id`/payee fields/Others note, save-as-vendor RPC, pending-vendors section | — |
| Phase 5a payment-request lifecycle (S16, PR #53) | ✅ MERGED — role-differentiated frontend (initiator form, ICO/MD/accountant queues), 23505 collision retry | — |
| Trading/resale order items (S16, PR #54) | ✅ MERGED — source_type toggle + cost_basis in order forms; Resale badge in detail; BDM order-item link in payment requests | — |
| Payment-request History view (S17, PR #59) | ✅ MERGED — full audit trail on detail modal | — |
| Payment-request Edit-while-draft (S17, PR #60) | ✅ MERGED — initiator can edit before ICO review; locked after | — |
| Phase 5b closure logic (S17, PR #61) | ✅ MERGED — `close`/`override_close` actions, evidence-gated per closure_mechanism, dual-actor override log, self-review reporting view | — |
| Truck loading per-product rates (S17, PR #62 + #68) | ✅ MERGED — trip-tiered `truck_loading_rates` table, live editable per product, fixes the broken ₦8 flat rate; delete capability (blocked once payroll moves past draft); Historical badge on backfilled entries | — |
| Truck loading payroll consolidation (S17, PR #68) | ✅ MERGED — redundant `truck_loading_payroll` table, its RPCs, and old broken Labour.jsx truck tab all removed; consolidated onto proven `weekly_labour_payroll` path | — |
| Phase 5c reconciliation gate (S17, PR #63) | ✅ MERGED — whole-file opening+credits−debits=closing gate; explicit acknowledgment when check cannot run; no silent partial ingestion | — |
| Phase 5c reference matching (S17, PR #64) | ✅ MERGED — APC-PR-##### auto-match against payment_requests; amount-agreement gate (mismatch = discrepancy, never auto-confirm); suggested-match review queue | — |
| Phase 5c disbursement source account (S17, PR #65) | ✅ MERGED — `bank_account_id` required on non-cash disburse; recorded on request row; RPC receives `p_bank_account_id` | — |
| Phase 5c match-state machine (S17, DB) | ✅ LIVE — `suggest_bank_match` / `confirm_bank_match` RPCs; `suggested`→`confirmed`/`rejected` with audit trail; replaces unguarded client-side writes | — |
| Historical backfill (S17, PR #66) | ✅ MERGED — `transaction_date` column, `backfill_payment_request` RPC (lands in `disbursed`, mandatory note), `query`/`resolve_query` actions, on-behalf-of picker via `user_profiles_directory` | — |
| Trading/resale corrections (S17, DB) | ✅ LIVE — "9 Inch (Nigeria Standard)" product fixed; APC-INV-2026-2381 source_type corrected; cost_basis accumulating auto-sync trigger on disbursed Trading Purchases requests | — |
| Full landed-cost margin (S17, PR #67) | ✅ MERGED — `order_trading_margin` view + `get_order_trading_margin()` RPC; TradingMarginReport UI (gross vs true margin); client-side field normalization at setRows | — |
| suppliers_select RLS fix (S17, DB) | ✅ LIVE — initiator roles can now see active vendors; was oversight-roles-only | — |
| Staff self-service ID card (S17, DB) | ✅ LIVE — `staff_photos_read` self-access rule added; any linked employee can download own ID card | — |
| NULL-role-bypass security sweep (S17, DB) | ✅ LIVE — 9 functions patched; `NOT IN (...)` now null-safe across schema | — |
| `reconcile_attendance_punches` access (S17, DB) | ✅ LIVE — REVOKE from authenticated; service_role only | — |
| Waybill→truck loading sync (S18, DB) | ✅ LIVE — `fn_sync_waybill_to_truck_loading()` trigger; `apc_map_block_type_to_product_id()` helper; paid entries locked from overwrite | — |
| `truck_loading_log` waybill FK ON DELETE (S18, DB) | ✅ FIXED — was RESTRICT (would block waybill deletion); now SET NULL | — |
| Transit-damage driver linkage (S18, DB) | ✅ LIVE — `damage_log.waybill_id` FK added; 5 records backfilled; `fn_autolink_delivery_damage()` trigger on INSERT | — |
| Duplicate loader assignment — BWR-100XB (S18) | ✅ RESOLVED (S19) — zero duplicate active rows confirmed in `truck_loader_assignments`; `UNIQUE INDEX` on `truck_loading_log(waybill_id)` also added | — |
| `deliveries` table / `damage_log.delivery_id` (S18) | ✅ RESOLVED (S21, PR #84 + DB) — `delivery_id` FK dropped from damage_log + waybills; deliveries table dropped; Reports.jsx damage query fixed to use waybill_id | — |
| Payment-request + ingestion (#5) | **5a ✅, 5b ✅, 5c ✅ (S17)** — 5d (revenue matching) and 5e (treasury funding) queued per §8 design | 5c live-proven → 5d revenue matching |
| Document storage buckets (receipts/lpo/supplier/vehicle) | ✅ **CLOSED** — signed URLs (PR #44 receipts, PR #45 lpo/supplier/vehicle), buckets flipped private, storage RLS role-scoped (S14, migration `storage_policy_cleanup_role_scoped_buckets`) | — |
| Storage policy cleanup (public_* removal, S14) | ✅ COMPLETE — 4 generic + 3 receipts-legacy permissive policies replaced with 9 per-bucket role-scoped policies across 5 buckets; verified via full 8-role × 7-bucket RLS simulation (SELECT+INSERT, positive+negative) | — |
| `waybills.signed_by_name` + `store_officer_id` (S19, DB) | ✅ LIVE — planning-chat migration; on-site signer column (distinct from `receiver_name`) + `store_officer_id` FK → `staff.id` replacing free-text field | — |
| Deletion audit trail — `deletion_log` (S19, DB + PR #71) | ✅ LIVE — table + triggers on invoices, payments, orders, waybills, truck_loading_log; captures deleted-row snapshots (jsonb) with actor + timestamp | — |
| Invoice deletion + order deletion guard (S19, PR #71) | ✅ MERGED — MD-only, confirm-gated, payment-guarded for both; `deletion_log` captures all deletes | — |
| Truck loading duplicate cleanup + unique index (S19, DB) | ✅ LIVE — 9 duplicate `truck_loading_log` rows cleared (~₦28,800 phantom payroll exposure); `UNIQUE INDEX` on `truck_loading_log(waybill_id)` added; zero duplicates confirmed | — |
| Dead code removal + rates-tab crash fix (S19, PR #72) | ✅ MERGED — ~443 lines of dead `TruckLoadingTab`/`LoadingLogForm`/`AssignLoaderForm`/`LoadingWeeklySummary` removed from Labour.jsx; `.order('created_at')` → `.order('updated_at')` crash fix | — |
| '9 Inch 3 Hole Block' product split (S19, DB) | ✅ LIVE — separate product record + loading rate; no longer bundled under '9 Inch (Nigeria Standard)' | — |
| Loading/waybill redesign (S19, PR #74) | ✅ MERGED — loader picker (auto-fill from standing crew, per-trip override, syncLoaders); edit action on log entries (blocked when paid); waybill picker + backfill mode; `signed_by_name`; `store_officer_id` FK dropdown | — |
| Store officer dropdown fix (S19, PR #75) | ✅ MERGED — filtered to `role = 'Store Officer'`; field relabeled "Receiver's Signature (Name)"; placeholder updated | — |
| Driver dropdown fix (S19, PR #76) | ✅ MERGED — filtered to `role = 'Driver'`; `({s.role})` suffix dropped from labels | — |
| Sidebar nav regroup (S20, PR #78) | ✅ MERGED — Operations split into Production/Logistics/HR & Workforce sections; all ids/labels/icons byte-identical, zero logic change | — |
| Payroll week nav UX (S20, PR #79) | ✅ MERGED — shiftWeek() helper; ‹/› prev/next buttons; status badge (No payroll / Draft / Paid / verbatim fallthrough) per week+subtab | — |
| Payroll date-range + draft mode (S20, PR #80; DB) | ✅ MERGED — period_start/period_end on weekly_labour_payroll; payroll_id FKs on daily_roster + truck_loading_log; UNIQUE(week_ending,payroll_type) dropped; range picker + row-level checkboxes + draft-edit mode; draft detected via payroll_id linkage not week_ending. Follow-up DB: advance_weekly_payroll() now cascades paid status to linked rows; 17 rows backfilled | — |
| Payment-request filter + outstanding card (S20, PR #81) | ✅ MERGED — 7-status filter bar (all roles incl. initiators); Outstanding Disbursement stat card for funded requests; status-aware empty-state message | — |
| Trading Margin Report ICO access (S17 open decision) | ✅ CLOSED S20 — ICO stays excluded; no code or DB change needed | — |
| Curing-stage damage KPI + Batches entry (S20, PR #82; DB) | ✅ MERGED — damage_log.stage 'curing' value + batch_id FK + recorded_by retargeted to user_profiles; 7 rows reclassified; KPIDashboard dmgCuring metric + KPICard + PDF row; Batches 'Log Damage' action (store_officer + md only, active batches only) | ⚠️ Real-world usage check next session — first production use by a store_officer not yet confirmed |
| Dead deliveries table cleanup (S21, PR #84 + DB) | ✅ MERGED — Reports.jsx damage query fixed; deliveriesService removed; delivery_id columns + deliveries table dropped | — |
| Labour & Loading dashboard widget (S21, PR #85) | ✅ MERGED — 4 StatCards (Blocks Loaded, Active Loaders, Pending Payroll, Roster Headcount); role-gated; Promise.all fetch | — |
| Staff messaging system (S21, PR #86 + DB) | ✅ MERGED — DM + group threads; per-participant read tracking; user_profiles_directory name resolution; fn_is_conversation_participant SECURITY DEFINER; created_by SELECT policy fix | — |
| Notification bell (S21, PR #87 + DB) | ✅ MERGED — notifications table + RLS + read_at-only trigger; DB triggers on 4 approval chains; fn_resolve_user_by_name helper; bell + dropdown UI; page-level click-through | — |
| Messages shortcut button (S21, PR #88) | ✅ MERGED — MessagesBell.jsx alongside notification bell; reuses unreadMsgCount state; no new polling | — |
| Notification Phase 1 — role reminders | ⬜ FORWARD GOAL — parked; needs agreed per-role SLAs before build | MD ratifies response-time expectations |
| Notification Phase 3 — performance tracking | ⬜ FORWARD GOAL — parked; needs real Phase 2 usage data first | After Phase 2 bedded in |
| **Phase 6 design-lock (S22, PR #91)** | ✅ MERGED — §9 roadmap (6A–6E) added to master doc; planning-only | Build sub-phase by sub-phase |
| Phase 6A maintenance page (S23, PR #92) | ✅ MERGED — PM checklists + downtime log; first real OEE data source | Real-world usage check once crews log |
| Maintenance staff-picker team filter (S23, PR #93) | ✅ MERGED — picker filtered to asset team via `reports_to_staff_id` | — |
| Phase 6B Batches product + curing sign-off (S23, PR #94) | ✅ MERGED — product dropdown/`product_id`, Batch Date, advisory Store-Officer sign-off | Set interlock/kerb curing days (§5) to make it enforceable |
| Batches Edit/Delete role-gate (S23, PR #95→#96) | ✅ MERGED — UI gated to match RLS; #95 re-landed as PR #96 (process recovery) | — |
| Production audit trail + duplicate warning (S23, PR #97) | ✅ MERGED — `updated_at`/`updated_by`; same-day dup guard; `onClick` event-arg bug fixed | — |
| Production dust/chippings auto-deduct fix (S23, PR #98) | ✅ MERGED — keyword-match lookup that never matched "DUST" fixed; deduction now fires | — |
| Roster upsert-dedupe (S23, PR #99 + `fbdad15`) | ✅ MERGED — delete-then-reinsert (RLS silent no-op → dup rows) replaced with upsert + guard; UUID `NOT IN` quoting fix | removed-worker row-count re-check not provable from window (disclosed) |
| Messages nav + notification empty-states (S23, PR #100) | ✅ MERGED — Messages re-added to affected `ROLE_PAGES`; blank notification states fixed | — |
| Production-delete inventory reversal (S23, PR #101) | ✅ MERGED — `deleteEntry` reverses the linked stock movement | — |
| Inventory kg/tonnes toggle + recorder (S23, PR #102) | ✅ MERGED — unit toggle (canonical unit) + read-only "Recorded By" | — |
| Payment-request attachment read-back (S23, PR #103) | ✅ MERGED — stored attachments now listed on the request detail | — |
| Reports expense_date + error-swallow fix (S23, PR #104) | ✅ MERGED — `expense_date` (was non-existent `date`); 13 fetchers stop swallowing PostgREST errors | — |
| Inventory editMovement double-deduct + role-gate (S23, PR #105) | ✅ MERGED — reverses `oldMovement.movement_type` before applying edit; movement buttons role-gated | — |
| P&L accrual rebuild (S23, PR #106) | ✅ MERGED — rebuilt as proper accrual income statement | Data still moving (backfill) |
| Reports rebuild — expense/supplier/cashflow/balancesheet (S23, PR #107) | ✅ MERGED — every column re-verified vs `information_schema`; traps in §10 | Data still moving (backfill) |
| Roster/loading payroll-lock gating (S23, PR #108) | ✅ MERGED — Edit/Delete gated on linked payroll status (locked past draft) | — |
| Truck Loading date-range filter (S23, PR #109) | ✅ MERGED — from/to filter + null-date toggle + payroll signpost | — |
| Multi-role access control (S23, PR #110) | ✅ MERGED — effective roles, union nav, MD `RoleGrantsManager`, `hasRole`; `src/lib/roles.js` | Button-level `hasRole` conversion in 4 files deferred (§4) |
| Phase 6C spares / 6D fleet / 6E dashboard | ⬜ NOT started (§9) | Build after backfill/costing queue (§3) |
| Historical backfill to January | 🟡 IN PROGRESS — totals in flux (§2) | Then physical count + WAC costing (§3) |
| Go-live re-entry / dust gap | parked | MD triggers |

---

## 8. PHASE 5 RE-PLAN — PAYMENT-REQUEST + INGESTION (Session 13, 2026-07-03)

**Status: DESIGN LOCKED (13 decisions). Schema NOT started — blocked on §Pre-schema verification.**
**This section supersedes the §3 line "Payment-request (revenue) + ingestion" — label was stale; Phase 5 is EXPENDITURE-side. Revenue matching is committed as 5d.**

### SUB-PHASE MAP

| Sub | Scope | Depends on |
|---|---|---|
| **5a** | Payment-request lifecycle: request → ICO → MD → accountant disburses. Single reference `APC-PR-#####` as matching spine. States include `md_approved` (awaiting funds) → `funded` (5e hook; until 5e ships, funding approval stays on WhatsApp/paper and `funded` is set manually) → `disbursed` → `closed`. | audit Cat-4 PR merged/parked first (WR#1) |
| **5b** | Attachments (private bucket) + goods-receipt link = existing `stock_movements` row (three-way check: approved/paid/delivered). Evidence-gated closure with logged overrides. | 5a |
| **5c** | Statement ingestion (both accounts, both directions) + **outflow matching only**. Builds shared engine: statement-lines store, match-state machine (unmatched → suggested → confirmed/rejected), accountant confirm screen. Extends existing Phase 0 parser (`src/utils/parseBankStatement.js`). | 5a live |
| **5d** | **Revenue matching — COMMITTED**, starts after 5c live-proven. Matches credits banked by 5c against invoices; adds partial/lump-sum rules + payment-record creation from confirmed matches. Open 5d decision: non-block income (cement, dust, chippings, bags, scrap, asset disposal) has no invoice target — widen invoicing vs categorize-and-confirm. | 5c live-proven |
| **5e** | Treasury funding layer: monthly drawdown revenue→operations, chain accountant → ICO → MD → **board chairman**, against annual budget ceilings (data rows, not a budgeting module). Funding batch moves member requests to `funded`. Inter-account transfer pairs in 5c like top-ups. | 5a; independent of 5b–5d |

**Out of scope (all of Phase 5):** receipt OCR; bank alert email/SMS parsing; depreciation (no bank event — future accounting phase); payroll/labour/advance disbursements (own state machines — tables untouched).

### DECISION LOG (all MD-ratified this session)

1. **Relabel:** #5 = expenditure. Skeleton authoritative over old "(revenue)" label. Revenue = 5d, committed (not a deferral).
2. **Ingest both directions, match debits only (5c).** Credits stored + parked with category tag; matching screen defaults to debits.
3. **Sequencing:** 5c = shared engine + outflows; 5d immediately after 5c live-proven, launches against banked credit rows.
4. **Request boundary = any manually initiated outflow** (incl. supplier purchases, maintenance, tax/levies/fines, medical, capital, bought-in blocks, electricity, diesel). Excluded: state-machine-governed disbursements (staff payroll, labour payroll, advances). Unmatched debits from excluded flows are parked-categorized (payroll/advance/bank-charge/unknown), never anonymous. **Correction on record:** `lpo_orders` is CUSTOMER sales orders (verified in code) — supplier-purchase `source_type` links to `stock_movements`, not `lpo_orders`.
5. **Categories are data — REUSE `expense_categories` (exists, live, is_active + parent grouping; verified S13).** No new payment_categories table; extend for income direction. Both seed lists in §Seeds.
6. **Three-account ingestion (corrected S13):** **`bank_accounts` EXISTS (live: 4 rows = two duplicate pairs, revenue + operations; DEDUPE required; add Moniepoint row).** 5c ingests all three (same parser, no extra build); debit-matching runs on operations + Moniepoint only; revenue-account lines are parked (credits = 5d's dataset, banking from day one). Every statement line account-tagged; every disbursement records its account (the big-from-Taj/small-from-Moniepoint norm can be broken with approval — account is recorded per request, never inferred from amount). Revenue↔operations drawdowns and operations↔Moniepoint top-ups pair as internal transfers, excluded from vendor matching.
7. **Disbursement norm = bank transfer; cash = failsafe** (mechanic/roadside labour). Cash requests run the IDENTICAL approval chain, must reference a logged withdrawal, `disbursement_method='cash'`, close on accountant confirmation (no statement match). Running monthly cash total visible (drift control).
8. **WhatsApp cutoff = FLOATING:** 14 days after the first real request completes request→ICO→MD→disbursed on PRODUCTION. Calendar date announced the day 5a merges.
9. **Matching strategy per account/channel:** Taj = schedule-first (expected-disbursement list), narration secondary; Moniepoint = reference-first. Every disbursement records execution channel: `online_transfer` | `bank_letter` (letter ⇒ narration untrusted — bank clerk types it).
10. **Multi-beneficiary bank letters ⇒ disbursement batch** (one letter = one batch = N requests). Taj posts **one debit per beneficiary — EMPIRICALLY CONFIRMED (S13, real statement: 07-APR-26, three per-beneficiary debits from one instruction).** Line↔request matching primary; line↔batch-total fallback built regardless (posting behavior is bank-internal and can change silently). Moniepoint posts either a **single BULK_TRF-tagged debit for the whole batch** (beneficiary field blank, e.g. 26-Aug-2025 ₦180,298.84, 02-Sep-2025 ₦422,580.00, 09-Sep-2025 ₦432,520.00) or **individual per-beneficiary debits** (e.g. 31-Aug-2025, 11-person salary run, each its own TRF line with beneficiary name) — depends on whether the sender used Moniepoint's bulk-transfer feature for that specific payment run, not a fixed rule per bank. **EMPIRICALLY CONFIRMED (S15, real statement: Moniepoint-Document-2026-07-03T08-58.xlsx, account ...88428).** Matching logic must handle both. Additionally, **Moniepoint bulk batches can carry a partial BULK_TRF_RFD refund credit afterward** if one beneficiary in the batch fails (confirmed 09-Sep-2025, ₦8,120 partial refund against that day's ₦432,520 bulk debit) — a bulk batch's net cost isn't always its original debit amount.
11. **Initiator roles (RPC-enforced, not CSS):** production_manager, logistics_manager, bdm, hr_officer — each requesting within their own domain (PM: production; logistics_manager: logistics/operations; hr_officer: HR/office-management expenses; bdm: business development). store_officer, accountant, and md removed as initiators **(S16 — MD decision)**; **ICO still excluded** — gates, never originates (S7 control principle). Domain restriction (e.g. HR requesting only HR-related spend) is enforced by ICO's review, not by the database — `expense_category_id` stays optional per Decision 13's roadside case, so a hard role↔category mapping isn't reliable; ICO catches out-of-domain or unauthorized requests at approval time with a stated reason.
12. **Reference format:** canonical `APC-PR-#####` (server-side, collision-retry like the six existing generators; sequential, NO year segment). Narration convention `PR#####`, **typed at the START of the narration** ("PR00123 diesel") — Taj truncates the details field at fixed width (verified S13), so a trailing reference is destroyed. Matcher normalizes (case/hyphen/space-insensitive, embedded-anywhere, accepts full form). **Amount-agreement gate:** reference match + amount mismatch = flagged discrepancy, never auto-confirm.
13. **5b closure:** goods categories close on `stock_movements` link; service categories expect receipt attachment; nothing mandatory at initiation (roadside case). **Dual override (accountant OR MD)**, logged with actor; monthly override count split by actor so accountant-overrides-own-disbursement is its own visible line (self-review mitigation).

**Standing rules:** every match is a SUGGESTION until accountant-confirmed (both directions, forever). The payment request is the ONLY money-out truth; `stock_movements.total_cost` is inventory valuation, never "paid".

### EXISTING SUBSYSTEM MAP (S13 — Phase 0 is a full draft of 5c/5d, partly in production use)
Live-verified (code on main + live DB query 2026-07-03). Disposition per component — Phase 5 EXTENDS this; it does not greenfield:
- **`bank_accounts`** — REUSE. Live: 4 rows, two duplicate pairs (revenue ×2, ops ×2). ACTION: dedupe, add Moniepoint.
- **`bank_transactions`** — REUSE/EXTEND as the 5c statement-lines store. Live: 1,277 rows of real ingested history (keep-or-remigrate decision pending). Extend: `suggested`/`confirmed` match states, RPC-guarded confirm (current writes are client-side, unguarded), reconciliation gate at import, account-tagging already present via `bank_account_id`.
- **`expense_categories`** — REUSE (= Decision 5).
- **`expenses` (43 rows; dashboards KPI/Board/Reports read it; Labour.jsx inserts payroll costs)** — DO NOT convert or touch. New `payment_requests` table is workflow truth; disbursement writes a linked `expenses` row (accounting projection) so all reporting keeps working. Payroll continues writing expenses directly, outside requests (consistent with Decision 4 boundary).
- **`receipts` table + flow** — REUSE as 5b attachment store (add request linkage) after bucket fix below.
- **Parser `autoMatchTransactions`/`detectCategory`** — SUPERSEDED by 5c rules; DataImport UI is the base to extend.
- **`bank_import_batches`, `bank_reconciliations`** — reuse; reconciliation gate writes into the latter.

#### Live-DB findings (S13 planning-chat verification)
1. **EXPOSURE — `receipts` storage bucket is PUBLIC** (unauthenticated read of vendor receipts). **MD RULING (S13): coordinate flip with the code PR** — accepted interim risk (exploit requires a leaked URL: random path slugs, `file_url` behind finance-role RLS). BOUNDED: signed-URL PR is a standalone scope queued BEFORE any Phase 5 build session (it is on 5b's critical path regardless); bucket flip applied from the planning chat the same day the PR merges, verified by unauthenticated fetch before/after.
   - receipts bucket flipped private 2026-07-03 ✓ (PR #44); lpo-documents, supplier-documents, vehicle-documents also found PUBLIC — same bounded treatment, this PR + planning-chat flip.
   - **✅ FULLY CLOSED (S14, 2026-07-07):** all 4 buckets private + signed URLs live (PR #44/#45); storage.objects RLS layer also tightened — the generic `public_*` policies that persisted after the bucket flips (needed at the time so the app kept working) are now replaced with per-bucket role-scoped policies. See Session 14 entry above for the full verification.
2. **`expenses` has NO guard trigger** — status is a soft column, not a state machine; S12 audit Category 5's CLEAN claim did not cover this table. Accepted risk short-term; 5a replaces this approval path. _(Re-verified S13: `expenses` guard-trigger count = 0.)_
3. `bank_accounts` duplicates + 1,277 legacy `bank_transactions` rows — hygiene items gating 5c.

### STATEMENT EMPIRICS (S13 — verified against real Jan–Jun 2026 Taj PDFs, both accounts, + 12-month Moniepoint Excel)
- **Reconciliation gate confirmed buildable on all three sources.** Taj: identical layout both accounts; opening balance + per-row running balance + TRANS SUMMARY; arithmetic verified to the kobo on both. Moniepoint: opening/closing/total debit/credit header + Balance Before/After per row.
- **Fee legs:** every Taj transfer spawns companion debit rows (NIP fee 53.75/26.88/10.75, stamp duty 50, levy 50, monthly SMS) **carrying the parent's narration** — a charge-classification pass MUST run before any matching or fee rows keyword-match as phantom payments. Moniepoint pairs fee legs explicitly via Transaction Ref suffix (`_DEBIT_1/_2`); Taj needs keyword + known-amount heuristics.
- **Reversals:** observed live (06-MAY: 3,000,000 debit + `RevNIP…` credit same day). Match-state machine rule: a reversal credit voids its parent debit's match. Moniepoint exposes a Reversal Status column.
- **Moniepoint columns are rich:** Beneficiary name + institution, clean free-text narration, unique refs — Moniepoint matching = reference + beneficiary + amount, stronger than reference-alone.
- **Revenue account is not inflow-only:** loan in/repayment out (Bilaad ₦102.9M in, ₦92M out), Mudaraba investment flows. Moniepoint credits include non-block sales revenue (stone dust trips, plaster sand) — 5d's inflow dataset spans Moniepoint too.

### EXISTING ASSETS (verified in code this session)
- `src/utils/parseBankStatement.js` (Phase 0): TAJ PDF (pdfjs, DD-Mon-YY, meta-row filter) + CSV + Excel. 5c extends, does not rebuild. **Taj is PDF-ONLY for BOTH accounts (corrected S13 — no Excel option exists); Moniepoint offers Excel or PDF (use Excel).** The Taj parser is therefore a single point of failure for the majority of money out. Mitigation is a MANDATORY reconciliation gate in 5c ingestion: a statement file is accepted only if opening + credits − debits = closing (and per-row running balance validates where present); any mismatch rejects the ENTIRE file loudly — silent partial ingestion is forbidden. A Taj layout redesign = visible ingestion outage + parser patch, never quietly wrong data.
- `staging_transactions` table exists (per audit).
- Store's stock-in IS the goods receipt — no separate GRN table (two-records-one-truth guard, third occurrence).

### PRE-SCHEMA VERIFICATION (WR#8 — blocks schema session)
1. Live column shapes of `stock_movements` and `staging_transactions`. **✅ CLOSED (S13)** — `stock_movements` shape confirmed live (includes `supplier_id` + `reference` columns); `staging_transactions` verified 0 rows and unreferenced by code — legacy scaffolding from the abandoned OCR/alert design, leave in place, out of Phase 5 scope. See results below.
2. How Phase 0 parser output is wired in `App.jsx` (extend vs re-route). **✅ CLOSED (S13) — see results below.**
3. Reconfirm Decision 10 posting behavior. **✅ CLOSED (S15)** — Taj Bank behavior reconfirmed by MD; Moniepoint behavior newly empirically confirmed against real statement data (see Decision 10 above — both bulk-single-debit and individual-per-beneficiary patterns observed).
4. ~~Taj PDF balance fields~~ **CLOSED S13** (see Statement Empirics). Moniepoint xlsx through the app's SheetJS parser: **✅ CLOSED (S13)** — SheetJS parses the real Moniepoint xlsx (2,995 rows, header detected at row 7, malformed styles tolerated).

#### Pre-schema verification results (Claude Code, S13)
- **Item 1 — column shapes (live DB, 2026-07-03):**
  - `stock_movements`: `id` uuid, `item_id` uuid, `movement_type` text NOT NULL, `quantity` numeric NOT NULL, `unit_cost` numeric, `total_cost` numeric, `supplier` text, `reference` text, `issued_to` text, `staff_name` text, `date` date NOT NULL, `notes` text, `created_at` timestamptz, `supplier_id` uuid. → 5b's supplier-purchase link (Decision 4) has `supplier`/`supplier_id`/`reference`/`total_cost` to key on; `total_cost` is the inventory-valuation column (never "paid" — standing rule).
  - `staging_transactions`: `id` uuid, `channel` text NN, `content_hash` text NN, `raw_payload` jsonb NN, `file_path` text, `extracted_amount` numeric, `extracted_date` date, `extracted_party` text, `extracted_ref` text, `direction` text, `proposed_target` text, `ocr_confidence` numeric, `status` text NN, `review_mode` text NN, `promoted_to_table` text, `promoted_to_id` uuid, `promoted_by` text, `promoted_at` timestamptz, `reviewed_by` text, `reviewed_at` timestamptz, `reject_reason` text, `created_at` timestamptz NN, `updated_at` timestamptz. → already a generic staging shape with a promote-to-target lifecycle; usable as a model for the 5c match-state machine.
- **Item 2 — Phase 0 parser wiring (code on main):** the ingest+match flow lives **inline in App.jsx** as an Accounting sub-tab, NOT in the standalone `DataImport` component. Flow: `buildPreview()` → `mapRowsToTransactions` → `bankTransactionsService.checkDuplicates` → `autoMatchTransactions(...)` (App.jsx ~L5242) → `confirmImport()` writes to `bank_transactions`; `detectCategory` used for unmatched debits (~L5896). The separate `DataImport` component (`data_import` route, accountant-only) is the `staging_transactions` OCR/promote path. → **5c extends the inline App.jsx `bank_transactions` reconciliation flow** (add suggested/confirmed states + RPC-guarded confirm + reconciliation gate); the `DataImport`/`staging_transactions` path is a separate lineage, not the 5c base.

### SEEDS
- **Expenditure:** machine maintenance, truck maintenance, production materials (cement/dust/diesel), delivery/diesel-trucks, electricity (prepaid grid), admin, commission, medical, tax/VAT, levies & fines, capital acquisition, bought-in finished blocks, float replenishment, loan/investment repayment, professional services (consultancy), staff welfare/support, bank charges (system category — fee legs auto-classified, never user-selected).
- **Income (5d):** block sales, cement sales, stone dust, chippings, empty cement bags, scrap metal, asset disposal, loans/investments received (funding, not revenue — flag for 5e/5d rules), reversals (system — voids parent debit).

## 9. PHASE 6 — OPERATIONAL EXCELLENCE: MAINTENANCE, QUALITY & FLEET TRACKING (Session 22, 2026-07-14)

**Status: DESIGN LOCKED (5 sub-phases, A-E). Schema NOT started. Sequencing is priority-ordered — each sub-phase ships independently, none blocks starting the next once its own dependencies are met.**

**Origin:** this phase comes out of an external research pass — an industry benchmarking of the company's precast concrete operation against global and Nigerian-market standards, commissioned by the MD. The research compared actual operations against OEE/TPM maintenance benchmarks, NIS 87 quality standards, and Nigerian market context (power reliability, customs lead times for the Turkish-made Conmach MD-20 machine, Abuja construction demand). It identified the company's ~35-50% machine capacity utilization as the top-priority gap — driven primarily by an absent preventive-maintenance program and no spares buffer for imported parts — plus secondary gaps in curing-standard enforcement, fleet downtime (2 of 4 trucks inactive), and role-level performance visibility. Phase 6 is the system-side response: build the tracking objects needed to actually monitor, evaluate, and eventually enforce the improvement plan. The plan itself has no teeth without them.

### SUB-PHASE MAP

| Sub | Scope | Depends on |
|---|---|---|
| **6A** | Maintenance & downtime tracking. PM task templates per asset (Conmach MD-20, each truck) with daily/weekly/monthly/annual checklist items, assigned role, completion logging. Downtime log: every stoppage (machine or truck) with start/end time, reason category (breakdown, changeover, power outage, material shortage, awaiting parts), resolver. This is the top-priority sub-phase — it's what makes a real, measured OEE figure possible for the first time, replacing the current estimate-only ~35-50% figure. | None — can start first |
| **6B** | Curing standard enforcement. Minimum curing age tied to batch creation (default per NIS 87 guidance, MD-configurable); Store Officer's "ripe for picking" determination becomes a system check against that standard rather than pure judgment. Optional quality-test records (compressive strength, dimensions) linked to batches — informational first, groundwork for eventual SON certification. | None — independent of 6A, can build in parallel |
| **6C** | Spare parts inventory. Critical-spares register: part, criticality tier, quantity on hand, reorder threshold, typical lead time (accounting for the multi-week Turkish-parts customs/shipping reality). Alert when stock crosses reorder point. | Loosely benefits from 6A existing first (downtime-reason data helps prioritize which parts are actually critical) but not a hard blocker |
| **6D** | Fleet status tracking. Active/down status per truck (extends existing `vehicles` table), repair log with expected-return date. Visibility into real delivery capacity vs. production output — closes the blind spot that let 2 of 4 trucks sit down without a system-visible capacity impact. | None — independent |
| **6E** | Role-KPI dashboard + reminders. Extends the existing Labour & Loading dashboard widget (built Session 20) with PM completion rate, downtime hours, curing compliance, spares alerts, fleet status. Wires the existing notification system (built Session 21) to all of the above: overdue PM task, batch approaching/exceeding curing window, low critical-spare stock, truck down past expected date. This is also where the previously-parked "phase 1" role-responsibility reminder concept (deferred earlier in Session 21 for being underspecified) becomes concretely buildable — 6A-6D give it real data to alert on instead of invented due-dates. | 6A, 6B, 6C, 6D (needs their data to have anything to surface) |

**Out of scope (all of Phase 6):** the specific penalty/disciplinary-consequence mechanics for underperformance — MD has explicitly deferred this to a separate future conversation once 6A-6E are live and producing real data. Performance-tracking/scorecard system (the earlier-discussed "phase 3") remains parked for the same reason — needs real usage data from this phase first, not built alongside it.

### DECISION LOG

1. **Full 5-phase roadmap recorded now, built incrementally** — MD explicitly chose to document the whole shape upfront (matching how Phase 5 was fully scoped before being built sub-phase by sub-phase), rather than only recording the next single sub-phase and sketching the rest loosely.
2. **Sequencing is priority-ordered by the research report's own gap ranking**, not arbitrary: 6A (maintenance/downtime) first because it's the top-impact, lowest-cost gap per the report and is a prerequisite for ever having a real OEE number; 6B (curing) and 6D (fleet) next as cheap, high-value, independent builds; 6C (spares) after, since it benefits from 6A's downtime data existing; 6E (dashboard/reminders) last since it depends on the others having real data to surface.
3. **Enforcement/penalty design is explicitly out of scope for this phase** — building measurement before consequence, deliberately, so the two aren't tangled together and the KPIs can be evaluated on their own merit first.
4. **This phase supersedes/concretizes the "phase 1" and "phase 3" notification concepts** parked in Session 21 — phase 1 (role-responsibility reminders) was deferred at the time for lacking a real, agreed definition of expected duties; 6A-6D now provide that real definition (PM checklists, curing windows, spares thresholds, fleet status) instead of guessed due-dates.

---

## 10. COLUMN-NAME TRAPS & RECURRING BUG PATTERNS

Reference material distilled from the Session 23 accounting/data-integrity clean-up. **Before writing any query, confirm the column against `information_schema.columns` for the specific table (Working Rule #11).** Do not carry an assumption from one table to another — the same concept has different column names across tables here.

### 10.1 Date columns — where `date` exists and where it does NOT
The single most expensive trap: assuming a table has a `date` column. A query that filters/sorts on a non-existent column does not error usefully through PostgREST in the patterns used here — it returns nothing (or, with the swallowed-error pattern below, an empty array that looks like "no data").

**Tables that do NOT have `date` — use the real column:**
| Table | WRONG (assumed) | RIGHT (actual) |
|---|---|---|
| `expenses` | `date` | **`expense_date`** |
| `supplier_transactions` | `date` | **`transaction_date`** |
| `payment_requests` | `date` | `transaction_date` (money-moved) / `created_at` (record-entered) — distinct, pick deliberately |

**Tables that genuinely DO have a `date` column — do NOT "fix" these to something else:**
`production_log`, `damage_log`, `attendance`, `stock_movements`, `vehicle_fuel_log`. (`stock_movements.date` is `date NOT NULL` — confirmed in §8 item 1.) When a report joins several of these plus `expenses`, some legs correctly read `date` and others correctly read `expense_date`/`transaction_date` in the SAME query — that asymmetry is correct, not a bug to "clean up."

*Root cause of the original bug (PR #104):* `fetchExpensesRange` filtered `expenses` on `date`, which does not exist → every dated expense report returned empty. Fixed to `expense_date`.

### 10.2 `expenses` has no free-text category columns
- `expenses` has **no `category` text column and no `subcategory` column.** Category lives in **`category_id`** (FK) — join `expense_categories` to get a human label; never `SELECT ... category` off `expenses`.
- `expense_categories` itself carries the parent/group structure and `is_active` (used to deactivate Labour/Salaries so they never appear as payment-request options — see §8 Decision 5). Read the label/grouping there.

### 10.3 Supplier naming
- `suppliers` — the company name column is **`company_name`, NOT `name`.** A `SELECT name` returns nothing/errors depending on path. Supplier statement / vendor pickers must read `company_name`.
- `supplier_transactions` — date column is **`transaction_date`** (see 10.1).

### 10.4 RLS delete-then-reinsert bug class (silent no-op → duplicate accumulation)
**Pattern:** app code "replaces" a set of child rows by DELETE-ing them then INSERT-ing fresh ones (e.g. roster worker rows). **Failure mode:** if the table's DELETE RLS policy is *narrower* than its INSERT policy, the DELETE silently affects zero rows for some roles (RLS makes the rows invisible to the delete, no error raised), then the INSERT adds a fresh copy — so every "edit" **accumulates duplicates** instead of replacing.
- **Seen in:** roster edit (PR #99) — fixed by switching to `upsert(rows, { onConflict })` + a duplicate-worker guard, so there is no delete leg to silently fail.
- **Rule:** never model "replace these rows" as delete-then-reinsert on an RLS table unless the DELETE and INSERT policies are provably identical in scope. Prefer `upsert` on a real conflict key.
- **Related trap (same PR):** a PostgREST `NOT IN` / `.not('id','in',...)` filter with unquoted **hyphenated UUIDs** parses wrong — each UUID must be quoted: `("uuid1","uuid2")`. Fixed in follow-up `fbdad15`.

### 10.5 Swallowed-error pattern (a failed query looks like empty data)
**Pattern:** `const { data } = await supabase...; return data || []` — the `error` is destructured away and never checked, so a query that FAILED (bad column, RLS block, network) returns `[]`, indistinguishable from a legitimately empty result. Reports built this way fail *silently and invisibly*.
- **Seen in:** 13 Reports fetchers (PR #104), all corrected to check and surface `error`.
- **Rule:** always destructure and act on `error`. In reporting code especially, an error must be visible (thrown or shown), because "empty report" and "broken report" must never look the same.

### 10.6 Keyword-match inventory lookup (never matches the real item)
**Pattern:** finding an inventory item by fuzzy keyword against a guessed name — e.g. `items.find(i => i.name.includes('granite'))` — when the real row is named something else (the actual item is **"DUST"**, not "granite"/"chippings").
- **Seen in:** `autoDeductProduction` (PR #98) — dust/chippings consumption was never deducted from stock because the keyword never matched the real item name. Fixed to match the actual item records; form field + column wired through so the deduction fires.
- **Rule:** resolve inventory items by id / exact catalogued name, never by an assumed substring. If a name-based lookup is unavoidable, verify it against the live `items` rows first.

### 10.7 Reverse-then-apply on edits (avoid double-deduct)
**Pattern:** editing a stock-affecting row re-applies the new effect without first undoing the old one → double-count.
- **Seen in:** inventory `editMovement` (PR #105) — re-applied a deduction using the *new* `movement_type` without reversing the *old* movement first. Fixed to reverse using `oldMovement.movement_type`, then apply the edit. Same shape as the production-delete reversal gap (PR #101), where deletion didn't reverse the consumed stock at all.
- **Rule:** any edit/delete of a row that changed stock must first reverse the row's *original* effect (using the original type/quantity), then apply the new one. Never apply the delta from the new values alone.
