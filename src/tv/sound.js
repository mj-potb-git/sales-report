// Celebration sound + voice for the TV board — as LOUD and hype as possible so
// it carries across the floor: a triumphant fanfare, a crowd APPLAUSE swell,
// and a spoken congratulations by name. All synthesized (no audio files).
//
// A brick-wall limiter keeps everything hot without distorting. Real loudness
// still depends on the TV's own volume — turn that up too.
//
// Browsers block audio until a user gesture, and a TV kiosk gets none after
// load — so the board shows a one-time "Enable sound" button that unlocks
// everything for the whole session.

let ctx = null
let master = null      // everything routes here → limiter → speakers
let enabled = false

export function isSoundEnabled() { return enabled }

function ensureGraph() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (!master) {
    master = ctx.createGain()
    master.gain.value = 1
    // Limiter so layered fanfare + applause stay loud but never clip harshly.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.2
    master.connect(limiter)
    limiter.connect(ctx.destination)
  }
}

/** Enable audio. Safe to call on load (best-effort) or on a user gesture.
 *  Never blocks: marks enabled and resumes in the background so a celebration
 *  right after this still fires. On a gesture, resume() succeeds and it's
 *  audible; on autoplay-allowed TV/kiosk browsers it's audible from load. */
export function enableSound() {
  try {
    ensureGraph()
    enabled = true
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    try { window.speechSynthesis?.getVoices() } catch { /* ignore */ }
    return true
  } catch (err) {
    console.warn('[tv] enableSound failed:', err.message)
    return false
  }
}

/** Full celebration: loud fanfare + applause, then a spoken congratulations. */
export function celebrate(text) {
  if (!ctx) return
  enabled = true
  if (ctx.state === 'suspended') ctx.resume().catch(() => {}) // last-ditch resume
  playFanfare(1.0, false)
  playApplause(0.9, 3.6)
  // Announce shortly after the fanfare hit (kept snappy so it fits a short show).
  setTimeout(() => speak(text), 700)
}

/** Loud fanfare only (kept for compatibility). */
export function playCelebration() {
  if (!ctx || !enabled) return
  playFanfare(1.0, false)
  playApplause(0.9, 3.6)
}

/** Speak a congratulations line via the browser voice (voice AI). */
export function speak(text) {
  if (!enabled) return
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.0
    u.pitch = 1.15
    u.volume = 1
    const voices = synth.getVoices()
    const pick = voices.find(v => /Google US English|Samantha|en-US/i.test(`${v.name} ${v.lang}`))
             || voices.find(v => /^en/i.test(v.lang))
    if (pick) u.voice = pick
    synth.cancel()
    synth.speak(u)
  } catch (err) {
    console.warn('[tv] speak failed:', err.message)
  }
}

// A bright ascending run + a sustained major triad.
function playFanfare(vol, soft) {
  const t0 = ctx.currentTime
  const run = [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5 E5 G5 C6 E6
  run.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const t = t0 + i * 0.09
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(vol, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.45)
    osc.connect(gain); gain.connect(master)
    osc.start(t); osc.stop(t + 0.5)
  })
  if (soft) return
  const chordAt = t0 + run.length * 0.09 + 0.05
  ;[523.25, 659.25, 783.99, 1046.5].forEach(freq => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, chordAt)
    gain.gain.linearRampToValueAtTime(vol * 0.6, chordAt + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0008, chordAt + 1.3)
    osc.connect(gain); gain.connect(master)
    osc.start(chordAt); osc.stop(chordAt + 1.4)
  })
}

// Crowd applause: filtered noise that swells in, sustains, then fades — with a
// scatter of sharper "clap" transients on top so it reads as a real ovation.
function playApplause(vol, dur = 3.4) {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * dur)
  const buffer = ctx.createBuffer(1, len, sr)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  // scatter louder clap transients
  const claps = Math.floor(dur * 22)
  for (let c = 0; c < claps; c++) {
    const start = Math.floor(Math.random() * (len - 400))
    const amp = 1.5 + Math.random()
    for (let j = 0; j < 300; j++) {
      data[start + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / 60)
    }
  }

  const src = ctx.createBufferSource()
  src.buffer = buffer
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1700
  bp.Q.value = 0.6
  const gain = ctx.createGain()
  const t0 = ctx.currentTime
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.5)          // swell in
  gain.gain.setValueAtTime(vol, t0 + dur - 1.2)             // hold
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur)  // fade out
  src.connect(bp); bp.connect(gain); gain.connect(master)
  src.start(t0); src.stop(t0 + dur)
}
