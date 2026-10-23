// Which machine a production entry carries (production_log.asset_id), given the
// active machines (assets.asset_type = 'machine', status = 'active') at the
// entry's site. Never guess when a site has more than one machine.

// Preselect only when the site has exactly one active machine.
export const defaultMachineId = (machines = []) => (machines.length === 1 ? machines[0].id : '')

// Returns { assetId, error }. error is a message to show instead of saving.
//   machines   — active machines at the form's site (already loaded for it)
//   selectedId — the machine chosen in the form ('' when none)
//   originalId — on edit, the entry's saved machine (may no longer be active
//                at the site; keeping it unchanged is allowed)
export function resolveMachine({ machines = [], selectedId = '', originalId = null } = {}) {
  if (selectedId) {
    if (machines.some(m => m.id === selectedId) || selectedId === originalId) return { assetId: selectedId, error: null }
    return { assetId: null, error: 'The chosen machine is not active at this site. Choose the machine again.' }
  }
  if (machines.length === 0) return { assetId: null, error: null }
  if (machines.length === 1) return { assetId: machines[0].id, error: null }
  return { assetId: null, error: `This site has ${machines.length} active machines. Choose which machine produced these blocks.` }
}
