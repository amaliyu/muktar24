import { useState, useEffect, useRef, useCallback } from 'react'
import { notificationsService } from '../services/notifications'

const theme = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21263a", border: "#2e3452",
  text: "#e8eaf0", textMuted: "#6b7280", accent: "#f5a623",
  green: "#2dd4a0", red: "#f06b6b", blue: "#5b8dee",
}

const TYPE_META = {
  action_required: { color: '#f5a623', label: 'Action Required' },
  approved:        { color: '#2dd4a0', label: 'Approved' },
  rejected:        { color: '#f06b6b', label: 'Rejected' },
  info:            { color: '#5b8dee', label: 'Info' },
}

// Map notification related_table → page id
const TABLE_PAGE = {
  payment_requests:     'payment_requests',
  weekly_labour_payroll: 'labour',
  lpo_orders:           'lpo_approvals',
  delivery_schedules:   'schedule_approvals',
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function BellIcon({ hasUnread }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {hasUnread && <circle cx="18" cy="5" r="4" fill="#f06b6b" stroke="none" />}
    </svg>
  )
}

export default function NotificationBell({ userProfile, onNavigate, isMobile }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef(null)

  const loadCount = useCallback(() => {
    if (!userProfile?.id) return
    notificationsService.getUnreadCount(userProfile.id)
      .then(setUnreadCount)
      .catch(() => {})
  }, [userProfile?.id])

  const loadNotifications = useCallback(async () => {
    if (!userProfile?.id) return
    setLoading(true)
    try {
      const data = await notificationsService.getRecent(userProfile.id, 30)
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.read_at).length)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [userProfile?.id])

  // Poll unread count every 45s
  useEffect(() => {
    loadCount()
    const interval = setInterval(loadCount, 45000)
    return () => clearInterval(interval)
  }, [loadCount])

  // Load full list when dropdown opens
  useEffect(() => {
    if (open) loadNotifications()
  }, [open, loadNotifications])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleMarkAllRead = async () => {
    if (!userProfile?.id) return
    try {
      await notificationsService.markAllRead(userProfile.id)
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // silent
    }
  }

  const handleClickNotification = async (n) => {
    // Mark read if not already
    if (!n.read_at) {
      try {
        await notificationsService.markRead(n.id)
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch {
        // silent
      }
    }
    // Navigate if we know the page
    const page = n.related_table ? TABLE_PAGE[n.related_table] : null
    if (page && onNavigate) {
      onNavigate(page)
      setOpen(false)
    }
  }

  if (!userProfile) return null

  const containerStyle = {
    position: 'fixed',
    top: isMobile ? '10px' : '14px',
    right: isMobile ? '12px' : '28px',
    zIndex: 400,
  }

  const buttonStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: unreadCount > 0 ? theme.accent : theme.textMuted,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    transition: 'color 0.2s',
  }

  const badgeStyle = {
    position: 'absolute',
    top: '-5px',
    right: '-5px',
    background: theme.red,
    color: '#fff',
    fontSize: '9px',
    fontWeight: '700',
    borderRadius: '10px',
    padding: '1px 4px',
    minWidth: '16px',
    textAlign: 'center',
    lineHeight: '14px',
    pointerEvents: 'none',
  }

  const dropdownStyle = {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: '380px',
    maxWidth: 'calc(100vw - 16px)',
    maxHeight: '480px',
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      <button
        onClick={() => setOpen(o => !o)}
        style={buttonStyle}
        title="Notifications"
      >
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span style={badgeStyle}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={dropdownStyle}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
            <span style={{ fontWeight: '700', fontSize: '13px', color: theme.text }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{ marginLeft: '8px', background: theme.red, color: '#fff', fontSize: '10px', fontWeight: '700', borderRadius: '10px', padding: '1px 6px' }}>{unreadCount}</span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{ background: 'none', border: 'none', color: theme.blue, fontSize: '11px', cursor: 'pointer', fontWeight: '600', padding: '2px 6px' }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>Loading…</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>No notifications yet</div>
            ) : (
              notifications.map(n => {
                const meta = TYPE_META[n.type] || TYPE_META.info
                const isUnread = !n.read_at
                const hasNav = n.related_table && TABLE_PAGE[n.related_table]
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${theme.border}`,
                      cursor: hasNav ? 'pointer' : 'default',
                      background: isUnread ? `${meta.color}08` : 'transparent',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (hasNav) e.currentTarget.style.background = `${meta.color}14` }}
                    onMouseLeave={e => { e.currentTarget.style.background = isUnread ? `${meta.color}08` : 'transparent' }}
                  >
                    {/* Unread dot */}
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isUnread ? meta.color : 'transparent', flexShrink: 0, marginTop: '5px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.label}</span>
                        <span style={{ fontSize: '10px', color: theme.textMuted, marginLeft: 'auto', flexShrink: 0 }}>{relativeTime(n.created_at)}</span>
                      </div>
                      {n.title && (
                        <div style={{ fontSize: '12px', fontWeight: isUnread ? '700' : '600', color: theme.text, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
                      )}
                      {n.body && (
                        <div style={{ fontSize: '11px', color: theme.textMuted, lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.body}</div>
                      )}
                      {hasNav && (
                        <div style={{ fontSize: '10px', color: theme.blue, marginTop: '3px', fontWeight: '600' }}>View →</div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
