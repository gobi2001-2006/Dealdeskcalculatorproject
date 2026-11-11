export function ProductTypeBadge({ type }) {
  const configs = {
    'Adrenalin Native': {
      dotBg: 'bg-blue-600',
      pillBg: 'bg-blue-50 text-blue-700 border-blue-200',
      label: 'Adrenalin Native',
    },
    'AI Agent Module': {
      dotBg: 'bg-purple-600',
      pillBg: 'bg-purple-50 text-purple-700 border-purple-200',
      label: 'AI Agent Module',
    },
    'Partner Integrated': {
      dotBg: 'bg-orange-600',
      pillBg: 'bg-orange-50 text-orange-700 border-orange-200',
      label: 'Partner Integrated',
    },
  }

  const config = configs[type] || {
    dotBg: 'bg-slate-500',
    pillBg: 'bg-slate-100 text-slate-700 border-slate-200',
    label: type || 'Standard',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-medium border text-[11px] ${config.pillBg}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotBg}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </span>
  )
}

export default ProductTypeBadge
