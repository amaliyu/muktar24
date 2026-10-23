import { useEffect, useRef } from 'react'

// Phone layout for the daily site screens (Dashboard, Production, Inventory,
// Batches, Waybills, Truck Loading, Labour, Pending Deliveries).
//
// Wrap a page in <MobileScope>. At 768px and below every <table> inside it
// becomes a stacked list (house style: never a sideways-scrolling table):
//   - each row is a bordered block;
//   - the first cell (or the cell marked className="m-title") sits on top as
//     the row's identity;
//   - the cell marked className="m-key" is the key figure, large on the right;
//   - other cells are label/value pairs, the label taken from the column header;
//   - a cell marked className="m-actions" puts its buttons full-width at the
//     bottom of the block;
//   - className="m-hide" drops a cell on phones only.
// A table with className="m-keep" is left alone. Desktop layout is untouched:
// every rule below lives inside the max-width media query.
//
// Layout helpers (also phone-only):
//   m-header  title row: title on its own line, actions full-width beneath
//   m-wrap    tab / filter pill rows wrap instead of overflowing
//   m-grid    metric tiles: 1–2 columns that fit the screen
//   m-form    form grids and modal bodies: single column, full-width inputs
//   m-page    a page wrapper with its own outer padding (the shell already pads)
//   m-pad     a card with padding 0 around a table: give the stacked rows room
//   m-full    an element that should take the full width on phones
//   m-buttons a row of form buttons: stacked full-width, primary 48px
//   m-col     a side-by-side row that should stack on phones
//   m-only    shown on phones only (e.g. the block type under a row's date)
//   m-stack   side-by-side panels (list | detail): one column on phones
//   m-pills   (fit) a vertical list of filter links becomes a row of pills
//   m-tap     (fit) a link used as a button: 44px tap target
//   m-statement (fit) P&L / balance sheet / cash flow: label | amount lines
//             stay two columns, labels wrap, amounts right-aligned
//
// <MobileScope fit> — for the office pages, whose layouts are inline-styled
// grids and flex rows rather than the labelled helpers above. On phones it
// also:
//   - reflows any inline grid: tile grids (repeat(n, …)) to as many ~170px
//     columns as fit; form grids (holding inputs) and side-by-side panels
//     (list | detail) to one column;
//   - lets inline flex rows wrap, with at least 8px between items;
//   - keeps every element inside the screen width (long names and numbers
//     wrap, fixed-width panels and charts shrink);
//   - for tables without explicit m-key / m-actions cells, makes the "amount"
//     column the key figure and a cell holding only buttons the action row;
//   - stacks flex rows of form fields (one field per line, full width) and
//     makes the amber primary buttons 48px tall.
// Explicit classes still win. The site pages from UX update 1 don't pass
// `fit`, so they are unchanged.
const CSS = `
.m-scope .m-only { display: none; }
@media (max-width: 768px) {
  .m-scope { min-width: 0; max-width: 100%; }
  .m-scope table:not(.m-keep) { min-width: 0 !important; width: 100% !important; }
  .m-scope div:has(> table:not(.m-keep)) { overflow-x: visible !important; }
  .m-scope table:not(.m-keep), .m-scope table:not(.m-keep) > tbody, .m-scope table:not(.m-keep) > tfoot { display: block; }
  .m-scope table:not(.m-keep) > thead { display: none; }
  .m-scope table:not(.m-keep) > tbody > tr, .m-scope table:not(.m-keep) > tfoot > tr {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 12px; row-gap: 2px;
    border: 1px solid #2e3452; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; background: #1a1d27;
  }
  .m-scope table:not(.m-keep) > tbody > tr > td, .m-scope table:not(.m-keep) > tfoot > tr > td {
    grid-column: 1 / -1; display: flow-root; min-height: 24px;
    padding: 4px 0 !important; border: none !important; text-align: right !important;
    min-width: 0; max-width: 100%; overflow-wrap: anywhere; white-space: normal !important; font-size: 14px;
  }
  .m-scope table:not(.m-keep) td::before {
    content: attr(data-label); float: left; width: 40%; margin-right: 8px; padding-top: 2px; text-align: left; line-height: 1.3;
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #a0a7bf;
  }
  .m-scope table:not(.m-keep) td:not([data-label])::before, .m-scope table:not(.m-keep) td[data-label=""]::before { display: none; }
  .m-scope table:not(.m-keep) td:not([data-label]), .m-scope table:not(.m-keep) td[data-label=""] { text-align: left !important; }
  .m-scope table:not(.m-keep) td > div { justify-content: flex-end; }
  .m-scope table:not(.m-keep) td:empty { display: none; }
  /* identity on top */
  .m-scope table:not(.m-keep) tr > td.m-title,
  .m-scope table:not(.m-keep) tr:not(:has(> td.m-title)) > td:first-child {
    grid-column: 1; grid-row: 1; text-align: left !important; font-size: 15px; font-weight: 700;
  }
  .m-scope table:not(.m-keep) tr > td.m-title > div,
  .m-scope table:not(.m-keep) tr:not(:has(> td.m-title)) > td:first-child > div { justify-content: flex-start; }
  .m-scope table:not(.m-keep) tr:not(:has(> td.m-key)) > td.m-title,
  .m-scope table:not(.m-keep) tr:not(:has(> td.m-key)):not(:has(> td.m-title)) > td:first-child { grid-column: 1 / -1; }
  .m-scope table:not(.m-keep) tr > td.m-title::before,
  .m-scope table:not(.m-keep) tr:not(:has(> td.m-title)) > td:first-child::before { display: none; }
  /* key figure, large on the right (its column name in small type above) */
  .m-scope table:not(.m-keep) tr > td.m-key {
    grid-column: 2; grid-row: 1; text-align: right !important;
    font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; max-width: 55vw;
  }
  .m-scope table:not(.m-keep) tr > td.m-key::before { float: none; display: block; width: auto; margin: 0; text-align: right; }
  /* row actions: full-width buttons at the bottom of the block */
  .m-scope table:not(.m-keep) tr > td.m-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 0 0 !important; }
  .m-scope table:not(.m-keep) tr > td.m-actions::before { display: none; }
  .m-scope table:not(.m-keep) tr > td.m-actions > div { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 8px !important; width: 100%; }
  .m-scope table:not(.m-keep) tr > td.m-actions button { width: 100%; min-height: 44px; }
  .m-scope .m-hide { display: none !important; }
  /* inputs inside stacked rows: label above, full-width field */
  .m-scope table:not(.m-keep) td input:not([type=checkbox]):not([type=radio]), .m-scope table:not(.m-keep) td select { width: 100% !important; max-width: 100%; margin-top: 4px; }
  .m-scope table:not(.m-keep) td input[type=checkbox] { float: right; }
  .m-scope .m-pad { padding: 12px !important; }
  .m-scope .m-page { padding: 0 !important; min-height: 0 !important; }

  /* touch targets */
  .m-scope button, .m-scope select,
  .m-scope input:not([type=checkbox]):not([type=radio]):not([type=hidden]) { min-height: 44px !important; }
  .m-scope input[type=checkbox], .m-scope input[type=radio] { width: 22px; height: 22px; }
  .m-scope textarea { min-height: 88px !important; }

  /* layout helpers */
  .m-scope .m-header { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
  .m-scope .m-header > :not(:first-child) { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 8px !important; width: 100%; }
  .m-scope .m-header > :not(:first-child) button, .m-scope .m-header > button { width: 100%; min-height: 48px !important; }
  .m-scope .m-wrap { flex-wrap: wrap !important; gap: 8px !important; overflow-x: visible !important; }
  .m-scope .m-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)) !important; gap: 12px !important; }
  .m-scope .m-grid > * { min-width: 0; overflow-wrap: anywhere; }
  .m-scope .m-form { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; gap: 8px !important; }
  .m-scope .m-form > * { min-width: 0 !important; width: 100% !important; grid-column: 1 / -1 !important; }
  .m-scope .m-col { flex-direction: column !important; align-items: stretch !important; gap: 8px !important; text-align: left !important; }
  .m-scope .m-form input:not([type=checkbox]):not([type=radio]), .m-scope .m-form select, .m-scope .m-form textarea { width: 100% !important; }
  .m-scope .m-full { width: 100% !important; min-width: 0 !important; }
  .m-scope .m-buttons { flex-direction: column !important; align-items: stretch !important; gap: 8px !important; }
  .m-scope .m-buttons > button { width: 100%; min-height: 48px !important; }
  .m-scope .m-only { display: block; }

  /* ── fit mode (office pages) ── */
  .m-fit { overflow-wrap: anywhere; }
  .m-fit :where(div, section, form, header, label, p, span, ul, li, svg, canvas, img, input, select, textarea, button, table, fieldset) { max-width: 100%; }
  .m-fit [style*="grid-template-columns"]:not(.m-keep):not(.m-stack) { grid-template-columns: minmax(0, 1fr) !important; }
  .m-fit [style*="grid-template-columns: repeat("]:not(.m-keep):not(.m-stack):not([style*="repeat(auto-"]) {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)) !important;
  }
  .m-fit [style*="grid-template-columns"]:not(.m-keep):not(.m-stack):has(> * input:not([type=checkbox]):not([type=radio]), > * select, > * textarea, > input:not([type=checkbox]):not([type=radio]), > select, > textarea) {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .m-fit [style*="grid-template-columns"]:not(.m-keep):not(.m-stack) > * { min-width: 0; grid-column: auto !important; }
  .m-fit [style*="display: flex"]:not(.m-nowrap):not([style*="flex-direction: column"]) { flex-wrap: wrap !important; }
  .m-fit [style*="display: flex"] > * { min-width: 0; }
  /* a growing column never collapses to a sliver: below ~160px it wraps to its own line */
  .m-fit [style*="display: flex"] > :is([style*="flex: 1"], [style*="flex: 2"], [style*="flex: 3"]) { min-width: min(100%, 160px); }
  /* a flex row holding form fields stacks: one field per line, full width */
  .m-fit [style*="display: flex"]:not(.m-nowrap):not(:has(> button)):has(> input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), > select, > textarea, > * > input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), > * > select, > * > textarea, > * > * > input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), > * > * > select) {
    flex-direction: column !important; align-items: stretch !important;
  }
  .m-fit [style*="display: flex"] > :has(> input:not([type=checkbox]):not([type=radio]):not([type=hidden]), > select, > textarea, > label + input, > label + select) { flex: 1 1 100% !important; }
  .m-fit input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), .m-fit select, .m-fit textarea { width: 100% !important; max-width: 100% !important; }
  /* primary (amber) buttons: 48px */
  .m-fit button[style*="rgb(245, 166, 35)"], .m-fit .m-primary { min-height: 48px !important; }
  /* a tab group inside a title row stays a wrapping row of pills */
  .m-fit .m-header .m-wrap { flex-direction: row !important; flex-wrap: wrap !important; }
  .m-fit .m-header .m-wrap button { width: auto !important; flex: 1 1 auto; }
  .m-fit .m-pills { display: flex !important; flex-wrap: wrap; gap: 8px; padding: 0 !important; background: none !important; border: none !important; position: static !important; }
  .m-fit .m-pills > * { border: 1px solid #2e3452 !important; border-radius: 4px; min-height: 44px; gap: 8px; padding: 8px 12px !important; }
  /* financial statements keep label | amount lines: the label wraps, the amount stays right */
  .m-fit .m-statement [style*="justify-content: space-between"]:not(.m-nowrap):not(:has(input, select, textarea)) { flex-wrap: nowrap !important; align-items: flex-start !important; }
  .m-fit .m-statement [style*="justify-content: space-between"]:not(.m-nowrap):not(:has(input, select, textarea)) > :first-child { flex: 1 1 auto; min-width: 0; }
  .m-fit .m-statement [style*="justify-content: space-between"]:not(.m-nowrap):not(:has(input, select, textarea)) > :not(:first-child) { flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; }
  .m-fit button { min-width: 44px; }
  .m-fit a.m-tap { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; padding: 0 8px; }
  .m-scope .m-stack { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; gap: 16px !important; }
  .m-scope .m-stack > * { min-width: 0; }
  .m-fit [style*="gap: 2px"], .m-fit [style*="gap: 3px"], .m-fit [style*="gap: 4px"], .m-fit [style*="gap: 5px"], .m-fit [style*="gap: 6px"] { gap: 8px !important; }
  .m-fit [style*="white-space: nowrap"]:not(td):not(th) { white-space: normal !important; }
  .m-fit button { white-space: normal; }
  .m-fit svg, .m-fit canvas, .m-fit img { height: auto; }
  .m-fit td.m-auto-actions { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 0 0 !important; }
  .m-fit td.m-auto-actions::before { display: none; }
  .m-fit td.m-auto-actions > div { display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 8px !important; width: 100%; }
  .m-fit td.m-auto-actions button { width: 100%; }
  .m-fit :is(td.m-actions, td.m-auto-actions) a { display: flex; align-items: center; justify-content: center; min-height: 44px; border: 1px solid #2e3452; border-radius: 4px; }
  .m-fit table:not(.m-keep) tr > td.m-auto-key {
    grid-column: 2; grid-row: 1; text-align: right !important;
    font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; max-width: 55vw;
  }
  .m-fit table:not(.m-keep) tr > td.m-auto-key::before { float: none; display: block; width: auto; margin: 0; text-align: right; }
  .m-fit [role=button], .m-fit tr[style*="cursor: pointer"], .m-fit div[style*="cursor: pointer"] { min-height: 44px; }
}`

