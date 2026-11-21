import { useEffect, useRef, useState } from 'react'
import { loadFaceEngine } from '../../utils/siteFace'

export const freshFix = fix => fix && Date.now() - fix.at <= 60_000 ? fix : null

export function useLocation(enabled) {
  const [fix, setFix] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) return
    let active = true
    if (!navigator.geolocation) { setError('Location is unavailable in this browser.'); return }
    const id = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
      if (active) {
        setFix({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, at: timestamp })
        setError('')
      }
    }, error => {
      if (!active) return
      setFix(null)
      setError(error.code === 1 ? 'Location is blocked. Allow location in your browser’s site settings, then reopen this page.' : error.message)
    }, { enableHighAccuracy: true, maximumAge: 0 })
    const timer = setInterval(() => setFix(current => freshFix(current)), 1000)
    return () => { active = false; clearInterval(timer); navigator.geolocation.clearWatch(id) }
  }, [enabled])
  return { fix: enabled ? freshFix(fix) : null, error }
}

let device
export function deviceId() {
  if (device) return device
  try { device = localStorage.getItem('apcl-device-id') } catch { /* Keep the ID in memory. */ }
  if (!device) {
    device = crypto.randomUUID()
    try { localStorage.setItem('apcl-device-id', device) } catch { /* Keep the ID in memory. */ }
  }
  return device
}

export function useFaceCamera(enabled, facing) {
  const video = useRef(null)
  const [state, setState] = useState({})
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let stream
    setState({ loading: true })
    async function start() {
      try {
        const engine = await loadFaceEngine()
        if (stopped) return
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('The camera requires a secure page and camera access.')
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } })
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return }
        video.current.srcObject = stream
        await video.current.play()
        if (!stopped) setState({ engine })
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop())
        if (!stopped) setState({ error: error.message })
      }
    }
    start()
    return () => { stopped = true; stream?.getTracks().forEach(track => track.stop()) }
  }, [enabled, facing, retry])
  return { ...state, engine: enabled ? state.engine : null, video, retry: () => setRetry(n => n + 1) }
}
