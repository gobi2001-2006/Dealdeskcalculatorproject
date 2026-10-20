import { FileText } from 'lucide-react'

export function NotesAndScopeCard({ notes = '', onChangeNotes }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs mb-6">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
        <FileText className="w-4 h-4 text-slate-500" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
          Notes & Scope
        </h3>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">
        Document commercial assumptions, packaging boundaries, legal constraints, or delivery scope.
      </p>
      <textarea
        rows={3}
        value={notes}
        onChange={(e) => onChangeNotes(e.target.value)}
        placeholder="Scope inclusions / exclusions, assumptions..."
        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white text-slate-800 placeholder:text-slate-400 resize-y"
        aria-label="Notes and Scope"
      />
    </div>
  )
}

export default NotesAndScopeCard
