// Reusable custom date picker — supports BOTH a continuous range (from–to)
// AND multi-select of arbitrary individual days. Whatever the mode, it emits a
// flat, sorted array of 'YYYY-MM-DD' keys via onApply, so every consuming tab
// can treat "custom" uniformly as "this explicit set of days".
//
// Usage:
//   <DateRangePicker
//      value={customDates}            // string[] of YYYY-MM-DD (current selection)
//      active={periodId === 'custom'} // highlight the trigger when in use
//      onApply={(dates) => { setCustomDates(dates); setPeriodId('custom') }}
//   />

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Check } from 'lucide-react'

const TEAL = '#1B4F4F'
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function toKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// All YYYY-MM-DD keys between two dates inclusive (oldest → newest).
function expandRange(aKey, bKey) {
  let a = fromKey(aKey).getTime()
  let b = fromKey(bKey).getTime()
  if (a > b) [a, b] = [b, a]
  const out = []
  for (let t = a; t <= b; t += 86400000) out.push(toKey(new Date(t)))
  return out
}

// Build the 6-row calendar grid (leading/trailing blanks as null) for a month.
function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function shortLabel(keys) {
  if (keys.length === 0) return 'Custom'
  if (keys.length === 1) return fromKey(keys[0]).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const sorted = [...keys].sort()
  const contiguous = expandRange(sorted[0], sorted[sorted.length - 1]).length === sorted.length
  if (contiguous) {
    const a = fromKey(sorted[0]).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    const b = fromKey(sorted[sorted.length - 1]).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return `${a} – ${b}`
  }
  return `${keys.length} days`
}

export default function DateRangePicker({ value = [], active = false, onApply }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('range')          // 'range' | 'multi'
  const [sel, setSel] = useState(value)               // working selection (keys)
  const [, setRangeAnchor] = useState(null) // first click in range mode (value read via functional updater)
  const today = startOfDay(new Date())
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const ref = useRef(null)

  function toggleOpen() {
    if (open) { setOpen(false); return }
    setSel(value)            // re-sync working copy with the applied selection
    setRangeAnchor(null)
    setMode('range')         // always start in Range mode for predictability
    setOpen(true)
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const selSet = useMemo(() => new Set(sel), [sel])
  const cells = useMemo(() => monthGrid(view.year, view.month), [view])
  const todayKey = toKey(today)

  function clickDay(d) {
    if (!d) return
    const k = toKey(d)
    if (mode === 'multi') {
      // Functional updater so rapid successive clicks accumulate correctly
      // (each click reads the freshest selection, never a stale snapshot).
      setSel(prev => {
        const next = new Set(prev)
        if (next.has(k)) next.delete(k); else next.add(k)
        return [...next].sort()
      })
    } else {
      // range mode: first click sets the anchor, second completes the range
      setRangeAnchor(prevAnchor => {
        if (!prevAnchor) { setSel([k]); return k }
        setSel(expandRange(prevAnchor, k))
        return null
      })
    }
  }

  function nav(delta) {
    setView(v => {
      const m = v.month + delta
      const year = v.year + Math.floor(m / 12)
      const month = ((m % 12) + 12) % 12
      return { year, month }
    })
  }

  function apply() {
    onApply?.([...sel].sort())
    setOpen(false)
  }
  function clear() { setSel([]); setRangeAnchor(null) }

  const label = active && value.length ? shortLabel(value) : 'Custom'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border"
        style={
          active
            ? { backgroundColor: TEAL, color: '#fff', borderColor: TEAL }
            : { backgroundColor: '#fff', color: '#374151', borderColor: '#e5e7eb' }
        }
      >
        <CalendarIcon className="w-3.5 h-3.5" />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[300px] rounded-2xl bg-white shadow-xl border border-gray-100 p-3.5">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-gray-100 p-0.5 mb-3 text-xs font-semibold">
            {[['range', 'Range'], ['multi', 'Pick dates']].map(([m, lbl]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setRangeAnchor(null) }}
                className="flex-1 py-1.5 rounded-md transition"
                style={mode === m ? { backgroundColor: '#fff', color: TEAL, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' } : { color: '#6b7280' }}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => nav(-1)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-gray-900">{MONTHS[view.month]} {view.year}</span>
            <button onClick={() => nav(1)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[10px] font-semibold text-gray-400 py-1">{w}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const k = toKey(d)
              const isSel = selSet.has(k)
              const isToday = k === todayKey
              const isFuture = d.getTime() > today.getTime()
              return (
                <button
                  key={i}
                  onClick={() => clickDay(d)}
                  disabled={isFuture}
                  className="h-8 rounded-md text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed"
                  style={
                    isSel
                      ? { backgroundColor: TEAL, color: '#fff' }
                      : isToday
                        ? { backgroundColor: '#E6F0F0', color: TEAL, fontWeight: 700 }
                        : { color: '#374151' }
                  }
                  onMouseEnter={(e) => { if (!isSel && !isFuture) e.currentTarget.style.backgroundColor = '#f3f4f6' }}
                  onMouseLeave={(e) => { if (!isSel && !isToday) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <span className="text-[11px] text-gray-500">
              {sel.length === 0 ? 'No dates selected'
                : sel.length === 1 ? '1 day selected'
                : `${sel.length} days selected`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={clear}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition"
              >
                <X className="w-3 h-3" /> Clear
              </button>
              <button
                onClick={apply}
                disabled={sel.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-40"
                style={{ backgroundColor: TEAL }}
              >
                <Check className="w-3 h-3" /> Apply
              </button>
            </div>
          </div>

          <p className="mt-2 text-[10px] text-gray-400 leading-snug">
            {mode === 'range'
              ? 'Click a start date then an end date.'
              : 'Click days to add/remove them — they don’t need to be consecutive.'}
          </p>
        </div>
      )}
    </div>
  )
}
