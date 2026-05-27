export default function StatusBadge({ status }) {
  if (!status) return null

  const styles = {
    'SMS opted out': 'bg-amber-100 text-amber-700 border border-amber-200',
    'Confirmed':     'bg-green-100 text-green-700 border border-green-200',
    'Pending':       'bg-gray-100 text-gray-600 border border-gray-200',
  }

  const cls = styles[status] ?? 'bg-gray-100 text-gray-600 border border-gray-200'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
