// Generic "hero" summary band — one big number + optional verdict + a row of
// secondary stats. Gives every tab an instant "is this good?" read with a
// consistent look. (Operations has its own OpsHero; this is for the rest.)

import { TrendingUp, TrendingDown } from 'lucide-react'

const TEAL = '#1B4F4F'

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-white/60">{label}</span>
      <span className="text-lg font-bold text-white leading-tight">{value}</span>
    </div>
  )
}

export default function HeroBand({ label, value, sub, verdict = null, delta = null, stats = [] }) {
  return (
    <section
      className="rounded-2xl p-5 sm:p-6 shadow-sm text-white"
      style={{ background: `linear-gradient(135deg, ${TEAL} 0%, #0f3a3a 100%)` }}
    >
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest text-white/70">{label}</span>
            {verdict && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: verdict.tone }}>
                {verdict.text}
              </span>
            )}
          </div>
          <div className="flex items-end gap-3 mt-1">
            <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">{value}</span>
            {delta !== null && delta !== undefined && (
              <span className={`mb-1.5 inline-flex items-center gap-0.5 text-sm font-semibold ${delta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {Math.abs(delta)}%
              </span>
            )}
          </div>
          {sub && <p className="text-sm text-white/70 mt-1">{sub}</p>}
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-6 gap-y-3 bg-white/5 rounded-xl px-4 py-3">
            {stats.map((s, i) => <Stat key={i} label={s.label} value={s.value} />)}
          </div>
        )}
      </div>
    </section>
  )
}