// Column headers that name a row's key money figure (fit mode only), most
// telling first: a row with "Paid" and "Outstanding" leads with what is owed.
const KEY_HEADERS = ['outstanding', 'balance', 'net pay', 'net', 'amount', 'amount (₦)', 'total', 'total (₦)', 'value', 'cost', 'true margin', 'margin', 'revenue', 'due', 'paid']

const setClass = (el, cls, on) => { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on) }

// Fit mode: infer the key figure and the action cell for tables that don't
// mark them explicitly.
function inferRoles(table, headers) {
  const explicitKey = !!table.querySelector('td.m-key')
  const explicitActions = !!table.querySelector('td.m-actions')
  const norm = headers.map(h => h.replace(/[↑↓▲▼]/g, '').trim().toLowerCase())
  const keyName = explicitKey ? null : KEY_HEADERS.find(k => norm.includes(k))
  const keyCol = keyName ? norm.indexOf(keyName) : -1
  Array.from(table.tBodies).forEach(body => Array.from(body.rows).forEach(tr => {
    let col = 0
    Array.from(tr.cells).forEach(td => {
      const span = td.colSpan || 1
      const onlyButtons = !explicitActions && td.querySelector('button') &&
        !Array.from(td.querySelectorAll('*')).some(el => el.tagName !== 'BUTTON' && el.tagName !== 'A' && !el.closest('button, a') && el.children.length === 0 && el.textContent.trim()) &&
        !Array.from(td.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())
      setClass(td, 'm-auto-actions', !!onlyButtons)
      setClass(td, 'm-auto-key', span === 1 && col === keyCol && !td.classList.contains('m-title') && !tr.querySelector('td.m-key'))
      col += span
    })
  }))
}

