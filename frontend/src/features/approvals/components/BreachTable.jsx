import { AlertTriangle } from 'lucide-react'

export function BreachTable({ title, ceiling, rows = [], approved }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-slate-900">
        {title} ({ceiling === null || ceiling === undefined ? 'ceiling not configured' : `ceiling ${ceiling}%`})
        {rows.length > 0 && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              approved
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {approved ? 'Approved' : 'Needs approval'}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-500">
          {ceiling === null || ceiling === undefined ? 'Not configured' : 'Within policy'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Where</th>
                <th className="px-3 py-2 text-right font-semibold">Discount</th>
                <th className="px-3 py-2 text-right font-semibold">Ceiling</th>
                <th className="px-3 py-2 text-right font-semibold">Over by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-800">{r.where}</td>
                  <td className="px-3 py-2 text-right font-mono text-rose-700">{r.pct}%</td>
                  <td className="px-3 py-2 text-right font-mono">{ceiling}%</td>
                  <td className="px-3 py-2 text-right font-mono">+{(r.pct - ceiling).toFixed(1)} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
