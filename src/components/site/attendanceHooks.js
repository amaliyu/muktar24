import { useEffect, useRef, useState } from 'react'
import { getFaceEngineCheck, loadFaceEngine } from '../../utils/siteFace'

import { siteAttendance } from '../../services/siteAttendance'

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

export function useFaceCamera(enabled, facing, siteId) {
  const video = useRef(null)
  const stopStream = useRef(() => {})
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
        const check = getFaceEngineCheck()
        let result
        try { result = await siteAttendance.logEngine(siteId, check, deviceId()) }
        catch { throw new Error('Could not confirm the face engine. Check the network and tap Retry.') }
        if (stopped) return
        if (!(check.score >= check.min) || result?.passed !== true) throw new Error('This phone could not run the face check correctly (self-test ' + check.score.toFixed(3) + '). Use “Check in without face” and tell the MD.')
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('The camera requires a secure page and camera access.')
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } })
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return }
        stopStream.current = () => stream.getTracks().forEach(track => track.stop())
        video.current.srcObject = stream
        await video.current.play()
        if (!stopped) setState({ engine, engineCheck: { backend: check.backend, score: check.score } })
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop())
        if (!stopped) setState({ error: error.message })
      }
    }
    start()
    return () => { stopped = true; stream?.getTracks().forEach(track => track.stop()) }
  }, [enabled, facing, siteId, retry])
  return { ...state, stop: () => { stopStream.current(); setState({}) }, engine: enabled ? state.engine : null, video, retry: () => setRetry(n => n + 1) }
}
