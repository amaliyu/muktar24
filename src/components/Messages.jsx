import React, { useState, useEffect, useRef, useCallback } from 'react'
import { messagesService } from '../services/messages'

const theme = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21263a", border: "#2e3452",
  accent: "#f5a623", green: "#2dd4a0", red: "#f06b6b",
  blue: "#5b8dee", text: "#e8eaf0", textMuted: "#7c839e",
}

function formatMsgTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date().toISOString().split('T')[0]
  const msgDay = iso.split('T')[0]
  if (msgDay === today) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (msgDay === yesterday.toISOString().split('T')[0]) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const Spinner = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
)

const AlertBar = ({ msg, type = 'error', onClose }) => (
  <div style={{
    padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
    background: (type === 'success' ? theme.green : theme.red) + '22',
    border: `1px solid ${(type === 'success' ? theme.green : theme.red)}44`,
    color: type === 'success' ? theme.green : theme.red,
    fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  }}>
    <span>{msg}</span>
    <span onClick={onClose} style={{ cursor: 'pointer', marginLeft: '12px', fontWeight: '700' }}>✕</span>
  </div>
)

const s = {
  card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px' },
  btn: (v = 'primary') => ({
    padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    border: v === 'secondary' ? `1px solid ${theme.border}` : 'none',
    background: v === 'primary' ? theme.accent : v === 'ghost' ? 'none' : theme.surface,
    color: v === 'primary' ? '#000' : v === 'ghost' ? theme.textMuted : theme.textMuted,
  }),
  input: {
    background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px',
    padding: '9px 12px', fontSize: '13px', color: theme.text, width: '100%',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  label: { fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '5px', display: 'block' },
}

const Messages = ({ userProfile, onUnreadChange }) => {
  const [view, setView] = useState('inbox')
  const [conversations, setConversations] = useState([])
  const [selectedConv, setSelectedConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [alert, setAlert] = useState(null)

  const [showNewConv, setShowNewConv] = useState(false)
  const [newConvType, setNewConvType] = useState('dm')
  const [allUsers, setAllUsers] = useState([])
  const [dmTarget, setDmTarget] = useState('')
  const [groupMembers, setGroupMembers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)

  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const loadInbox = useCallback(async () => {
    if (!userProfile) return
    try {
      const data = await messagesService.getInbox(userProfile.id)
      setConversations(data)
      onUnreadChange?.(data.reduce((sum, c) => sum + (c.unread || 0), 0))
    } catch (e) {
      setAlert({ type: 'error', msg: 'Failed to load messages: ' + e.message })
    } finally {
      setLoading(false)
    }
  }, [userProfile, onUnreadChange])

  useEffect(() => {
    if (!userProfile) return
    setLoading(true)
    loadInbox()
    messagesService.getAllUsers(userProfile.id).then(setAllUsers).catch(() => {})
  }, [userProfile])

  // Scroll to bottom when messages change or entering thread view
  useEffect(() => {
    if (view === 'thread') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, view])

  const openThread = async (conv) => {
    setSelectedConv(conv)
    setView('thread')
    setThreadLoading(true)
    setMessages([])
    setBody('')
    try {
      const msgs = await messagesService.getMessages(conv.id)
      setMessages(msgs)
      await messagesService.markAsRead(conv.id, userProfile.id)
      setConversations(prev => {
        const updated = prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c)
        onUnreadChange?.(updated.reduce((sum, c) => sum + (c.unread || 0), 0))
        return updated
      })
    } catch (e) {
      setAlert({ type: 'error', msg: 'Failed to load thread: ' + e.message })
    } finally {
      setThreadLoading(false)
    }
  }

  const backToInbox = () => {
    setView('inbox')
    setSelectedConv(null)
    setMessages([])
    setBody('')
    loadInbox()
  }

  const handleSend = async () => {
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const msg = await messagesService.sendMessage(selectedConv.id, userProfile.id, trimmed)
      setMessages(prev => [...prev, msg])
      setBody('')
      textareaRef.current?.focus()
    } catch (e) {
      setAlert({ type: 'error', msg: 'Failed to send: ' + e.message })
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCreate = async () => {
    if (newConvType === 'dm') {
      if (!dmTarget) return setAlert({ type: 'error', msg: 'Select a person to message.' })
    } else {
      if (!groupName.trim()) return setAlert({ type: 'error', msg: 'Group name is required.' })
      if (groupMembers.length < 2) return setAlert({ type: 'error', msg: 'A group requires at least 2 other members.' })
    }
    setCreating(true)
    try {
      let convId
      if (newConvType === 'dm') {
        convId = await messagesService.createDM(userProfile.id, dmTarget)
      } else {
        convId = await messagesService.createGroup(userProfile.id, groupMembers, groupName.trim())
      }
      setShowNewConv(false)
      setDmTarget('')
      setGroupMembers([])
      setGroupName('')

      const fresh = await messagesService.getInbox(userProfile.id)
      setConversations(fresh)
      onUnreadChange?.(fresh.reduce((sum, c) => sum + (c.unread || 0), 0))

      const target = fresh.find(c => c.id === convId)
      if (target) openThread(target)
    } catch (e) {
      setAlert({ type: 'error', msg: 'Failed to create conversation: ' + e.message })
    } finally {
      setCreating(false)
    }
  }

  const toggleGroupMember = (uid) =>
    setGroupMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])

  if (!userProfile) return null
  if (loading) return <Spinner />

  return (
    <div>
      {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* ── INBOX ─────────────────────────────────────── */}
      {view === 'inbox' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>Messages</div>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '3px' }}>Internal team communications</div>
            </div>
            <button style={s.btn('primary')} onClick={() => { setNewConvType('dm'); setAlert(null); setShowNewConv(true); }}>
              + New Message
            </button>
          </div>

          {conversations.length === 0 ? (
            <div style={{ ...s.card, padding: '48px', textAlign: 'center', color: theme.textMuted, fontSize: '14px' }}>
              No conversations yet — start one with the button above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => openThread(conv)}
                  style={{
                    ...s.card, padding: '14px 18px', cursor: 'pointer',
                    borderLeft: `3px solid ${conv.unread > 0 ? theme.accent : 'transparent'}`,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        {conv.is_group && (
                          <span style={{ fontSize: '10px', fontWeight: '700', background: theme.blue + '22', color: theme.blue, padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', flexShrink: 0 }}>Group</span>
                        )}
                        <span style={{ fontWeight: '700', color: theme.text, fontSize: '14px' }}>{conv.name}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>
                        {conv.lastMessage ? conv.lastMessage.body : <em>No messages yet</em>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', marginLeft: '16px', flexShrink: 0 }}>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                        {conv.lastMessage ? formatMsgTime(conv.lastMessage.created_at) : ''}
                      </div>
                      {conv.unread > 0 && (
                        <span style={{ background: theme.red, color: '#fff', fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 7px', minWidth: '20px', textAlign: 'center' }}>
                          {conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── THREAD ────────────────────────────────────── */}
      {view === 'thread' && selectedConv && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <button onClick={backToInbox} style={{ ...s.btn('ghost'), padding: '6px 10px', fontSize: '18px', lineHeight: 1 }}>←</button>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{selectedConv.name}</div>
              {selectedConv.is_group && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {selectedConv.participants?.length || 0} members
                </div>
              )}
            </div>
          </div>

          {/* Message list */}
          <div style={{ ...s.card, marginBottom: '12px' }}>
            <div style={{
              padding: '16px', overflowY: 'auto',
              maxHeight: 'calc(100vh - 340px)', minHeight: '220px',
              display: 'flex', flexDirection: 'column', gap: '2px',
            }}>
              {threadLoading ? (
                <Spinner />
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: theme.textMuted, fontSize: '13px', padding: '32px' }}>
                  No messages yet — say hello!
                </div>
              ) : (
                messages.map(msg => {
                  const isOwn = msg.sender_id === userProfile.id
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: '6px' }}>
                      {!isOwn && selectedConv.is_group && (
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '3px', paddingLeft: '4px' }}>
                          {msg.sender?.full_name || 'Unknown'}
                        </div>
                      )}
                      <div style={{
                        maxWidth: '65%',
                        background: isOwn ? theme.accent + '1a' : theme.surface,
                        border: `1px solid ${isOwn ? theme.accent + '55' : theme.border}`,
                        borderRadius: isOwn ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        padding: '10px 14px',
                        fontSize: '13px', color: theme.text,
                      }}>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5' }}>{msg.body}</div>
                        <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '5px', textAlign: isOwn ? 'right' : 'left' }}>
                          {formatMsgTime(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Compose box */}
          <div style={{ ...s.card, padding: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                rows={2}
                style={{ ...s.input, flex: 1, resize: 'none', lineHeight: '1.5' }}
              />
              <button
                onClick={handleSend}
                disabled={!body.trim() || sending}
                style={{ ...s.btn('primary'), padding: '10px 20px', whiteSpace: 'nowrap', opacity: (!body.trim() || sending) ? 0.5 : 1 }}
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── NEW CONVERSATION MODAL ─────────────────────── */}
      {showNewConv && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>New Conversation</div>
              <button onClick={() => { setShowNewConv(false); setAlert(null); }} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>✕</button>
            </div>

            {/* DM / Group toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {['dm', 'group'].map(t => (
                <button key={t} onClick={() => { setNewConvType(t); setAlert(null); }} style={{
                  padding: '7px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                  border: `1px solid ${newConvType === t ? theme.accent : theme.border}`,
                  background: newConvType === t ? theme.accent + '22' : theme.surface,
                  color: newConvType === t ? theme.accent : theme.textMuted,
                }}>
                  {t === 'dm' ? 'Direct Message' : 'Group Chat'}
                </button>
              ))}
            </div>

            {alert && <AlertBar msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

            {newConvType === 'dm' ? (
              <div style={{ marginBottom: '20px' }}>
                <label style={s.label}>Send to</label>
                <select value={dmTarget} onChange={e => setDmTarget(e.target.value)} style={s.input}>
                  <option value="">— Select a person —</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Group Name</label>
                  <input
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    placeholder="e.g. Production Team"
                    style={s.input}
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={s.label}>
                    Members&nbsp;
                    <span style={{ fontWeight: '400', color: groupMembers.length >= 2 ? theme.green : theme.textMuted }}>
                      ({groupMembers.length} selected — need at least 2)
                    </span>
                  </label>
                  <div style={{ maxHeight: '220px', overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '6px' }}>
                    {allUsers.length === 0 ? (
                      <div style={{ padding: '12px', color: theme.textMuted, fontSize: '13px' }}>Loading users…</div>
                    ) : (
                      allUsers.map(u => (
                        <label key={u.id} style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                          cursor: 'pointer', borderRadius: '6px',
                          background: groupMembers.includes(u.id) ? theme.accent + '11' : 'transparent',
                        }}>
                          <input
                            type="checkbox"
                            checked={groupMembers.includes(u.id)}
                            onChange={() => toggleGroupMember(u.id)}
                            style={{ accentColor: theme.accent, width: '14px', height: '14px', flexShrink: 0 }}
                          />
                          <span style={{ color: theme.text, fontSize: '13px', flex: 1 }}>{u.full_name}</span>
                          <span style={{ color: theme.textMuted, fontSize: '11px' }}>{u.role}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNewConv(false); setAlert(null); }} style={s.btn('secondary')}>Cancel</button>
              <button onClick={handleCreate} disabled={creating} style={{ ...s.btn('primary'), opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Creating…' : newConvType === 'dm' ? 'Open Chat' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Messages
