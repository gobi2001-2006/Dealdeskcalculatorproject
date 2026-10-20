import { Save } from 'lucide-react'

export function PackSaveBar({
  typeCounts = { total: 0, native: 0, aiAgent: 0, partner: 0 },
  onSave,
  onCancel,
  isSaving = false,
}) {
  return (
    <footer
      aria-label="Pack Builder Action Bar"
      className="bg-[#0B1528] text-white border-t border-slate-800 px-4 sm:px-6 py-2.5 shrink-0 flex items-center justify-between select-none z-20 shadow-md"
    >
      {/* Four Live Counters */}
      <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto py-1">
        {/* Total Products */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase font-semibold tracking-wider text-slate-400">
            Products:
          </span>
          <span className="font-mono text-sm font-bold text-white bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700">
            {typeCounts.total}
          </span>
        </div>

        {/* Adrenalin Native */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden="true" />
          <span className="text-[11px] font-medium text-slate-300">
            Adrenalin:
          </span>
          <span className="font-mono text-xs font-semibold text-blue-300">
            {typeCounts.native}
          </span>
        </div>

        {/* AI Agent Module */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" aria-hidden="true" />
          <span className="text-[11px] font-medium text-slate-300">
            AI Agent:
          </span>
          <span className="font-mono text-xs font-semibold text-purple-300">
            {typeCounts.aiAgent}
          </span>
        </div>

        {/* Partner Integrated */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" aria-hidden="true" />
          <span className="text-[11px] font-medium text-slate-300">
            Partner:
          </span>
          <span className="font-mono text-xs font-semibold text-orange-300">
            {typeCounts.partner}
          </span>
        </div>
      </div>

      {/* Save Pack Action Button & Cancel */}
      <div className="flex items-center gap-2.5 shrink-0 pl-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg bg-[#F26522] hover:bg-orange-600 active:bg-orange-700 text-white shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          <span>Save Pack</span>
        </button>
      </div>
    </footer>
  )
}

export default PackSaveBar
