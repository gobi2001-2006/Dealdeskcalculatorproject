import React, { useEffect } from 'react'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

export function DeleteRateCardConfirmDialog({
  isOpen,
  title = 'Delete Record',
  recordName = '',
  recordType = 'record',
  isDeleting = false,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isDeleting, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!isDeleting) onClose()
        }}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="relative z-10 bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="p-5">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="delete-dialog-title"
                className="text-sm font-bold text-slate-900"
              >
                {title}
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete {recordName ? (
                  <>the {recordType} <span className="font-semibold text-slate-900 font-mono">"{recordName}"</span>?</>
                ) : (
                  <>this {recordType}?</>
                )} This action cannot be undone.
              </p>
            </div>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Close delete dialog"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteRateCardConfirmDialog
