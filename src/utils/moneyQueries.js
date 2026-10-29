export function queryRows(result, label = 'Revenue') {
  if (result.error) throw new Error(`${label} could not be loaded: ${result.error.message || result.error}`)
  return result.data || []
}
export function settledRows(result, label = 'Revenue') {
  if (result.status === 'rejected') throw new Error(`${label} could not be loaded: ${result.reason?.message || result.reason}`)
  return queryRows(result.value, label)
}
