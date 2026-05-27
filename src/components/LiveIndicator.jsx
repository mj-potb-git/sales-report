import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

function relativeTime(date) {
  if (!date) return 'never'
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 5)   return 'just now'
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ago`
}

export default function LiveIndicator({ lastFetched, refreshing, onRefresh, label = 'Live' }) {
  // Tick once a second so the relative timestamp stays fresh
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full ${refreshing ? 'bg-amber-400' : 'bg-emerald-500'} opacity-75 ${refreshing ? 'animate-ping' : 'animate-pulse'}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${refreshing ? 'bg-amber-500' : 'bg-emerald-600'}`} />
      </span>
      <span className="text-gray-500 font-medium">
        {label} · <span className="text-gray-400">{relativeTime(lastFetched)}</span>
      </span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh now"
          className="p-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={11} className={`text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  )
}
