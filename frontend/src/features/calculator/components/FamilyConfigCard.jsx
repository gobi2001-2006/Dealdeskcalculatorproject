import { useMemo } from 'react'
import {
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Sparkles,
  Briefcase,
  HeartHandshake,
  ShieldCheck,
  Package,
  Trash2,
} from 'lucide-react'
import { INITIAL_PRODUCT_FAMILIES, INITIAL_PRODUCTS } from '../../../data/catalogueData'
import { INITIAL_PACKS } from '../../../data/packsData'
import { FeaturesTable } from './FeaturesTable'

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

export function FamilyConfigCard({
  familyConfig,
  countryPricingModel = 'PEPM',
  countryHeadcount = 5000,
  onUpdateFamily,
  onRemoveFamily,
}) {
  const familyMaster =
    INITIAL_PRODUCT_FAMILIES.find((f) => f.id === familyConfig.familyId) || {
      id: familyConfig.familyId,
      name: 'Product Family',
      code: 'FAM',
      iconName: 'Package',
    }

  const FamilyIcon = ICON_MAP[familyMaster.iconName] || Package

  // Filter packs created in Pack Builder for this family
  const availablePacks = useMemo(() => {
    return INITIAL_PACKS.filter((p) => p.familyId === familyConfig.familyId)
  }, [familyConfig.familyId])

  // Get selected pack details
  const selectedPack = useMemo(() => {
    if (!familyConfig.selectedPackId) return null
    return INITIAL_PACKS.find((p) => p.id === familyConfig.selectedPackId) || null
  }, [familyConfig.selectedPackId])

  // Extract included products in the selected pack
  const includedProducts = useMemo(() => {
    if (!selectedPack || !selectedPack.productIds) return []
    return selectedPack.productIds
      .map((pId) => INITIAL_PRODUCTS.find((prod) => prod.id === pId))
      .filter(Boolean)
  }, [selectedPack])

  // Handle pack selection change
  const handlePackChange = (packId) => {
    onUpdateFamily({
      ...familyConfig,
      selectedPackId: packId || null,
      // If user had selected features that are now included in the new pack,
      // we don't need to double-select them, but we keep unrelated features.
    })
  }

  // Handle toggle feature
  const handleToggleFeature = (featureId) => {
    const current = familyConfig.selectedFeatureIds || []
    const exists = current.includes(featureId)
    const next = exists
      ? current.filter((id) => id !== featureId)
      : [...current, featureId]

    onUpdateFamily({
      ...familyConfig,
      selectedFeatureIds: next,
    })
  }

  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
      {/* Family Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-800 shadow-2xs">
            <FamilyIcon className="w-4 h-4 text-orange-600" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 tracking-tight">
                {familyMaster.name}
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700">
                {familyMaster.code}
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              {familyMaster.description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemoveFamily}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-200"
          title={`Remove ${familyMaster.name} configuration`}
          aria-label={`Remove ${familyMaster.name} family`}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Pack Selection & Headcount Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
        {/* Pack Selector Dropdown */}
        <div className="md:col-span-8">
          <label
            htmlFor={`pack-select-${familyConfig.id}`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Pack Selection (from Pack Builder)
          </label>
          <div className="relative">
            <select
              id={`pack-select-${familyConfig.id}`}
              value={familyConfig.selectedPackId || ''}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
            >
              <option value="">-- No Base Pack (À la carte only) --</option>
              {availablePacks.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name} ({pack.code}) — {pack.productIds?.length || 0} Products
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Headcount Input (if PEPM / Platform Subscription) */}
        <div className="md:col-span-4">
          <label
            htmlFor={`family-headcount-${familyConfig.id}`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Employee Volume <span className="text-slate-400 font-normal">({countryPricingModel})</span>
          </label>
          <input
            id={`family-headcount-${familyConfig.id}`}
            type="number"
            min="1"
            value={familyConfig.headcount || countryHeadcount}
            onChange={(e) =>
              onUpdateFamily({
                ...familyConfig,
                headcount: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1),
              })
            }
            placeholder="e.g. 5000"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
          />
        </div>
      </div>

      {/* Selected Pack Details Card */}
      {selectedPack ? (
        <div className="p-3 rounded-lg bg-white border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: selectedPack.color || '#F26522' }}
                aria-hidden="true"
              />
              <span className="text-xs font-bold text-slate-900">
                {selectedPack.name}
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {selectedPack.code}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              {includedProducts.length} Included Products
            </span>
          </div>

          <p className="text-[11px] text-slate-500">
            {selectedPack.description}
          </p>

          {/* Included Products List */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
              Included Products in this Pack
            </span>
            <div className="flex flex-wrap gap-1.5">
              {includedProducts.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-50 text-slate-800 border border-slate-200"
                >
                  <span className="font-medium">{p.subItem}</span>
                  <span className="font-mono text-[9px] text-slate-500">
                    ({p.code})
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Pack Pricing Result Box */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/50 p-2 rounded">
            <span className="font-semibold text-slate-700">
              Pack Pricing Result:
            </span>
            <span
              className="text-[11px] font-mono text-slate-500 italic bg-white border border-slate-200 px-2 py-0.5 rounded"
              title="Awaiting backend pricing calculation"
            >
              Pricing pending backend calculation
            </span>
          </div>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-white border border-dashed border-slate-200 text-center text-xs text-slate-400">
          No base pack selected. Choose a pack from Pack Builder above or select à la carte features below.
        </div>
      )}

      {/* Phase D — À la Carte Features Table */}
      <FeaturesTable
        familyId={familyConfig.familyId}
        packProductIds={selectedPack?.productIds || []}
        selectedFeatureIds={familyConfig.selectedFeatureIds || []}
        onToggleFeature={handleToggleFeature}
      />
    </div>
  )
}

export default FamilyConfigCard
