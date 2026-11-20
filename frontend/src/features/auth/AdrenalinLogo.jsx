import { AdrenalinMark, AdrenalinWordmark } from '../../components/brand/AdrenalinBrand'

/** Login-page logo: the shared Adrenalin badge and wordmark (defined once in components/brand). */
export function AdrenalinLogo({ onDark = false, height = 26, className = '' }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height / 3) }}>
      <AdrenalinMark size={Math.round(height * 1.15)} />
      <AdrenalinWordmark height={height} onDark={onDark} />
    </span>
  )
}

export default AdrenalinLogo
