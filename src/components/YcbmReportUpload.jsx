// Upload control for accumulating YCBM report exports (per account).
// Each upload MERGES into the saved store (dedup by booking Id) — it does NOT
// replace. Shows how many were added / updated / total accumulated, so MJ can
// upload daily and cross-check without losing older data.
import { useState, useEffect } from 'react'
import { Upload, FileCheck2, Trash2 } from 'lucide-react'
import { parseReportCSV, replaceReport, getReportMeta, clearReport, subscribeReport } from '../lib/ycbmReport'

export default function YcbmReportUpload({ account, label = 'YCBM report' }) {
  const [meta, setMeta] = useState(() => getReportMeta(account))
  const [flash, setFlash] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const refresh = () => setMeta(getReportMeta(account))
    refresh()
    return subscribeReport(refresh)
  }, [account])

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setErr(null)
    try {
      const rows = parseReportCSV(await file.text())
      if (!rows.length) throw new Error('Walang nabasang bookings sa file.')
      // REPLACE (not accumulate): the latest export is the single source of
      // truth, so counts match the YCBM export exactly (no leftover bookings
      // from older uploads).
      const { total } = replaceReport(account, rows)
      setFlash(`✓ Na-save! ${total} bookings — ito na ang buong report (pinalitan ang luma). Eksaktong katugma ng YCBM export mo.`)
      setTimeout(() => setFlash(null), 9000)
    } catch (e2) { setErr(e2.message) }
    finally { e.target.value = '' }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          {meta
            ? <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium"><FileCheck2 size={15} /> {meta.total} bookings naipon · {meta.dateMin}–{meta.dateMax}</span>
            : <span className="text-gray-500">Wala pang na-upload — automatic (live API) muna.</span>}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white cursor-pointer hover:opacity-90" style={{ backgroundColor: '#1B4F4F' }}>
            <Upload size={13} /> Upload {label}
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {meta && (
            <button onClick={() => clearReport(account)} title="Tanggalin lahat ng naipong report (balik sa automatic)"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-500"><Trash2 size={14} /></button>
          )}
        </div>
      </div>
      {flash && <div className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">{flash}</div>}
      {err && <div className="px-3 py-2 rounded-lg bg-red-50 text-red-700 text-xs">{err}</div>}
    </div>
  )
}
