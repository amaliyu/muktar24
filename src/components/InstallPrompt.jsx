import { useEffect, useState } from 'react';

const DISMISS_KEY = 'apcl_install_dismissed';

const isStandalone = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
  window.navigator?.standalone === true;

const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 3v13" />
    <path d="M7 8l5-5 5 5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

export default function InstallPrompt() {
  const [standalone] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === 'true'
  );
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [ios] = useState(isIOS);

  useEffect(() => {
    if (standalone) return;
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [standalone]);

  if (standalone || dismissed) return null;
  if (!ios && !deferredPrompt) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const cardStyle = {
    position: 'fixed',
    left: '16px',
    right: '16px',
    bottom: '16px',
    maxWidth: '420px',
    margin: '0 auto',
    background: '#21263a',
    border: '1px solid #2e3452',
    color: '#e8eaf0',
    borderRadius: '12px',
    padding: '14px 16px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontFamily: 'inherit',
  };

  const closeBtnStyle = {
    background: 'none',
    border: 'none',
    color: '#7c839e',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px',
    flexShrink: 0,
  };

  if (ios) {
    return (
      <div style={cardStyle} role="dialog" aria-label="Install APCL Manager">
        <ShareIcon />
        <div style={{ flex: 1, fontSize: '13px' }}>
          Tap the Share icon, then <strong>Add to Home Screen</strong> to install APCL Manager.
        </div>
        <button onClick={dismiss} style={closeBtnStyle} aria-label="Dismiss">×</button>
      </div>
    );
  }

  return (
    <div style={cardStyle} role="dialog" aria-label="Install APCL Manager">
      <div style={{ flex: 1, fontSize: '13px' }}>Install APCL Manager for quicker access.</div>
      <button
        onClick={handleInstall}
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
        Install APCL Manager
      </button>
      <button onClick={dismiss} style={closeBtnStyle} aria-label="Dismiss">×</button>
    </div>
  );
}
