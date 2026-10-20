import { useState } from 'react'
import { CheckCircle2, Package, Plus } from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { PacksSidebar } from './PacksSidebar'
import { PackEditor } from './PackEditor'
import { DeletePackModal } from './DeletePackModal'
import { INITIAL_PACKS } from '../../data/packsData'
import {
  INITIAL_PRODUCT_FAMILIES,
  INITIAL_PRODUCTS,
} from '../../data/catalogueData'

export function PacksPage() {
  const [packs, setPacks] = useState(INITIAL_PACKS)
  const [selectedPackId, setSelectedPackId] = useState(null)
  const [packToDelete, setPackToDelete] = useState(null)
  const [toastMessage, setToastMessage] = useState('')

  const activePack = packs.find((p) => p.id === selectedPackId) || null
  const isNewPack = selectedPackId === 'new'

  // Handle Save Pack (create or update)
  const handleSavePack = (savedData) => {
    let targetId = savedData.id

    setPacks((prev) => {
      const exists = prev.some((p) => p.id === savedData.id)
      if (exists) {
        return prev.map((p) =>
          p.id === savedData.id
            ? { ...p, ...savedData, updatedAt: new Date().toISOString() }
            : p,
        )
      }
      return [
        { ...savedData, createdAt: new Date().toISOString() },
        ...prev,
      ]
    })

    setSelectedPackId(targetId)

    // Trigger toast notification
    setToastMessage(`Pack "${savedData.name}" saved successfully.`)
    setTimeout(() => {
      setToastMessage('')
    }, 3500)
  }

  // Handle Delete Pack
  const handleConfirmDelete = (packId) => {
    setPacks((prev) => {
      const filtered = prev.filter((p) => p.id !== packId)
      if (selectedPackId === packId) {
        setSelectedPackId(null)
      }
      return filtered
    })
    setPackToDelete(null)
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation with Pack Builder highlighted */}
      <CatalogueTopNav activeSection="packs" />

      {/* 2. Commercial Summary Strip */}
      <SummaryStrip
        productLinesCount={INITIAL_PRODUCT_FAMILIES.length}
        totalProductsCount={INITIAL_PRODUCTS.length}
      />

      {/* 3. Main Workspace: Left Sidebar + Pack Editor or Empty State */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Saved Packs */}
        <PacksSidebar
          packs={packs}
          allProducts={INITIAL_PRODUCTS}
          selectedPackId={selectedPackId}
          onSelectPack={(id) => setSelectedPackId(id)}
          onCreateNewClick={() => setSelectedPackId('new')}
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
              families={INITIAL_PRODUCT_FAMILIES}
              allProducts={INITIAL_PRODUCTS}
              existingPacks={packs}
              onSavePack={handleSavePack}
              onCancel={() => setSelectedPackId(null)}
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
                onClick={() => setSelectedPackId('new')}
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
