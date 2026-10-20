import { useState, useEffect, useRef } from 'react'
import {
  X,
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Briefcase,
  Sparkles,
  ShieldCheck,
  Layers,
  HeartHandshake,
} from 'lucide-react'

const AVAILABLE_ICONS = [
  { name: 'Users', label: 'People / Talent', icon: Users },
  { name: 'Building', label: 'Core / Org', icon: Building },
  { name: 'DollarSign', label: 'Payroll / Finance', icon: DollarSign },
  { name: 'Award', label: 'Performance / Goals', icon: Award },
  { name: 'Clock', label: 'Time / Shifts', icon: Clock },
  { name: 'Briefcase', label: 'Executive / Ops', icon: Briefcase },
  { name: 'Sparkles', label: 'AI / Automation', icon: Sparkles },
  { name: 'ShieldCheck', label: 'Security / Compliance', icon: ShieldCheck },
  { name: 'Layers', label: 'Platform / Modules', icon: Layers },
  { name: 'HeartHandshake', label: 'Engagement / Benefits', icon: HeartHandshake },
]

function AddFamilyForm({ onClose, onAddFamily, existingFamilies = [] }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedIcon, setSelectedIcon] = useState('Users')
  const [error, setError] = useState('')
  const nameInputRef = useRef(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmedName = name.trim()

    if (!trimmedName) {
      setError('Family Name is required.')
      nameInputRef.current?.focus()
      return
    }

    const isDuplicate = existingFamilies.some(
      (fam) => fam.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )

    if (isDuplicate) {
      setError('A product family with this name already exists.')
      nameInputRef.current?.focus()
      return
    }

    onAddFamily({
      name: trimmedName,
      description: description.trim(),
      iconName: selectedIcon,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-family-title"
      className="relative z-10 bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Modal Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div>
          <h2
            id="add-family-title"
            className="text-base font-bold text-slate-900"
          >
            Add Product Family
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define a top-level L1 product category in the master catalogue.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Form Body */}
      <form onSubmit={handleSubmit}>
        <div className="p-5 space-y-4">
          {/* Family Name */}
          <div>
            <label
              htmlFor="family-name-input"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
            >
              Family Name <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="family-name-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError('')
              }}
              placeholder="e.g. Learning & Development"
              className={`w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:bg-white text-slate-900 ${
                error
                  ? 'border-red-400 focus:ring-red-500 bg-red-50/30'
                  : 'border-slate-300 focus:ring-emerald-600'
              }`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'family-name-error' : undefined}
            />
            {error && (
              <p
                id="family-name-error"
                className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1"
              >
                {error}
              </p>
            )}
          </div>

          {/* Description (Optional) */}
          <div>
            <label
              htmlFor="family-desc-input"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
            >
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="family-desc-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of modules and capabilities grouped under this family..."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white text-slate-900 resize-none"
            />
          </div>

          {/* Icon Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Family Icon
            </label>
            <div
              className="grid grid-cols-5 gap-2"
              role="radiogroup"
              aria-label="Select family icon"
            >
              {AVAILABLE_ICONS.map((item) => {
                const Icon = item.icon
                const isSelected = selectedIcon === item.name
                return (
                  <button
                    key={item.name}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedIcon(item.name)}
                    className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/80 text-orange-900 ring-2 ring-orange-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                    }`}
                    title={item.label}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            Create Family
          </button>
        </div>
      </form>
    </div>
  )
}

export function AddFamilyModal({
  isOpen,
  onClose,
  onAddFamily,
  existingFamilies = [],
}) {
  // Escape key handler
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Form */}
      <AddFamilyForm
        onClose={onClose}
        onAddFamily={onAddFamily}
        existingFamilies={existingFamilies}
      />
    </div>
  )
}

export default AddFamilyModal
