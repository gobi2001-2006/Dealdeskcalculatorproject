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
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { PacksSidebar } from './PacksSidebar'
import { PackEditor } from './PackEditor'
import { DeletePackModal } from './DeletePackModal'
import { INITIAL_PACKS, PRESET_COLORS } from '../../data/packsData'
import {
  INITIAL_PRODUCT_FAMILIES,
  INITIAL_PRODUCTS,
} from '../../data/catalogueData'
import {
  getPacks,
  createPack,
  getPackDetail,
  updatePack,
  deletePack,
  getPackVersion,
  createPackVersion,
  updatePackVersion,
  syncPackItems,
  updatePackItem,
} from '../../api/packsApi'
import {
  getCatalogueFamilies,
  getCatalogueProducts,
  getCatalogueFeatures,
  createCatalogueFeature,
} from '../../api/catalogueApi'

function mapBackendPacks(backendPacks, backendFeatures) {
  if (!Array.isArray(backendPacks)) return []

  return backendPacks.map((bp, index) => {
    const activeVer =
      bp.pack_versions?.find((v) => v.status === 'active') ||
      bp.pack_versions?.[bp.pack_versions.length - 1] ||
      null

    const color =
      PRESET_COLORS[index % PRESET_COLORS.length]?.hex || '#F26522'

    const productIds = []
    const requiredProductIds = []

    if (activeVer && Array.isArray(activeVer.pack_items)) {
      activeVer.pack_items.forEach((item) => {
        const prodId =
          item.feature?.product_id ||
          (backendFeatures && backendFeatures.find((f) => f.id === item.feature_id)?.product_id)
        if (prodId) {
          productIds.push(prodId)
          if (item.is_required !== false) {
            requiredProductIds.push(prodId)
          }
        }
      })
    }

    return {
      id: bp.id,
      name: bp.name,
      description: `Commercial pack bundle (${bp.variant} tier).`,
      code: bp.code,
      familyId: bp.product_family_id || '',
      color,
      variant: bp.variant || 'standard',
      status: bp.status || 'active',
      versionId: activeVer?.id || null,
      versionNo: activeVer?.version_no || 1,
      versionStatus: activeVer?.status || 'active',
      productIds,
      requiredProductIds,
      notes: `Live PostgreSQL Pack record [ID: ${bp.id}, Code: ${bp.code}].`,
      createdAt: bp.created_at,
      updatedAt: bp.updated_at,
    }
  })
}

