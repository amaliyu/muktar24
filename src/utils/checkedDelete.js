// Deletes that report what really happened.
//
// supabase-js .delete() never throws: a failure comes back as { error }, and a
// delete that RLS blocks is not an error at all — it simply removes nothing
// (UNIFIED_MASTER_STATE_AND_PLAN §10.4). So every delete here asks for the
// removed rows back (.select('id')) and treats "fewer removed than expected"
// as a failure, never as success (§10.5).

// Delete the rows of `table` where `column` = `value`. Rows that exist are
// counted first, so "nothing to delete" (fine) and "rows there but none
// removed" (blocked) are told apart. Returns the number removed; throws when
// the delete errors or leaves rows behind.
export async function deleteWhere(client, table, column, value) {
  const { data: found, error: findErr } = await client.from(table).select('id').eq(column, value)
  if (findErr) throw findErr
  const ids = (found || []).map(r => r.id)
  if (!ids.length) return 0
  const { data: gone, error } = await client.from(table).delete().in('id', ids).select('id')
  if (error) throw error
  const removed = gone?.length || 0
  if (removed < ids.length) {
    throw new Error(`${removed} of ${ids.length} removed — you may not have permission to delete it`)
  }
  return removed
}

// Delete exactly one row by id; throws unless that row was removed.
export async function deleteById(client, table, id, emptyMessage) {
  const { data, error } = await client.from(table).delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error(emptyMessage || 'nothing was removed — you may not have permission to delete it, or it was already deleted')
  return data.length
}

const reason = (e) => e?.message || String(e)

// Delete a vehicle maintenance record and the P&L entries made from it, in
// order: linked supplier transaction, linked expense, then the record itself.
// Stops at the first failed step. Returns { ok, message } where the message
// names the step that failed and what is still in place.
export async function deleteMaintenanceRecord(client, record) {
  const expId = record.linked_expense_id
  let txnRemoved = 0
  let expRemoved = 0
  if (expId) {
    try {
      txnRemoved = await deleteWhere(client, 'supplier_transactions', 'linked_expense_id', expId)
    } catch (e) {
      return { ok: false, message: `The maintenance record was not deleted because the linked supplier transaction could not be removed: ${reason(e)}. Nothing was deleted.` }
    }
    try {
      expRemoved = await deleteWhere(client, 'expenses', 'id', expId)
    } catch (e) {
      return {
        ok: false,
        message: `The maintenance record was not deleted because the linked expense could not be removed: ${reason(e)}. ` +
          (txnRemoved ? 'The linked supplier transaction was already removed; the expense and the maintenance record are still in place.' : 'The expense and the maintenance record are still in place.'),
      }
    }
  }
  try {
    await deleteById(client, 'vehicle_maintenance', record.id)
  } catch (e) {
    const done = [expRemoved && 'linked expense', txnRemoved && 'linked supplier transaction'].filter(Boolean)
    return {
      ok: false,
      message: `The maintenance record could not be deleted: ${reason(e)}. ` +
        (done.length ? `Its ${done.join(' and ')} ${done.length > 1 ? 'were' : 'was'} already removed — the record is still in place without them.` : 'Nothing was deleted.'),
    }
  }
  const extras = [expRemoved && 'linked expense', txnRemoved && 'linked supplier transaction'].filter(Boolean)
  return { ok: true, message: extras.length ? `Maintenance record deleted, with its ${extras.join(' and ')}.` : 'Maintenance record deleted.' }
}
