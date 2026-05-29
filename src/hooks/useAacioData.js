import { useCallback } from 'react'
import usePolling from './usePolling'
import { fetchAacioBookings, fetchAacioProfiles, mapAacioBooking } from '../api/ycbmAacio'

// AACIO has low volume — poll slower (30s) so we don't hammer the proxy queue
// while POTB YCBM (15s) is also paginating.
const POLL_INTERVAL_MS = 30_000

export default function useAacioData() {
  const fetcher = useCallback(async () => {
    const [profs, raws] = await Promise.all([fetchAacioProfiles(), fetchAacioBookings()])
    const byId = Object.fromEntries(profs.map(p => [p.id, p]))
    return {
      profiles: profs,
      bookings: raws.map(r => mapAacioBooking(r, byId)),
    }
  }, [])

  const { data, loading, refreshing, error, lastFetched, refresh } =
    usePolling(fetcher, POLL_INTERVAL_MS)

  return {
    bookings: data?.bookings ?? [],
    profiles: data?.profiles ?? [],
    loading,
    refreshing,
    error,
    lastFetched,
    refresh,
  }
}
