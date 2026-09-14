import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        background: '#3d1515',
        color: '#f06b6b',
        borderBottom: '1px solid #f06b6b',
        padding: '10px 16px',
        textAlign: 'center',
        fontSize: '13px',
        fontWeight: 600,
        zIndex: 10001,
        boxSizing: 'border-box',
      }}
    >
      No internet connection — data cannot be loaded or saved.
    </div>
  );
}

function UpdateUI() {
  const [collapsed, setCollapsed] = useState(false);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
    },
  });

  if (needRefresh && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          right: '16px',
          bottom: '16px',
          zIndex: 10000,
          background: '#f5a623',
          color: '#1a0e00',
          border: 'none',
          borderRadius: '50%',
          width: '44px',
          height: '44px',
          fontSize: '18px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}
        aria-label="Update available"
        title="A new version of APCL Manager is available"
      >
        ↻
      </button>
    );
  }

  if (needRefresh) {
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          left: '16px',
          right: '16px',
          top: '16px',
          maxWidth: '480px',
          margin: '0 auto',
          background: '#21263a',
          border: '1px solid #f5a623',
          color: '#e8eaf0',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ flex: 1, fontSize: '13px' }}>
          A new version of APCL Manager is available.
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: '#f5a623',
            color: '#1a0e00',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          Reload
        </button>
        <button
          onClick={() => setCollapsed(true)}
          style={{ background: 'none', border: 'none', color: '#7c839e', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '4px' }}
          aria-label="Collapse"
        >
          ×
        </button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div
        role="status"
        style={{
          position: 'fixed',
          left: '16px',
          right: '16px',
          top: '16px',
          maxWidth: '480px',
          margin: '0 auto',
          background: '#21263a',
          border: '1px solid #2dd4a0',
          color: '#e8eaf0',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ flex: 1, fontSize: '13px' }}>APCL Manager is ready to work offline.</div>
        <button
          onClick={() => setOfflineReady(false)}
          style={{ background: 'none', border: 'none', color: '#7c839e', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '4px' }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    );
  }

  return null;
}

export default function UpdatePrompt() {
  return (
    <>
      <OfflineBanner />
      <UpdateUI />
    </>
  );
}