// Copies each column header onto its cells as data-label so the stacked rows
// can show "LABEL value" pairs. Re-runs whenever the rows change.
function syncLabels(root, fit) {
  root.querySelectorAll('table:not(.m-keep)').forEach(table => {
    const headRow = table.tHead?.rows[table.tHead.rows.length - 1]
    const headers = []
    if (headRow) {
      Array.from(headRow.cells).forEach(th => {
        const text = th.textContent.trim()
        for (let i = 0; i < (th.colSpan || 1); i++) headers.push(text)
      })
    }
    const bodies = [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])]
    bodies.forEach(body => Array.from(body.rows).forEach(tr => {
      let col = 0
      Array.from(tr.cells).forEach(td => {
        const span = td.colSpan || 1
        const label = span === 1 ? (headers[col] ?? '') : ''
        if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label)
        col += span
      })
    }))
    if (fit) inferRoles(table, headers)
  })
}

// On a phone, master/detail panels stack, so the detail opened by tapping a
// row can be far below it. Call after selecting to bring it into view.
export function revealOnPhone(id) {
  if (typeof window === 'undefined' || window.innerWidth > 768) return
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

export default function MobileScope({ children, fit = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let frame = 0
    const run = () => { frame = 0; syncLabels(root, fit) }
    run()
    // childList/characterData only: our own attribute writes never retrigger it.
    const obs = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(run) })
    obs.observe(root, { childList: true, subtree: true, characterData: true })
    return () => { obs.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [fit])
  return (
    <div ref={ref} className={fit ? 'm-scope m-fit' : 'm-scope'}>
      <style>{CSS}</style>
      {children}
    </div>
  )
}
