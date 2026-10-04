import { useEffect, useRef } from 'react'

// One header Refresh button reloads whatever page is open: the header fires
// this event and each page that keeps its own data listens for it.
const REFRESH_EVENT = 'taskwise:refresh'

export const requestRefresh = () => window.dispatchEvent(new Event(REFRESH_EVENT))

export function useRefreshListener(reload: () => unknown) {
  const ref = useRef(reload)
  ref.current = reload
  useEffect(() => {
    const handler = () => { void ref.current() }
    window.addEventListener(REFRESH_EVENT, handler)
    return () => window.removeEventListener(REFRESH_EVENT, handler)
  }, [])
}
