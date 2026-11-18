import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const unassigned = { siteId: null, loading: false, error: null }
const pending = { ...unassigned, loading: true }
const AssignedSiteContext = createContext(unassigned)

export function AssignedSiteProvider({ children }) {
  const request = useRef(null)
  const [assignment, setAssignment] = useState(pending)
  useEffect(() => {
    let active = true
    // The authenticated shell remounts on a user change or sign-out.
    request.current ??= Promise.resolve().then(async () => {
      const { data, error } = await supabase.rpc('my_assigned_site')
      if (error) throw error
      if (data !== null && (typeof data !== 'string' || !data)) {
        throw new Error('Invalid assigned site response.')
      }
      return { ...unassigned, siteId: data }
    }).catch(error => ({ ...unassigned, error }))
    request.current.then(result => { if (active) setAssignment(result) })
    return () => { active = false }
  }, [])
  return <AssignedSiteContext.Provider value={assignment}>{children}</AssignedSiteContext.Provider>
}

export const useAssignedSite = () => useContext(AssignedSiteContext)

export function AssignedSiteStatus({ loading, error }) {
  if (loading) return <p role="status">Loading assigned site…</p>
  if (error) return <p role="alert" style={{ overflowWrap: 'anywhere' }}>
    Could not load your assigned site. {error.message || String(error)}
  </p>
  return null
}

export function withAssignedSite(Form) {
  function AssignedSiteForm(props) {
    const assignment = useAssignedSite()
    if (assignment.loading || assignment.error) return <AssignedSiteStatus {...assignment} />
    return <Form {...props} assignedSiteId={assignment.siteId} />
  }
  AssignedSiteForm.displayName = `AssignedSite(${Form.name})`
  return AssignedSiteForm
}
