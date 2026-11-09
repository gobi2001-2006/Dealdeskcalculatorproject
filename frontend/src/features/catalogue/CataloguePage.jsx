import { useState, useMemo, useEffect } from 'react'
import { Search, Plus, Loader2, AlertCircle, Database, Info, RefreshCw } from 'lucide-react'
import { CatalogueTopNav } from './CatalogueTopNav'
import { ProductFamiliesSidebar } from './ProductFamiliesSidebar'
import { ProductTable } from './ProductTable'
import { AddFamilyModal } from './AddFamilyModal'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import {
  getCatalogueFamilies,
  createCatalogueFamily,
  getCatalogueProducts,
  createCatalogueProduct,
  updateCatalogueProduct,
  deleteCatalogueProduct,
  getCatalogueFeatures,
  createCatalogueFeature,
  updateCatalogueFeature,
  deleteCatalogueFeature,
} from '../../api/catalogueApi'

function mapBackendCatalogue(backendFamilies, backendProducts, backendFeatures) {
  const mappedFamilies = (backendFamilies || []).map((bf) => ({
    id: bf.id,
    code: bf.code,
    name: bf.name,
    iconName: 'Layers',
    description: `Backend Family [ID: ${bf.id}, Code: ${bf.code}] - Status: ${bf.status}`,
    status: bf.status,
  }))

  // The table shows one row per product with its first feature; featureCount tells
  // the user (and the delete action) when a product has more features than shown.
  const featureLookup = new Map()
  const featureCount = new Map()
  if (Array.isArray(backendFeatures)) {
    backendFeatures.forEach((feat) => {
      featureCount.set(feat.product_id, (featureCount.get(feat.product_id) || 0) + 1)
      if (!featureLookup.has(feat.product_id)) {
        featureLookup.set(feat.product_id, feat)
      }
    })
  }

  const mappedProducts = (backendProducts || []).map((bp) => {
    const owningFamily = mappedFamilies.find((f) => f.id === bp.product_family_id)
    const primaryFeature = featureLookup.get(bp.id)

    let displayType = 'Adrenalin Native'
    if (primaryFeature?.classification === 'ai_enabled') {
      displayType = 'AI Agent Module'
    } else if (primaryFeature?.classification === 'partner') {
      displayType = 'Partner Integrated'
    }

    return {
      id: bp.id,
      familyId: bp.product_family_id,
      familyName: owningFamily?.name || 'Unassigned',
      solution: bp.name,
      subItem: primaryFeature ? primaryFeature.name : '—',
      code: bp.code,
      type: displayType,
      status: bp.status,
      featureId: primaryFeature?.id || null,
      featureCount: featureCount.get(bp.id) || 0,
      featureCode: primaryFeature?.code || '',
      classification: primaryFeature?.classification || 'native',
      partnerName: primaryFeature?.partner_name || '',
    }
  })

  return { mappedFamilies, mappedProducts }
}

