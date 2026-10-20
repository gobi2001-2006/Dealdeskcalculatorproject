export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
  badge,
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200">
      <div>
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1">
            <ol className="flex items-center gap-1.5 text-xs text-slate-500">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <li key={crumb.label || idx} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="text-slate-400">/</span>}
                    {crumb.to && !isLast ? (
                      <a
                        href={crumb.to}
                        className="hover:text-slate-800 transition-colors"
                      >
                        {crumb.label}
                      </a>
                    ) : (
                      <span className={isLast ? 'text-slate-800 font-medium' : ''}>
                        {crumb.label}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">{description}</p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  )
}

export default PageHeader
