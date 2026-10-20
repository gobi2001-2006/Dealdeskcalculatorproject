import { CheckCircle2, Lock, Sparkles } from 'lucide-react'
import { INITIAL_PRODUCTS } from '../../../data/catalogueData'

export function FeaturesTable({
  familyId,
  packProductIds = [],
  selectedFeatureIds = [],
  onToggleFeature,
}) {
  // Find all catalogue features belonging to this product family
  const familyProducts = INITIAL_PRODUCTS.filter((p) => p.familyId === familyId)

  if (familyProducts.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-slate-400">
        No additional features configured for this family.
      </div>
    )
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          <h4 className="text-xs font-bold text-slate-900 tracking-tight">
            À la Carte Features & Add-ons
          </h4>
          <span className="text-[10px] text-slate-500">
            ({familyProducts.length} catalogue items)
          </span>
        </div>
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          Features in pack are automatically locked to prevent duplicate charges.
        </span>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="À la carte features">
            <thead className="bg-slate-50 text-[10px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th scope="col" className="py-2 px-3 w-10 text-center">
                  Select
                </th>
                <th scope="col" className="py-2 px-3">
                  Feature / Solution
                </th>
                <th scope="col" className="py-2 px-3">
                  SKU / Code
                </th>
                <th scope="col" className="py-2 px-3">
                  Product Type
                </th>
                <th scope="col" className="py-2 px-3">
                  Pack Status
                </th>
                <th scope="col" className="py-2 px-3 text-right">
                  Feature Pricing
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {familyProducts.map((prod) => {
                const isIncludedInPack = packProductIds.includes(prod.id)
                const isSelectedAlaCarte = selectedFeatureIds.includes(prod.id)
                const isChecked = isIncludedInPack || isSelectedAlaCarte

                return (
                  <tr
                    key={prod.id}
                    className={`transition-colors ${
                      isIncludedInPack
                        ? 'bg-emerald-50/40 text-slate-900'
                        : isSelectedAlaCarte
                        ? 'bg-orange-50/30 text-slate-900'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Checkbox column */}
                    <td className="py-2.5 px-3 text-center">
                      <label className="inline-flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isIncludedInPack}
                          onChange={() => {
                            if (!isIncludedInPack) {
                              onToggleFeature(prod.id)
                            }
                          }}
                          className={`w-4 h-4 rounded border-slate-300 transition-colors ${
                            isIncludedInPack
                              ? 'text-emerald-600 cursor-not-allowed opacity-80'
                              : 'text-orange-600 focus:ring-orange-500 cursor-pointer'
                          }`}
                          aria-label={`Select ${prod.subItem || prod.solution}`}
                        />
                      </label>
                    </td>

                    {/* Feature name */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 text-xs">
                        {prod.subItem}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">
                        {prod.solution}
                      </div>
                    </td>

                    {/* SKU Code */}
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                      {prod.code}
                    </td>

                    {/* Type badge */}
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          prod.type === 'AI Agent Module'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : prod.type === 'Partner Integrated'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {prod.type}
                      </span>
                    </td>

                    {/* Pack Status Badge */}
                    <td className="py-2.5 px-3">
                      {isIncludedInPack ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs"
                          title="Included in base pack — will not be double-charged"
                        >
                          <Lock className="w-2.5 h-2.5 text-emerald-600" aria-hidden="true" />
                          <span>Included in Pack</span>
                        </span>
                      ) : isSelectedAlaCarte ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                          <CheckCircle2 className="w-2.5 h-2.5 text-orange-600" aria-hidden="true" />
                          <span>À la Carte Added</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Available</span>
                      )}
                    </td>

                    {/* Pricing column */}
                    <td className="py-2.5 px-3 text-right">
                      {isIncludedInPack ? (
                        <span className="text-[11px] font-medium text-emerald-700">
                          Covered in Pack
                        </span>
                      ) : isSelectedAlaCarte ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 italic"
                          title="Pricing pending backend calculation"
                        >
                          <span>Pending backend pricing</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default FeaturesTable
