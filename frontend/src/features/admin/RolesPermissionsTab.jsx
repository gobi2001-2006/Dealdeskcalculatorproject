import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { adminApi, adminErrorMessage } from '../../api/adminApi'
import { Notice, SectionHeader } from './adminUi'
import { ROLE_STYLES, cardCls, primaryBtn, secondaryBtn } from './adminConstants'

function toSets(grants) {
  const out = {}
  for (const [role, perms] of Object.entries(grants || {})) out[role] = new Set(perms)
  return out
}

/** Admin → Roles & Permissions: permissions as rows, roles as columns; saved and enforced by the backend. */
export function RolesPermissionsTab() {
  const [matrix, setMatrix] = useState(null)
  const [grants, setGrants] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ kind: 'success', text: '' })

  useEffect(() => {
    adminApi
      .getMatrix()
      .then((m) => {
        setMatrix(m)
        setGrants(toSets(m.grants))
      })
      .catch((e) => setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not load permissions.') }))
  }, [])

  const dirty = useMemo(() => {
    if (!matrix) return false
    return matrix.roles.some((r) => {
      const a = new Set(matrix.grants[r.code] || [])
      const b = grants[r.code] || new Set()
      return a.size !== b.size || [...a].some((p) => !b.has(p))
    })
  }, [matrix, grants])

  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const categories = useMemo(() => {
    const groups = []
    for (const p of matrix?.permissions || []) {
      let g = groups.find((x) => x.name === p.category)
      if (!g) groups.push((g = { name: p.category, items: [] }))
      g.items.push(p)
    }
    return groups
  }, [matrix])

  const locked = new Set(matrix?.locked?.admin || [])

  function toggle(role, perm) {
    setGrants((g) => {
      const next = new Set(g[role] || [])
      if (next.has(perm)) next.delete(perm)
      else next.add(perm)
      return { ...g, [role]: next }
    })
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const payload = {}
      for (const r of matrix.roles) payload[r.code] = [...(grants[r.code] || [])]
      const m = await adminApi.saveMatrix(payload)
      setMatrix(m)
      setGrants(toSets(m.grants))
      setMessage({ kind: 'success', text: 'Permissions saved. They apply immediately to every user with that role.' })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not save permissions.') })
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (saving || !window.confirm('Reset every role to the approved initial permissions (v3.1 setup)? Your changes to the matrix will be replaced.')) return
    setSaving(true)
    try {
      const m = await adminApi.resetMatrix()
      setMatrix(m)
      setGrants(toSets(m.grants))
      setMessage({ kind: 'success', text: 'Permissions reset to the approved initial setup.' })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not reset permissions.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label="Roles and permissions">
      <SectionHeader
        title="Roles & Permissions"
        description="Tick what each role can do. Changes apply immediately to every user with that role and are enforced by the server. Edit rights also respect workflow locks: once submitted, only the approver on the current step can change the proposal."
        actions={
          <>
            <button type="button" className={secondaryBtn} onClick={reset} disabled={saving || !matrix}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> Reset to defaults
            </button>
            <button type="button" className={primaryBtn} onClick={save} disabled={saving || !dirty}>
              <Save className="w-4 h-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      />
      <div className="mb-3 space-y-2">
        <Notice kind={message.kind}>{message.text}</Notice>
        {dirty && <Notice kind="info">You have unsaved changes.</Notice>}
        {matrix &&
          !Object.entries(grants).some(([code, g]) => [...(g || [])].some((p) => !(matrix.locked?.[code] || []).includes(p))) && (
          <Notice kind="info">
            No permissions are granted yet, apart from the Admin&apos;s locked ones (users, roles &amp; permissions). Tick
            what each role can do and save, or use Reset to defaults to apply the approved initial setup.
          </Notice>
        )}
      </div>
      {!matrix && !message.text && <p className="text-sm text-slate-500">Loading…</p>}
      {matrix && (
        <div className={`${cardCls} overflow-x-auto`}>
          <table className="w-full text-[14px]" aria-label="Permission matrix">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Permission</th>
                {matrix.roles.map((r) => (
                  <th key={r.code} className="px-3 py-3 text-center text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    <div aria-hidden="true">{ROLE_STYLES[r.code]?.icon}</div>
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => [
                <tr key={`h-${cat.name}`} className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={matrix.roles.length + 1} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    {cat.name}
                  </td>
                </tr>,
                ...cat.items.map((p) => (
                  <tr key={p.code} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">
                      <div className="text-slate-900">{p.label}</div>
                      <div className="text-[12px] text-slate-500">{p.description}</div>
                    </td>
                    {matrix.roles.map((r) => {
                      const isLocked = r.code === 'admin' && locked.has(p.code)
                      return (
                        <td key={r.code} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="w-5 h-5 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                            aria-label={`${r.label}: ${p.label}`}
                            checked={grants[r.code]?.has(p.code) || false}
                            disabled={saving || isLocked}
                            title={isLocked ? 'Always granted to Admin (prevents lock-out)' : undefined}
                            onChange={() => toggle(r.code, p.code)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default RolesPermissionsTab
