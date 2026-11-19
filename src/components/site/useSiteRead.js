import { useEffect, useState } from 'react'

export function useSiteRead(load, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  useEffect(() => {
    let current = true
    setState({ data: null, error: null, loading: true })
    Promise.resolve().then(load).then(data => {
      if (current) setState({ data, error: null, loading: false })
    }, error => {
      if (current) setState({ data: null, error, loading: false })
    })
    return () => { current = false }
  }, deps)
  return state
}
