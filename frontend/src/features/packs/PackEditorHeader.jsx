import { Copy, Trash2, GitBranch, CheckCircle2 } from 'lucide-react'
import { PRESET_COLORS } from '../../data/packsData'

export function PackEditorHeader({
  pack,
  isNewPack = false,
  formValues = {},
  onChangeField,
  families = [],
  selectedCount = 0,
  validationErrors = {},
  onCancel,
  onDuplicate,
  onDelete,
  onCreateVersion,
  onActivateVersion,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs mb-4">
      {/* Top row: Heading and Selected Count Badge */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-3">
          <span
            className="w-4 h-4 rounded-full shrink-0 shadow-2xs border border-white"
            style={{ backgroundColor: formValues.color || '#F26522' }}
            aria-hidden="true"
          />
          <div>
            <h1 className="text-[26px] sm:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
              {isNewPack ? 'New Pack' : `Edit Pack: ${formValues.name || 'Untitled Pack'}`}
            </h1>
          </div>
        </div>

        {/* Selected-product count badge, Version, Actions, and Cancel */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {!isNewPack && (
            <>
              {/* Version Badge */}
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
                <GitBranch className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>v{pack?.versionNo || 1} ({pack?.versionStatus || 'active'})</span>
              </span>

              {/* Activate Version button if in draft */}
              {pack?.versionStatus === 'draft' && onActivateVersion && (
                <button
                  type="button"
                  onClick={onActivateVersion}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                  title="Activate this version"
                  aria-label="Activate Version"
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Activate</span>
                </button>
              )}

              {/* New Version button */}
              {onCreateVersion && (
                <button
                  type="button"
                  onClick={onCreateVersion}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  title="Create new version snapshot"
                  aria-label="New Version"
                >
                  <GitBranch className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span>New Version</span>
                </button>
              )}

              {/* Duplicate button */}
              {onDuplicate && (
                <button
                  type="button"
                  onClick={onDuplicate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  title="Duplicate this pack into a new template"
                  aria-label="Duplicate Pack"
                >
                  <Copy className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span>Duplicate</span>
                </button>
              )}

              {/* Delete button */}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors cursor-pointer"
                  title="Delete this pack"
                  aria-label="Delete Pack"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              )}
            </>
          )}

          <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-200/80 font-mono">
            {selectedCount} Selected
          </span>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Editor Fields Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 pt-4">
        {/* 1. Pack Name (Required) */}
        <div className="lg:col-span-4">
          <label
            htmlFor="pack-name-input"
            className="block text-[13px] font-semibold text-slate-700 mb-1.5"
          >
            Pack Name <span className="text-red-500">*</span>
          </label>
          <input
            id="pack-name-input"
            type="text"
            value={formValues.name || ''}
            onChange={(e) => onChangeField('name', e.target.value)}
            placeholder="e.g. Talent Acquisition Growth Suite"
            className={`w-full px-3.5 py-2 text-[14px] bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:bg-white text-slate-900 ${
              validationErrors.name
                ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                : 'border-slate-300 focus:ring-orange-500'
            }`}
            aria-invalid={Boolean(validationErrors.name)}
            aria-describedby={validationErrors.name ? 'pack-name-error' : undefined}
          />
          {validationErrors.name && (
            <span id="pack-name-error" className="text-[11px] text-red-600 font-medium block mt-1">
              {validationErrors.name}
            </span>
          )}
        </div>

        {/* 2. Short Description */}
        <div className="lg:col-span-5">
          <label
            htmlFor="pack-desc-input"
            className="block text-[13px] font-semibold text-slate-700 mb-1.5"
          >
            Short Description
          </label>
          <input
            id="pack-desc-input"
            type="text"
            value={formValues.description || ''}
            onChange={(e) => onChangeField('description', e.target.value)}
            placeholder="Brief commercial positioning summary..."
            className="w-full px-3.5 py-2 text-[14px] bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-slate-900"
          />
        </div>

        {/* 3. PACK CODE / SKU */}
        <div className="lg:col-span-3">
          <label
            htmlFor="pack-code-input"
            className="block text-[13px] font-semibold text-slate-700 mb-1.5"
          >
            Pack Code / SKU
          </label>
          <input
            id="pack-code-input"
            type="text"
            value={formValues.code || ''}
            onChange={(e) => onChangeField('code', e.target.value.toUpperCase())}
            placeholder="e.g. TA-GROWTH-01"
            className="w-full px-3.5 py-2 text-[14px] font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-slate-900 uppercase"
          />
        </div>

        {/* 4. L1 PRODUCT FAMILY */}
        <div className="lg:col-span-6">
          <label
            htmlFor="pack-family-select"
            className="block text-[13px] font-semibold text-slate-700 mb-1.5"
          >
            L1 Product Family
          </label>
          <select
            id="pack-family-select"
            value={formValues.familyId || ''}
            onChange={(e) => onChangeField('familyId', e.target.value)}
            className="w-full px-3.5 py-2 text-[14px] bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-slate-900"
          >
            <option value="">Cross-Family / General Commercial Pack</option>
            {families.map((fam) => (
              <option key={fam.id} value={fam.id}>
                {fam.name}
              </option>
            ))}
          </select>
        </div>

        {/* 5. COLOUR Picker & Swatches */}
        <div className="lg:col-span-6">
          <label
            htmlFor="pack-color-input"
            className="block text-[13px] font-semibold text-slate-700 mb-1.5"
          >
            Pack Colour
          </label>
          <div className="flex items-center gap-3">
            {/* Hex input & live color swatch */}
            <div className="relative flex items-center">
              <input
                id="pack-color-input"
                type="color"
                value={formValues.color || '#F26522'}
                onChange={(e) => onChangeField('color', e.target.value)}
                className="w-8 h-8 rounded border border-slate-300 p-0.5 cursor-pointer bg-white"
                title="Choose custom pack color"
                aria-label="Choose custom pack color"
              />
              <span className="ml-2 font-mono text-[12px] text-slate-600 uppercase">
                {formValues.color || '#F26522'}
              </span>
            </div>

            {/* Quick preset swatches */}
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              {PRESET_COLORS.map((preset) => {
                const isCurrent = (formValues.color || '').toLowerCase() === preset.hex.toLowerCase()
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => onChangeField('color', preset.hex)}
                    className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                      isCurrent
                        ? 'ring-2 ring-offset-1 ring-slate-800 scale-110'
                        : 'hover:scale-110 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                    title={preset.name}
                    aria-label={`Select color ${preset.name}`}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PackEditorHeader
