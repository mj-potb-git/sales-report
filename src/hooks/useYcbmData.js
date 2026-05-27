import { useCallback } from 'react'
import usePolling from './usePolling'
import { fetchBookings, fetchProfiles, mapBooking } from '../api/ycbm'

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
