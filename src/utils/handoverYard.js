import { qty as fmtQty } from './siteNotices'

// Warning shown before saving a handover that would take the site yard below
// zero (Phase 7 leftover). Yard figures can lag batch entry, so this only asks
// for confirmation — it never blocks the save.
//   qty      — quantity being handed over
//   balance  — v_site_yard.in_yard for the site + block type (0 when the yard
//              has no row for it); null when the yard could not be read, in
//              which case there is nothing reliable to compare against
// Returns the confirmation text, or null when no warning is needed.
export function handoverYardWarning({ qty, balance, blockType, siteName }) {
  const q = Math.round(Number(qty))
  if (balance == null || !(q > 0)) return null
  const b = Number(balance)
  if (!Number.isFinite(b) || q <= b) return null
  return `This hands over ${fmtQty(q)} but the yard shows only ${fmtQty(b)} ${blockType} at ${siteName}. Save anyway?`
}
