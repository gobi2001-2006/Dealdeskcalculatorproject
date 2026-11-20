import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, KeyRound, GitBranch, Mail } from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { adminApi, adminErrorMessage } from '../../api/adminApi'
import { UsersTab } from './UsersTab'
import { RolesPermissionsTab } from './RolesPermissionsTab'
import { ApprovalWorkflowTab } from './ApprovalWorkflowTab'
import { EmailNotificationsTab } from './EmailNotificationsTab'

const TABS = [
  { key: 'users', label: 'Users', icon: Users, permission: 'admin.users' },
  { key: 'roles', label: 'Roles & Permissions', icon: KeyRound, permission: 'admin.roles' },
  { key: 'workflow', label: 'Approval Workflow', icon: GitBranch, permission: 'admin.workflow' },
  { key: 'notifications', label: 'Email Notifications', icon: Mail, permission: 'admin.notifications' },
]

/**
 * Admin module (Phase 2): Users, Roles & Permissions, Approval Workflow, Email Notifications.
 * The tab is kept in the URL (?tab=...). Access is enforced by the backend; the page only hides
 * tabs the acting user cannot use.
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const active = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'users'
  const [me, setMe] = useState(null)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([adminApi.me(), adminApi.meta()])
      .then(([m, mt]) => {
        if (!alive) return
        setMe(m)
        setMeta(mt)
      })
      .catch((e) => alive && setError(adminErrorMessage(e, 'Could not load the Admin module.')))
    return () => {
      alive = false
    }
  }, [])

  const can = (perm) => Boolean(me?.bootstrap_mode || me?.permissions?.includes(perm))
  const visible = TABS.filter((t) => !me || can(t.permission))
  const current = visible.find((t) => t.key === active) || visible[0]

  return (
    <div className="h-screen overflow-hidden bg-slate-100 flex flex-col text-slate-800 font-sans">
      <CatalogueTopNav activeSection="admin" />

      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2 flex shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden" role="tablist" aria-label="Admin sections">
        {visible.map((tab) => {
          const Icon = tab.icon
          const isActive = current?.key === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setParams({ tab: tab.key })}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors border ${
                isActive
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
                  : 'text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto" data-testid="admin-scroll">
      <main className="w-full max-w-[1600px] mx-auto p-4 sm:p-6">
        {me?.bootstrap_mode && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900" role="status">
            <strong>Set-up mode:</strong> no active user has the Admin role yet, so these screens are open. Assign the
            Admin role to a user on the Users tab; from then on only users with the matching permission can change
            these settings.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800" role="alert">
            {error}
          </div>
        )}
        {!me && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {me && visible.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            Your role has no administration permissions. Ask an Admin to grant them on Roles & Permissions.
          </div>
        )}
        {me && meta && current?.key === 'users' && <UsersTab meta={meta} me={me} />}
        {me && meta && current?.key === 'roles' && <RolesPermissionsTab />}
        {me && meta && current?.key === 'workflow' && <ApprovalWorkflowTab meta={meta} />}
        {me && meta && current?.key === 'notifications' && <EmailNotificationsTab meta={meta} />}
      </main>
      </div>
    </div>
  )
}

export default AdminPage
