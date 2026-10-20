import { Package, Plus } from 'lucide-react'
import { calculatePackTypeCounts } from '../../data/packsData'

export function PacksSidebar({
  packs = [],
  allProducts = [],
  selectedPackId,
  onSelectPack,
  onCreateNewClick,
}) {
  return (
    <aside
      aria-label="Saved Packs"
      className="w-full md:w-[360px] lg:w-[380px] bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none overflow-hidden"
    >
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
            <Package className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Packs
          </h2>
        </div>
        <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full">
          {packs.length}
        </span>
      </div>

      {/* Scrollable Pack Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {packs.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-xs font-medium text-slate-600">No packs saved yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click &quot;Create New Pack&quot; below to build your first preset.
            </p>
          </div>
        ) : (
          packs.map((pack) => {
            const isSelected = selectedPackId === pack.id
            const typeCounts = calculatePackTypeCounts(pack.productIds, allProducts)

            return (
              <div
                key={pack.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPack(pack.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectPack(pack.id)
                  }
                }}
                className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                  isSelected
                    ? 'bg-[#FEF3EC] border-[#F26522] border-l-4 shadow-xs ring-1 ring-orange-500/20'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200 shadow-2xs hover:border-slate-300'
                }`}
              >
                {/* Pack Header: Name and Counts */}
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: pack.color || '#F26522' }}
                      aria-hidden="true"
                    />
                    <h3
                      className="text-xs font-bold truncate leading-tight"
                      style={{ color: pack.color || '#9A3412' }}
                      title={pack.name}
                    >
                      {pack.name}
                    </h3>
                  </div>

                  {/* Code & Product Count */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {pack.code && (
                      <span className="font-mono text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {pack.code}
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-slate-500">
                      {typeCounts.total} {typeCounts.total === 1 ? 'product' : 'products'}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p className="mt-2 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {pack.description || (
                    <span className="text-slate-400 italic">No description</span>
                  )}
                </p>

                {/* Product Type Count Badges */}
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap text-[10px]">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium border border-blue-200/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" aria-hidden="true" />
                    <span>Native: {typeCounts.native}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium border border-purple-200/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-600" aria-hidden="true" />
                    <span>AI Agent: {typeCounts.aiAgent}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium border border-orange-200/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-600" aria-hidden="true" />
                    <span>Partner: {typeCounts.partner}</span>
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Bottom Pinned: + Create New Pack Button */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
        <button
          type="button"
          onClick={onCreateNewClick}
          className="w-full py-2.5 px-4 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 cursor-pointer"
          aria-label="Create New Pack"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Create New Pack</span>
        </button>
      </div>
    </aside>
  )
}

export default PacksSidebar
