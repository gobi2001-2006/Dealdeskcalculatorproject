import { useId } from 'react'

/**
 * Adrenalin wordmark, taken from the v3.1 prototype, where it is marked as a placeholder
 * ("swap for the official logo asset"). Replace this one component when the official asset arrives.
 */
export function AdrenalinLogo({ onDark = false, height = 26, className = '' }) {
  const gradientId = `adrenalin-logo-${useId().replace(/:/g, '')}`
  return (
    <svg
      className={className}
      height={height}
      width={Math.round((height * 150) / 32)}
      viewBox="0 0 150 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="adrenalin"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8f4e14" />
          <stop offset="1" stopColor="#e39a4a" />
        </linearGradient>
      </defs>
      <path d="M2 28 L13 4 L17.5 13 L21.5 8.5 L31 28 Z" fill={`url(#${gradientId})`} />
      <path d="M10 28 L16 17 L22 28 Z" fill={onDark ? '#0b1220' : '#ffffff'} />
      <text
        x="37"
        y="23.5"
        fontFamily="'Space Grotesk', Inter, 'Segoe UI', sans-serif"
        fontWeight="700"
        fontSize="21"
        fill={onDark ? '#f3ecdf' : '#0b1220'}
        letterSpacing="-0.4"
      >
        adrenalin
      </text>
    </svg>
  )
}

export default AdrenalinLogo
