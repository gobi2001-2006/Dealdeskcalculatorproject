import { CheckCircle2, Lock, Sparkles } from 'lucide-react'
import { INITIAL_PRODUCTS } from '../../../data/catalogueData'

export function FeaturesTable({
  familyId,
  packProductIds = [],
  selectedFeatureIds = [],
  onToggleFeature,
  products = [],
}) {
  const productList = products.length > 0 ? products : INITIAL_PRODUCTS

  // Find all catalogue features belonging to this product family
  const familyProducts = productList.filter(
    (p) =>
      String(p.product_family_id) === String(familyId) ||
      String(p.familyId) === String(familyId)
  )

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
                const isIncludedInPack = packProductIds.some(
                  (pId) => String(pId) === String(prod.id)
                )
                const isSelectedAlaCarte = selectedFeatureIds.some(
                  (sId) => String(sId) === String(prod.id)
                )
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
                          aria-label={`Select ${prod.name || prod.subItem || prod.solution}`}
                        />
                      </label>
                    </td>

                    {/* Name */}
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {prod.name || prod.subItem || prod.solution}
                    </td>

                    {/* Code */}
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                      {prod.code}
                    </td>

                    {/* Classification */}
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {prod.classification || prod.productType || 'Standard Module'}
                    </td>

                    {/* Pack Status */}
                    <td className="py-2.5 px-3">
                      {isIncludedInPack ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          <Lock className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                          <span>Included in Pack</span>
                        </span>
                      ) : isSelectedAlaCarte ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800">
                          <CheckCircle2 className="w-3 h-3 text-orange-600" aria-hidden="true" />
                          <span>À la Carte Add-on</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Available</span>
                      )}
                    </td>

                    {/* Pricing */}
                    <td className="py-2.5 px-3 text-right text-[11px] font-medium text-slate-500">
                      {isIncludedInPack ? (
                        <span className="text-emerald-700 font-semibold">Bundled</span>
                      ) : isSelectedAlaCarte ? (
                        <span className="text-orange-700 font-semibold font-mono">
                          Backend Rate Card
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
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
