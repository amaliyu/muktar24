const theme = {
  surface: "#1a1d27", border: "#2e3452",
  text: "#e8eaf0", textMuted: "#6b7280", accent: "#f5a623", red: "#f06b6b",
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function MessagesBell({ unreadMsgCount, onNavigate, isMobile }) {
  const containerStyle = {
    position: 'fixed',
    top: isMobile ? '10px' : '14px',
    right: isMobile ? '56px' : '74px',
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
    color: unreadMsgCount > 0 ? theme.accent : theme.textMuted,
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

  return (
    <div style={containerStyle}>
      <button
        onClick={() => onNavigate?.('messages')}
        style={buttonStyle}
        title="Messages"
      >
        <ChatIcon />
        {unreadMsgCount > 0 && (
          <span style={badgeStyle}>{unreadMsgCount > 99 ? '99+' : unreadMsgCount}</span>
        )}
      </button>
    </div>
  )
}
