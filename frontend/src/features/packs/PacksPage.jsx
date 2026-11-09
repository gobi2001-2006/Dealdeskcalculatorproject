import { useState, useEffect } from 'react'
import {
  CheckCircle2,
  Package,
  Plus,
  Loader2,
  AlertCircle,
  Database,
  RefreshCw,
} from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { PacksSidebar } from './PacksSidebar'
import { PackEditor } from './PackEditor'
import { DeletePackModal } from './DeletePackModal'
import { PRESET_COLORS } from '../../data/packsData'
import {
  getPacks,
  createPack,
  getPackDetail,
  updatePack,
  deletePack,
  createPackVersion,
  updatePackVersion,
  syncPackItems,
} from '../../api/packsApi'
import {
  getCatalogueFamilies,
  getCatalogueProducts,
  getCatalogueFeatures,
} from '../../api/catalogueApi'

/**
 * The version the Pack Builder edits: the newest draft if there is one (so a new version can be
 * prepared and then activated), otherwise the active version, otherwise the newest version.
 */
function workingPackVersion(versions = []) {
  const byNewest = [...versions].sort((a, b) => b.version_no - a.version_no)
  return byNewest.find((v) => v.status === 'draft') || byNewest.find((v) => v.status === 'active') || byNewest[0] || null
}

function packProductIds(version, backendFeatures) {
  const productIds = []
  const requiredProductIds = []
  ;(version?.pack_items || []).forEach((item) => {
    const prodId =
      item.feature?.product_id ||
      (backendFeatures || []).find((f) => f.id === item.feature_id)?.product_id
    if (prodId && !productIds.includes(prodId)) {
      productIds.push(prodId)
      if (item.is_required !== false) requiredProductIds.push(prodId)
    }
  })
  return { productIds, requiredProductIds }
}

function mapBackendPacks(backendPacks, backendFeatures) {
  if (!Array.isArray(backendPacks)) return []

  return backendPacks.map((bp, index) => {
    const ver = workingPackVersion(bp.pack_versions || [])
    const { productIds, requiredProductIds } = packProductIds(ver, backendFeatures)
    return {
      id: bp.id,
      name: bp.name,
      description: `Commercial pack bundle (${bp.variant} tier).`,
      code: bp.code,
      familyId: bp.product_family_id || '',
      color: PRESET_COLORS[index % PRESET_COLORS.length]?.hex || '#F26522',
      variant: bp.variant || 'standard',
      status: bp.status || 'active',
      versionId: ver?.id || null,
      versionNo: ver?.version_no || null,
      versionStatus: ver?.status || null,
      productIds,
      requiredProductIds,
      packFeatureIds: (ver?.pack_items || []).map((i) => i.feature_id),
      notes: `Saved pack [ID: ${bp.id}, Code: ${bp.code}].`,
      createdAt: bp.created_at,
      updatedAt: bp.updated_at,
    }
  })
}

function mapBackendProducts(backendProducts, backendFeatures, families) {
  const firstFeature = new Map()
  ;(backendFeatures || []).forEach((f) => {
    if (!firstFeature.has(f.product_id)) firstFeature.set(f.product_id, f)
  })
  return (backendProducts || []).map((bp) => {
    const owningFam = families.find((f) => f.id === bp.product_family_id)
    const primaryFeat = firstFeature.get(bp.id)
    let displayType = 'Adrenalin Native'
    if (primaryFeat?.classification === 'ai_enabled') displayType = 'AI Agent Module'
    else if (primaryFeat?.classification === 'partner') displayType = 'Partner Integrated'
    return {
      id: bp.id,
      familyId: bp.product_family_id,
      familyName: owningFam?.name || 'Unassigned',
      solution: bp.name,
      subItem: primaryFeat ? primaryFeat.name : '—',
      code: bp.code,
      type: displayType,
      status: bp.status,
    }
  })
}

