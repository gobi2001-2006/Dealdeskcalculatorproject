import { useId } from 'react'
import { BRAND_RING, BRAND_SPECTRUM } from './brandColors'

/*
 * Adrenalin brand marks, drawn as SVG from the reference artwork supplied for Phase 3
 * (round "a" badge with a four-colour ring; lowercase wordmark with ® and a spectrum underline).
 * This is the single place the brand is defined: the top navigation, the login page and the
 * favicon (public/favicon.svg) all use these shapes. Replace them here when the official
 * vector files arrive.
 */


/** Round "a" badge. `badge` draws the light disc behind the ring (as in the app icon). */
export function AdrenalinMark({ size = 32, badge = true, onDark = false, className = '', title = 'adrenalin' }) {
  const ink = onDark && !badge ? '#ffffff' : '#111111'
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}
      xmlns="http://www.w3.org/2000/svg">
      {badge && <circle cx="32" cy="32" r="31" fill="#f2f2f2" stroke="#d9d9d9" strokeWidth="2" />}
      <g fill="none" strokeWidth="5" strokeLinecap="butt">
        <path d="M16.44 16.44 A22 22 0 0 1 47.56 16.44" stroke={BRAND_RING.top} />
        <path d="M47.56 16.44 A22 22 0 0 1 47.56 47.56" stroke={BRAND_RING.right} />
        <path d="M47.56 47.56 A22 22 0 0 1 16.44 47.56" stroke={BRAND_RING.bottom} />
        <path d="M16.44 47.56 A22 22 0 0 1 16.44 16.44" stroke={BRAND_RING.left} />
      </g>
      <text x="32" y="41.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700"
        fontSize="30" fill={ink}>a</text>
    </svg>
  )
}

/** Lowercase "adrenalin" wordmark with ® and the spectrum underline. */
export function AdrenalinWordmark({ height = 28, onDark = false, className = '' }) {
  const gradientId = `adrenalin-spectrum-${useId().replace(/:/g, '')}`
  const ink = onDark ? '#ffffff' : '#111111'
  return (
    <svg className={className} height={height} width={Math.round((height * 140) / 40)} viewBox="0 0 140 40"
      role="img" aria-label="adrenalin" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          {BRAND_SPECTRUM.map((c, i) => (
            <stop key={c} offset={i / (BRAND_SPECTRUM.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <text x="0" y="27" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="30"
        textLength="128" lengthAdjust="spacingAndGlyphs" fill={ink}>adrenalin</text>
      <text x="129.5" y="11" fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fill={ink}>®</text>
      <rect x="1" y="34" width="127" height="2.5" rx="1.25" fill={`url(#${gradientId})`} />
    </svg>
  )
}

/** Badge + wordmark, used in the top navigation. */
export function AdrenalinBrand({ onDark = false, height = 30, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <AdrenalinMark size={height} />
      <AdrenalinWordmark height={Math.round(height * 0.8)} onDark={onDark} />
    </span>
  )
}

export default AdrenalinBrand
