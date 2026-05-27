import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Polls an async fetcher on an interval. Pauses while the document is hidden
 * (tab in background, screen locked, etc.) and resumes the moment it returns
 * — even firing an immediate refresh on resume so stale data is corrected
 * quickly. Returns the loading state of the *initial* fetch only; background
 * refreshes do not flip `loading` so the UI stays steady.
 */
export default function usePolling(fetcher, intervalMs = 30_000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)        // initial only
  const [refreshing, setRefreshing] = useState(false) // background refreshes
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)

  // Hold the fetcher in a ref so we don't re-bind the interval when the
  // caller passes a new function on every render
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const inFlight = useRef(false)

  const run = useCallback(async ({ background } = {}) => {
    if (inFlight.current) return
    inFlight.current = true
    if (background) setRefreshing(true)
    try {
      const result = await fetcherRef.current()
      setData(result)
      setError(null)
      setLastFetched(new Date())
    } catch (e) {
      setError(e)
    } finally {
      if (background) setRefreshing(false)
      else setLoading(false)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    let timerId = null

    const start = () => {
      stop()
      timerId = setInterval(() => run({ background: true }), intervalMs)
    }
    const stop = () => {
      if (timerId) { clearInterval(timerId); timerId = null }
    }

    const handleVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        // Resumed → fire an immediate catch-up refresh, then resume polling
        run({ background: true })
        start()
      }
    }

    // Initial fetch
    run({ background: false })
    start()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [intervalMs, run])

  const refresh = useCallback(() => run({ background: true }), [run])

  return { data, loading, refreshing, error, lastFetched, refresh }
}
