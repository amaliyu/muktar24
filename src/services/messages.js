import { supabase } from '../lib/supabase'

export const messagesService = {
  async getAllUsers(currentUserId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .neq('id', currentUserId)
      .order('full_name')
    if (error) throw error
    return data || []
  },

  async getInbox(userId) {
    const { data, error } = await supabase
      .from('conversation_participants')
      .select(`
        last_read_at,
        conversation:conversation_id(
          id, is_group, name, created_at,
          participants:conversation_participants(
            user_id,
            profile:user_id(id, full_name)
          ),
          messages(id, body, created_at, sender_id)
        )
      `)
      .eq('user_id', userId)
    if (error) throw error

    return (data || [])
      .filter(p => p.conversation)
      .map(part => {
        const conv = part.conversation
        const msgs = [...(conv.messages || [])].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        )
        const lastMsg = msgs[0] || null

        let displayName
        if (conv.is_group) {
          displayName = conv.name || 'Group Chat'
        } else {
          const other = (conv.participants || []).find(p => p.user_id !== userId)
          displayName = other?.profile?.full_name || 'Unknown'
        }

        const unread = (conv.messages || []).filter(m => {
          if (!part.last_read_at) return true
          return new Date(m.created_at) > new Date(part.last_read_at)
        }).length

        return {
          id: conv.id,
          is_group: conv.is_group,
          name: displayName,
          lastMessage: lastMsg,
          unread,
          participants: conv.participants || [],
          created_at: conv.created_at,
        }
      })
      .sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.created_at || ''
        const bTime = b.lastMessage?.created_at || b.created_at || ''
        return new Date(bTime) - new Date(aTime)
      })
  },

  async getTotalUnread(userId) {
    const inbox = await this.getInbox(userId)
    return inbox.reduce((s, c) => s + (c.unread || 0), 0)
  },

  async getMessages(conversationId) {
    const { data, error } = await supabase
      .from('messages')
      .select('id, body, created_at, sender_id, sender:sender_id(id, full_name)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  async sendMessage(conversationId, senderId, body) {
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, body })
      .select('id, body, created_at, sender_id, sender:sender_id(id, full_name)')
      .single()
    if (error) throw error
    return data
  },

  async markAsRead(conversationId, userId) {
    const { error } = await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
    if (error) throw error
  },

  async findExistingDM(userId, otherUserId) {
    const { data: myParts } = await supabase
      .from('conversation_participants')
      .select('conversation_id, conversation:conversation_id(is_group)')
      .eq('user_id', userId)

    const myDMIds = (myParts || [])
      .filter(p => p.conversation && !p.conversation.is_group)
      .map(p => p.conversation_id)

    if (myDMIds.length === 0) return null

    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', otherUserId)
      .in('conversation_id', myDMIds)

    return shared?.[0]?.conversation_id || null
  },

  async createDM(userId, otherUserId) {
    const existing = await this.findExistingDM(userId, otherUserId)
    if (existing) return existing

    const { data: conv, error: ce } = await supabase
      .from('conversations')
      .insert({ is_group: false, created_by: userId })
      .select()
      .single()
    if (ce) throw ce

    const { error: pe } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: conv.id, user_id: userId },
        { conversation_id: conv.id, user_id: otherUserId },
      ])
    if (pe) throw pe

    return conv.id
  },

  async createGroup(userId, memberIds, name) {
    const { data: conv, error: ce } = await supabase
      .from('conversations')
      .insert({ is_group: true, name, created_by: userId })
      .select()
      .single()
    if (ce) throw ce

    const allIds = [userId, ...memberIds]
    const { error: pe } = await supabase
      .from('conversation_participants')
      .insert(allIds.map(uid => ({ conversation_id: conv.id, user_id: uid })))
    if (pe) throw pe

    return conv.id
  },
}
