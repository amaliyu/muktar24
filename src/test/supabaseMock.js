// Minimal chainable stand-in for the supabase-js query builder, for service
// tests. Every call is recorded on `calls`; the awaited result of a chain is
// produced by `resolve(table, ops)` (default: { data: [], error: null }).
// RPCs resolve through the same function as `resolve('rpc:<name>', args)`.
export function createSupabaseMock(resolve = () => ({ data: [], error: null })) {
  const calls = []
  const from = (table) => {
    const ops = []
    const builder = {}
    for (const m of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit', 'not', 'is']) {
      builder[m] = (...args) => { ops.push([m, ...args]); return builder }
    }
    const settle = () => { calls.push({ table, ops }); return Promise.resolve(resolve(table, ops)) }
    builder.single = () => { ops.push(['single']); return settle() }
    builder.maybeSingle = () => { ops.push(['maybeSingle']); return settle() }
    builder.then = (onOk, onErr) => settle().then(onOk, onErr)
    return builder
  }
  const rpc = (fn, args) => {
    calls.push({ rpc: fn, args })
    return Promise.resolve(resolve(`rpc:${fn}`, args))
  }
  return { supabase: { from, rpc }, calls }
}

// The first op of a given kind in a recorded call, e.g. op(call, 'insert').
export const op = (call, kind) => call.ops.find(o => o[0] === kind)
