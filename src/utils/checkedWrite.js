// A successful HTTP response can still be an RLS-filtered, zero-row write.
export function checkedWrite({ data, error }, expected = 1) {
  if (error) throw error
  const rows = Array.isArray(data) ? data : data ? [data] : []
  if (rows.length !== expected || rows.some(row => !row.id)) {
    throw new Error('Not saved — the expected rows were not returned. You may not have permission to save this record.')
  }
  return data
}