export function CataloguePage() {
  // Only saved records are shown; an unavailable backend shows an error, never demo data.
  const [families, setFamilies] = useState([])
  const [products, setProducts] = useState([])
  const [selectedFamilyId, setSelectedFamilyId] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Backend integration state
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [isLiveBackendData, setIsLiveBackendData] = useState(false)
  const [mutationNotice, setMutationNotice] = useState(null)

  // Modal & inline states
  const [isAddFamilyOpen, setIsAddFamilyOpen] = useState(false)
  const [isAddRowOpen, setIsAddRowOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function fetchData() {
      try {
        const [backendFamilies, backendProducts, backendFeatures] = await Promise.all([
          getCatalogueFamilies(),
          getCatalogueProducts(),
          getCatalogueFeatures(),
        ])

        if (!isMounted) return

        const { mappedFamilies, mappedProducts } = mapBackendCatalogue(
          backendFamilies,
          backendProducts,
          backendFeatures,
        )
        setFamilies(mappedFamilies)
        setProducts(mappedProducts)
        setIsLiveBackendData(true)
      } catch (err) {
        if (!isMounted) return
        setApiError(err?.response?.data?.detail || err?.message || 'Failed to connect to backend catalogue API')
        setIsLiveBackendData(false)
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

  const handleReloadBackend = async () => {
    setIsLoading(true)
    setApiError(null)
    try {
      const [backendFamilies, backendProducts, backendFeatures] = await Promise.all([
        getCatalogueFamilies(),
        getCatalogueProducts(),
        getCatalogueFeatures(),
      ])

      const { mappedFamilies, mappedProducts } = mapBackendCatalogue(
        backendFamilies,
        backendProducts,
        backendFeatures,
      )
      setFamilies(mappedFamilies)
      setProducts(mappedProducts)
      setIsLiveBackendData(true)
    } catch (err) {
      setApiError(err?.response?.data?.detail || err?.message || 'Failed to connect to backend catalogue API')
      setIsLiveBackendData(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter products by selected family and search term
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchesFamily =
        selectedFamilyId === 'all' || prod.familyId === selectedFamilyId

      if (!matchesFamily) return false

      if (!searchTerm.trim()) return true

      const query = searchTerm.trim().toLowerCase()
      const matchSolution = prod.solution.toLowerCase().includes(query)
      const matchSubItem = prod.subItem.toLowerCase().includes(query)
      const matchCode = prod.code.toLowerCase().includes(query)
      const matchFamily = prod.familyName.toLowerCase().includes(query)

      return matchSolution || matchSubItem || matchCode || matchFamily
    })
  }, [products, selectedFamilyId, searchTerm])

  // Get active family metadata
  const activeFamily = useMemo(() => {
    if (selectedFamilyId === 'all') {
      return {
        id: 'all',
        name: 'All Products',
        description:
          'Complete enterprise product portfolio across all functional commercial domains.',
      }
    }
    return (
      families.find((f) => f.id === selectedFamilyId) || {
        id: selectedFamilyId,
        name: 'Product Family',
        description: '',
      }
    )
  }, [selectedFamilyId, families])

  // Handle Add Family (Connected to backend POST /api/catalogue/families)
  const handleAddFamily = async (newFamilyData) => {
    const generatedCode = newFamilyData.code
      ? newFamilyData.code.trim().toUpperCase()
      : newFamilyData.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 4) || 'FAM'

    if (isLiveBackendData) {
      try {
        const created = await createCatalogueFamily({
          code: generatedCode,
          name: newFamilyData.name.trim(),
          sort_order: families.length + 1,
          status: 'active',
        })

        await handleReloadBackend()
        setSelectedFamilyId(created.id)
        setIsAddFamilyOpen(false)
        setMutationNotice(`Product family '${created.name}' successfully created in database.`)
      } catch (err) {
        console.error('Failed to create product family in backend:', err)
        const detail = err.response?.data?.detail || err.message || 'Error creating family'
        setMutationNotice(`Cannot create product family: ${detail}`)
      }
      return
    }

    setMutationNotice('Cannot create product family: the catalogue backend is not available.')
  }

  // Handle Add Product Row (Connected to backend POST /api/catalogue/products and features)
  const handleSaveNewProduct = async (newProduct) => {
    const targetFamilyId = Number(newProduct.familyId)
    if (!isLiveBackendData) {
      setMutationNotice('Cannot create product: the catalogue backend is not available.')
      return
    }
    if (!Number.isInteger(targetFamilyId) || !families.some((f) => Number(f.id) === targetFamilyId)) {
      setMutationNotice('Select a saved product family for the new product.')
      return
    }

    try {
      const createdProd = await createCatalogueProduct({
        product_family_id: targetFamilyId,
        code: newProduct.code,
        name: newProduct.solution,
        status: 'active',
      })

      let classification = 'native'
      if (newProduct.type === 'AI Agent Module') {
        classification = 'ai_enabled'
      } else if (newProduct.type === 'Partner Integrated') {
        classification = 'partner'
      }

      const featureName = (newProduct.subItem && newProduct.subItem !== '—')
        ? newProduct.subItem.trim()
        : newProduct.solution
      const featureCode = `${createdProd.code}-001`
      const partnerName = classification === 'partner' ? featureName : null

      try {
        await createCatalogueFeature({
          product_id: createdProd.id,
          code: featureCode,
          name: featureName,
          classification,
          partner_name: partnerName,
          status: 'active',
        })
      } catch (featErr) {
        await handleReloadBackend()
        const detail = featErr.response?.data?.detail || featErr.message
        setMutationNotice(`Product '${createdProd.name}' was created, but its feature could not be saved: ${detail}`)
        return
      }

      await handleReloadBackend()
      setMutationNotice(`Product '${createdProd.name}' (${createdProd.code}) saved.`)
    } catch (err) {
      console.error('Failed to create product in backend:', err)
      const detail = err.response?.data?.detail || err.message || 'Error creating product'
      setMutationNotice(`Failed to create product: ${detail}`)
    }
  }

  // Handle Update Product (Connected to backend PATCH /api/catalogue/products/{id} and features)
  const handleUpdateProduct = async (id, updatedFields) => {
    if (!isNaN(Number(id))) {
      try {
        const payload = {}
        if (updatedFields.solution) payload.name = updatedFields.solution
        if (updatedFields.code) payload.code = updatedFields.code
        if (updatedFields.familyId && !isNaN(Number(updatedFields.familyId))) {
          payload.product_family_id = Number(updatedFields.familyId)
        }

        const updatedProd = await updateCatalogueProduct(Number(id), payload)

        const existingProd = products.find((p) => p.id === id)
        const featureId = existingProd?.featureId

        let classification = existingProd?.classification || 'native'
        if (updatedFields.type === 'AI Agent Module') {
          classification = 'ai_enabled'
        } else if (updatedFields.type === 'Partner Integrated') {
          classification = 'partner'
        } else if (updatedFields.type === 'Adrenalin Native') {
          classification = 'native'
        }

        const subItemName = (updatedFields.subItem && updatedFields.subItem !== '—')
          ? updatedFields.subItem.trim()
          : (existingProd?.subItem !== '—' ? existingProd?.subItem : updatedProd.name)
        const partnerName = classification === 'partner' ? subItemName : null

        if (featureId && !isNaN(Number(featureId))) {
          try {
            await updateCatalogueFeature(Number(featureId), {
              name: subItemName,
              classification,
              partner_name: partnerName,
            })
          } catch (featErr) {
            throw new Error(`product saved, but feature update failed: ${featErr.response?.data?.detail || featErr.message}`, { cause: featErr })
          }
        } else if (subItemName) {
          try {
            await createCatalogueFeature({
              product_id: Number(id),
              code: `${updatedProd.code}-001`,
              name: subItemName,
              classification,
              partner_name: partnerName,
              status: 'active',
            })
          } catch (featErr) {
            throw new Error(`product saved, but feature creation failed: ${featErr.response?.data?.detail || featErr.message}`, { cause: featErr })
          }
        }

        await handleReloadBackend()
        setMutationNotice(`Product '${updatedProd.code}' successfully updated in database.`)
      } catch (err) {
        console.error('Failed to update product in backend:', err)
        const detail = err.response?.data?.detail || err.message || 'Error updating product'
        setMutationNotice(`Failed to update product: ${detail}`)
      }
    } else {
      setMutationNotice('Cannot update product: it is not a saved record.')
    }
  }

  // Handle Delete Product Confirmation (Connected to backend DELETE /api/catalogue/products/{id})
  const handleConfirmDelete = async (id) => {
    if (isNaN(Number(id))) {
      setMutationNotice('Cannot delete product: it is not a saved record.')
      return
    }
    const targetProd = products.find((p) => p.id === id)
    if ((targetProd?.featureCount || 0) > 1) {
      setMutationNotice(
        `Cannot delete product: it has ${targetProd.featureCount} features. Remove the extra features first.`,
      )
      return
    }
    try {
      if (targetProd?.featureId) {
        // The backend refuses to delete a product that still has features.
        await deleteCatalogueFeature(Number(targetProd.featureId))
      }
      await deleteCatalogueProduct(Number(id))
      await handleReloadBackend()
      setProductToDelete(null)
      setMutationNotice(`Product ID ${id} deleted.`)
    } catch (err) {
      await handleReloadBackend()
      const detail = err.response?.data?.detail || err.message || 'Error deleting product'
      setMutationNotice(`Cannot delete product: ${detail}`)
    }
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation: Dark navy header with brand and navigation */}
      <CatalogueTopNav />


      {/* Backend Integration & Status Banners */}
      <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex flex-wrap items-center justify-between text-xs shrink-0 gap-2">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="inline-flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Loading catalog…</span>
            </span>
          ) : isLiveBackendData ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded font-medium">
              <Database className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span>Connected to database</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded font-medium">
              <Info className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
              <span>Catalogue backend unavailable{apiError ? ` (${apiError})` : ''}</span>
            </span>
          )}

          <span className="text-[11px] text-slate-500 hidden md:inline">
            {families.length} families · {products.length} products
          </span>
        </div>

        <button
          type="button"
          onClick={handleReloadBackend}
          disabled={isLoading}
          className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          title="Reload the catalog from the server"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Mutation Notice (Read-only disclaimer alert) */}
      {mutationNotice && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-100/90 border-b border-amber-300 text-amber-900 px-4 py-1.5 text-xs flex items-center justify-between animate-in fade-in shrink-0"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
            <span>{mutationNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setMutationNotice(null)}
            className="text-amber-700 hover:text-amber-950 font-bold ml-2 cursor-pointer"
            aria-label="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}

      {/* 3. Main Workspace: Split into Left Sidebar and Right Catalogue Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Product Families */}
        <ProductFamiliesSidebar
          families={families}
          products={products}
          selectedFamilyId={selectedFamilyId}
          onSelectFamily={(famId) => {
            setSelectedFamilyId(famId)
            setIsAddRowOpen(false)
          }}
          onOpenAddFamily={() => setIsAddFamilyOpen(true)}
        />

        {/* Main Catalogue Area */}
        <main
          className="flex-1 flex flex-col p-4 sm:p-5 overflow-hidden bg-[#F8FAFC]"
          aria-label="Product Catalogue Management"
        >
          {/* Catalogue Area Header & Controls */}
          <div className="mb-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  {activeFamily.name}
                </h1>
                <span className="text-xs font-mono font-semibold bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              {activeFamily.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 max-w-2xl">
                  {activeFamily.description}
                </p>
              )}
            </div>

            {/* Search Input & + Add Row button */}
            <div className="flex items-center gap-2.5">
              <div className="relative w-64">
                <Search
                  className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name or code..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 placeholder:text-slate-400 shadow-2xs"
                  aria-label="Search name or code"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsAddRowOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer shrink-0"
                aria-label="Add product row"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Row</span>
              </button>
            </div>
          </div>

          {/* Catalogue Table Area */}
          <ProductTable
            products={filteredProducts}
            families={families}
            selectedFamilyId={selectedFamilyId}
            isAddRowOpen={isAddRowOpen}
            onCloseAddRow={() => setIsAddRowOpen(false)}
            onSaveNewProduct={handleSaveNewProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProductClick={(prod) => setProductToDelete(prod)}
            searchTerm={searchTerm}
            onClearSearch={() => setSearchTerm('')}
            totalProductsCount={products.length}
          />
        </main>
      </div>

      {/* 4. Add Family Accessible Modal */}
      <AddFamilyModal
        isOpen={isAddFamilyOpen}
        onClose={() => setIsAddFamilyOpen(false)}
        onAddFamily={handleAddFamily}
        existingFamilies={families}
      />

      {/* 5. Delete Confirmation Accessible Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(productToDelete)}
        product={productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  )
}

export default CataloguePage
