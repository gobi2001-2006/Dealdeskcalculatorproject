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
  countryHeadcount = 5000,
  onUpdateFamily,
  onRemoveFamily,
  families = [],
  packs = [],
  products = [],
}) {
  const familyList = families.length > 0 ? families : INITIAL_PRODUCT_FAMILIES
  const packList = packs.length > 0 ? packs : INITIAL_PACKS
  const productList = products.length > 0 ? products : INITIAL_PRODUCTS

  const familyMaster =
    familyList.find((f) => String(f.id) === String(familyConfig.familyId)) || {
      id: familyConfig.familyId,
      name: 'Product Family',
      code: 'FAM',
      iconName: 'Package',
    }

  const FamilyIcon = ICON_MAP[familyMaster.iconName] || Package

  // Filter packs for this family
  const availablePacks = useMemo(() => {
    return packList.filter(
      (p) =>
        String(p.product_family_id) === String(familyConfig.familyId) ||
        String(p.familyId) === String(familyConfig.familyId)
    )
  }, [familyConfig.familyId, packList])

  // Get selected pack details
  const selectedPack = useMemo(() => {
    if (!familyConfig.selectedPackId) return null
    return (
      packList.find(
        (p) =>
          String(p.id) === String(familyConfig.selectedPackId) ||
          p.versions?.some((v) => String(v.id) === String(familyConfig.selectedPackId))
      ) || null
    )
  }, [familyConfig.selectedPackId, packList])

  // Extract included feature IDs in the selected pack version
  const packFeatureIds = useMemo(() => {
    if (!selectedPack) return []
    // If backend pack has versions with pack_items
    const matchedVer = selectedPack.versions?.find(
      (v) => String(v.id) === String(familyConfig.selectedPackId)
    )
    if (matchedVer?.pack_items) {
      return matchedVer.pack_items.map((pi) => pi.feature_id)
    }
    return selectedPack.productIds || []
  }, [selectedPack, familyConfig.selectedPackId])

  // Handle pack selection change
  const handlePackChange = (rawId) => {
    if (!rawId) {
      onUpdateFamily({
        ...familyConfig,
        selectedPackId: null,
      })
      return
    }

    // Resolve pack version ID
    const targetPack = packList.find(
      (p) => String(p.id) === String(rawId) || p.versions?.some((v) => String(v.id) === String(rawId))
    )
    const packVersionId = targetPack?.versions?.[0]?.id || targetPack?.id || Number(rawId) || rawId

    onUpdateFamily({
      ...familyConfig,
      selectedPackId: packVersionId,
    })
  }

  // Handle toggle feature
  const handleToggleFeature = (featureId) => {
    const current = familyConfig.selectedFeatureIds || []
    const exists = current.some((id) => String(id) === String(featureId))
    const next = exists
      ? current.filter((id) => String(id) !== String(featureId))
      : [...current, Number(featureId) || featureId]

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
              {familyMaster.description || 'Enterprise module packaging and à la carte features.'}
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
              <option value="">-- No Pack (À la Carte Features Only) --</option>
              {availablePacks.map((pack) => {
                const versionId = pack.versions?.[0]?.id || pack.id
                return (
                  <option key={versionId} value={versionId}>
                    {pack.name} ({pack.code || pack.variant}) — Version {pack.versions?.[0]?.version_no || 1}
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        {/* Headcount Allocation */}
        <div className="md:col-span-4">
          <label
            htmlFor={`headcount-${familyConfig.id}`}
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            User Volume / Headcount
          </label>
          <input
            id={`headcount-${familyConfig.id}`}
            type="number"
            min="1"
            value={familyConfig.headcount ?? countryHeadcount}
            onChange={(e) =>
              onUpdateFamily({
                ...familyConfig,
                headcount: Number(e.target.value) || 0,
              })
            }
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
        </div>
      </div>

      {/* Features Table */}
      <FeaturesTable
        familyId={familyConfig.familyId}
        packProductIds={packFeatureIds}
        selectedFeatureIds={familyConfig.selectedFeatureIds || []}
        onToggleFeature={handleToggleFeature}
        products={productList}
      />
    </div>
  )
}

export default FamilyConfigCard
