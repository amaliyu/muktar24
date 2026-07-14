import { supabase } from '../lib/supabase'

export const notificationsService = {
  async getRecent(userId, limit = 30) {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, related_table, related_id, read_at, created_at')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  },

  async getUnreadCount(userId) {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null)
    if (error) throw error
    return count || 0
  },

  async markRead(id) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async markAllRead(userId) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .is('read_at', null)
    if (error) throw error
  },
}
