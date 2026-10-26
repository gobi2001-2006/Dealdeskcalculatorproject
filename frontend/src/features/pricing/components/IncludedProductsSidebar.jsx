import {
  Globe,
  Layers,
  Package,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { buildCatalogueLookup } from '../../../utils/catalogueLookup'

export function IncludedProductsSidebar({
  lookup = buildCatalogueLookup(),
  countryConfigs = [],
  focusedCountryId,
  focusedFamilyId,
  onSelectCountry,
  onSelectFamily,
}) {
  if (countryConfigs.length === 0) {
    return (
      <aside
        aria-label="Included Products Navigation"
        className="w-full lg:w-72 bg-white border-r border-slate-200 p-4 shrink-0 flex flex-col justify-between overflow-y-auto"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Layers className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
              Included Products
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
            <Globe className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-slate-800">
              No Proposal Scope Configured
            </h3>
            <p className="text-[11px] text-slate-500">
              No regional countries or product packages have been configured yet.
            </p>
            <div className="pt-2">
              <Link
                to="/calculator"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors"
              >
                <span>Configure Proposal</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Included Products Navigation"
      className="w-full lg:w-72 bg-white border-r border-slate-200 p-4 shrink-0 flex flex-col overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-orange-600" aria-hidden="true" />
          <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
            Included Products
          </h2>
        </div>
        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
          {countryConfigs.length} {countryConfigs.length === 1 ? 'Country' : 'Countries'}
        </span>
      </div>

      <p className="text-[11px] text-slate-500 mt-2 mb-3 leading-relaxed">
        Select a country or family to view and adjust line-item rates and discounts.
      </p>

      {/* Country & Families Tree */}
      <div className="space-y-3.5 flex-1 overflow-y-auto">
        {countryConfigs.map((country) => {
          const isCountryFocused = focusedCountryId === country.id

          return (
            <div
              key={country.id}
              className={`rounded-xl border transition-all overflow-hidden ${
                isCountryFocused
                  ? 'border-orange-500/70 bg-orange-50/20 shadow-xs'
                  : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
              }`}
            >
              {/* Country Item Header Button */}
              <button
                type="button"
                onClick={() => {
                  onSelectCountry(country.id)
                  onSelectFamily(null)
                }}
                className={`w-full text-left p-3 flex items-center justify-between transition-colors ${
                  isCountryFocused
                    ? 'bg-[#0B1528] text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200/60'
                }`}
                aria-current={isCountryFocused ? 'true' : undefined}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Globe
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isCountryFocused ? 'text-orange-400' : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold truncate">
                    {country.countryName}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                    isCountryFocused
                      ? 'bg-slate-800 text-orange-300 border border-slate-700'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  {country.currency}
                </span>
              </button>

              {/* Country Context Badges */}
              <div className="px-3 py-2 border-b border-slate-100 text-[10px] text-slate-600 flex flex-wrap gap-1 bg-white">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium">
                  {lookup.tierName(country.pricingTierId)}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium">
                  {lookup.deploymentName(country.deploymentModelId)}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-orange-100/70 text-orange-800 font-semibold">
                  {lookup.pricingModelName(country.pricingModelId)}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 font-medium">
                  {country.contractTerm ? `${country.contractTerm}m` : 'term not set'}
                </span>
              </div>

              {/* Families List under this Country */}
              <div className="p-2 space-y-1.5 bg-white">
                {country.families.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic p-1.5 text-center">
                    No families attached
                  </div>
                ) : (
                  country.families.map((fam) => {
                    const familyMaster = lookup.family(fam.familyId)
                    const pack = fam.selectedPackId ? lookup.packVersion(fam.selectedPackId) : null
                    const FamilyIcon = Package
                    const isFamilyFocused =
                      isCountryFocused && focusedFamilyId === fam.id

                    return (
                      <button
                        key={fam.id}
                        type="button"
                        onClick={() => {
                          onSelectCountry(country.id)
                          onSelectFamily(fam.id)
                        }}
                        className={`w-full text-left p-2 rounded-lg text-xs transition-all flex items-start gap-2 ${
                          isFamilyFocused
                            ? 'bg-orange-50 text-orange-950 font-semibold border border-orange-200 shadow-2xs'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <FamilyIcon
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            isFamilyFocused ? 'text-orange-600' : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">{familyMaster.name}</span>
                            <span className="text-[9px] font-mono text-slate-400">
                              {familyMaster.code}
                            </span>
                          </div>
                          {pack ? (
                            <div className="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: '#F26522' }}
                                aria-hidden="true"
                              />
                              <span className="truncate">{pack.name}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic mt-0.5">
                              À la carte only
                            </div>
                          )}
                          {fam.selectedFeatureIds?.length > 0 && (
                            <div className="text-[9px] text-orange-700 mt-0.5">
                              +{fam.selectedFeatureIds.length} à la carte item(s)
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Return to Page 4 link */}
      <div className="pt-3 border-t border-slate-100 mt-2">
        <Link
          to="/calculator"
          className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <span>Edit Configurator Scope</span>
        </Link>
      </div>
    </aside>
  )
}

export default IncludedProductsSidebar
