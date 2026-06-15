# Session Handoff — Abuja Precast Concrete Manager ERP

**Last updated:** 2026-06-15  
**Repo:** `amaliyu/muktar24`  
**Production branch:** `main` → deployed via Vercel  
**Stack:** React 18.3.1 + Vite 5 + Supabase (PostgreSQL + Auth + RLS)  
**Full technical reference:** `APP_FULL_DOC.md`

---

## Session 1 — Role-Level Security (2026-06-12)

### What was decided

- A 14-table permission matrix was produced, reviewed, and approved with corrections (see commit message on `346b340` for the full matrix). Tables not in the matrix keep their pre-session policies until future sessions.
- Approved write-permission summary:
  - **payroll_runs / payroll_lines** — INSERT/UPDATE: md, hr_officer (accountant excluded)
  - **payments** — INSERT/UPDATE: md, accountant; DELETE: md only
  - **invoices** — INSERT: md, bdm, accountant (marketer excluded); UPDATE: md, accountant
  - **bank_accounts / bank_transactions / bank_reconciliations / financial_adjustments / opening_balances** — INSERT/UPDATE: md, accountant; DELETE: md
  - **expenses** — INSERT: md, accountant, hr_officer; UPDATE/DELETE: md, accountant
  - **income_records** — INSERT: md, accountant; UPDATE: none (immutable); DELETE: md, accountant
  - **staff** — INSERT/UPDATE: md, hr_officer; DELETE: md
  - **staff_documents** — INSERT: md, hr_officer + self-upload via `user_profiles.staff_id`; UPDATE: none; DELETE: md, hr_officer
  - **weekly_labour_payroll** — INSERT/UPDATE: md, production_manager, assistant_production_manager, hr_officer, logistics_manager, ico; DELETE: md

### What was applied to the live DB (2026-06-12)

All three migration files in `supabase/migrations/` are now in `main`. Two are already applied:

| File | Status |
|---|---|
| `20260612000000_session1_preamble.sql` | ✅ Applied — dropped legacy allow_all/staff_write/fa_*/ob_* policies, normalized SELECT on 4 masked tables, added own-doc clause to staff_documents_select |
| `20260612000001_role_rls_write_policies.sql` | ✅ Applied — role-specific INSERT/UPDATE/DELETE for the 14 approved tables |
| `20260612000002_staff_documents_bucket_private.sql` | ⏳ **NOT YET APPLIED** — apply only after signed-URL code is verified in production |

### Code changes merged to main

- **`src/services/hrService.js`** — `upload()` stores storage path (not public URL) in `file_url`; `getByStaff()` generates `displayUrl` via `createSignedUrl(3600s)`; `delete()` handles both old http:// and new path formats
- **`src/App.jsx`** — `handleUpload` stores path; `loadDocs` generates `displayUrl` per doc; `handleDeleteDoc` handles both formats; display link uses `doc.displayUrl`
- **`src/App.jsx` UI guards** — Edit payment: md/accountant; Remove payment: md only; Generate Invoice: md/accountant/bdm; Record Payment: md/accountant
- **`src/components/StaffHR.jsx`** — document View link uses `doc.displayUrl`

---

## Pending / Next Sessions

### Immediate (before next deploy or next session)
- **Apply `20260612000002_staff_documents_bucket_private.sql`** via the DB channel once production is confirmed working with signed URLs. Until then the bucket is still public — documents load, but aren't yet protected by the signed-URL gate.

### Session 2 (planned)
- **RLS for remaining ~48 tables** — produce a reviewed permission matrix for: vehicles/fleet, suppliers, waybills, orders/order_items/customers, labour (non-payroll), production/inventory, delivery, LPO, import tables, reference/lookup tables. Same stop-point discipline: matrix approval before any SQL is written.

### Known skips / not in scope yet
- `user_profiles` SELECT is currently `id = auth.uid() OR role = 'md'` — no change planned; auth trigger (SECURITY DEFINER) handles inserts.
- Storage policies for buckets other than `staff-documents` not yet reviewed.
- No automated migration runner configured — all migrations applied manually via Supabase SQL editor.

---

## Session 3 — Phase 4a: Staff Onboarding Frontend (2026-06-15)

### DB layer (applied in planning chat this session — Supabase, 2026-06-15)

All migrations tracked via `apply_migration`. **No code-side migrations needed.**

- `staff.employment_status`: NOT NULL, default `'active'`, CHECK IN (`onboarding|active|suspended|terminated`). GENERATED `is_active` column derived from it — do not write `is_active` directly.
- `onboarding_checklist_templates`: 6 seeded items (`bank_details`, `next_of_kin`, `emergency_contact`, `guarantor`, `nin`, `signed_contract`).
- `staff_onboarding_checklist`: per-staff progress table, UNIQUE(staff_id, item_key). RLS: md/hr_officer write.
- BEFORE UPDATE trigger on `staff`: blocks `employment_status → 'active'` unless all required checklist items are `is_complete = true`.
- BEFORE INSERT triggers on `attendance` and `payroll_lines`: reject rows for non-active staff.
- Existing 17 staff backfilled as fully checklisted (`completed_by = 'system_backfill'`).

### Frontend changes — branch `feature/4a-staff-onboarding-frontend`

**Task 1 — Add Staff defaults**
- `emptyForm.employment_status` changed from `"active"` → `"onboarding"`.
- Payload fallback changed from `"active"` → `"onboarding"`.
- Removed `is_active: true` from the create call (generated column; direct writes fail).

**Task 2 — Onboarding tab**
- New `OnboardingTab` component: lists all staff with `employment_status = 'onboarding'`.
- Shows all 6 checklist items per staff with hr_officer/md-only checkboxes; sets `completed_at`/`completed_by` on toggle.
- Activate button: updates `employment_status → 'active'`; DB trigger rejects if checklist incomplete; friendly error shown.
- New "Onboarding" tab added to main HR tab bar (between Directory and Attendance).

**Task 3 — Status visibility + downstream guards**
- `staffService.getActive()` changed to filter `employment_status = 'active'` (was `is_active = true`).
- Directory status filter: "Inactive" option replaced with "Onboarding"; filter logic updated to use `employment_status`.
- `statusColor` helper: `onboarding` → blue badge; removed `is_active` fallback.
- Attendance `catch` block: detects eligibility trigger errors and shows `"This staff member is not active and cannot be added to attendance/payroll."` instead of raw Postgres error.

### Still outstanding
- Add Staff form Employment tab still shows `employment_status` dropdown with all 4 values — verify that HR staff shouldn't be able to set `active` directly on creation (the DB default enforces it, but the UI still offers it).
- Payroll line creation in `PayrollTab` uses `staffService.getActive()` which now correctly filters to active only.
- Staff payroll trigger+RPC+audit workflow — MD decision still pending (see master doc §4).
