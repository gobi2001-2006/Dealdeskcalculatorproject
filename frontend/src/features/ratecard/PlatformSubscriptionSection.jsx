import {
  Layers,
  Info,
} from 'lucide-react'
import { fixedFeeBasisLabel, unitRateBasisLabel } from './rateCardFormatters'

export function PlatformSubscriptionSection({
  activeCurrencySymbol = '',
  activeCurrencyCode = '',
  isVersionLocked = false,
  activeDeployment = 'Shared Cloud',
  activeCountry = null,
  selectedFamilyName = 'All Product Families',
  pricingModelName = 'Platform + Subscription',
  fixedFeeBasis = 'annual',
  unitRateBasis = 'monthly',
  tierCount = 0,
}) {
  const period = unitRateBasisLabel(unitRateBasis)
  const platformTerm =
    fixedFeeBasis === 'one_time' ? 'Tier Platform Fee (one-time)' : 'Tier Platform Fee × Contract Years'
  const subscriptionTerm = period
    ? `Subscription Rate × Volume per ${period} × ${period === 'month' ? 'Contract Months' : 'Contract Years'}`
    : 'Subscription Rate × Volume × Billing Periods'
  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
            <Layers className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-bold text-slate-900">
                {pricingModelName || 'Platform + Subscription'} Commercial Model
              </h2>
              {isVersionLocked && (
                <span className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  Locked / Read-Only
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Two independent components: a platform {fixedFeeBasisLabel(fixedFeeBasis)} for each customer tier
              {tierCount > 0 ? ` (${tierCount} tiers)` : ''}, plus a subscription rate per unit of measure
              {period ? ` per ${period}` : ''}.
            </p>
          </div>
        </div>

      </div>

      {/* Scope Strip */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Architecture:</span>
            <span className="px-2.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-800 text-[10px]">
              {activeDeployment}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Country & Currency:</span>
            <span className="px-2.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-800 text-[10px]">
              {activeCountry?.name || 'Active'} ({activeCurrencySymbol} {activeCurrencyCode})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Scope:</span>
            <span className="px-2.5 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-800 text-[10px]">
              {selectedFamilyName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400">Unit of Measure:</span>
          <span className="px-2.5 py-0.5 rounded bg-orange-50 border border-orange-200 font-semibold text-orange-800 text-[10px]">
            Set per rate row (shown in each row)
          </span>
        </div>
      </div>

      {/* Pricing Formula Banner */}
      <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-4 text-[12px] text-sky-950 flex items-start gap-3">
        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1.5">
          <div className="font-semibold text-[13px] text-sky-950">
            Platform + Subscription Pricing Formula:
          </div>
          <div className="text-[11px] font-mono text-sky-900 bg-sky-100/70 px-2.5 py-1 rounded inline-block font-semibold">
            Total Contract Value = {platformTerm} + {subscriptionTerm}
          </div>
          <p className="text-[11px] text-sky-800 leading-relaxed">
            Set each tier&apos;s platform fee, unit of measure, and subscription rate below. Proposal totals calculate in the <strong>Proposal Configurator</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
