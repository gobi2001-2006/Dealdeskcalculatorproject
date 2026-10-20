import { Fragment } from 'react'
import {
  Package,
  Sparkles,
  Briefcase,
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  HeartHandshake,
  ShieldCheck,
  Tag,
  Percent,
} from 'lucide-react'
import { INITIAL_PRODUCT_FAMILIES, INITIAL_PRODUCTS } from '../../../data/catalogueData'
import { INITIAL_PACKS } from '../../../data/packsData'
import { CountrySummarySectionHeader } from './CountrySummarySectionHeader'
import { CountrySubtotalRow } from './CountrySubtotalRow'
import { GrandTotalRow } from './GrandTotalRow'

const ICON_MAP = {
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Sparkles,
  Briefcase,
  HeartHandshake,
  ShieldCheck,
}

export function ProposalFinancialTable({
  countryConfigs = [],
  clientInfo,
  lineItemDiscounts = {},
  overallDiscounts = {},
  serviceDiscounts = {},
  showDiscounts = false,
  calculationResult = null,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="w-full text-left text-xs border-collapse"
          aria-label="Detailed Proposal Commercial Summary"
        >
          {/* Table Column Headers */}
          <thead className="bg-slate-100/90 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th scope="col" className="py-3 px-4 min-w-[280px]">
                Country / Product
              </th>
              <th scope="col" className="py-3 px-3 text-right min-w-[130px]">
                License Fee
              </th>
              <th scope="col" className="py-3 px-3 text-right min-w-[150px]">
                Rental / PEPM
              </th>
              <th scope="col" className="py-3 px-3 text-right min-w-[130px]">
                Service Fees
              </th>
              <th scope="col" className="py-3 px-3 text-right min-w-[150px]">
                Total
              </th>
              <th scope="col" className="py-3 px-3 text-right min-w-[120px]">
                Gross Margin
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {countryConfigs.map((country, cIdx) => {
              const countryOverallDiscount =
                overallDiscounts[country.id] ||
                overallDiscounts[country.countryId] ||
                null

              return (
                <Fragment key={country.id}>
                  {/* 1. Country Header Row */}
                  <CountrySummarySectionHeader
                    countryIndex={cIdx + 1}
                    countryConfig={country}
                  />

                  {/* 2. Product Family Lines */}
                  {country.families.map((fam) => {
                    const famMaster = INITIAL_PRODUCT_FAMILIES.find(
                      (f) => f.id === fam.familyId
                    )
                    const FamIcon =
                      (famMaster?.iconName && ICON_MAP[famMaster.iconName]) ||
                      Package

                    const selectedPack = fam.selectedPackId
                      ? INITIAL_PACKS.find((p) => p.id === fam.selectedPackId)
                      : null

                    const packKey =
                      `${country.id}:${fam.id}:pack:${selectedPack?.id}`
                    const packKeyAlt =
                      `${country.id}:${fam.familyId}:pack:${selectedPack?.id}`
                    const packDiscount =
                      lineItemDiscounts[packKey] ||
                      lineItemDiscounts[packKeyAlt] ||
                      null

                    // Selected à la carte features
                    const alaCarteProducts = (fam.selectedFeatureIds || [])
                      .map((featId) =>
                        INITIAL_PRODUCTS.find((p) => p.id === featId)
                      )
                      .filter(Boolean)

                    return (
                      <Fragment key={fam.id}>
                        {/* A. Base Pack Row */}
                        {selectedPack && (
                          <tr className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-start gap-2.5">
                                <div className="w-6 h-6 rounded bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5 border border-slate-200">
                                  <FamIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-slate-900 text-xs flex items-center gap-2 flex-wrap">
                                    <span>{selectedPack.name}</span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                      {selectedPack.code}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                      {country.currency}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {famMaster?.name || 'Product Suite'} •{' '}
                                    <span className="font-mono">
                                      {Number(
                                        fam.headcount || country.headcount || 0
                                      ).toLocaleString()}
                                    </span>{' '}
                                    users × {country.contractTerm} mos
                                  </p>

                                  {/* Show Discounts detail for Pack */}
                                  {showDiscounts && packDiscount && packDiscount.value && (
                                    <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
                                      <Tag className="w-3 h-3 text-amber-600" aria-hidden="true" />
                                      <span>
                                        Discount:{' '}
                                        <strong>
                                          {packDiscount.type === 'percentage'
                                            ? `${packDiscount.value}%`
                                            : `${country.currencySymbol}${packDiscount.value}`}
                                        </strong>
                                      </span>
                                      {packDiscount.reason && (
                                        <span className="text-amber-700 italic border-l border-amber-200 pl-1.5">
                                          "{packDiscount.reason}"
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Financial Cells */}
                            <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400">
                              {country.pricingModelId === 'pm-platform'
                                ? 'Pending backend calculation'
                                : '—'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-500 italic">
                              Pending backend calculation
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400">
                              —
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-slate-700 italic">
                              Pending backend calculation
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-[11px] text-slate-400 italic">
                              —
                            </td>
                          </tr>
                        )}

                        {/* B. À la carte Feature Rows */}
                        {alaCarteProducts.map((prod) => {
                          const featKey =
                            `${country.id}:${fam.id}:feature:${prod.id}`
                          const featKeyAlt =
                            `${country.id}:${fam.familyId}:feature:${prod.id}`
                          const featDiscount =
                            lineItemDiscounts[featKey] ||
                            lineItemDiscounts[featKeyAlt] ||
                            null

                          return (
                            <tr
                              key={prod.id}
                              className="hover:bg-slate-50/70 transition-colors bg-orange-50/15"
                            >
                              <td className="py-2.5 px-4 pl-9">
                                <div className="flex items-start gap-2">
                                  <Sparkles
                                    className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5"
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                                      <span>
                                        {prod.solution || prod.subItem}
                                      </span>
                                      <span className="text-[10px] font-mono text-slate-500">
                                        ({prod.code})
                                      </span>
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-orange-100 text-orange-800">
                                        À la carte
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                      {prod.subItem} • {country.currency}
                                    </p>

                                    {/* Show Discounts detail for Feature */}
                                    {showDiscounts && featDiscount && featDiscount.value && (
                                      <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
                                        <Percent className="w-2.5 h-2.5 text-amber-600" aria-hidden="true" />
                                        <span>
                                          Discount:{' '}
                                          <strong>
                                            {featDiscount.type === 'percentage'
                                              ? `${featDiscount.value}%`
                                              : `${country.currencySymbol}${featDiscount.value}`}
                                          </strong>
                                        </span>
                                        {featDiscount.reason && (
                                          <span className="text-amber-700 italic border-l border-amber-200 pl-1">
                                            "{featDiscount.reason}"
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Financial Cells */}
                              <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400">
                                —
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500 italic">
                                Pending backend calculation
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400">
                                —
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold text-slate-700 italic">
                                Pending backend calculation
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400 italic">
                                —
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}

                  {/* 3. Professional Service Lines */}
                  {(country.serviceLines || []).map((srv) => {
                    const srvDiscount = serviceDiscounts[srv.id] || null

                    return (
                      <tr
                        key={srv.id}
                        className="hover:bg-slate-50/70 transition-colors bg-teal-50/15"
                      >
                        <td className="py-2.5 px-4 pl-9">
                          <div className="flex items-start gap-2">
                            <Briefcase
                              className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                                <span>{srv.roleName}</span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-teal-100 text-teal-800">
                                  Professional Services
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {srv.hoursOrDays} hours @ {country.currencySymbol}
                                {srv.rateApplied}/hr • {srv.currency || country.currency}
                              </p>

                              {/* Show Discounts detail for Service */}
                              {showDiscounts && (srvDiscount?.value || srv.discountPct > 0) && (
                                <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
                                  <Tag className="w-2.5 h-2.5 text-amber-600" aria-hidden="true" />
                                  <span>
                                    Service Discount:{' '}
                                    <strong>
                                      {srvDiscount?.value
                                        ? `${srvDiscount.value}%`
                                        : `${srv.discountPct}%`}
                                    </strong>
                                  </span>
                                  {srvDiscount?.reason && (
                                    <span className="text-amber-700 italic border-l border-amber-200 pl-1">
                                      "{srvDiscount.reason}"
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Financial Cells */}
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400">
                          —
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400">
                          —
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500 italic">
                          Pending backend calculation
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold text-slate-700 italic">
                          Pending backend calculation
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400 italic">
                          —
                        </td>
                      </tr>
                    )
                  })}

                  {/* 4. Country-Level Overall Discount Row (When Show Discounts is Enabled) */}
                  {showDiscounts && countryOverallDiscount && countryOverallDiscount.value && (
                    <tr className="bg-amber-50/40 text-amber-900 text-xs border-t border-amber-100">
                      <td colSpan={6} className="py-2 px-4 pl-9">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3 h-3 text-amber-600 shrink-0" aria-hidden="true" />
                          <span className="font-semibold text-[11px]">
                            {country.countryName} Overall Discretionary Discount:
                          </span>
                          <span className="font-mono font-bold text-xs bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                            {countryOverallDiscount.value}%
                          </span>
                          {countryOverallDiscount.reason && (
                            <span className="text-[11px] text-amber-800 italic">
                              Justification: "{countryOverallDiscount.reason}"
                            </span>
                          )}
                          <span className="text-[10px] text-amber-700 ml-auto italic">
                            (Applied authoritatively by backend calculation engine)
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* 5. Country Subtotal Row */}
                  <CountrySubtotalRow
                    countryConfig={country}
                    reportingCurrency={clientInfo.reportingCurrency}
                    calculationResult={calculationResult}
                  />
                </Fragment>
              )
            })}

            {/* 6. Grand Total Consolidated Row */}
            <GrandTotalRow
              reportingCurrency={clientInfo.reportingCurrency}
              calculationResult={calculationResult}
            />
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ProposalFinancialTable
