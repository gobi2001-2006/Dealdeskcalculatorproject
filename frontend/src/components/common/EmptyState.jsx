export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-300 bg-white/70 ${className}`}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-3 border border-slate-200">
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-[16px] font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 text-[13px] text-slate-500 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
