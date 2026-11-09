import { useState, useMemo } from 'react'
import {
  Search,
  Database,
  Edit2,
  Check,
  X,
  RefreshCw,
  Info,
} from 'lucide-react'

export function RateCardRegistryTable({
  rawRateCards = [],
  activeVersion = null,
  countries = [],
  deploymentModels = [],
  pricingModels = [],
  pricingTiers = [],
  packs = [],
  features = [],
  isVersionLocked = false,
  onUpdateRate,
  onRefresh,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCountry, setFilterCountry] = useState('all')
  const [filterDeployment, setFilterDeployment] = useState('all')
  const [filterPricingModel, setFilterPricingModel] = useState('all')
  const [filterTier, setFilterTier] = useState('all')
  const [filterType] = useState('all') // 'all' | 'pack' | 'feature'

  // Inline editing state: { [rateCardId]: { fixed_fee, unit_rate } }
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({ fixed_fee: '', unit_rate: '' })

  const mappedRows = useMemo(() => {
    return rawRateCards.map((rc) => {
      const countryObj =
        rc.country ||
        countries.find((c) => String(c.id) === String(rc.country_id)) || {
          name: `Country #${rc.country_id}`,
          iso_code: '',
          currency: rc.currency?.code || '',
        }

      const depObj =
        rc.deployment_model ||
        deploymentModels.find((d) => d.id === rc.deployment_model_id) || {
          name: `Deployment #${rc.deployment_model_id}`,
          code: '',
        }

      const pmObj =
        rc.pricing_model ||
        pricingModels.find((p) => p.id === rc.pricing_model_id) || {
          name: `Pricing #${rc.pricing_model_id}`,
          code: '',
        }

      const tierObj =
        rc.tier ||
        pricingTiers.find((t) => t.id === rc.tier_id) || {
          name: `Tier #${rc.tier_id}`,
          code: `Tier ${rc.tier_id}`,
        }

      const uomObj = rc.uom || { name: `UoM #${rc.uom_id}`, code: '' }

      const packObj =
        rc.pack_version?.pack ||
        packs.find(
          (p) =>
            p.id === rc.pack_version?.pack_id ||
            p.packId === rc.pack_version?.pack_id ||
            (p.versions || []).some((v) => v.id === rc.pack_version_id),
        )

      const featObj =
        rc.feature ||
        features.find((f) => f.id === rc.feature_id)

      const isPack = Boolean(rc.pack_version_id)
      const targetName = isPack
        ? packObj?.name || rc.pack_version?.pack?.name || `Pack #${rc.pack_version_id}`
        : featObj?.name || rc.feature?.name || `Feature #${rc.feature_id}`

      const targetCode = isPack
        ? packObj?.code || rc.pack_version?.pack?.code || `PACK-V${rc.pack_version_id}`
        : featObj?.code || rc.feature?.code || `FEAT-${rc.feature_id}`

      const currencyCode = rc.currency?.code || countryObj.currency || ''

      return {
        id: rc.id,
        raw: rc,
        // 6 Core Dimensions:
        countryId: rc.country_id,
        countryName: countryObj.name,
        countryCode: countryObj.iso_code || countryObj.code,
        deploymentId: rc.deployment_model_id,
        deploymentName: depObj.name,
        deploymentCode: depObj.code,
        pricingModelId: rc.pricing_model_id,
        pricingModelName: pmObj.name,
        pricingModelCode: pmObj.code,
        tierId: rc.tier_id,
        tierName: tierObj.name,
        tierCode: tierObj.code,
        targetType: isPack ? 'Pack' : 'Feature',
        targetName,
        targetCode,
        packVersionId: rc.pack_version_id,
        featureId: rc.feature_id,
        uomName: uomObj.name,
        // Rates & Pricing details:
        fixedFee: rc.fixed_fee != null ? Number(rc.fixed_fee) : null,
        unitRate: rc.unit_rate != null ? Number(rc.unit_rate) : null,
        floorPrice: rc.floor_price != null ? Number(rc.floor_price) : null,
        currencyCode,
        versionNo: activeVersion?.version_no || `v${rc.rate_card_version_id}`,
        versionStatus: activeVersion?.status || 'active',
        effectiveDates: activeVersion?.valid_from
          ? `${activeVersion.valid_from} to ${activeVersion.valid_to || 'Indefinite'}`
          : 'Effective Baseline',
      }
    })
  }, [rawRateCards, activeVersion, countries, deploymentModels, pricingModels, pricingTiers, packs, features])

  // Filtered rows
  const filteredRows = useMemo(() => {
    return mappedRows.filter((row) => {
      if (filterCountry !== 'all' && String(row.countryId) !== String(filterCountry)) {
        return false
      }
      if (filterDeployment !== 'all' && String(row.deploymentId) !== String(filterDeployment)) {
        return false
      }
      if (filterPricingModel !== 'all' && String(row.pricingModelId) !== String(filterPricingModel)) {
        return false
      }
      if (filterTier !== 'all' && String(row.tierId) !== String(filterTier)) {
        return false
      }
      if (filterType !== 'all') {
        if (filterType === 'pack' && row.targetType !== 'Pack') return false
        if (filterType === 'feature' && row.targetType !== 'Feature') return false
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase()
        const text = `${row.targetName} ${row.targetCode} ${row.countryName} ${row.deploymentName} ${row.pricingModelName} ${row.tierName} ${row.uomName}`.toLowerCase()
        if (!text.includes(query)) return false
      }
      return true
    })
  }, [mappedRows, filterCountry, filterDeployment, filterPricingModel, filterTier, filterType, searchTerm])

  const startEdit = (row) => {
    setEditingId(row.id)
    setEditValues({
      fixed_fee: row.fixedFee != null ? String(row.fixedFee) : '',
      unit_rate: row.unitRate != null ? String(row.unitRate) : '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValues({ fixed_fee: '', unit_rate: '' })
  }

  const saveEdit = (row) => {
    if (onUpdateRate) {
      onUpdateRate({
        id: row.id,
        raw: row.raw,
        fixed_fee: editValues.fixed_fee !== '' ? parseFloat(editValues.fixed_fee) : null,
        unit_rate: editValues.unit_rate !== '' ? parseFloat(editValues.unit_rate) : null,
      })
    }
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      {/* Top Controls Bar: Search, Filters, Stats */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Full Commercial Rate Card Registry
              </h3>
              <p className="text-[11px] text-slate-500">
                Normalized 6-dimensional table of all configured SKU rates in active version ({activeVersion?.version_no || 'RC-DEV-1'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
              Showing {filteredRows.length} of {mappedRows.length} rates
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Refresh rate records from PostgreSQL"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search product, pack, code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Country filter */}
          <div>
            <select
              aria-label="Filter by Country"
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer font-medium"
            >
              <option value="all">All Countries ({countries.length})</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Deployment filter */}
          <div>
            <select
              aria-label="Filter by Deployment"
              value={filterDeployment}
              onChange={(e) => setFilterDeployment(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer font-medium"
            >
              <option value="all">All Deployments</option>
              {deploymentModels.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pricing Model filter */}
          <div>
            <select
              aria-label="Filter by Pricing Model"
              value={filterPricingModel}
              onChange={(e) => setFilterPricingModel(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer font-medium"
            >
              <option value="all">All Pricing Models</option>
              {pricingModels.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tier filter */}
          <div>
            <select
              aria-label="Filter by Customer Tier"
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer font-medium"
            >
              <option value="all">All Tiers ({pricingTiers.length})</option>
              {pricingTiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table view */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3 font-semibold min-w-[200px]">Product / Pack Target</th>
                  <th className="py-2.5 px-2.5 font-semibold">Country</th>
                  <th className="py-2.5 px-2.5 font-semibold">Deployment</th>
                  <th className="py-2.5 px-2.5 font-semibold">Pricing Model</th>
                  <th className="py-2.5 px-2.5 font-semibold">Tier</th>
                  <th className="py-2.5 px-2.5 font-semibold">Unit of Measure (UOM)</th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">Fixed Platform Fee</th>
                  <th className="py-2.5 px-2.5 font-semibold text-right">Unit Rate</th>
                  <th className="py-2.5 px-2 font-semibold">Curr</th>
                  <th className="py-2.5 px-2.5 font-semibold">Status / Dates</th>
                  <th className="py-2.5 px-2.5 font-semibold text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const isEditing = editingId === row.id
                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isEditing ? 'bg-orange-50/30' : ''
                      }`}
                    >
                      {/* 1. Target Name & Code */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              row.targetType === 'Pack'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {row.targetType}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">
                            {row.targetName}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {row.targetCode}
                        </div>
                      </td>

                      {/* 2. Country */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span className="font-medium text-slate-800">
                          {row.countryName}
                        </span>
                        {row.countryCode && (
                          <span className="text-[10px] text-slate-400 ml-1 font-mono">
                            [{row.countryCode}]
                          </span>
                        )}
                      </td>

                      {/* 3. Deployment */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                          {row.deploymentName}
                        </span>
                      </td>

                      {/* 4. Pricing Model */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span className="font-medium text-slate-800">
                          {row.pricingModelName}
                        </span>
                      </td>

                      {/* 5. Customer Tier */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span className="font-mono font-semibold text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {row.tierCode || row.tierName}
                        </span>
                      </td>

                      {/* 6. UOM */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span className="text-[11px] text-slate-600 font-medium">
                          {row.uomName}
                        </span>
                      </td>

                      {/* 7. Fixed Fee */}
                      <td className="py-2.5 px-2.5 text-right font-mono font-medium whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editValues.fixed_fee}
                            onChange={(e) =>
                              setEditValues((prev) => ({ ...prev, fixed_fee: e.target.value }))
                            }
                            placeholder="—"
                            className="w-20 px-1.5 py-0.5 text-right font-mono text-xs border border-orange-400 rounded bg-white"
                          />
                        ) : row.fixedFee != null ? (
                          <span className="text-amber-800 font-semibold">
                            {row.fixedFee.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* 8. Unit Rate */}
                      <td className="py-2.5 px-2.5 text-right font-mono font-medium whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editValues.unit_rate}
                            onChange={(e) =>
                              setEditValues((prev) => ({ ...prev, unit_rate: e.target.value }))
                            }
                            placeholder="—"
                            className="w-20 px-1.5 py-0.5 text-right font-mono text-xs border border-orange-400 rounded bg-white"
                          />
                        ) : row.unitRate != null ? (
                          <span className="text-emerald-800 font-bold">
                            {row.unitRate.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* 9. Currency */}
                      <td className="py-2.5 px-2 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                        {row.currencyCode}
                      </td>

                      {/* 10. Status / Dates */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              row.versionStatus === 'active'
                                ? 'bg-emerald-500'
                                : row.versionStatus === 'retired'
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span className="font-semibold text-[10px] uppercase text-slate-700">
                            {row.versionStatus}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {row.versionNo}
                        </div>
                      </td>

                      {/* 11. Actions */}
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(row)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                              title="Save rate"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"
                              title="Cancel editing"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : !isVersionLocked ? (
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                            title="Edit rates"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-300">Locked</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 px-4 text-center space-y-2">
            <Info className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">
              No rate-card records match your current filter selections.
            </p>
            <p className="text-[11px] text-slate-500">
              Try clearing search terms or selecting 'All' for countries, deployments, pricing models, and tiers.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default RateCardRegistryTable
