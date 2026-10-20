import {
  Layers,
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Briefcase,
  Sparkles,
  ShieldCheck,
  HeartHandshake,
  Plus,
} from 'lucide-react'

const ICON_MAP = {
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Briefcase,
  Sparkles,
  ShieldCheck,
  Layers,
  HeartHandshake,
}

export function RateCardProductsSidebar({
  families = [],
  products = [],
  selectedFamilyId = 'all',
  onSelectFamily,
  onOpenAddProduct,
}) {
  const totalCount = products.length

  const getFamilyCount = (familyId) => {
    return products.filter((p) => p.familyId === familyId).length
  }

  return (
    <aside
      aria-label="Products and Families Navigation"
      className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none overflow-hidden"
    >
      {/* Top Section: Header & Family List */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            PRODUCTS & FAMILIES
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {families.length}
          </span>
        </div>

        <nav aria-label="Product Families List" className="py-2 space-y-0.5">
          {/* All Families option */}
          <button
            type="button"
            onClick={() => onSelectFamily('all')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-left transition-colors cursor-pointer ${
              selectedFamilyId === 'all'
                ? 'bg-[#FEF3EC] border-l-4 border-[#F26522] text-[#9A3412] font-semibold pl-2.5'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-l-4 border-transparent'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Layers
                className={`w-4 h-4 shrink-0 ${
                  selectedFamilyId === 'all' ? 'text-[#F26522]' : 'text-slate-400'
                }`}
                aria-hidden="true"
              />
              <span className="truncate">All Families</span>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                selectedFamilyId === 'all'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {totalCount}
            </span>
          </button>

          {/* Individual Families */}
          {families.map((family) => {
            const Icon = ICON_MAP[family.iconName] || Layers
            const count = getFamilyCount(family.id)
            const isActive = selectedFamilyId === family.id

            return (
              <button
                key={family.id}
                type="button"
                onClick={() => onSelectFamily(family.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#FEF3EC] border-l-4 border-[#F26522] text-[#9A3412] font-semibold pl-2.5'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#F26522]' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate" title={family.name}>
                    {family.name}
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                    isActive
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom Pinned: + Add Product Button */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
        <button
          type="button"
          onClick={onOpenAddProduct}
          className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-2xs transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 cursor-pointer"
          aria-label="Add a new product"
        >
          <Plus className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
          <span>Add Product</span>
        </button>
      </div>
    </aside>
  )
}
