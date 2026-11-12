import { useState } from 'react'
import { X, Plus, AlertCircle } from 'lucide-react'
import { PRODUCT_TYPES } from '../../../data/catalogueData'

export function AddProductModal({ isOpen, onClose, onSave, families = [], selectedFamilyId = 'all' }) {
  const defaultFamilyId = selectedFamilyId !== 'all' ? selectedFamilyId : families[0]?.id || 'fam-ta'
  const [familyId, setFamilyId] = useState(defaultFamilyId)
  const [solution, setSolution] = useState('')
  const [subItem, setSubItem] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState(PRODUCT_TYPES[0] || 'Adrenalin Native')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const selectedFamily = families.find((f) => f.id === familyId) || families[0]

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const trimmedSolution = solution.trim()
    const trimmedSubItem = subItem.trim()
    const trimmedCode = code.trim().toUpperCase()

    if (!trimmedSolution) {
      setError('Product solution name is required.')
      return
    }

    if (!trimmedCode) {
      setError('Product code / SKU is required.')
      return
    }

    onSave({
      familyId,
      familyName: selectedFamily?.name || 'Talent Acquisition',
      solution: trimmedSolution,
      subItem: trimmedSubItem || 'Standard Capability',
      code: trimmedCode,
      type,
    })

    setSolution('')
    setSubItem('')
    setCode('')
    setError('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-product-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Plus className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-product-title" className="text-[16px] font-bold text-slate-900">
                Add Catalogue Product
              </h2>
              <p className="text-[11px] text-slate-500">
                Register a new solution module under a product family
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 text-[11px] rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="product-family" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Target Product Family <span className="text-rose-500">*</span>
            </label>
            <select
              id="product-family"
              value={familyId}
              onChange={(e) => setFamilyId(e.target.value)}
              className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            >
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="product-solution" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Solution / Module Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="product-solution"
              type="text"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              placeholder="e.g. Executive Succession Studio"
              className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="product-subitem" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Sub-Item / Feature Description
            </label>
            <input
              id="product-subitem"
              type="text"
              value={subItem}
              onChange={(e) => setSubItem(e.target.value)}
              placeholder="e.g. 9-box calibration matrix and bench strength"
              className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="product-code" className="block text-[13px] font-semibold text-slate-700 mb-1">
                Product SKU / Code <span className="text-rose-500">*</span>
              </label>
              <input
                id="product-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. TA-NEW-007"
                className="w-full px-3.5 py-2 text-[14px] font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label htmlFor="product-type" className="block text-[13px] font-semibold text-slate-700 mb-1">
                Product Type
              </label>
              <select
                id="product-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-[13px] font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Add Product
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
