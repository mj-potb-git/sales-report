import { useState } from 'react'

// Pinoy Online Travel Biz logo.
// Prefers a real raster at /logo.png (drop one in public/ for pixel-perfect),
// and falls back to a faithful inline SVG recreation — a cyan→teal "P" stem
// with a gold loop and a little gold airplane — so the brand mark always shows.
export default function PotbLogo({ size = 64, withWordmark = false, className = '' }) {
  const [useImg, setUseImg] = useState(true)

  const mark = useImg ? (
    <img
      src="/logo.png"
      alt="Pinoy Online Travel Biz"
      style={{ height: size, width: 'auto' }}
      onError={() => setUseImg(false)}
    />
  ) : (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img"
         aria-label="Pinoy Online Travel Biz" className="block">
      <defs>
        <linearGradient id="potbStem" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#0E6E91" />
          <stop offset="100%" stopColor="#29ABE2" />
        </linearGradient>
      </defs>
      {/* Gold loop of the P (thick right-side arc) */}
      <path d="M47 20 A22 22 0 0 1 47 64"
            fill="none" stroke="#F9B233" strokeWidth="13" strokeLinecap="round" />
      {/* Blue vertical stem */}
      <rect x="33" y="16" width="15" height="68" rx="7.5" fill="url(#potbStem)" />
      {/* Little gold airplane, angled up-right, top-left of the P */}
      <g transform="translate(12 16) rotate(-18)" fill="#F9B233">
        <path d="M0 9 L18 2 L14 11 L20 14 L16 18 L9 15 L6 22 L3 14 L0 13 Z" />
      </g>
    </svg>
  )

  if (!withWordmark) return <span className={className}>{mark}</span>

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      {mark}
      <span className="font-extrabold leading-tight tracking-tight" style={{ fontSize: size * 0.32 }}>
        Pinoy Online<br />Travel Biz
      </span>
    </span>
  )
}
