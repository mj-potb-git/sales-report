import { useCallback, useMemo } from 'react'
import usePolling from './usePolling'
import { fetchBookings, fetchProfiles, mapBooking, getCachedBookings } from '../api/ycbm'

const POLL_INTERVAL_MS = 15_000 // 15s — near-real-time for ops monitoring

export default function useYcbmData() {
  const fetcher = useCallback(async () => {
    const [profs, raws] = await Promise.all([fetchProfiles(), fetchBookings()])
    const byId = Object.fromEntries(profs.map(p => [p.id, p]))
    return {
      profiles: profs,
      bookings: raws.map(r => mapBooking(r, byId)),
    }
  }, [])

  const { data, loading, refreshing, error, lastFetched, refresh } =
    usePolling(fetcher, POLL_INTERVAL_MS)

  // Instant-load fallback: render the last cached bookings (from localStorage)
  // while the first network fetch is still paginating — which can take minutes
  // on a cold load. Mapped with empty profiles (team shows "unknown" until the
  // fresh fetch lands); good enough to populate the matrix immediately.
  const cachedBookings = useMemo(() => getCachedBookings().map(r => mapBooking(r, {})), [])

  return {
    bookings: data?.bookings ?? cachedBookings,
    profiles: data?.profiles ?? [],
    // Don't gate the whole UI behind the slow fetch when we already have cache.
    loading: loading && cachedBookings.length === 0,
    refreshing: refreshing || (loading && cachedBookings.length > 0),
    error,
    lastFetched,
    refresh,
  }
}
