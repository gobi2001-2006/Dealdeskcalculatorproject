import { AlertTriangle, Clock } from 'lucide-react'

/**
 * Backend calculation caveats that must never be hidden:
 * - stale: the saved proposal changed after this snapshot was calculated;
 * - warnings: limitations reported by the engine (e.g. countries not priced separately).
 */
export function CalculationNotices({ totals, isLocallyModified = false }) {
  if (!totals) return null
  const stale = totals.isStale === true || isLocallyModified
  if (!stale && totals.warnings.length === 0) return null

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {stale && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-[11px] text-amber-900">
          <Clock className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            Outdated calculation: the proposal changed after snapshot #{totals.snapshotId} was calculated.
            Recalculate before relying on these figures.
          </span>
        </div>
      )}
      {totals.warnings.map((w) => (
        <div
          key={w}
          className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg border border-orange-300 bg-orange-50 text-[11px] text-orange-900"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-orange-600" aria-hidden="true" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  )
}

export default CalculationNotices
