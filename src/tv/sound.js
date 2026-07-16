// Celebration sound + voice announcement for the TV board.
//
// Sound is a triumphant fanfare generated with the Web Audio API (no asset).
// Voice uses the browser's built-in speech synthesis (voice AI) to announce
// the seller by name — "Congratulations <name>! New sale!".
//
// Browsers block audio until a user gesture, and a TV kiosk gets none after
// load — so the board shows a one-time "Enable sound" button. One tap unlocks
// both the fanfare and the voice for the whole session.

let ctx = null
let enabled = false

export function isSoundEnabled() { return enabled }

/** Resume/create audio + warm the voice engine on a user gesture. */
export async function enableSound() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') await ctx.resume()
    enabled = true
    // Warm the speech engine (voice list often loads lazily on first use).
    try { window.speechSynthesis?.getVoices() } catch { /* ignore */ }
    playFanfare(0.25, true)   // gentle confirmation
    return true
  } catch (err) {
    console.warn('[tv] enableSound failed:', err.message)
    return false
  }
}

/** Loud celebration fanfare (no-op until sound is enabled). */
export function playCelebration() {
  if (!ctx || !enabled) return
  playFanfare(0.8, false)
}

/** Speak a congratulations line via the browser voice (no-op if not enabled). */
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
    // Prefer a clear English voice; fall back to the default.
    const pick = voices.find(v => /Google US English|Samantha|en-US/i.test(`${v.name} ${v.lang}`))
             || voices.find(v => /^en/i.test(v.lang))
    if (pick) u.voice = pick
    synth.cancel()      // interrupt any previous announcement
    synth.speak(u)
  } catch (err) {
    console.warn('[tv] speak failed:', err.message)
  }
}

// A richer, louder fanfare: a fast ascending run, then a sustained major triad.
function playFanfare(vol, soft) {
  const t0 = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 1
  master.connect(ctx.destination)

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

  // Sustained triumphant chord after the run (C major, C5-E5-G5-C6).
  const chordAt = t0 + run.length * 0.09 + 0.05
  ;[523.25, 659.25, 783.99, 1046.5].forEach(freq => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, chordAt)
    gain.gain.linearRampToValueAtTime(vol * 0.7, chordAt + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0008, chordAt + 1.1)
    osc.connect(gain); gain.connect(master)
    osc.start(chordAt); osc.stop(chordAt + 1.2)
  })
}
