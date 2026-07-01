import React, { useCallback, useEffect, useRef, useState } from 'react';
import { kioskService } from '../services/kioskService';
import { supabase } from '../lib/supabase';

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const IDB_NAME = 'apc_kiosk_v1';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ({ target: { result: db } }) => {
      if (!db.objectStoreNames.contains('staff_cache'))
        db.createObjectStore('staff_cache', { keyPath: 'staff_id' });
      if (!db.objectStoreNames.contains('punch_queue'))
        db.createObjectStore('punch_queue', { keyPath: 'local_id', autoIncrement: true });
    };
    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror   = ({ target: { error  } }) => reject(error);
    req.onblocked = () => reject(new Error('IDB blocked'));
  });
}

function idbGetAll(db, store) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(db, store, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbClear(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

// ─── Crypto / photo helpers ───────────────────────────────────────────────────

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function captureFrame(videoEl) {
  if (!videoEl || videoEl.readyState < 2) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width  = videoEl.videoWidth  || 320;
  canvas.height = videoEl.videoHeight || 240;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.75));
}

// ─── Style constants ──────────────────────────────────────────────────────────

const pinBtnStyle = {
  padding: '16px 0', fontSize: 22, fontWeight: 600, borderRadius: 8,
  border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff',
  color: '#111827', touchAction: 'manipulation', userSelect: 'none',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AttendanceKiosk({ userProfile }) {
  const isHR = ['hr_officer', 'md'].includes(userProfile?.role);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mode, setMode]                   = useState('scan');   // 'scan' | 'pin'
  const [barcodeOk, setBarcodeOk]         = useState(null);     // null | true | false
  const [punchType, setPunchType]         = useState('IN');
  const [pinDisplay, setPinDisplay]       = useState([]);       // dot display only
  const [online, setOnline]               = useState(navigator.onLine);
  const [queueCount, setQueueCount]       = useState(0);
  const [lastSync, setLastSync]           = useState(null);
  const [syncing, setSyncing]             = useState(false);
  const [toast, setToast]                 = useState(null);     // { msg, ok }
  const [overOpen, setOverOpen]           = useState(false);
  const [overStaffId, setOverStaffId]     = useState('');
  const [overPunchType, setOverPunchType] = useState('IN');
  const [overSaving, setOverSaving]       = useState(false);
  const [liveStaff, setLiveStaff]         = useState([]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const dbRef            = useRef(null);
  const videoRef         = useRef(null);
  const staffByEmpRef    = useRef({});   // employee_number → { staff_id, employee_number, pin_hash }
  const punchTypeRef     = useRef('IN');
  const debounceRef      = useRef(null); // barcode scan debounce
  const isSyncingRef     = useRef(false);
  const scanRafRef       = useRef(null);
  const pinDigitsRef     = useRef([]);   // authoritative PIN buffer (avoids stale-closure in async)
  const handleBarcodeRef = useRef(null); // updated each render
  const doFlushRef       = useRef(null); // updated each render

  // ── Keep punchTypeRef current ─────────────────────────────────────────────
  useEffect(() => { punchTypeRef.current = punchType; }, [punchType]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Refresh queue count ───────────────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    if (!dbRef.current) return;
    const q = await idbGetAll(dbRef.current, 'punch_queue');
    setQueueCount(q.length);
  }, []);

  // ── Flush IDB queue to Supabase ───────────────────────────────────────────
  const doFlush = useCallback(async () => {
    if (!navigator.onLine || !dbRef.current || isSyncingRef.current) return;
    const queue = await idbGetAll(dbRef.current, 'punch_queue');
    if (!queue.length) return;
    isSyncingRef.current = true;
    setSyncing(true);
    try {
      for (const entry of queue) {
        const { local_id, photo_blob, ...row } = entry;
        if (photo_blob) {
          const path = `punches/${row.staff_id}/${row.punch_time.replace(/[:.]/g, '-')}.jpg`;
          const stored = await kioskService.uploadPhoto(photo_blob, path);
          if (stored) row.photo_storage_path = stored;
        }
        await kioskService.uploadPunches([row]);
        await idbDelete(dbRef.current, 'punch_queue', local_id);
      }
      setLastSync(new Date());
    } catch { /* leave remaining entries for next sync */ }
    finally {
      isSyncingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => { doFlushRef.current = doFlush; }, [doFlush]);

  // ── Queue punch → IDB then attempt immediate upload ───────────────────────
  const queuePunch = useCallback(async (staffId, photoBlob, method) => {
    if (!dbRef.current) return;
    await idbPut(dbRef.current, 'punch_queue', {
      staff_id:            staffId,
      punch_time:          new Date().toISOString(),
      punch_type:          punchTypeRef.current,
      verification_method: method,
      device_source:       'kiosk_web',
      photo_blob:          photoBlob || null,
    });
    await refreshCount();
    doFlushRef.current?.();
  }, [refreshCount]);

  // ── Barcode handler ───────────────────────────────────────────────────────
  const handleBarcode = useCallback((rawValue) => {
    if (debounceRef.current) return;
    debounceRef.current = setTimeout(() => { debounceRef.current = null; }, 3000);
    const cached = staffByEmpRef.current[rawValue];
    if (!cached) { showToast(`Barcode "${rawValue}" not in roster`, false); return; }
    captureFrame(videoRef.current).then(blob => {
      queuePunch(cached.staff_id, blob, 'barcode').then(() => {
        showToast(`${punchTypeRef.current}: ${rawValue}`);
      });
    });
  }, [queuePunch, showToast]);

  useEffect(() => { handleBarcodeRef.current = handleBarcode; }, [handleBarcode]);

  // ── Sync pins from server into IDB ────────────────────────────────────────
  const syncPins = useCallback(async () => {
    if (!navigator.onLine || !dbRef.current) return;
    try {
      const pins = await kioskService.syncPins();
      await idbClear(dbRef.current, 'staff_cache');
      for (const row of pins) await idbPut(dbRef.current, 'staff_cache', row);
      const map = {};
      pins.forEach(r => { map[r.employee_number] = r; });
      staffByEmpRef.current = map;
    } catch { /* keep stale cache */ }
  }, []);

  // ── Init: IDB + camera + barcode scan ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let stream    = null;

    (async () => {
      try {
        const db = await openDB();
        if (cancelled) return;
        dbRef.current = db;

        const cached = await idbGetAll(db, 'staff_cache');
        const map = {};
        cached.forEach(r => { map[r.employee_number] = r; });
        staffByEmpRef.current = map;

        const q = await idbGetAll(db, 'punch_queue');
        setQueueCount(q.length);

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          });
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch { stream = null; }

        if ('BarcodeDetector' in window && !cancelled) {
          setBarcodeOk(true);
          const detector = new BarcodeDetector({ formats: ['code_128'] });
          const scan = async () => {
            if (cancelled) return;
            if (videoRef.current && videoRef.current.readyState >= 2) {
              try {
                const codes = await detector.detect(videoRef.current);
                if (codes.length) handleBarcodeRef.current?.(codes[0].rawValue);
              } catch { /* ignore */ }
            }
            scanRafRef.current = requestAnimationFrame(scan);
          };
          requestAnimationFrame(scan);
        } else if (!cancelled) {
          setBarcodeOk(false);
          setMode('pin');
        }

        if (navigator.onLine) {
          syncPins();
          setTimeout(() => doFlushRef.current?.(), 800);
        }
      } catch (err) {
        if (!cancelled) showToast('Init failed: ' + err.message, false);
      }
    })();

    return () => {
      cancelled = true;
      if (scanRafRef.current) cancelAnimationFrame(scanRafRef.current);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Network / visibility sync triggers ───────────────────────────────────
  useEffect(() => {
    const onOnline  = () => { setOnline(true);  doFlushRef.current?.(); syncPins(); };
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') doFlushRef.current?.(); };
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(() => doFlushRef.current?.(), 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poll);
    };
  }, [syncPins]);

  // ── PIN digit handler ─────────────────────────────────────────────────────
  const handlePinDigit = useCallback(async (digit) => {
    const next = [...pinDigitsRef.current, digit];
    pinDigitsRef.current = next;
    setPinDisplay([...next]);
    if (next.length < 4) return;

    const hash  = await sha256hex(next.join(''));
    const match = Object.values(staffByEmpRef.current).find(s => s.pin_hash === hash);

    if (match) {
      pinDigitsRef.current = [];
      setPinDisplay([]);
      const blob = await captureFrame(videoRef.current);
      await queuePunch(match.staff_id, blob, 'pin');
      showToast(`${punchTypeRef.current}: ${match.employee_number}`);
    } else if (next.length >= 6) {
      pinDigitsRef.current = [];
      setPinDisplay([]);
      showToast('PIN not recognised', false);
    }
    // length 4 or 5 with no match — keep collecting
  }, [queuePunch, showToast]);

  const clearPin = useCallback(() => {
    pinDigitsRef.current = [];
    setPinDisplay([]);
  }, []);

  const backspacePin = useCallback(() => {
    const next = pinDigitsRef.current.slice(0, -1);
    pinDigitsRef.current = next;
    setPinDisplay([...next]);
  }, []);

  // ── HR override: open panel ───────────────────────────────────────────────
  const openOverride = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('staff_public')
        .select('id, full_name, employee_number')
        .order('full_name');
      setLiveStaff(data || []);
    } catch { setLiveStaff([]); }
    setOverStaffId('');
    setOverPunchType('IN');
    setOverOpen(true);
  }, []);

  // ── HR override: submit ───────────────────────────────────────────────────
  const submitOverride = useCallback(async () => {
    if (!overStaffId) { showToast('Select a staff member', false); return; }
    setOverSaving(true);
    try {
      await kioskService.uploadPunches([{
        staff_id:            overStaffId,
        punch_time:          new Date().toISOString(),
        punch_type:          overPunchType,
        verification_method: 'manual_override',
        device_source:       'kiosk_web',
        recorded_by_user:    userProfile?.id,
      }]);
      showToast(`Manual ${overPunchType} recorded`);
      setOverOpen(false);
    } catch (e) {
      showToast(e.message || 'Upload failed', false);
    } finally {
      setOverSaving(false);
    }
  }, [overStaffId, overPunchType, userProfile, showToast]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: '100dvh', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f3f4f6', borderRadius: 8, padding: '6px 12px' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{online ? 'Online' : 'Offline'}</span>
        {queueCount > 0 && <span style={{ color: '#b45309' }}>Queue: {queueCount}</span>}
        {lastSync && (
          <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 11 }}>
            Synced {lastSync.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={() => doFlushRef.current?.()}
          disabled={!online || syncing}
          style={{
            marginLeft: lastSync ? 0 : 'auto',
            fontSize: 12, padding: '2px 8px', borderRadius: 4,
            border: '1px solid #d1d5db', cursor: online && !syncing ? 'pointer' : 'not-allowed',
            background: '#fff',
          }}
        >
          {syncing ? '…' : '↑ Sync'}
        </button>
      </div>

      {/* ── Punch type toggle ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
        {['IN', 'OUT'].map(t => (
          <button key={t} onClick={() => setPunchType(t)} style={{
            flex: 1, padding: '14px 0', fontSize: 20, fontWeight: 700,
            border: 'none', cursor: 'pointer', touchAction: 'manipulation',
            background: punchType === t ? (t === 'IN' ? '#16a34a' : '#dc2626') : '#f9fafb',
            color: punchType === t ? '#fff' : '#9ca3af',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Camera view ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', borderRadius: 10, overflow: 'hidden',
        background: '#111', aspectRatio: '4/3',
        display: (mode === 'pin' && barcodeOk === false) ? 'none' : 'block',
      }}>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {mode === 'scan' && barcodeOk && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ border: '3px solid rgba(255,255,255,0.85)', borderRadius: 8, width: '70%', height: '28%' }} />
            <p style={{ color: '#fff', margin: '8px 0 0', fontSize: 13, textShadow: '0 1px 2px #000' }}>
              Hold barcode steady
            </p>
          </div>
        )}
        {mode === 'pin' && barcodeOk === true && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#d1fae5', margin: 0, fontSize: 13 }}>Camera ready for photo capture</p>
          </div>
        )}
      </div>

      {/* ── Mode tabs (only when BarcodeDetector available) ──────────────── */}
      {barcodeOk === true && (
        <div style={{ display: 'flex', gap: 8 }}>
          {[['scan', 'Barcode Scan'], ['pin', 'PIN Entry']].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8,
              border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 14,
              fontWeight: mode === m ? 700 : 400,
              background: mode === m ? '#2563eb' : '#f9fafb',
              color: mode === m ? '#fff' : '#374151',
            }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {barcodeOk === false && (
        <p style={{ margin: 0, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
          BarcodeDetector not available — PIN entry active
        </p>
      )}

      {/* ── PIN pad ───────────────────────────────────────────────────────── */}
      {mode === 'pin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ textAlign: 'center', letterSpacing: 12, fontSize: 26, padding: '10px 0', userSelect: 'none' }}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} style={{ color: i < pinDisplay.length ? '#2563eb' : '#d1d5db' }}>
                {i < pinDisplay.length ? '●' : '○'}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => handlePinDigit(String(n))} style={pinBtnStyle}>{n}</button>
            ))}
            <button onClick={clearPin}    style={{ ...pinBtnStyle, background: '#fee2e2', color: '#dc2626' }}>C</button>
            <button onClick={() => handlePinDigit('0')} style={pinBtnStyle}>0</button>
            <button onClick={backspacePin} style={{ ...pinBtnStyle, background: '#f3f4f6', fontSize: 18 }}>⌫</button>
          </div>
        </div>
      )}

      {/* ── HR Manual Override ─────────────────────────────────────────────── */}
      {isHR && !overOpen && (
        <button
          onClick={openOverride}
          style={{
            marginTop: 'auto', padding: '10px 0', borderRadius: 8,
            border: '1px solid #d1d5db', background: '#f9fafb',
            cursor: 'pointer', fontSize: 14, color: '#374151',
          }}
        >
          Manual Override (HR)
        </button>
      )}

      {isHR && overOpen && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 15 }}>Manual Override</strong>
            <button onClick={() => setOverOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af', lineHeight: 1 }}>✕</button>
          </div>
          <select
            value={overStaffId}
            onChange={e => setOverStaffId(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%' }}
          >
            <option value="">— Select staff —</option>
            {liveStaff.map(s => (
              <option key={s.id} value={s.id}>{s.full_name} ({s.employee_number})</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            {['IN', 'OUT'].map(t => (
              <button key={t} onClick={() => setOverPunchType(t)} style={{
                flex: 1, padding: '8px 0', borderRadius: 6,
                border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: 700,
                background: overPunchType === t ? (t === 'IN' ? '#16a34a' : '#dc2626') : '#f9fafb',
                color: overPunchType === t ? '#fff' : '#6b7280',
              }}>
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={submitOverride}
            disabled={overSaving || !overStaffId}
            style={{
              padding: '11px 0', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 700,
              cursor: overSaving || !overStaffId ? 'not-allowed' : 'pointer',
              background: !overStaffId ? '#e5e7eb' : '#2563eb',
              color: !overStaffId ? '#9ca3af' : '#fff',
            }}
          >
            {overSaving ? 'Recording…' : `Record ${overPunchType}`}
          </button>
        </div>
      )}

      {/* ── Toast overlay ─────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? '#15803d' : '#dc2626',
          color: '#fff', padding: '14px 28px', borderRadius: 12,
          fontSize: 16, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          zIndex: 9999, pointerEvents: 'none', maxWidth: '90vw', textAlign: 'center',
        }}>
          {toast.msg}
        </div>
      )}

      {/* NOTE: reconcile_attendance_punches(date) must be scheduled via pg_cron — pending MD decision */}
    </div>
  );
}