export function PacksPage() {
  // Only saved records are shown; nothing is replaced with demo data when the backend fails.
  const [packs, setPacks] = useState([])
  const [families, setFamilies] = useState([])
  const [products, setProducts] = useState([])
  const [featuresList, setFeaturesList] = useState([])
  const [selectedPackId, setSelectedPackId] = useState(null)
  const [packToDelete, setPackToDelete] = useState(null)
  const [duplicatedTemplate, setDuplicatedTemplate] = useState(null)
  const [toastMessage, setToastMessage] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [isLiveBackendData, setIsLiveBackendData] = useState(false)
  const [mutationNotice, setMutationNotice] = useState(null)

  const loadAll = async () => {
    const [backendPacks, backendFamilies, backendProducts, backendFeatures] = await Promise.all([
      getPacks(),
      getCatalogueFamilies(),
      getCatalogueProducts(),
      getCatalogueFeatures(),
    ])
    const mappedFamilies = (backendFamilies || []).map((bf) => ({
      id: bf.id,
      code: bf.code,
      name: bf.name,
      iconName: 'Layers',
      description: `Backend Family [ID: ${bf.id}, Code: ${bf.code}]`,
      status: bf.status,
    }))
    return {
      features: backendFeatures || [],
      families: mappedFamilies,
      products: mapBackendProducts(backendProducts, backendFeatures, mappedFamilies),
      packs: mapBackendPacks(backendPacks, backendFeatures),
    }
  }

  const applyLoaded = (data) => {
    setFeaturesList(data.features)
    setFamilies(data.families)
    setProducts(data.products)
    setPacks(data.packs)
    setIsLiveBackendData(true)
  }

  useEffect(() => {
    let isMounted = true
    loadAll()
      .then((data) => {
        if (isMounted) applyLoaded(data)
      })
      .catch((err) => {
        if (!isMounted) return
        setIsLiveBackendData(false)
        setApiError(err?.message ? `Backend unavailable (${err.message})` : 'Backend unavailable')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  const handleRefresh = async () => {
    setIsLoading(true)
    setApiError(null)
    try {
      applyLoaded(await loadAll())
    } catch (err) {
      setIsLiveBackendData(false)
      setApiError(err?.message ? `Backend unavailable (${err.message})` : 'Backend unavailable')
    } finally {
      setIsLoading(false)
    }
  }

  const activePack =
    selectedPackId === 'new'
      ? duplicatedTemplate
      : packs.find((p) => p.id === selectedPackId) || null
  const isNewPack = selectedPackId === 'new'

  // The editor selects products. A product already in the pack keeps exactly the features the
  // saved version contains; a newly added product brings all of its saved features. Products
  // without features cannot be packed (features are created on the Product Catalogue page).
  const resolveItemsForProducts = (prodIds, reqProdIds, existingFeatureIds = []) => {
    const items = []
    const missing = []
    for (const pId of prodIds) {
      const productFeatures = featuresList.filter((f) => f.product_id === pId && f.status !== 'retired')
      const kept = productFeatures.filter((f) => existingFeatureIds.includes(f.id))
      const chosen = kept.length > 0 ? kept : productFeatures
      if (chosen.length === 0) {
        missing.push(products.find((p) => p.id === pId)?.solution || `product ${pId}`)
        continue
      }
      chosen.forEach((f) => items.push({ feature_id: f.id, is_required: reqProdIds.includes(pId) }))
    }
    if (missing.length > 0) {
      throw new Error(`These products have no saved features yet: ${missing.join(', ')}. Add features on the Product Catalogue first.`)
    }
    return items
  }

  // Handle selecting a pack (loads live pack version items from backend)
  const handleSelectPack = async (packId) => {
    setDuplicatedTemplate(null)
    setSelectedPackId(packId)

    if (isLiveBackendData && typeof packId === 'number') {
      try {
        const packDetail = await getPackDetail(packId)
        if (packDetail) {
          const activeVer = workingPackVersion(packDetail.pack_versions || [])
          const { productIds, requiredProductIds } = packProductIds(activeVer, featuresList)

          setPacks((prev) =>
            prev.map((p) =>
              p.id === packId
                ? {
                    ...p,
                    name: packDetail.name,
                    code: packDetail.code,
                    variant: packDetail.variant,
                    familyId: packDetail.product_family_id || '',
                    versionId: activeVer?.id || null,
                    versionNo: activeVer?.version_no || null,
                    versionStatus: activeVer?.status || null,
                    productIds,
                    requiredProductIds,
                    packFeatureIds: (activeVer?.pack_items || []).map((i) => i.feature_id),
                  }
                : p,
            ),
          )
        }
      } catch (err) {
        console.warn('Unable to load pack detail from backend:', err)
      }
    }
  }

  // Handle Save Pack (create or update)
  const handleSavePack = async (savedData) => {
    const trimmedName = savedData.name.trim()
    if (!isLiveBackendData) {
      setMutationNotice('Cannot save pack: the backend is not available.')
      return
    }
    if (!isNewPack && ['locked', 'superseded'].includes(savedData.versionStatus)) {
      setMutationNotice(`Version ${savedData.versionNo} is ${savedData.versionStatus} and cannot be edited. Create a new version instead.`)
      return
    }

    try {
      const existing =
        (isNewPack ? duplicatedTemplate?.packFeatureIds : packs.find((p) => p.id === savedData.id)?.packFeatureIds) || []
      const itemsList = resolveItemsForProducts(savedData.productIds || [], savedData.requiredProductIds || [], existing)

      if (isNewPack) {
        const created = await createPack({
          name: trimmedName,
          code: savedData.code || `PACK-${Date.now().toString().slice(-4)}`,
          variant: savedData.variant || 'standard',
          product_family_id: savedData.familyId ? Number(savedData.familyId) : null,
          status: 'active',
          initial_version: 1,
          items: itemsList,
        })
        await handleRefresh()
        setSelectedPackId(created.id)
        setMutationNotice(`Pack "${created.name}" created.`)
      } else {
        // Metadata only; the pack's status is not changed by an edit.
        await updatePack(savedData.id, {
          name: trimmedName,
          code: savedData.code,
          variant: savedData.variant || 'standard',
          product_family_id: savedData.familyId ? Number(savedData.familyId) : null,
        })
        const versionId = savedData.versionId || packs.find((p) => p.id === savedData.id)?.versionId
        if (versionId) {
          await syncPackItems(versionId, itemsList)
        }
        await handleRefresh()
        setSelectedPackId(savedData.id)
        setMutationNotice(`Pack "${trimmedName}" updated.`)
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error saving pack'
      setMutationNotice(`Failed to save pack: ${detail}`)
      return
    }

    setDuplicatedTemplate(null)
    setToastMessage(`Pack "${savedData.name}" saved successfully.`)
    setTimeout(() => {
      setToastMessage('')
    }, 3500)
  }

  // Handle Duplicate Pack
  const handleDuplicatePack = (pack) => {
    if (!pack) return
    const duplicated = {
      ...pack,
      id: `pack-${Date.now()}`,
      name: `${pack.name} (Copy)`,
      code: pack.code ? `${pack.code}-COPY` : 'COPY',
      versionNo: null,
      versionStatus: null,
      versionId: null,
    }
    setDuplicatedTemplate(duplicated)
    setSelectedPackId('new')
    setToastMessage(`Duplicated template created for "${pack.name}".`)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // Handle Create Version: a new draft version with the current contents becomes the working version.
  const handleCreateVersion = async (pack) => {
    if (!pack) return
    if (!isLiveBackendData || typeof pack.id !== 'number') {
      setMutationNotice('Cannot create a version: the pack is not saved or the backend is unavailable.')
      return
    }
    const nextVersionNo = (pack.versionNo || 0) + 1
    try {
      const itemsList = resolveItemsForProducts(pack.productIds || [], pack.requiredProductIds || [], pack.packFeatureIds || [])
      const createdVer = await createPackVersion({ pack_id: pack.id, version_no: nextVersionNo, status: 'draft' })
      if (itemsList.length > 0) {
        await syncPackItems(createdVer.id, itemsList)
      }
      await handleRefresh()
      setSelectedPackId(pack.id)
      setToastMessage(`Created Version ${nextVersionNo} (draft) for "${pack.name}".`)
      setTimeout(() => setToastMessage(''), 3500)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error creating version'
      setMutationNotice(`Failed to create version: ${detail}`)
    }
  }

  // Handle Activate Version (the backend supersedes the previously active version)
  const handleActivateVersion = async (pack) => {
    if (!pack) return
    if (!isLiveBackendData || typeof pack.versionId !== 'number') {
      setMutationNotice('Cannot activate: the version is not saved or the backend is unavailable.')
      return
    }
    try {
      await updatePackVersion(pack.versionId, { status: 'active' })
      await handleRefresh()
      setSelectedPackId(pack.id)
      setToastMessage(`Version ${pack.versionNo} activated for "${pack.name}".`)
      setTimeout(() => setToastMessage(''), 3500)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error activating version'
      setMutationNotice(`Failed to activate version: ${detail}`)
    }
  }

  // Handle Delete Pack
  const handleConfirmDelete = async (packId) => {
    if (!isLiveBackendData || typeof packId !== 'number') {
      setMutationNotice('Cannot delete: the pack is not saved or the backend is unavailable.')
      setPackToDelete(null)
      return
    }
    try {
      await deletePack(packId)
      await handleRefresh()
      setSelectedPackId(null)
      setPackToDelete(null)
      setToastMessage('Pack deleted successfully.')
      setTimeout(() => setToastMessage(''), 3000)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error deleting pack'
      setMutationNotice(`Cannot delete pack: ${detail}`)
    }
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation with Pack Builder highlighted */}
      <CatalogueTopNav activeSection="packs" />


      {/* Backend Integration Status Banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-1.5 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="flex items-center gap-1.5 text-orange-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Loading packs…</span>
            </span>
          ) : isLiveBackendData ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Connected &bull; {packs.length} packs, {products.length} products
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Backend unavailable &bull; {apiError || 'no data loaded'}</span>
            </span>
          )}

          {mutationNotice && (
            <span className="hidden md:inline-block ml-3 px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
              {mutationNotice}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 text-[11px]"
          title="Refresh packs and catalogue from backend"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* 3. Main Workspace: Left Sidebar + Pack Editor or Empty State */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Saved Packs */}
        <PacksSidebar
          packs={packs}
          allProducts={products}
          selectedPackId={selectedPackId}
          onSelectPack={handleSelectPack}
          onCreateNewClick={() => {
            setDuplicatedTemplate(null)
            setSelectedPackId('new')
          }}
        />

        {/* Main Workspace Pane */}
        <main
          className="flex-1 flex flex-col overflow-hidden relative"
          aria-label="Pack Builder Workspace"
        >
          {/* Toast Notification */}
          {toastMessage && (
            <div
              role="status"
              aria-live="polite"
              className="absolute top-4 right-4 z-30 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-900 text-emerald-100 text-xs font-semibold shadow-lg border border-emerald-700 animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span>{toastMessage}</span>
            </div>
          )}

          {selectedPackId ? (
            /* Active Editor Component (keyed by selectedPackId to naturally reset on selection) */
            <PackEditor
              key={selectedPackId}
              pack={activePack}
              isNewPack={isNewPack}
              families={families}
              allProducts={products}
              existingPacks={packs}
              onSavePack={handleSavePack}
              onCancel={() => {
                setDuplicatedTemplate(null)
                setSelectedPackId(null)
              }}
              onDuplicate={handleDuplicatePack}
              onDelete={(pack) => setPackToDelete(pack)}
              onCreateVersion={handleCreateVersion}
              onActivateVersion={handleActivateVersion}
            />
          ) : (
            /* Default Empty Workspace */
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F8FAFC] text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600 mb-4 shadow-xs">
                <Package className="w-8 h-8" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-4 max-w-sm">
                Select a pack to edit, or create your first pack.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDuplicatedTemplate(null)
                  setSelectedPackId('new')
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#F26522] hover:bg-orange-600 active:bg-orange-700 text-white shadow-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Create First Pack</span>
              </button>
            </div>
          )}
        </main>
      </div>

      {/* 4. Delete Confirmation Modal */}
      <DeletePackModal
        isOpen={Boolean(packToDelete)}
        pack={packToDelete}
        onClose={() => setPackToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  )
}

export default PacksPage
