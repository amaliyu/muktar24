import { supabase } from '../lib/supabase'

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export const staffTasksService = {
  list: async (includeClosed = false) => (await rpc('list_staff_tasks', { p_include_closed: includeClosed })) || [],
  create: ({ assignedTo, title, details, dueOn, checklist }) => rpc('create_staff_task', {
    p_assigned_to: assignedTo, p_title: title, p_details: details || null, p_due_on: dueOn,
    p_checklist: checklist, p_kind: 'manual', p_target_ids: null,
  }),
  tick: (id, key, done) => rpc('tick_staff_task_item', { p_task_id: id, p_key: key, p_done: done }),
  submit: (id, note) => rpc('submit_staff_task', { p_task_id: id, p_note: note || null }),
  review: (id, action, note) => rpc('review_staff_task', {
    p_task_id: id, p_action: action, p_note: note || null,
  }),
  comment: (id, note) => rpc('comment_staff_task', { p_task_id: id, p_note: note }),
}
