import { useCallback } from 'react'
import usePolling from './usePolling'
import { fetchSalesRecords } from '../api/lakbay'

const POLL_INTERVAL_MS = 30_000 // 30s — LakbayHub API rate-limits beyond ~10 RPM

export default function useSalesData() {
  const fetcher = useCallback(() => fetchSalesRecords(), [])

  const { data, loading, refreshing, error, lastFetched, refresh } =
    usePolling(fetcher, POLL_INTERVAL_MS)

  return {
    records: data ?? [],
    loading,
    refreshing,
    error,
    lastFetched,
    refresh,
  }
}
