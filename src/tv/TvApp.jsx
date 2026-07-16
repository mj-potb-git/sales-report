// TV Sales Achievement board — a full-screen kiosk view for the office TV.
// No login: exposed only on the internal Vercel URL / office network.
//
//   • Live "today" + month-to-date totals across all three sales audiences
//   • Monthly target progress ring (company-wide goal from Settings)
//   • Faces leaderboard (MTD) with photos from /tv/admin
//   • Real-time confetti celebration whenever a new sale lands
//
// Data + new-sale detection live in useTvData; photos in agentPhotos.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import useTvData, { SOURCE_LABELS, SOURCE_ORDER } from './useTvData'
import { formatPHP, formatPHPCompact } from '../api/lakbay'
import { getSettings } from '../lib/settings'
import { enableSound, playCelebration, speak, isSoundEnabled } from './sound'

// Category colors aligned to the dashboard palette (cyan / gold / teal-violet).
// SOURCE_COLORS = the vivid fill (dots, bars, avatars, ring).
// SOURCE_TEXT   = a darker shade of the same hue for label text on white
//                 (keeps contrast legible — plain gold is too light on white).
const SOURCE_COLORS = {
  acquisition: '#1CA9D6', // dashboard cyan
  officers:    '#F5A623', // dashboard gold
  aacio:       '#7C5CFC', // violet (distinct 3rd category)
}
const SOURCE_TEXT = {
  acquisition: '#0E6E93',
  officers:    '#B26E09',
  aacio:       '#5B3FD4',
}

// ── Small presentational bits ───────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function Avatar({ name, photo, size = 72, color = '#334155' }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="tv-avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}>
      {photo ? <img src={photo} alt={name} /> : <span>{initials}</span>}
    </div>
  )
}

