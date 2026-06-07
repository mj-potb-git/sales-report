// Reusable empty / loading states so "no data" reads as intentional,
// not broken. Use across tabs instead of blank space or plain "Loading…".

import { Inbox, Loader2 } from 'lucide-react'

export function EmptyState({ icon: Icon = Inbox, title = 'No data', subtitle = '', className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-10 text-center ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6 text-gray-300" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">{subtitle}</p>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-gray-400 ${className}`}>
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
