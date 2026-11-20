import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

/**
 * Shared DecisionPanel used on both ApprovalsPage and ProposalReviewSubmitPage.
 * Displays the current stage label, comment input (required for rejection), and Approve/Reject buttons.
 */
export function DecisionPanel({ action, onDecide, busy }) {
  const [comment, setComment] = useState('')
  const [localError, setLocalError] = useState('')

  const submit = (decision) => {
    if (decision === 'rejected' && !comment.trim()) {
      setLocalError('A comment is required when returning a proposal.')
      return
    }
    setLocalError('')
    onDecide(decision, comment.trim())
  }

  return (
    <section className="bg-white rounded-xl border-2 border-amber-300 shadow-xs p-5" aria-label="Your decision">
      <h2 className="text-[15px] font-semibold text-slate-900">Your decision · {action.stage_label}</h2>
      <label htmlFor="decision-comment" className="mt-3 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
        Comment (required to reject)
      </label>
      <textarea
        id="decision-comment"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Enter your approval notes or rejection rationale..."
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
      />
      {localError && <p className="mt-1 text-[13px] text-rose-700" role="alert">{localError}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => submit('approved')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[14px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit('rejected')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-4 py-2 text-[14px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <XCircle className="w-4 h-4" aria-hidden="true" /> Reject
        </button>
      </div>
    </section>
  )
}
