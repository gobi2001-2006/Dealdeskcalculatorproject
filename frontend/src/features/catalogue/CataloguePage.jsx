import { useState, useMemo } from 'react'
import { Search, Plus } from 'lucide-react'
import { CatalogueTopNav } from './CatalogueTopNav'
import { SummaryStrip } from './SummaryStrip'
import { ProductFamiliesSidebar } from './ProductFamiliesSidebar'
import { ProductTable } from './ProductTable'
import { AddFamilyModal } from './AddFamilyModal'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import {
  INITIAL_PRODUCT_FAMILIES,
  INITIAL_PRODUCTS,
} from '../../data/catalogueData'

export function CataloguePage() {
  const [families, setFamilies] = useState(INITIAL_PRODUCT_FAMILIES)
  const [products, setProducts] = useState(INITIAL_PRODUCTS)
  const [selectedFamilyId, setSelectedFamilyId] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Modal & inline states
  const [isAddFamilyOpen, setIsAddFamilyOpen] = useState(false)
  const [isAddRowOpen, setIsAddRowOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState(null)

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

  // Handle Add Family
  const handleAddFamily = (newFamilyData) => {
    const newId = `fam-${Date.now()}`
    const generatedCode = newFamilyData.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 4)

    const newFamily = {
      id: newId,
      code: generatedCode || 'FAM',
      name: newFamilyData.name,
      description: newFamilyData.description,
      iconName: newFamilyData.iconName,
    }

    setFamilies((prev) => [...prev, newFamily])
    setSelectedFamilyId(newId)
    setIsAddFamilyOpen(false)
  }

  // Handle Add Product Row
  const handleSaveNewProduct = (newProduct) => {
    setProducts((prev) => [newProduct, ...prev])
  }

  // Handle Update Product
  const handleUpdateProduct = (id, updatedFields) => {
    setProducts((prev) =>
      prev.map((prod) => (prod.id === id ? { ...prod, ...updatedFields } : prod)),
    )
  }

  // Handle Delete Product Confirmation
  const handleConfirmDelete = (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id))
    setProductToDelete(null)
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation: Dark navy header with brand and navigation */}
      <CatalogueTopNav />

      {/* 2. Summary Strip: Client, Countries, Product Lines, FCV, Services, Grand Total */}
      <SummaryStrip
        productLinesCount={families.length}
        totalProductsCount={products.length}
      />

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
