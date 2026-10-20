import { Button } from '../../components/common/Button'
import { Package, FileQuestion } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-4">
        <FileQuestion className="w-8 h-8 text-slate-600" aria-hidden="true" />
      </div>

      <span className="text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full mb-2">
        404 ERROR
      </span>

      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        Page Not Found
      </h1>

      <p className="mt-2 text-sm text-slate-500 max-w-md">
        The commercial desk view or proposal route you requested does not exist or may have been relocated.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Button
          to="/catalogue"
          variant="primary"
          size="md"
          icon={Package}
          aria-label="Return to Product Catalogue"
        >
          Return to Product Catalogue
        </Button>
      </div>
    </div>
  )
}

export default NotFoundPage
