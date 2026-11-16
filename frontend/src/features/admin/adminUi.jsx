/** Shared presentational pieces for the Admin tabs. */

export function Notice({ kind = 'success', children }) {
  if (!children) return null
  const tone =
    kind === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : kind === 'info'
        ? 'border-slate-200 bg-slate-50 text-slate-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return (
    <div className={`rounded-lg border px-3 py-2 text-[13px] ${tone}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function SectionHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-slate-500 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
