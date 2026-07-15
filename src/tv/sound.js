// Celebration chime for the TV board — a short triumphant arpeggio generated
// with the Web Audio API (no audio file needed, no external asset).
//
// Browsers block audio until a user gesture, and a TV kiosk gets none after
// load — so the board shows a one-time "Enable sound" button. One tap resumes
// the AudioContext for the whole session; every new-sale celebration then
// plays automatically.

let ctx = null
let enabled = false

export function isSoundEnabled() { return enabled }

/** Resume/create the audio context on a user gesture. Plays a soft confirm. */
export async function enableSound() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') await ctx.resume()
    enabled = true
    playChime(0.18)          // gentle confirmation blip
    return true
  } catch (err) {
    console.warn('[tv] enableSound failed:', err.message)
    return false
  }
}

/** Play the celebration fanfare (no-op if sound isn't enabled yet). */
export function playCelebration() {
  if (!ctx || !enabled) return
  playChime(0.5)
}

function playChime(vol) {
  const t0 = ctx.currentTime
  // Rising C-major arpeggio + an octave sparkle on top.
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const t = t0 + i * 0.11
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(vol, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.55)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.6)
  })
}
