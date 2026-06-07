// Design tokens — the single source of truth for the dashboard's palette.
//
// These mirror the CSS custom properties in src/index.css (:root). Import these
// JS constants anywhere a component needs a color value for inline styles, SVG
// fills, or Recharts props (where Tailwind classes / CSS vars can't reach).
//
// Don't hardcode hex colors in components — import from here so the palette
// stays consistent and is changeable in one place.

export const PRIMARY = '#1B4F4F' // brand teal
export const PRIMARY_DARK = '#0f3a3a' // gradient end / hover
export const ACCENT = '#F5A623' // gold
export const BG = '#F8FAFA'
export const SURFACE = '#FFFFFF'

// Semantic status colors (used by attendance cells, verdict chips, deltas).
export const POSITIVE = '#10b981' // emerald-500 — good / showed / profit
export const WARNING = '#f59e0b' // amber-500 — caution / mid
export const NEGATIVE = '#ef4444' // red-500 — bad / no-show / loss

// Show-up / health rate thresholds → color. Shared so every tab grades the
// same way (matrix legend, heat cells, etc.).
export function rateColor(pct) {
  if (pct === null || pct === undefined) return '#d1d5db' // gray-300 (no data)
  if (pct >= 70) return POSITIVE
  if (pct >= 40) return WARNING
  return NEGATIVE
}

export const theme = { PRIMARY, PRIMARY_DARK, ACCENT, BG, SURFACE, POSITIVE, WARNING, NEGATIVE }
export default theme
