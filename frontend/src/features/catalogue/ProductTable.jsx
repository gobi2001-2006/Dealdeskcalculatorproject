import { useState, Fragment } from 'react'
import {
  Trash2,
  Edit2,
  Check,
  X,
  PackageSearch,
} from 'lucide-react'
import { ProductTypeBadge } from './ProductTypeBadge'
import { PRODUCT_TYPES } from '../../data/catalogueData'

function generateSuggestedCode(familyId, families) {
  const fam = families.find((f) => f.id === familyId)
  const prefix = fam?.code || 'SKU'
  const randomNum = Math.floor(100 + Math.random() * 900)
  return `${prefix}-${randomNum}`
}

function AddRowTableRow({
  families,
  initialFamilyId,
  onSave,
  onClose,
}) {
  const [familyId, setFamilyId] = useState(initialFamilyId)
  const [solution, setSolution] = useState('')
  const [subItem, setSubItem] = useState('')
  const [code, setCode] = useState(() => generateSuggestedCode(initialFamilyId, families))
  const [type, setType] = useState('Adrenalin Native')
  const [error, setError] = useState('')

  const handleFamilyChange = (e) => {
    const nextFamId = e.target.value
    setFamilyId(nextFamId)
    setCode(generateSuggestedCode(nextFamId, families))
    setError('')
  }

  const handleSave = (e) => {
    e?.preventDefault()
    const trimmedSolution = solution.trim()
    const trimmedCode = code.trim().toUpperCase()

    if (!trimmedSolution) {
      setError('Solution / Module is required.')
      return
    }

    if (!trimmedCode) {
      setError('Product Code is required.')
      return
    }

    const fam = families.find((f) => f.id === familyId)

    onSave({
      id: `prod-${Date.now()}`,
      familyId,
      familyName: fam?.name || 'Unassigned',
      solution: trimmedSolution,
      subItem: subItem.trim() || '—',
      code: trimmedCode,
      type,
    })

    onClose()
  }

  return (
    <tr className="bg-amber-50/70 border-b-2 border-orange-400 animate-in fade-in duration-100">
      <td className="py-2.5 px-3.5">
        <select
          value={familyId}
          onChange={handleFamilyChange}
          className="w-full text-[13px] bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-orange-500 text-slate-800"
          aria-label="New product family"
        >
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2.5 px-3.5">
        <input
          type="text"
          value={solution}
          onChange={(e) => {
            setSolution(e.target.value)
            if (error) setError('')
          }}
          placeholder="Solution name..."
          className="w-full text-[13px] bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-orange-500 text-slate-800"
          aria-label="New solution name"
        />
        {error && (
          <span className="text-[11px] text-red-600 block mt-0.5">
            {error}
          </span>
        )}
      </td>
      <td className="py-2.5 px-3.5">
        <input
          type="text"
          value={subItem}
          onChange={(e) => setSubItem(e.target.value)}
          placeholder="Sub-item / Partner..."
          className="w-full text-[13px] bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-orange-500 text-slate-800"
          aria-label="New partner or sub-item"
        />
      </td>
      <td className="py-2.5 px-3.5">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CODE-001"
          className="w-full text-[13px] font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-orange-500 text-slate-800 uppercase"
          aria-label="New product code"
        />
      </td>
      <td className="py-2.5 px-3.5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full text-[13px] bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-orange-500 text-slate-800"
          aria-label="New product type"
        >
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={handleSave}
            className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
            title="Save new product"
            aria-label="Save product row"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
            title="Cancel adding row"
            aria-label="Cancel adding row"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export function ProductTable({
  products = [],
  families = [],
  selectedFamilyId = 'all',
  isAddRowOpen = false,
  onCloseAddRow,
  onSaveNewProduct,
  onUpdateProduct,
  onDeleteProductClick,
  searchTerm = '',
  onClearSearch,
  totalProductsCount = 0,
}) {
  const initialAddFamilyId =
    selectedFamilyId !== 'all' ? selectedFamilyId : families[0]?.id || ''

  // Inline Edit Row state (row id being edited)
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [editError, setEditError] = useState('')

  const handleStartEdit = (product) => {
    setEditingId(product.id)
    setEditValues({
      solution: product.solution,
      subItem: product.subItem === '—' ? '' : product.subItem,
      code: product.code,
      type: product.type,
      familyId: product.familyId,
    })
    setEditError('')
  }

  const handleSaveEdit = (productId) => {
    const trimmedSolution = editValues.solution?.trim()
    const trimmedCode = editValues.code?.trim().toUpperCase()

    if (!trimmedSolution) {
      setEditError('Solution / Module is required.')
      return
    }
    if (!trimmedCode) {
      setEditError('Product Code is required.')
      return
    }

    const fam = families.find((f) => f.id === editValues.familyId)

    onUpdateProduct(productId, {
      solution: trimmedSolution,
      subItem: editValues.subItem?.trim() || '—',
      code: trimmedCode,
      type: editValues.type,
      familyId: editValues.familyId,
      familyName: fam?.name || 'Unassigned',
    })

    setEditingId(null)
    setEditError('')
  }

  // Group products by family
  const groupedProducts = families.reduce((acc, family) => {
    const famProducts = products.filter((p) => p.familyId === family.id)
    if (selectedFamilyId === 'all') {
      if (famProducts.length > 0) {
        acc.push({ family, items: famProducts })
      }
    } else if (selectedFamilyId === family.id) {
      if (famProducts.length > 0) {
        acc.push({ family, items: famProducts })
      }
    }
    return acc
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
      {/* Scrollable Table Area */}
      <div className="flex-1 overflow-y-auto">
        <table
          className="w-full text-left border-collapse"
          aria-label="Commercial Product Catalogue Table"
        >
          <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
            <tr>
              <th scope="col" className="py-3 px-4 w-1/5">
                L1 Family
              </th>
              <th scope="col" className="py-3 px-4 w-1/4">
                L2 Solution / Module
              </th>
              <th scope="col" className="py-3 px-4 w-1/4">
                L3 Partner / Sub-item
              </th>
              <th scope="col" className="py-3 px-4 w-1/6 font-mono">
                Product Code
              </th>
              <th scope="col" className="py-3 px-4 w-1/6">
                Product Type
              </th>
              <th scope="col" className="py-3 px-4 w-16 text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-[13px] text-slate-800">
            {/* INLINE ADD ROW FORM */}
            {isAddRowOpen && (
              <AddRowTableRow
                families={families}
                initialFamilyId={initialAddFamilyId}
                onSave={onSaveNewProduct}
                onClose={onCloseAddRow}
              />
            )}

            {/* PRODUCT GROUPS */}
            {groupedProducts.length === 0 && !isAddRowOpen ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <PackageSearch className="w-10 h-10 text-slate-300 mb-2" aria-hidden="true" />
                    <span className="text-[14px] font-semibold text-slate-700">
                      {searchTerm
                        ? `No products match "${searchTerm}"`
                        : 'No products in this family yet'}
                    </span>
                    <p className="text-[12px] text-slate-400 mt-1 max-w-sm">
                      {searchTerm
                        ? 'Try clearing or modifying your search filter.'
                        : 'Use "Add Row" in the top bar to create a new product.'}
                    </p>
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={onClearSearch}
                        className="mt-3 px-3 py-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              groupedProducts.map(({ family, items }) => (
                <Fragment key={`group-${family.id}`}>
                  {/* Dark navy group-header row matching reference */}
                  <tr className="bg-[#0B1528] text-white">
                    <td
                      colSpan={6}
                      className="py-2 px-4 text-[12px] font-semibold tracking-wide"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
                          <span>{family.name}</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-300 bg-slate-800/80 px-2.5 py-0.5 rounded">
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Empty group message */}
                  {items.length === 0 && (
                    <tr className="bg-slate-50/50">
                      <td
                        colSpan={6}
                        className="py-4 px-4 text-[12px] text-slate-400 italic text-center"
                      >
                        No products in this family yet
                      </td>
                    </tr>
                  )}

                  {/* Products in this family */}
                  {items.map((prod) => {
                    const isEditing = editingId === prod.id

                    if (isEditing) {
                      return (
                        <tr
                          key={prod.id}
                          className="bg-amber-50/80 border-b border-orange-200"
                        >
                          <td className="py-2.5 px-3.5">
                            <span className="text-[13px] font-semibold text-slate-800">
                              {prod.familyName}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <input
                              type="text"
                              value={editValues.solution}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  solution: e.target.value,
                                })
                              }
                              className="w-full text-[13px] bg-white border border-slate-300 rounded px-2.5 py-1 focus:ring-1 focus:ring-orange-500"
                              aria-label="Edit solution name"
                            />
                            {editError && (
                              <span className="text-[10px] text-red-600 block mt-0.5">
                                {editError}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <input
                              type="text"
                              value={editValues.subItem}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  subItem: e.target.value,
                                })
                              }
                              className="w-full text-[13px] bg-white border border-slate-300 rounded px-2.5 py-1 focus:ring-1 focus:ring-orange-500"
                              aria-label="Edit partner or sub-item"
                            />
                          </td>
                          <td className="py-2.5 px-3.5">
                            <input
                              type="text"
                              value={editValues.code}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  code: e.target.value,
                                })
                              }
                              className="w-full text-[13px] font-mono bg-white border border-slate-300 rounded px-2.5 py-1 focus:ring-1 focus:ring-orange-500"
                              aria-label="Edit product code"
                            />
                          </td>
                          <td className="py-2.5 px-3.5">
                            <select
                              value={editValues.type}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  type: e.target.value,
                                })
                              }
                              className="w-full text-[13px] bg-white border border-slate-300 rounded px-2.5 py-1 focus:ring-1 focus:ring-orange-500"
                              aria-label="Edit product type"
                            >
                              {PRODUCT_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(prod.id)}
                                className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
                                title="Save changes"
                                aria-label={`Save changes for ${prod.code}`}
                              >
                                <Check className="w-4 h-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="p-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                                title="Cancel edit"
                                aria-label="Cancel editing"
                              >
                                <X className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr
                        key={prod.id}
                        className="bg-[#F9F9FB] hover:bg-slate-100/80 transition-colors group"
                      >
                        {/* L1 Family */}
                        <td className="py-2.5 px-4 text-slate-600 font-medium">
                          {prod.familyName}
                        </td>

                        {/* L2 Solution / Module */}
                        <td className="py-2.5 px-4 text-slate-900 font-semibold">
                          {prod.solution}
                        </td>

                        {/* L3 Partner / Sub-item */}
                        <td className="py-2.5 px-4 text-slate-600">
                          {prod.subItem}
                        </td>

                        {/* Product Code */}
                        <td className="py-2.5 px-4 font-mono text-slate-800 font-medium">
                          {prod.code}
                        </td>

                        {/* Product Type */}
                        <td className="py-2.5 px-4">
                          <ProductTypeBadge type={prod.type} />
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(prod)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                              title="Edit product"
                              aria-label={`Edit product ${prod.code}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteProductClick(prod)}
                              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete product"
                              aria-label={`Delete product ${prod.code}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Legend and Summary Row */}
      <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600 shrink-0 gap-2 select-none">
        {/* Product Type Legend */}
        <div
          className="flex items-center gap-4 text-[10px]"
          aria-label="Product Type Legend"
        >
          <span className="font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
            Legend:
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600" aria-hidden="true"></span>
            <span>Adrenalin Native</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-600" aria-hidden="true"></span>
            <span>AI Agent Module</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-600" aria-hidden="true"></span>
            <span>Partner Integrated</span>
          </span>
        </div>

        {/* Total Count */}
        <div className="font-mono text-[10px] text-slate-500">
          Showing {products.length} of {totalProductsCount} products
        </div>
      </div>
    </div>
  )
}

export default ProductTable
