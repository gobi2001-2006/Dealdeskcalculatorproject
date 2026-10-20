import { useState } from 'react'
import { PackEditorHeader } from './PackEditorHeader'
import { ProductSelectionPanel } from './ProductSelectionPanel'
import { NotesAndScopeCard } from './NotesAndScopeCard'
import { PackSaveBar } from './PackSaveBar'
import { calculatePackTypeCounts } from '../../data/packsData'

export function PackEditor({
  pack,
  isNewPack = false,
  families = [],
  allProducts = [],
  existingPacks = [],
  onSavePack,
  onCancel,
}) {
  // Form fields initialized once on mount (component has key={selectedPackId})
  const [name, setName] = useState(pack?.name || '')
  const [description, setDescription] = useState(pack?.description || '')
  const [code, setCode] = useState(pack?.code || '')
  const [familyId, setFamilyId] = useState(pack?.familyId || '')
  const [color, setColor] = useState(pack?.color || '#F26522')
  const [productIds, setProductIds] = useState(pack?.productIds || [])
  const [notes, setNotes] = useState(pack?.notes || '')
  const [validationErrors, setValidationErrors] = useState({})

  // Field change dispatcher
  const handleChangeField = (field, value) => {
    if (field === 'name') {
      setName(value)
      if (validationErrors.name) {
        setValidationErrors((prev) => ({ ...prev, name: '' }))
      }
    } else if (field === 'description') {
      setDescription(value)
    } else if (field === 'code') {
      setCode(value)
    } else if (field === 'familyId') {
      setFamilyId(value)
    } else if (field === 'color') {
      setColor(value)
    }
  }

  // Toggle product selection
  const handleToggleProduct = (productId) => {
    setProductIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId)
      }
      return [...prev, productId]
    })
  }

  // Remove product from selection
  const handleRemoveProduct = (productId) => {
    setProductIds((prev) => prev.filter((id) => id !== productId))
  }

  // Live dynamic product-type counts
  const typeCounts = calculatePackTypeCounts(productIds, allProducts)

  // Save validation & submission
  const handleSave = () => {
    const trimmedName = name.trim()
    const errors = {}

    if (!trimmedName) {
      errors.name = 'Pack Name is required.'
    } else {
      const isDuplicate = existingPacks.some((p) => {
        // Skip current pack if editing
        if (!isNewPack && p.id === pack?.id) return false
        return p.name.trim().toLowerCase() === trimmedName.toLowerCase()
      })

      if (isDuplicate) {
        errors.name = 'A pack with this name already exists. Please choose a unique name.'
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    onSavePack({
      id: isNewPack ? `pack-${Date.now()}` : pack.id,
      name: trimmedName,
      description: description.trim(),
      code: code.trim().toUpperCase(),
      familyId,
      color,
      productIds,
      notes: notes.trim(),
    })
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F8FAFC]">
      {/* Scrollable Editor Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {/* Editor Metadata Header */}
        <PackEditorHeader
          isNewPack={isNewPack}
          formValues={{
            name,
            description,
            code,
            familyId,
            color,
          }}
          onChangeField={handleChangeField}
          families={families}
          selectedCount={productIds.length}
          validationErrors={validationErrors}
          onCancel={onCancel}
        />

        {/* Product Selection Panel with accordion and selected items summary */}
        <ProductSelectionPanel
          families={families}
          allProducts={allProducts}
          selectedProductIds={productIds}
          onToggleProduct={handleToggleProduct}
          onRemoveProduct={handleRemoveProduct}
        />

        {/* Notes & Scope Card */}
        <NotesAndScopeCard
          notes={notes}
          onChangeNotes={setNotes}
        />
      </div>

      {/* Fixed Bottom Save Bar with 4 live counters */}
      <PackSaveBar
        typeCounts={typeCounts}
        onSave={handleSave}
        onCancel={onCancel}
      />
    </div>
  )
}

export default PackEditor
