import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { adminApi, adminErrorMessage } from '../../api/adminApi'
import { Notice, SectionHeader } from './adminUi'
import { ROLE_STYLES, cardCls, initials, inputCls, primaryBtn, secondaryBtn } from './adminConstants'

const EMPTY_NEW = { full_name: '', email: '', role: '', region: '' }

function formatSignIn(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

/** Admin → Users: list, search, add, inline edit (name, email, role, region, active), delete. */
export function UsersTab({ meta, me }) {
  const [users, setUsers] = useState(null)
  const [regions, setRegions] = useState([])
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newUser, setNewUser] = useState(EMPTY_NEW)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ kind: 'success', text: '' })

  const load = useCallback(async (term) => {
    try {
      const [list, regs] = await Promise.all([adminApi.listUsers(term), adminApi.listRegions()])
      setUsers(list)
      setRegions(regs.filter((r) => r.status === 'active'))
      setDrafts({})
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not load users.') })
      setUsers([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search, load])

  const counts = useMemo(() => {
    const c = {}
    for (const u of users || []) if (u.is_active && u.role) c[u.role] = (c[u.role] || 0) + 1
    return c
  }, [users])

  const regionOptions = [...regions.map((r) => r.name), meta.global_region]

  async function save(user, patch) {
    if (savingId) return
    setSavingId(user.id)
    setMessage({ kind: 'success', text: '' })
    try {
      const updated = await adminApi.updateUser(user.id, patch)
      setUsers((list) => list.map((u) => (u.id === user.id ? updated : u)))
      setDrafts((d) => {
        const next = { ...d }
        delete next[user.id]
        return next
      })
      setMessage({ kind: 'success', text: `${updated.full_name} saved.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not save the user.') })
      setDrafts((d) => {
        const next = { ...d }
        delete next[user.id]
        return next
      })
    } finally {
      setSavingId(null)
    }
  }

  function commitText(user, field) {
    const value = drafts[user.id]?.[field]
    if (value === undefined || value.trim() === (user[field] || '')) return
    if (!value.trim()) {
      setMessage({ kind: 'error', text: field === 'email' ? 'Email is required.' : 'User name is required.' })
      setDrafts((d) => ({ ...d, [user.id]: { ...d[user.id], [field]: undefined } }))
      return
    }
    save(user, { [field]: value.trim() })
  }

  async function remove(user) {
    if (me?.user?.id === user.id) {
      setMessage({ kind: 'error', text: 'You cannot delete your own user.' })
      return
    }
    if (!window.confirm(`Delete ${user.full_name}? Users who own proposals or approvals cannot be deleted — deactivate them instead.`)) return
    setSavingId(user.id)
    try {
      await adminApi.deleteUser(user.id)
      setUsers((list) => list.filter((u) => u.id !== user.id))
      setMessage({ kind: 'success', text: `${user.full_name} deleted.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not delete the user.') })
    } finally {
      setSavingId(null)
    }
  }

  async function addUser(e) {
    e.preventDefault()
    if (busy) return
    if (!newUser.full_name.trim() || !newUser.email.trim() || !newUser.role) {
      setMessage({ kind: 'error', text: 'Name, email and role are required.' })
      return
    }
    setBusy(true)
    try {
      const created = await adminApi.createUser({ ...newUser, region: newUser.region || null })
      setUsers((list) => [...(list || []), created].sort((a, b) => a.full_name.localeCompare(b.full_name)))
      setNewUser(EMPTY_NEW)
      setAdding(false)
      setMessage({ kind: 'success', text: `${created.full_name} added.` })
    } catch (err) {
      setMessage({ kind: 'error', text: adminErrorMessage(err, 'Could not add the user.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Users">
      <SectionHeader
        title="Users"
        description="Assign each user a role and region. Business Heads are matched to proposals by Region (ADR) for commercial and Level-1 approvals; Global users receive every proposal."
        actions={
          <>
            <input
              type="search"
              className={`${inputCls} w-64`}
              placeholder="Search users…"
              aria-label="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className={primaryBtn} onClick={() => setAdding((v) => !v)}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Add user
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        {meta.roles.map((r) => (
          <div key={r.code} className={`${cardCls} p-4`} data-testid={`role-card-${r.code}`}>
            <div className="flex items-start gap-3">
              <span className={`w-9 h-9 shrink-0 rounded-lg ${ROLE_STYLES[r.code]?.tone || 'bg-slate-500'} text-white flex items-center justify-center`} aria-hidden="true">
                {ROLE_STYLES[r.code]?.icon}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{r.label}</div>
                <span className="inline-block mt-1 px-2 rounded-full bg-slate-100 text-[12px] text-slate-600">{counts[r.code] || 0}</span>
                <p className="mt-1 text-[12px] text-slate-500 leading-snug">{r.description || 'No description'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3 space-y-2">
        <Notice kind={message.kind}>{message.text}</Notice>
      </div>

      {adding && (
        <form onSubmit={addUser} className={`${cardCls} p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end`} aria-label="Add user">
          <label className="text-[12px] font-medium text-slate-600">
            User name
            <input className={inputCls} value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
          </label>
          <label className="text-[12px] font-medium text-slate-600">
            Email
            <input type="email" className={inputCls} value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
          </label>
          <label className="text-[12px] font-medium text-slate-600">
            Role
            <select className={inputCls} value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="">Select role…</option>
              {meta.roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </label>
          <label className="text-[12px] font-medium text-slate-600">
            Region (ADR)
            <select className={inputCls} value={newUser.region} onChange={(e) => setNewUser({ ...newUser, region: e.target.value })}>
              <option value="">Not set</option>
              {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={primaryBtn} disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
            <button type="button" className={secondaryBtn} onClick={() => { setAdding(false); setNewUser(EMPTY_NEW) }}>Cancel</button>
          </div>
        </form>
      )}

      <div className={`${cardCls} overflow-x-auto`}>
        <table className="w-full text-[14px]" aria-label="Users table">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left font-semibold px-4 py-3">User</th>
              <th className="text-left font-semibold px-4 py-3">Email</th>
              <th className="text-left font-semibold px-4 py-3">Role</th>
              <th className="text-left font-semibold px-4 py-3">Region (ADR)</th>
              <th className="text-left font-semibold px-4 py-3">Active</th>
              <th className="text-left font-semibold px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3"><span className="sr-only">Delete</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users === null && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Loading users…</td></tr>
            )}
            {users?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">{search ? 'No users match your search.' : 'No users yet. Add the first user.'}</td></tr>
            )}
            {users?.map((u) => {
              const draft = drafts[u.id] || {}
              const disabled = savingId === u.id
              const regionValue = u.region || ''
              const regionList = regionValue && !regionOptions.includes(regionValue) ? [regionValue, ...regionOptions] : regionOptions
              return (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-60'} data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-8 h-8 shrink-0 rounded-md ${ROLE_STYLES[u.role]?.tone || 'bg-slate-400'} text-white text-[11px] font-bold flex items-center justify-center`} aria-hidden="true">
                        {initials(u.full_name)}
                      </span>
                      <input
                        className={inputCls}
                        aria-label={`Name of ${u.full_name}`}
                        value={draft.full_name ?? u.full_name}
                        disabled={disabled}
                        onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: { ...d[u.id], full_name: e.target.value } }))}
                        onBlur={() => commitText(u, 'full_name')}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="email"
                      className={inputCls}
                      aria-label={`Email of ${u.full_name}`}
                      value={draft.email ?? u.email}
                      disabled={disabled}
                      onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: { ...d[u.id], email: e.target.value } }))}
                      onBlur={() => commitText(u, 'email')}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className={inputCls}
                      aria-label={`Role of ${u.full_name}`}
                      value={u.role || ''}
                      disabled={disabled}
                      onChange={(e) => e.target.value && save(u, { role: e.target.value })}
                    >
                      {!u.role && <option value="">No role</option>}
                      {meta.roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className={inputCls}
                      aria-label={`Region of ${u.full_name}`}
                      value={regionValue}
                      disabled={disabled}
                      onChange={(e) => save(u, { region: e.target.value || null })}
                    >
                      <option value="">Not set</option>
                      {regionList.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={u.is_active}
                      aria-label={`Active: ${u.full_name}`}
                      disabled={disabled}
                      onClick={() => save(u, { is_active: !u.is_active })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${u.is_active ? 'bg-emerald-700' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${u.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatSignIn(u.last_login_at)}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" aria-label={`Delete ${u.full_name}`} disabled={disabled} onClick={() => remove(u)} className="p-1.5 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50">
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-slate-500">
        Last sign-in is recorded by the login service; this application has no sign-in yet, so it shows “—”.
      </p>
    </section>
  )
}

export default UsersTab
