import {
  Layers,
  Info,
} from 'lucide-react'

export function PlatformSubscriptionSection({
  activeCurrencySymbol = '$',
  activeCurrencyCode = 'USD',
  isVersionLocked = false,
  activeDeployment = 'Shared Cloud',
  activeCountry = null,
  selectedFamilyName = 'All Product Families',
}) {
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
              <h2 className="text-sm font-bold text-slate-900">
                Platform + Subscription Commercial Model
              </h2>
              {isVersionLocked && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  Locked / Read-Only
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Enterprise tiered architecture: Fixed Annual Platform Access Fee + Per-Employee Monthly Subscription Fee.
            </p>
          </div>
        </div>

      </div>

      {/* Scope Strip */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Architecture:</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-800 text-[11px]">
              {activeDeployment}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Country & Currency:</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-800 text-[11px]">
              {activeCountry?.name || 'Active'} ({activeCurrencySymbol} {activeCurrencyCode})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Scope:</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-800 text-[11px]">
              {selectedFamilyName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-bold text-slate-400">Unit of Measure:</span>
          <span className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 font-semibold text-orange-800 text-[11px]">
            Set per rate row (shown in each row)
          </span>
        </div>
      </div>

      {/* Pricing Formula Banner */}
      <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 text-xs text-sky-950 flex items-start gap-3">
        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-semibold text-sky-950">
            Platform + Subscription Pricing Formula:
          </div>
          <div className="text-[11px] font-mono text-sky-900 bg-sky-100/70 px-2 py-1 rounded inline-block font-semibold">
            Total Contract Value = (Annual Platform Access Fee + (Monthly PEPM Subscription × 12)) × Term Years
          </div>
          <p className="text-[11px] text-sky-800 leading-relaxed">
            Configure tier-specific Fixed Platform Fees and Monthly Subscription rates in the Pack and Feature rate matrices below. Commercial totals, employee commitment volumes, and discounting schedules are calculated in <strong>Page 4 — Proposal Configurator</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
