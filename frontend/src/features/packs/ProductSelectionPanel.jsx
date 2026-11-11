import { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Layers,
  X,
} from 'lucide-react'
import { ProductTypeBadge } from '../catalogue/ProductTypeBadge'

const ICON_MAP = {
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Layers,
}

export function ProductSelectionPanel({
  families = [],
  allProducts = [],
  selectedProductIds = [],
  requiredProductIds = [],
  onToggleProduct,
  onRemoveProduct,
  onToggleRequired,
}) {
  const [searchTerm, setSearchTerm] = useState('')

  // Expanded families state: object map of familyId -> boolean
  const [expandedFamilies, setExpandedFamilies] = useState(() => {
    // Default: expand all families on initial load
    const initial = {}
    families.forEach((f) => {
      initial[f.id] = true
    })
    return initial
  })

  // Expand all families
  const handleExpandAll = () => {
    const updated = {}
    families.forEach((f) => {
      updated[f.id] = true
    })
    setExpandedFamilies(updated)
  }

  // Collapse all families
  const handleCollapseAll = () => {
    const updated = {}
    families.forEach((f) => {
      updated[f.id] = false
    })
    setExpandedFamilies(updated)
  }

  // Toggle single family
  const toggleFamily = (familyId) => {
    setExpandedFamilies((prev) => ({
      ...prev,
      [familyId]: !prev[familyId],
    }))
  }

  // Filter products by search term without losing selected items
  const filteredProductsByFamily = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return families.map((family) => {
      const familyProducts = allProducts.filter((p) => p.familyId === family.id)

      if (!query) {
        return {
          family,
          products: familyProducts,
          matchCount: familyProducts.length,
        }
      }

      const matching = familyProducts.filter((p) => {
        const matchSolution = p.solution.toLowerCase().includes(query)
        const matchSub = (p.subItem || '').toLowerCase().includes(query)
        const matchCode = p.code.toLowerCase().includes(query)
        const matchFamily = (p.familyName || '').toLowerCase().includes(query)
        return matchSolution || matchSub || matchCode || matchFamily
      })

      return {
        family,
        products: matching,
        matchCount: matching.length,
      }
    })
  }, [families, allProducts, searchTerm])

  // Selected products details for the bottom summary
  const selectedProductList = useMemo(() => {
    return selectedProductIds
      .map((id) => allProducts.find((p) => p.id === id))
      .filter(Boolean)
  }, [selectedProductIds, allProducts])

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden mb-4">
      {/* 1. Header: Title, Subtitle, Expand All, Collapse, Search */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-[19px] sm:text-[20px] font-bold text-slate-900 tracking-tight leading-snug">
              Select Products & Features
            </h2>
            <p className="text-[12px] text-slate-500 mt-1">
              Grouped by L1 family — expand to pick L2/L3 items.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Expand / Collapse Controls */}
            <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={handleExpandAll}
                className="px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 border-r border-slate-200 cursor-pointer"
                title="Expand all families"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                title="Collapse all families"
              >
                Collapse
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-64">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products or codes..."
                className="w-full pl-9 pr-3 py-1.5 text-[13px] bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 placeholder:text-slate-400 shadow-2xs"
                aria-label="Search products or codes"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Family Accordions & Product Rows */}
      <div className="divide-y divide-slate-100">
        {filteredProductsByFamily.map(({ family, products: familyItems, matchCount }) => {
          const Icon = ICON_MAP[family.iconName] || Layers
          const isExpanded = Boolean(expandedFamilies[family.id])
          const selectedInFamily = familyItems.filter((p) =>
            selectedProductIds.includes(p.id),
          ).length

          return (
            <div key={family.id} className="transition-colors">
              {/* Family Accordion Header */}
              <button
                type="button"
                onClick={() => toggleFamily(family.id)}
                className="w-full px-4 sm:px-5 py-3 bg-slate-50/70 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
                aria-expanded={isExpanded}
                aria-label={`Toggle family ${family.name}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-6 h-6 rounded bg-slate-200/70 text-slate-700 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <span className="text-[14px] sm:text-[15px] font-bold text-slate-800 truncate">
                    {family.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                    {matchCount} {matchCount === 1 ? 'item' : 'items'}
                  </span>
                  {selectedInFamily > 0 && (
                    <span className="text-[10px] font-mono font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                      {selectedInFamily} picked
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-slate-400">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  )}
                </div>
              </button>

              {/* Family Items Table / List */}
              {isExpanded && (
                <div className="overflow-x-auto">
                  {familyItems.length === 0 ? (
                    <div className="py-6 px-4 text-center text-[12px] text-slate-400 italic bg-white">
                      {searchTerm
                        ? `No products in ${family.name} match "${searchTerm}"`
                        : `No products available in ${family.name}.`}
                    </div>
                  ) : (
                    <table
                      className="w-full text-left border-collapse bg-white"
                      aria-label={`${family.name} Products`}
                    >
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <tr>
                          <th scope="col" className="w-12 py-2.5 px-3.5 text-center">
                            Pick
                          </th>
                          <th scope="col" className="py-2.5 px-3.5">
                            L2 Solution / Module
                          </th>
                          <th scope="col" className="py-2.5 px-3.5">
                            L3 Partner / Sub-item
                          </th>
                          <th scope="col" className="py-2.5 px-3.5 font-mono">
                            Code
                          </th>
                          <th scope="col" className="py-2.5 px-3.5">
                            Product Type
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[12px] sm:text-[13px]">
                        {familyItems.map((prod) => {
                          const isSelected = selectedProductIds.includes(prod.id)

                          return (
                            <tr
                              key={prod.id}
                              onClick={() => onToggleProduct(prod.id)}
                              className={`transition-colors cursor-pointer select-none ${
                                isSelected
                                  ? 'bg-orange-50/50 hover:bg-orange-50'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              {/* Checkbox column */}
                              <td
                                className="py-2.5 px-3.5 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => onToggleProduct(prod.id)}
                                  className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500 cursor-pointer"
                                  aria-label={`Select ${prod.solution}`}
                                />
                              </td>

                              {/* L2 Solution */}
                              <td className="py-2.5 px-3.5 font-medium text-slate-900">
                                {prod.solution}
                              </td>

                              {/* L3 Partner / Sub-item */}
                              <td className="py-2.5 px-3.5 text-slate-500">
                                {prod.subItem || '—'}
                              </td>

                              {/* Product Code */}
                              <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-700">
                                {prod.code}
                              </td>

                              {/* Product Type */}
                              <td className="py-2.5 px-3.5">
                                <ProductTypeBadge type={prod.type} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 3. Selected Products Summary at bottom of panel */}
      <div className="p-4 bg-slate-50/80 border-t border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Selected Products ({selectedProductList.length})
          </span>
          {selectedProductList.length > 0 && (
            <span className="text-[10px] text-slate-400">
              Click &times; to remove an item from this pack
            </span>
          )}
        </div>

        {selectedProductList.length === 0 ? (
          <div className="py-3 text-center text-xs text-slate-400 italic">
            No products selected yet
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {selectedProductList.map((prod) => {
              const isRequired = requiredProductIds.includes(prod.id)
              return (
                <span
                  key={prod.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-white border border-slate-300 text-slate-800 shadow-2xs"
                >
                  <span className="font-mono text-[10px] text-slate-500">
                    {prod.code}
                  </span>
                  <span className="font-medium truncate max-w-[180px]" title={prod.solution}>
                    {prod.solution}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleRequired?.(prod.id)
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      isRequired
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
                    }`}
                    title={isRequired ? 'Marked as Required (click to make Optional)' : 'Marked as Optional (click to make Required)'}
                    aria-label={`Toggle requirement for ${prod.solution}`}
                  >
                    {isRequired ? 'Required' : 'Optional'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveProduct(prod.id)}
                    className="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    title={`Remove ${prod.solution}`}
                    aria-label={`Remove ${prod.solution}`}
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProductSelectionPanel
