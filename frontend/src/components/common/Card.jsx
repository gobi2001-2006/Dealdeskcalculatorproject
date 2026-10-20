export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = '',
  headerClassName = '',
}) {
  const hasHeader = Boolean(title || subtitle || action)

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-xs ${className}`}>
      {hasHeader && (
        <div
          className={`px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${headerClassName}`}
        >
          <div>
            {title && (
              <h2 className="text-base font-semibold text-slate-900 leading-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </div>
  )
}

export default Card
