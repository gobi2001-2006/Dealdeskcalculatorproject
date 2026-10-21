import { useState } from 'react'
import {
  Layers,
  RotateCcw,
  Clock,
  ShieldAlert,
  Users,
  Building2,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import { SPREADSHEET_DEMO_PLATFORM_CONFIG } from '../../data/rateCardData'

export function PlatformSubscriptionSection({
  platformConfig,
  onChangeConfig,
  onResetToSpreadsheetDemo,
  activeCurrencySymbol = '₹',
  activeCurrencyCode = 'INR',
  isVersionLocked = false,
  activeDeployment = 'Shared Cloud',
  activeCountry = null,
  selectedFamilyName = 'All Product Families',
  pricingTiers = [],
}) {
  const [validationErrors, setValidationErrors] = useState({})

  const handleFieldChange = (tierKey, fieldKey, rawValue) => {
    // Validate field
    const newErrors = { ...validationErrors }
    const errorKey = `${tierKey}-${fieldKey}`

    if (fieldKey === 'employeeCount') {
      const num = Number(rawValue)
      if (rawValue !== '' && (!Number.isInteger(num) || num < 0)) {
        newErrors[errorKey] = 'Employee count must be a non-negative whole number.'
      } else {
        delete newErrors[errorKey]
      }
    } else {
      const num = Number(rawValue)
      if (rawValue !== '' && (isNaN(num) || num < 0)) {
        newErrors[errorKey] = 'Rate must be a valid non-negative number.'
      } else {
        delete newErrors[errorKey]
      }
    }

    setValidationErrors(newErrors)
    onChangeConfig(tierKey, fieldKey, rawValue)
  }

  const ACCENT_COLORS = ['border-orange-500', 'border-blue-500', 'border-emerald-500', 'border-purple-500', 'border-amber-500']
  const ICONS = [Building2, Users, TrendingUp, Building2, Users]

  const DEFAULT_TIERS = [
    {
      key: 'tier1',
      label: 'Tier 1',
      title: 'Enterprise',
      sub: 'Large enterprise footprint (>10,000 employees)',
      icon: Building2,
      accentColor: 'border-orange-500',
    },
    {
      key: 'tier2',
      label: 'Tier 2',
      title: 'Mid-Market',
      sub: 'Mid-scale organizations (2,500 - 10,000 employees)',
      icon: Users,
      accentColor: 'border-blue-500',
    },
    {
      key: 'tier3',
      label: 'Tier 3',
      title: 'Growth',
      sub: 'Emerging & high-growth teams (<2,500 employees)',
      icon: TrendingUp,
      accentColor: 'border-emerald-500',
    },
  ]

  const tiers =
    pricingTiers && pricingTiers.length > 0
      ? pricingTiers.map((t, idx) => ({
          key: `tier${idx + 1}`,
          tierId: t.id,
          label: t.code || `Tier ${idx + 1}`,
          title: t.name || t.code || `Tier ${idx + 1}`,
          sub: t.employee_max
            ? `${t.employee_min || 0} - ${t.employee_max} employees`
            : `>${t.employee_min || 0} employees`,
          icon: ICONS[idx % ICONS.length],
          accentColor: ACCENT_COLORS[idx % ACCENT_COLORS.length],
        }))
      : DEFAULT_TIERS

  return (
    <div className="space-y-4">
      {/* Top Banner & Demo Reset */}
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
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800">
                Excel Reference Layout
              </span>
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

        <button
          type="button"
          onClick={onResetToSpreadsheetDemo}
          disabled={isVersionLocked}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 shadow-2xs transition-colors shrink-0 ${
            isVersionLocked
              ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400'
              : 'hover:bg-slate-50 hover:text-slate-900 cursor-pointer'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          <span>Reset to Spreadsheet Demo Values</span>
        </button>
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
            Active Employees (with ESS)
          </span>
        </div>
      </div>

      {/* Critical Pricing Architecture Rule Banner */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-950">
            Mandatory Pricing Architecture Governance:
          </div>
          <div className="text-[11px] text-amber-800 leading-relaxed">
            The frontend captures parameter inputs (platform fee, consumption fee, committed employees). 
            In strict compliance with architectural constraints, client-side React code does not calculate
            Annual Subscription Price or Total Annual Price. Proposal totals, discounting, and commercial contracts are evaluated by the backend PricingCalculationEngine in <strong>Page 4 — Proposal Configurator</strong>.
          </div>
        </div>
      </div>

      {/* 3-Column Tier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const config = platformConfig?.[tier.key] || SPREADSHEET_DEMO_PLATFORM_CONFIG[tier.key]
          const TierIcon = tier.icon

          return (
            <div
              key={tier.key}
              className={`bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden flex flex-col justify-between border-t-4 ${tier.accentColor}`}
            >
              {/* Tier Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800 uppercase">
                    {tier.label}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <TierIcon className="w-4 h-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {tier.title}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {tier.sub}
                  </p>
                </div>
              </div>

              {/* Form Inputs (Editable) */}
              <div className="p-4 space-y-3.5 flex-1">
                {/* 1. Annual Platform Fee */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor={`${tier.key}-platform-fee`}
                      className="text-xs font-semibold text-slate-700"
                    >
                      Annual Platform Fee
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Fixed Base Fee
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono text-slate-400">
                      {activeCurrencySymbol}
                    </span>
                    <input
                      id={`${tier.key}-platform-fee`}
                      type="number"
                      min="0"
                      step="any"
                      disabled={isVersionLocked}
                      aria-label={`${tier.label} Annual Platform Fee`}
                      value={config.annualPlatformFee}
                      onChange={(e) =>
                        handleFieldChange(tier.key, 'annualPlatformFee', e.target.value)
                      }
                      className="w-full pl-7 pr-3 py-1.5 text-xs font-mono text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      placeholder="e.g. 100000"
                    />
                  </div>
                  {validationErrors[`${tier.key}-annualPlatformFee`] && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-600">
                      <AlertCircle className="w-3 h-3" />
                      <span>{validationErrors[`${tier.key}-annualPlatformFee`]}</span>
                    </div>
                  )}
                </div>

                {/* 2. Monthly Subscription Fee per employee */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor={`${tier.key}-monthly-fee`}
                      className="text-xs font-semibold text-slate-700"
                    >
                      Monthly Subscription Fee
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Per Employee / Mo
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono text-slate-400">
                      {activeCurrencySymbol}
                    </span>
                    <input
                      id={`${tier.key}-monthly-fee`}
                      type="number"
                      min="0"
                      step="any"
                      disabled={isVersionLocked}
                      aria-label={`${tier.label} Monthly Subscription Fee`}
                      value={config.monthlySubscriptionFee}
                      onChange={(e) =>
                        handleFieldChange(tier.key, 'monthlySubscriptionFee', e.target.value)
                      }
                      className="w-full pl-7 pr-3 py-1.5 text-xs font-mono text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      placeholder="e.g. 300"
                    />
                  </div>
                  {validationErrors[`${tier.key}-monthlySubscriptionFee`] && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-600">
                      <AlertCircle className="w-3 h-3" />
                      <span>{validationErrors[`${tier.key}-monthlySubscriptionFee`]}</span>
                    </div>
                  )}
                </div>

                {/* 3. Number of Employees (Whole number) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor={`${tier.key}-employee-count`}
                      className="text-xs font-semibold text-slate-700"
                    >
                      Number of Employees
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Whole Count (ESS)
                    </span>
                  </div>
                  <input
                    id={`${tier.key}-employee-count`}
                    type="number"
                    min="0"
                    step="1"
                    disabled={isVersionLocked}
                    aria-label={`${tier.label} Number of Employees`}
                    value={config.employeeCount}
                    onChange={(e) =>
                      handleFieldChange(tier.key, 'employeeCount', e.target.value)
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    placeholder="e.g. 10000"
                  />
                  {validationErrors[`${tier.key}-employeeCount`] && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-600">
                      <AlertCircle className="w-3 h-3" />
                      <span>{validationErrors[`${tier.key}-employeeCount`]}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Calculated Outputs (Read-only, Awaiting Backend) */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
                {/* 4. Annual Subscription Price */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-600">
                      Annual Subscription Price
                    </span>
                    <span className="text-[9px] uppercase font-mono text-slate-400">
                      Output
                    </span>
                  </div>
                  <div className="w-full p-2 rounded-lg bg-amber-50/80 border border-amber-200/90 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-amber-800 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                      <span>Pending backend calculation</span>
                    </div>
                    <span className="text-[10px] font-mono text-amber-700 font-semibold">
                      {activeCurrencyCode}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    Backend formula: Monthly fee × Employees × 12
                  </p>
                </div>

                {/* 5. Total Annual Price (including Platform Fee) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-600">
                      Total Annual Price (incl. Platform)
                    </span>
                    <span className="text-[9px] uppercase font-mono text-slate-400">
                      Output
                    </span>
                  </div>
                  <div className="w-full p-2 rounded-lg bg-amber-50/80 border border-amber-200/90 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-amber-800 font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                      <span>Pending backend calculation</span>
                    </div>
                    <span className="text-[10px] font-mono text-amber-700 font-semibold">
                      {activeCurrencyCode}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    Backend formula: Platform fee + Annual subscription
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
