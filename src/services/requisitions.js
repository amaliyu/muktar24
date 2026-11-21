import { supabase } from '../lib/supabase'

async function read(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

export const requisitionsService = {
  list(siteId, statuses) {
    let query = supabase.from('client_requisitions').select('*').eq('site_id', siteId)
    if (statuses) query = query.in('status', statuses)
    return read(query.order('created_at', { ascending: false }))
  },
  lines: id => read(supabase.from('client_requisition_lines').select('*').eq('requisition_id', id).order('id')),
  events: id => read(supabase.from('client_requisition_events').select('*').eq('requisition_id', id).order('at', { ascending: false })),
  cycle: id => read(supabase.from('contract_cycles').select('qty_9in,qty_6in').eq('id', id).maybeSingle()),
  materialPosition: siteId => read(supabase.rpc('client_requisition_material_position', { p_site_id: siteId })),
  progress: siteId => read(supabase.rpc('client_requisition_progress', { p_site_id: siteId })),
  supplied: id => read(supabase.rpc('client_requisition_supplied', { p_requisition_id: id })),
  create(siteId, fields) {
    return read(supabase.rpc('create_client_requisition', {
      p_site_id: siteId, p_qty_9in: Number(fields.nine), p_qty_6in: Number(fields.six),
      p_needed_by: fields.neededBy, p_kind: fields.kind, p_notes: fields.notes.trim() || null,
    }))
  },
  saveLine(id, line, quantity) {
    return read(supabase.rpc('set_client_requisition_line', {
      p_requisition_id: id, p_material: line.material, p_qty_requested: quantity,
      p_unit: line.unit, p_description: line.description ?? '',
    }))
  },
  advance: (id, action, fields = {}) => read(supabase.rpc('advance_client_requisition', {
    p_id: id, p_action: action, ...fields,
  })),
}
