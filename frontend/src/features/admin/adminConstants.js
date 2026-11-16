/** Presentation constants for the Admin tabs (icons and class names only; business data comes from the API). */

// Icon and colour per role code (presentation only; role names and descriptions come from /api/admin/meta).
export const ROLE_STYLES = {
  sales_lead: { icon: '💼', tone: 'bg-amber-600' },
  presales: { icon: '🧩', tone: 'bg-emerald-700' },
  business_head: { icon: '🏛', tone: 'bg-violet-600' },
  legal: { icon: '⚖', tone: 'bg-sky-700' },
  cfo: { icon: '📊', tone: 'bg-green-700' },
  ccxo: { icon: '⭐', tone: 'bg-orange-600' },
  admin: { icon: '🛠', tone: 'bg-slate-600' },
}

export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export const primaryBtn =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[14px] font-semibold bg-orange-700 hover:bg-orange-800 text-white disabled:opacity-50 disabled:cursor-not-allowed'
export const secondaryBtn =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[14px] font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed'
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 disabled:bg-slate-50'
export const cardCls = 'bg-white rounded-xl border border-slate-200 shadow-xs'
