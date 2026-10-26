import { useState } from 'react'
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
  Search,
  X,
  Package,
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
  Package,
}

export function RateCardProductsSidebar({
  families = [],
  products = [],
  selectedFamilyId = 'all',
  onSelectFamily,
  onOpenAddProduct,
  className = '',
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const totalCount = products.length

  const getFamilyCount = (familyId) => {
    return products.filter((p) => p.familyId === familyId).length
  }

  const filteredFamilies = families.filter((f) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (f.name && f.name.toLowerCase().includes(q)) ||
      (f.code && f.code.toLowerCase().includes(q))
    )
  })

  return (
    <aside
      aria-label="Products and Families Navigation"
      className={`w-72 bg-white border-r border-slate-200/90 flex flex-col justify-between shrink-0 select-none overflow-hidden h-full z-10 ${className}`}
    >
      {/* 1. Header with Catalog count */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
            Products & Families
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full font-semibold">
          {families.length}
        </span>
      </div>

      {/* 2. Search Filter Input */}
      <div className="p-2.5 border-b border-slate-100 bg-white shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search families..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Independently Scrollable Family Navigation List */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-50 py-1">
        <nav aria-label="Product Families List" className="px-1.5 space-y-0.5">
          {/* All Families Option */}
          <button
            type="button"
            onClick={() => onSelectFamily('all')}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left rounded-lg transition-all cursor-pointer ${
              selectedFamilyId === 'all'
                ? 'bg-orange-50 text-orange-950 font-semibold border border-orange-200/80 shadow-2xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Layers
                className={`w-4 h-4 shrink-0 ${
                  selectedFamilyId === 'all' ? 'text-orange-600' : 'text-slate-400'
                }`}
                aria-hidden="true"
              />
              <span className="truncate">All Families</span>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                selectedFamilyId === 'all'
                  ? 'bg-orange-200/80 text-orange-900'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {totalCount}
            </span>
          </button>

          {/* Filtered Families */}
          {filteredFamilies.map((family) => {
            const Icon = ICON_MAP[family.iconName] || Layers
            const count = getFamilyCount(family.id)
            const isActive = selectedFamilyId === family.id

            return (
              <button
                key={family.id}
                type="button"
                onClick={() => onSelectFamily(family.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left rounded-lg transition-all cursor-pointer ${
                  isActive
                    ? 'bg-orange-50 text-orange-950 font-semibold border border-orange-200/80 shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-orange-600' : 'text-slate-400'
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
                      ? 'bg-orange-200/80 text-orange-900'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}

          {filteredFamilies.length === 0 && (
            <div className="py-6 px-4 text-center text-xs text-slate-400 space-y-1">
              <p>No matching product families found.</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[11px] text-orange-600 font-medium hover:underline"
              >
                Clear search filter
              </button>
            </div>
          )}
        </nav>
      </div>

      {/* 4. Bottom-Pinned Action: + Add Product Button */}
      <div className="p-3 border-t border-slate-200/90 bg-slate-50/80 shrink-0">
        <button
          type="button"
          onClick={onOpenAddProduct}
          className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-2xs transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 cursor-pointer active:scale-[0.99]"
          aria-label="Add a new product"
        >
          <Plus className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
          <span>Add Product</span>
        </button>
      </div>
    </aside>
  )
}

export default RateCardProductsSidebar