export function PacksPage() {
  const [packs, setPacks] = useState(INITIAL_PACKS)
  const [families, setFamilies] = useState(INITIAL_PRODUCT_FAMILIES)
  const [products, setProducts] = useState(INITIAL_PRODUCTS)
  const [featuresList, setFeaturesList] = useState([])
  const [selectedPackId, setSelectedPackId] = useState(null)
  const [packToDelete, setPackToDelete] = useState(null)
  const [duplicatedTemplate, setDuplicatedTemplate] = useState(null)
  const [toastMessage, setToastMessage] = useState('')

  // Backend sync states
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [isLiveBackendData, setIsLiveBackendData] = useState(false)
  const [mutationNotice, setMutationNotice] = useState(null)

  // Fetch packs & catalogue records from backend on mount
  useEffect(() => {
    let isMounted = true

    async function fetchData() {
      try {
        const [backendPacks, backendFamilies, backendProducts, backendFeatures] =
          await Promise.all([
            getPacks(),
            getCatalogueFamilies(),
            getCatalogueProducts(),
            getCatalogueFeatures(),
          ])

        if (!isMounted) return

        if (Array.isArray(backendFeatures)) {
          setFeaturesList(backendFeatures)
        }

        let mappedFamilies = INITIAL_PRODUCT_FAMILIES
        if (Array.isArray(backendFamilies) && backendFamilies.length > 0) {
          mappedFamilies = backendFamilies.map((bf) => ({
            id: bf.id,
            code: bf.code,
            name: bf.name,
            iconName: 'Layers',
            description: `Backend Family [ID: ${bf.id}, Code: ${bf.code}]`,
            status: bf.status,
          }))
          setFamilies(mappedFamilies)
        }

        let mappedProducts = INITIAL_PRODUCTS
        if (Array.isArray(backendProducts) && backendProducts.length > 0) {
          const featLookup = new Map()
          if (Array.isArray(backendFeatures)) {
            backendFeatures.forEach((f) => featLookup.set(f.product_id, f))
          }

          mappedProducts = backendProducts.map((bp) => {
            const owningFam = mappedFamilies.find(
              (f) => f.id === bp.product_family_id,
            )
            const primaryFeat = featLookup.get(bp.id)

            let displayType = 'Adrenalin Native'
            if (primaryFeat?.classification === 'ai_enabled') {
              displayType = 'AI Agent Module'
            } else if (primaryFeat?.classification === 'partner') {
              displayType = 'Partner Integrated'
            }

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
          setProducts(mappedProducts)
        }

        if (Array.isArray(backendPacks) && backendPacks.length > 0) {
          const mappedPacks = mapBackendPacks(backendPacks, backendFeatures)
          setPacks(mappedPacks)
          setIsLiveBackendData(true)
        } else {
          setIsLiveBackendData(true)
        }
      } catch (err) {
        if (!isMounted) return
        setIsLiveBackendData(false)
        setApiError(
          err?.message ? `Backend offline (${err.message})` : 'Backend connection offline',
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      isMounted = false
    }
  }, [])

  // Manual refresh callback
  const handleRefresh = async () => {
    setIsLoading(true)
    setApiError(null)

    try {
      const [backendPacks, backendFamilies, backendProducts, backendFeatures] =
        await Promise.all([
          getPacks(),
          getCatalogueFamilies(),
          getCatalogueProducts(),
          getCatalogueFeatures(),
        ])

      if (Array.isArray(backendFeatures)) {
        setFeaturesList(backendFeatures)
      }

      let mappedFamilies = INITIAL_PRODUCT_FAMILIES
      if (Array.isArray(backendFamilies) && backendFamilies.length > 0) {
        mappedFamilies = backendFamilies.map((bf) => ({
          id: bf.id,
          code: bf.code,
          name: bf.name,
          iconName: 'Layers',
          description: `Backend Family [ID: ${bf.id}, Code: ${bf.code}]`,
          status: bf.status,
        }))
        setFamilies(mappedFamilies)
      }

      let mappedProducts = INITIAL_PRODUCTS
      if (Array.isArray(backendProducts) && backendProducts.length > 0) {
        const featLookup = new Map()
        if (Array.isArray(backendFeatures)) {
          backendFeatures.forEach((f) => featLookup.set(f.product_id, f))
        }

        mappedProducts = backendProducts.map((bp) => {
          const owningFam = mappedFamilies.find(
            (f) => f.id === bp.product_family_id,
          )
          const primaryFeat = featLookup.get(bp.id)

          let displayType = 'Adrenalin Native'
          if (primaryFeat?.classification === 'ai_enabled') {
            displayType = 'AI Agent Module'
          } else if (primaryFeat?.classification === 'partner') {
            displayType = 'Partner Integrated'
          }

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
        setProducts(mappedProducts)
      }

      if (Array.isArray(backendPacks) && backendPacks.length > 0) {
        const mappedPacks = mapBackendPacks(backendPacks, backendFeatures)
        setPacks(mappedPacks)
        setIsLiveBackendData(true)
      }
      setMutationNotice('Refreshed data from PostgreSQL.')
    } catch (err) {
      setIsLiveBackendData(false)
      setApiError(
        err?.message ? `Backend offline (${err.message})` : 'Backend connection offline',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const activePack =
    selectedPackId === 'new'
      ? duplicatedTemplate
      : packs.find((p) => p.id === selectedPackId) || null
  const isNewPack = selectedPackId === 'new'

  // Helper to map product IDs and required state to feature pack items
  const resolveItemsForProducts = async (prodIds, reqProdIds) => {
    let currentFeatures = featuresList
    if (!currentFeatures || currentFeatures.length === 0) {
      try {
        currentFeatures = await getCatalogueFeatures()
        setFeaturesList(currentFeatures)
      } catch (e) {
        currentFeatures = []
      }
    }

    const items = []
    for (const pId of prodIds) {
      let matchedFeat = currentFeatures.find((f) => f.product_id === pId)
      if (!matchedFeat && typeof pId === 'number') {
        const prod = products.find((p) => p.id === pId)
        try {
          matchedFeat = await createCatalogueFeature({
            product_id: pId,
            code: `${prod?.code || 'PRD'}-001`,
            name: prod?.solution || 'Default Feature',
            classification: 'native',
            status: 'active',
          })
          currentFeatures.push(matchedFeat)
          setFeaturesList([...currentFeatures])
        } catch (e) {
          console.warn('Could not auto-create feature for product:', pId, e)
        }
      }

      if (matchedFeat) {
        items.push({
          feature_id: matchedFeat.id,
          is_required: reqProdIds.includes(pId),
        })
      }
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
          const activeVer =
            packDetail.pack_versions?.find((v) => v.status === 'active') ||
            packDetail.pack_versions?.[packDetail.pack_versions.length - 1] ||
            null

          const productIds = []
          const requiredProductIds = []

          if (activeVer && Array.isArray(activeVer.pack_items)) {
            activeVer.pack_items.forEach((item) => {
              const prodId =
                item.feature?.product_id ||
                featuresList.find((f) => f.id === item.feature_id)?.product_id
              if (prodId) {
                productIds.push(prodId)
                if (item.is_required !== false) {
                  requiredProductIds.push(prodId)
                }
              }
            })
          }

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
                    versionNo: activeVer?.version_no || 1,
                    versionStatus: activeVer?.status || 'active',
                    productIds,
                    requiredProductIds,
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

  // Handle Save Pack (create or update with full persistence)
  const handleSavePack = async (savedData) => {
    let targetId = savedData.id
    const trimmedName = savedData.name.trim()

    // 1. Live backend persistence
    if (isLiveBackendData) {
      try {
        const itemsList = await resolveItemsForProducts(
          savedData.productIds || [],
          savedData.requiredProductIds || [],
        )

        if (isNewPack) {
          const payload = {
            name: trimmedName,
            code: savedData.code || `PACK-${Date.now().toString().slice(-4)}`,
            variant: savedData.variant || 'standard',
            product_family_id: savedData.familyId ? Number(savedData.familyId) : null,
            status: 'active',
            initial_version: 1,
            feature_ids: itemsList.map((i) => i.feature_id),
            required_feature_ids: itemsList.filter((i) => i.is_required).map((i) => i.feature_id),
            items: itemsList,
          }

          const created = await createPack(payload)
          targetId = created.id

          await handleRefresh()
          setSelectedPackId(created.id)
          setMutationNotice(`Pack "${created.name}" created and saved to PostgreSQL.`)
        } else {
          // Update existing pack
          const payload = {
            name: trimmedName,
            code: savedData.code,
            variant: savedData.variant || 'standard',
            product_family_id: savedData.familyId ? Number(savedData.familyId) : null,
            status: 'active',
          }

          if (typeof savedData.id === 'number') {
            await updatePack(savedData.id, payload)

            const targetPack = packs.find((p) => p.id === savedData.id)
            const versionId = savedData.versionId || targetPack?.versionId
            if (versionId && typeof versionId === 'number') {
              await syncPackItems(versionId, itemsList)
            }
          }

          await handleRefresh()
          setSelectedPackId(savedData.id)
          setMutationNotice(`Pack "${trimmedName}" updated in PostgreSQL.`)
        }
      } catch (err) {
        console.error('Failed to save pack in backend:', err)
        const detail = err.response?.data?.detail || err.message || 'Error saving pack'
        setMutationNotice(`Failed to save pack: ${detail}`)
        return
      }
    } else {
      // Local state update (offline / test runner)
      setPacks((prev) => {
        const exists = prev.some((p) => p.id === savedData.id)
        if (exists) {
          return prev.map((p) =>
            p.id === savedData.id ? { ...p, ...savedData, updatedAt: new Date().toISOString() } : p,
          )
        }
        return [{ ...savedData, createdAt: new Date().toISOString() }, ...prev]
      })
      setSelectedPackId(targetId)
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
      versionNo: 1,
      versionStatus: 'draft',
      versionId: null,
    }
    setDuplicatedTemplate(duplicated)
    setSelectedPackId('new')
    setToastMessage(`Duplicated template created for "${pack.name}".`)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // Handle Create Version
  const handleCreateVersion = async (pack) => {
    if (!pack) return
    const nextVersionNo = (pack.versionNo || 1) + 1

    if (isLiveBackendData && typeof pack.id === 'number') {
      try {
        const createdVer = await createPackVersion({
          pack_id: pack.id,
          version_no: nextVersionNo,
          status: 'draft',
        })

        const itemsList = await resolveItemsForProducts(
          pack.productIds || [],
          pack.requiredProductIds || [],
        )
        if (itemsList.length > 0) {
          await syncPackItems(createdVer.id, itemsList)
        }

        await handleRefresh()
        setSelectedPackId(pack.id)
        setToastMessage(`Created Version ${nextVersionNo} (draft) for "${pack.name}".`)
        setTimeout(() => setToastMessage(''), 3500)
        return
      } catch (err) {
        console.error('Backend version creation failed:', err)
        const detail = err.response?.data?.detail || err.message || 'Error creating version'
        setMutationNotice(`Failed to create version: ${detail}`)
        return
      }
    }

    setPacks((prev) =>
      prev.map((p) =>
        p.id === pack.id ? { ...p, versionNo: nextVersionNo, versionStatus: 'draft' } : p,
      ),
    )
    setToastMessage(`Created Version ${nextVersionNo} (draft) for "${pack.name}".`)
    setTimeout(() => setToastMessage(''), 3500)
  }

  // Handle Activate Version
  const handleActivateVersion = async (pack) => {
    if (!pack) return

    if (isLiveBackendData && pack.versionId && typeof pack.versionId === 'number') {
      try {
        await updatePackVersion(pack.versionId, { status: 'active' })
        await handleRefresh()
        setSelectedPackId(pack.id)
        setToastMessage(`Version ${pack.versionNo || 1} activated for "${pack.name}".`)
        setTimeout(() => setToastMessage(''), 3500)
        return
      } catch (err) {
        console.error('Backend version activation failed:', err)
        const detail = err.response?.data?.detail || err.message || 'Error activating version'
        setMutationNotice(`Failed to activate version: ${detail}`)
        return
      }
    }

    setPacks((prev) =>
      prev.map((p) => (p.id === pack.id ? { ...p, versionStatus: 'active' } : p)),
    )
    setToastMessage(`Version ${pack.versionNo || 1} activated for "${pack.name}".`)
    setTimeout(() => setToastMessage(''), 3500)
  }

  // Handle Delete Pack
  const handleConfirmDelete = async (packId) => {
    if (isLiveBackendData && typeof packId === 'number') {
      try {
        await deletePack(packId)
        await handleRefresh()
        setSelectedPackId(null)
        setPackToDelete(null)
        setToastMessage('Pack deleted successfully.')
        setTimeout(() => setToastMessage(''), 3000)
        return
      } catch (err) {
        console.error('Backend pack deletion failed:', err)
        const detail = err.response?.data?.detail || err.message || 'Error deleting pack'
        setMutationNotice(`Cannot delete pack: ${detail}`)
        return
      }
    }

    setPacks((prev) => {
      const filtered = prev.filter((p) => p.id !== packId)
      if (selectedPackId === packId) {
        setSelectedPackId(null)
      }
      return filtered
    })
    setPackToDelete(null)
    setToastMessage('Pack deleted successfully.')
    setTimeout(() => setToastMessage(''), 3000)
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation with Pack Builder highlighted */}
      <CatalogueTopNav activeSection="packs" />

      {/* 2. Commercial Summary Strip */}
      <SummaryStrip
        productLinesCount={families.length}
        totalProductsCount={products.length}
      />

      {/* Backend Integration Status Banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-1.5 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="flex items-center gap-1.5 text-orange-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Connecting to PostgreSQL...</span>
            </span>
          ) : isLiveBackendData ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Connected to PostgreSQL &bull; Live Packs &amp; Catalogue ({packs.length} packs, {products.length} products)
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Offline Fallback &bull; {apiError || 'Mock preset data loaded'}</span>
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