function TargetRing({ pct, size = 220 }) {
  const r = size / 2 - 16
  const c = 2 * Math.PI * r
  const clamped = Math.min(100, Math.max(0, pct))
  const dash = (clamped / 100) * c
  return (
    <div className="tv-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="14" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="url(#tvgrad)" strokeWidth="14" fill="none" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <defs>
          <linearGradient id="tvgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1B4F4F" />
            <stop offset="100%" stopColor="#1CA9D6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="tv-ring-label">
        <span className="tv-ring-pct">{Math.round(clamped)}%</span>
        <span className="tv-ring-sub">of target</span>
      </div>
    </div>
  )
}

function Celebration({ data, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 9000)
    return () => clearTimeout(id)
  }, [data.key, onDone])

  const color = SOURCE_COLORS[data.source] || '#1CA9D6'
  const textColor = SOURCE_TEXT[data.source] || color
  const confetti = Array.from({ length: 60 })
  return (
    <div className="tv-celebrate">
      <div className="tv-confetti">
        {confetti.map((_, i) => {
          const left = Math.random() * 100
          const delay = Math.random() * 0.8
          const dur = 2.2 + Math.random() * 1.8
          const colors = ['#1CA9D6', '#F5A623', '#7C5CFC', '#10b981', '#1B4F4F', '#F472B6']
          const bg = colors[i % colors.length]
          const size = 8 + Math.random() * 10
          return (
            <span key={i} className="tv-confetto"
              style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s`,
                       width: size, height: size, background: bg,
                       borderRadius: i % 2 ? '50%' : '2px' }} />
          )
        })}
      </div>
      <div className="tv-celebrate-card" style={{ boxShadow: `0 0 120px ${color}66` }}>
        <div className="tv-celebrate-congrats">🎉 CONGRATULATIONS! 🎉</div>
        <div className="tv-celebrate-badge" style={{ color: textColor }}>NEW SALE</div>
        <Avatar name={data.agent} photo={data.photo} size={160} color={color} />
        <div className="tv-celebrate-name">{data.agent}</div>
        <div className="tv-celebrate-amount" style={{ color: textColor }}>{formatPHP(data.amount)}</div>
        <div className="tv-celebrate-source" style={{ background: `${color}22`, color: textColor }}>
          {SOURCE_LABELS[data.source] || data.source}
        </div>
        {data.moreCount > 0 && (
          <div className="tv-celebrate-more">+{data.moreCount} more sale{data.moreCount > 1 ? 's' : ''} just came in!</div>
        )}
      </div>
    </div>
  )
}

function StatBlock({ label, value, sub, color }) {
  return (
    <div className="tv-stat">
      <span className="tv-stat-label" style={color ? { color } : undefined}>{label}</span>
      <span className="tv-stat-value">{value}</span>
      {sub && <span className="tv-stat-sub">{sub}</span>}
    </div>
  )
}

function Rank({ n }) {
  const medal = n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : null
  return <div className={`tv-rank ${n <= 3 ? 'tv-rank-top' : ''}`}>{medal || n}</div>
}

// One department column: header (Today + MTD + agent count) then the full list
// of every agent with sales this month, auto-scrolling if it overflows.
function DeptColumn({ source, stats, agents, loading }) {
  const color = SOURCE_COLORS[source]
  const textColor = SOURCE_TEXT[source] || color
  const lead = agents[0]?.mtdSales || 1
  const wrapRef = useRef(null)
  const scrollRef = useRef(null)
  const [scrollPx, setScrollPx] = useState(0)
  useLayoutEffect(() => {
    const wrap = wrapRef.current, list = scrollRef.current
    if (!wrap || !list) { setScrollPx(0); return }
    const over = list.scrollHeight - wrap.clientHeight
    setScrollPx(over > 8 ? over : 0)
  }, [agents.length, stats.mtdSales])

  return (
    <div className="tv-col" style={{ borderTop: `5px solid ${color}` }}>
      <div className="tv-col-head">
        <div className="tv-col-title" style={{ color: textColor }}>
          <span className="tv-team-dot" style={{ background: color }} />
          {SOURCE_LABELS[source]}
        </div>
        <div className="tv-col-stats">
          <div className="tv-col-stat"><span>TODAY</span><b>{formatPHP(stats.todaySales || 0)}</b></div>
          <div className="tv-col-stat"><span>MTD</span><b style={{ color: textColor }}>{formatPHP(stats.mtdSales || 0)}</b></div>
        </div>
        <div className="tv-col-count">{agents.length} agent{agents.length === 1 ? '' : 's'} may benta</div>
      </div>
      <div className="tv-col-list" ref={wrapRef}>
        {agents.length === 0 ? (
          <div className="tv-empty">{loading ? 'Naglo-load…' : 'Wala pang benta.'}</div>
        ) : (
          <div className="tv-col-scroll" ref={scrollRef}
               style={scrollPx ? { '--sp': `${scrollPx}px`, animation: 'tvscroll 30s linear infinite' } : undefined}>
            {agents.map((a, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1
              return (
                <div key={a.key} className={`tv-crow ${i < 3 ? 'tv-crow-top' : ''}`}>
                  <div className={`tv-crank ${i < 3 ? 'medal' : ''}`}>{medal}</div>
                  <Avatar name={a.name} photo={a.photo} size={40} color={color} />
                  <div className="tv-crow-main">
                    <div className="tv-crow-name">{a.name}</div>
                    <div className="tv-crow-bar"><span style={{ width: `${Math.max(5, (a.mtdSales / lead) * 100)}%`, background: color }} /></div>
                  </div>
                  <div className="tv-crow-right">
                    <div className="tv-crow-amt">{formatPHP(a.mtdSales)}</div>
                    {a.todaySales > 0 && <div className="tv-crow-today">+{formatPHPCompact(a.todaySales)} today</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main board ──────────────────────────────────────────────────────────────

export default function TvApp() {
  const {
    loading, error, lastFetched,
    todaySales, todayCount, mtdSales, mtdCount,
    bySource, leaderboard,
    celebration, clearCelebration,
  } = useTvData()
  const now = useClock()
  const { monthlyTarget, organizationName } = getSettings()
  const targetPct = monthlyTarget > 0 ? (mtdSales / monthlyTarget) * 100 : 0

  const dateLabel = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeLabel = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  const monthLabel = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  // All agents with sales this month, grouped per department (no cap — kung
  // ilan sila, ayun ang makikita; auto-scrolls if a column overflows).
  const deptAgents = (source) => leaderboard.filter(a => a.source === source)

  // Champion spotlight: highlight the #1 agent of the month per department,
  // flashing to the next department every 15 seconds.
  const [champIdx, setChampIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setChampIdx(i => (i + 1) % SOURCE_ORDER.length), 15_000)
    return () => clearInterval(id)
  }, [])
  const champSource = SOURCE_ORDER[champIdx]
  const champion = leaderboard.filter(a => a.source === champSource)[0] || null

  // Sound + voice: fanfare AND a spoken congratulations on each new sale.
  const [soundOn, setSoundOn] = useState(isSoundEnabled())
  useEffect(() => {
    if (!celebration) return
    playCelebration()
    const pesos = Math.round(celebration.amount).toLocaleString('en-US')
    speak(`Congratulations ${celebration.agent}! New sale, ${pesos} pesos!`)
  }, [celebration])

  return (
    <div className="tv-root">
      <TvStyles />

      {/* Header */}
      <header className="tv-header">
        <div>
          <div className="tv-org">{organizationName}</div>
          <h1 className="tv-title">SALES ACHIEVEMENT</h1>
        </div>
        <div className="tv-clock">
          <div className="tv-date">{dateLabel}</div>
          <div className="tv-time">{timeLabel}</div>
          <div className={`tv-live ${lastFetched ? 'on' : ''}`}>
            <span className="tv-dot" /> {loading ? 'connecting…' : error ? 'reconnecting…' : 'LIVE'}
          </div>
        </div>
      </header>

      {/* Champion spotlight (flashes per department every 15s) + overall */}
      <section className="tv-strip">
        {champion ? (
          <div className="tv-champ" key={`${champSource}-${champion.key}`}
               style={{ borderColor: `${SOURCE_COLORS[champSource]}55` }}>
            <div className="tv-champ-crown" style={{ background: SOURCE_COLORS[champSource] }}>🏆</div>
            <Avatar name={champion.name} photo={champion.photo} size={96} color={SOURCE_COLORS[champSource]} />
            <div className="tv-champ-info">
              <span className="tv-champ-badge" style={{ color: SOURCE_TEXT[champSource] }}>
                TOP {SOURCE_LABELS[champSource]} · {monthLabel}
              </span>
              <span className="tv-champ-name">{champion.name}</span>
              <span className="tv-champ-amt" style={{ color: SOURCE_TEXT[champSource] }}>
                {formatPHP(champion.mtdSales)}
                {champion.todaySales > 0 && <em className="tv-champ-today"> · +{formatPHPCompact(champion.todaySales)} today</em>}
              </span>
            </div>
          </div>
        ) : (
          <div className="tv-champ tv-champ-empty">
            <span className="tv-strip-label">{loading ? 'Naglo-load ng champions…' : 'Wala pang benta this month.'}</span>
          </div>
        )}

        <div className="tv-strip-right">
          <div className="tv-strip-stat">
            <span className="tv-strip-label">TODAY · ALL TEAMS</span>
            <span className="tv-strip-value">{formatPHP(todaySales)}</span>
            <span className="tv-strip-sub">{todayCount} sale{todayCount === 1 ? '' : 's'} today</span>
          </div>
          <div className="tv-strip-div" />
          <div className="tv-strip-stat">
            <span className="tv-strip-label">MTD · {monthLabel}</span>
            <span className="tv-strip-value">{formatPHP(mtdSales)}</span>
            <span className="tv-strip-sub">{mtdCount} sales</span>
          </div>
          <div className="tv-strip-ring">
            <TargetRing pct={targetPct} size={104} />
          </div>
        </div>
      </section>

      {/* Three departments side-by-side — ALL agents with sales */}
      <section className="tv-cols">
        {SOURCE_ORDER.map(s => (
          <DeptColumn key={s} source={s} stats={bySource[s] || {}} agents={deptAgents(s)} loading={loading} />
        ))}
      </section>

      {/* One-time sound enable (browsers block audio until a gesture) */}
      {!soundOn && (
        <button className="tv-sound-btn" onClick={async () => { const ok = await enableSound(); setSoundOn(ok) }}>
          <Volume2 style={{ width: '1.4vw', height: '1.4vw' }} /> I-enable ang sound
        </button>
      )}

      {celebration && <Celebration data={celebration} onDone={clearCelebration} />}
    </div>
  )
}

// ── Styles (scoped, self-contained so the kiosk needs no global CSS) ─────────

function TvStyles() {
  return (
    <style>{`
    /* Light theme — matched to the dashboard palette (teal #1B4F4F,
       cyan #1CA9D6, gold #F5A623) for an easy-on-the-eyes TV display. */
    .tv-root { position: fixed; inset: 0; overflow: hidden; color: #143C3C;
      background: radial-gradient(1200px 800px at 82% -12%, #E3F3F1 0%, transparent 60%),
                  radial-gradient(1000px 700px at -10% 112%, #E7F1FA 0%, transparent 55%), #F4F8F8;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      display: flex; flex-direction: column; padding: 2.2vh 2.4vw; gap: 1.6vh; }
    .tv-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .tv-org { font-size: 1.1vw; letter-spacing: 0.28em; text-transform: uppercase; color: #5B8079; font-weight: 700; }
    .tv-title { font-size: 3.2vw; font-weight: 900; letter-spacing: 0.04em; margin: 0.2vh 0 0;
      background: linear-gradient(90deg,#1B4F4F,#1CA9D6); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .tv-clock { text-align: right; }
    .tv-date { font-size: 1.3vw; color: #64748B; font-weight: 600; }
    .tv-time { font-size: 2.6vw; font-weight: 800; line-height: 1.05; color: #1B4F4F; }
    .tv-live { display: inline-flex; align-items: center; gap: 0.5vw; margin-top: 0.4vh;
      font-size: 1vw; font-weight: 800; letter-spacing: 0.12em; color: #94A3B8; }
    .tv-live.on { color: #10b981; }
    .tv-dot { width: 0.7vw; height: 0.7vw; border-radius: 50%; background: currentColor; animation: tvpulse 1.6s infinite; }
    @keyframes tvpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }

    .tv-hero { display: grid; grid-template-columns: 1.5fr 1fr; gap: 2vw; align-items: stretch; }
    .tv-hero-today, .tv-hero-month { background: #FFFFFF; border: 1px solid rgba(27,79,79,0.08);
      box-shadow: 0 6px 24px rgba(27,79,79,0.06); border-radius: 1.6vw; padding: 2.4vh 2vw; display: flex; flex-direction: column; }
    .tv-hero-label { font-size: 1.1vw; letter-spacing: 0.2em; color: #5B8079; font-weight: 800; }
    .tv-hero-amount { font-size: 5.6vw; font-weight: 900; line-height: 1; margin: 0.6vh 0;
      background: linear-gradient(90deg,#1B4F4F,#1CA9D6); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .tv-hero-sub { font-size: 1.2vw; color: #64748B; font-weight: 600; }
    .tv-source-chips { display: flex; gap: 0.8vw; margin-top: auto; padding-top: 1.6vh; flex-wrap: wrap; }
    .tv-chip { display: flex; align-items: center; gap: 0.5vw; padding: 0.9vh 1vw; border-radius: 999px;
      border: 1px solid rgba(27,79,79,0.10); background: #F7FBFB; }
    .tv-chip-dot { width: 0.8vw; height: 0.8vw; border-radius: 50%; }
    .tv-chip-label { font-size: 0.95vw; color: #64748B; font-weight: 700; }
    .tv-chip-value { font-size: 1.15vw; font-weight: 800; color: #1B4F4F; }

    .tv-hero-month { flex-direction: row; align-items: center; gap: 1.6vw; justify-content: center; }
    .tv-ring { position: relative; display: grid; place-items: center; flex-shrink: 0; }
    .tv-ring svg { transform: rotate(0deg); }
    .tv-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .tv-ring-pct { font-size: 2.6vw; font-weight: 900; color: #1B4F4F; }
    .tv-ring-sub { font-size: 0.9vw; color: #94A3B8; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .tv-month-stats { display: flex; flex-direction: column; }
    .tv-stat-label { font-size: 0.95vw; letter-spacing: 0.14em; color: #5B8079; font-weight: 800; text-transform: uppercase; }
    .tv-stat-value { font-size: 3vw; font-weight: 900; line-height: 1.1; color: #1B4F4F; }
    .tv-stat-sub { font-size: 1vw; color: #64748B; font-weight: 600; }

    .tv-board { flex: 1; min-height: 0; background: #FFFFFF; border: 1px solid rgba(27,79,79,0.08);
      box-shadow: 0 6px 24px rgba(27,79,79,0.06); border-radius: 1.6vw; padding: 2vh 2vw; display: flex; flex-direction: column; }
    .tv-board-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 1.2vh; }
    .tv-board-head h2 { font-size: 1.8vw; font-weight: 900; margin: 0; display: flex; align-items: center; gap: 0.7vw; }
    .tv-team-dot { width: 1.1vw; height: 1.1vw; border-radius: 50%; display: inline-block; }
    .tv-board-note { font-size: 1vw; color: #94A3B8; font-weight: 700; }
    .tv-board-stats { display: flex; align-items: center; gap: 1.4vw; }
    .tv-bstat { font-size: 1vw; color: #64748B; font-weight: 700; }
    .tv-bstat b { color: #1B4F4F; font-weight: 900; margin-left: 0.3vw; }
    .tv-rot-dots { display: flex; gap: 0.5vw; align-items: center; }
    .tv-rot-dot { width: 0.8vw; height: 0.8vw; border-radius: 50%; background: rgba(27,79,79,0.15); transition: all .3s; }
    .tv-rot-dot.on { transform: scale(1.3); }
    .tv-chip-active { box-shadow: 0 0 0 2px rgba(28,169,214,0.15); transform: translateY(-2px); transition: all .3s; }
    .tv-board-list { flex: 1; min-height: 0; overflow: hidden; animation: tvslide .5s ease; }
    .tv-board-scroll { display: flex; flex-direction: column; gap: 0.9vh; }
    @keyframes tvslide { from{opacity:0; transform:translateX(2vw)} to{opacity:1; transform:translateX(0)} }
    @keyframes tvscroll { 0%,10%{transform:translateY(0)} 90%,100%{transform:translateY(calc(-1 * var(--sp)))} }
    .tv-sound-btn { position: fixed; bottom: 2vh; right: 2vw; z-index: 40; display: inline-flex; align-items: center; gap: 0.6vw;
      padding: 1vh 1.4vw; border-radius: 999px; border: 1px solid rgba(28,169,214,0.35); background: #FFFFFF; color: #0E6E93;
      font-size: 1vw; font-weight: 800; cursor: pointer; box-shadow: 0 6px 20px rgba(27,79,79,0.12); animation: tvpulse 2.4s infinite; }
    .tv-row { display: flex; align-items: center; gap: 1.2vw; padding: 0.9vh 1vw; border-radius: 1vw;
      background: #FBFDFD; border: 1px solid rgba(27,79,79,0.05); }
    .tv-row-top { background: #F0F9FC; border-color: rgba(28,169,214,0.18); }
    .tv-rank { width: 3vw; text-align: center; font-size: 1.8vw; font-weight: 900; color: #94A3B8; flex-shrink: 0; }
    .tv-rank-top { font-size: 2.4vw; }
    .tv-row-main { flex: 1; min-width: 0; }
    .tv-row-name { font-size: 1.7vw; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #143C3C; }
    .tv-row-meta { display: flex; gap: 0.8vw; align-items: center; margin: 0.3vh 0; }
    .tv-row-source { font-size: 0.95vw; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
    .tv-row-today { font-size: 0.95vw; font-weight: 700; color: #10b981; }
    .tv-row-bar { height: 0.7vh; border-radius: 999px; background: rgba(27,79,79,0.08); overflow: hidden; }
    .tv-row-bar span { display: block; height: 100%; border-radius: 999px; transition: width .8s ease; }
    .tv-row-amount { font-size: 2vw; font-weight: 900; flex-shrink: 0; color: #1B4F4F; }
    .tv-empty { height: 100%; display: grid; place-items: center; color: #94A3B8; font-size: 1.4vw; font-weight: 700; }

    /* Champion band (spotlight left, overall right) */
    .tv-strip { display: flex; align-items: stretch; gap: 1.4vw; }
    .tv-champ { flex: 1; min-width: 0; display: flex; align-items: center; gap: 1.4vw; background: #FFFFFF;
      border: 2px solid; box-shadow: 0 6px 24px rgba(27,79,79,0.06); border-radius: 1.2vw; padding: 1.4vh 1.6vw;
      position: relative; animation: tvflash 0.6s ease; }
    .tv-champ-empty { justify-content: center; border-color: rgba(27,79,79,0.08) !important; }
    @keyframes tvflash { 0%{opacity:0; transform:scale(.97)} 55%{opacity:1; transform:scale(1.015)} 100%{transform:scale(1)} }
    .tv-champ-crown { position: absolute; top: -1.1vw; left: 1.2vw; width: 2.4vw; height: 2.4vw; border-radius: 50%;
      display: grid; place-items: center; font-size: 1.3vw; box-shadow: 0 4px 12px rgba(27,79,79,0.2); }
    .tv-champ-info { display: flex; flex-direction: column; min-width: 0; }
    .tv-champ-badge { font-size: 1vw; letter-spacing: 0.12em; font-weight: 800; text-transform: uppercase; }
    .tv-champ-name { font-size: 2.6vw; font-weight: 900; line-height: 1.05; color: #143C3C; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tv-champ-amt { font-size: 1.9vw; font-weight: 900; }
    .tv-champ-today { font-style: normal; font-size: 1vw; color: #10b981; font-weight: 700; }

    .tv-strip-right { display: flex; align-items: center; gap: 1.4vw; background: #FFFFFF; border: 1px solid rgba(27,79,79,0.08);
      box-shadow: 0 6px 24px rgba(27,79,79,0.06); border-radius: 1.2vw; padding: 1.4vh 1.6vw; }
    .tv-strip-stat { display: flex; flex-direction: column; }
    .tv-strip-label { font-size: 0.8vw; letter-spacing: 0.14em; color: #5B8079; font-weight: 800; text-transform: uppercase; }
    .tv-strip-value { font-size: 2.2vw; font-weight: 900; line-height: 1.05; color: #1B4F4F; }
    .tv-strip-sub { font-size: 0.8vw; color: #64748B; font-weight: 600; }
    .tv-strip-div { width: 1px; align-self: stretch; background: rgba(27,79,79,0.10); }
    .tv-strip-ring { display: flex; align-items: center; }

    /* Three department columns */
    .tv-cols { flex: 1; min-height: 0; display: flex; gap: 1.4vw; }
    .tv-col { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #FFFFFF;
      border: 1px solid rgba(27,79,79,0.08); box-shadow: 0 6px 24px rgba(27,79,79,0.06);
      border-radius: 1.2vw; overflow: hidden; }
    .tv-col-head { padding: 1.4vh 1.2vw; border-bottom: 1px solid rgba(27,79,79,0.07); }
    .tv-col-title { font-size: 1.5vw; font-weight: 900; display: flex; align-items: center; gap: 0.6vw; }
    .tv-col-stats { display: flex; gap: 1.6vw; margin-top: 0.8vh; }
    .tv-col-stat { display: flex; flex-direction: column; }
    .tv-col-stat span { font-size: 0.75vw; letter-spacing: 0.1em; color: #94A3B8; font-weight: 800; }
    .tv-col-stat b { font-size: 1.5vw; font-weight: 900; color: #1B4F4F; line-height: 1.1; }
    .tv-col-count { font-size: 0.85vw; color: #94A3B8; font-weight: 700; margin-top: 0.6vh; }
    .tv-col-list { flex: 1; min-height: 0; overflow: hidden; padding: 0.8vh 0.9vw; }
    .tv-col-scroll { display: flex; flex-direction: column; gap: 0.7vh; }
    .tv-crow { display: flex; align-items: center; gap: 0.7vw; padding: 0.6vh 0.6vw; border-radius: 0.7vw;
      background: #FBFDFD; border: 1px solid rgba(27,79,79,0.05); }
    .tv-crow-top { background: #F0F9FC; border-color: rgba(28,169,214,0.18); }
    .tv-crank { width: 1.8vw; text-align: center; font-size: 1vw; font-weight: 900; color: #94A3B8; flex-shrink: 0; }
    .tv-crank.medal { font-size: 1.4vw; }
    .tv-crow-main { flex: 1; min-width: 0; }
    .tv-crow-name { font-size: 1.15vw; font-weight: 800; color: #143C3C; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tv-crow-bar { height: 0.5vh; border-radius: 999px; background: rgba(27,79,79,0.08); overflow: hidden; margin-top: 0.3vh; }
    .tv-crow-bar span { display: block; height: 100%; border-radius: 999px; }
    .tv-crow-right { text-align: right; flex-shrink: 0; }
    .tv-crow-amt { font-size: 1.15vw; font-weight: 900; color: #1B4F4F; font-variant-numeric: tabular-nums; }
    .tv-crow-today { font-size: 0.8vw; font-weight: 700; color: #10b981; }

    .tv-avatar { border-radius: 50%; overflow: hidden; display: grid; place-items: center; color: #fff;
      font-weight: 800; flex-shrink: 0; border: 2px solid rgba(27,79,79,0.10); box-shadow: 0 2px 6px rgba(27,79,79,0.10); }
    .tv-avatar img { width: 100%; height: 100%; object-fit: cover; }

    .tv-celebrate { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center;
      background: rgba(27,79,79,0.28); backdrop-filter: blur(6px); animation: tvfade .3s ease; }
    @keyframes tvfade { from{opacity:0} to{opacity:1} }
    .tv-celebrate-card { background: #FFFFFF; border: 1px solid rgba(27,79,79,0.10);
      box-shadow: 0 24px 80px rgba(27,79,79,0.22); border-radius: 2vw; padding: 4vh 5vw;
      display: flex; flex-direction: column; align-items: center; gap: 1.4vh; animation: tvpop .5s cubic-bezier(.2,1.4,.4,1); }
    @keyframes tvpop { from{transform:scale(.6);opacity:0} to{transform:scale(1);opacity:1} }
    .tv-celebrate-congrats { font-size: 3.2vw; font-weight: 900; letter-spacing: 0.02em; color: #1B4F4F; text-align: center;
      background: linear-gradient(90deg,#1B4F4F,#1CA9D6); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .tv-celebrate-badge { font-size: 1.6vw; font-weight: 900; letter-spacing: 0.18em; }
    .tv-celebrate-name { font-size: 3.4vw; font-weight: 900; color: #143C3C; }
    .tv-celebrate-amount { font-size: 5vw; font-weight: 900; line-height: 1; }
    .tv-celebrate-source { font-size: 1.3vw; font-weight: 800; padding: 0.8vh 1.6vw; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.1em; }
    .tv-celebrate-more { font-size: 1.3vw; color: #64748B; font-weight: 700; margin-top: 0.6vh; }
    .tv-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .tv-confetto { position: absolute; top: -5%; animation-name: tvfall; animation-timing-function: linear; animation-iteration-count: 1; }
    @keyframes tvfall { 0%{transform:translateY(-10vh) rotate(0);opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:.9} }
    `}</style>
  )
}
