import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import { adminApi, adminErrorMessage } from '../../api/adminApi'
import { Notice, SectionHeader } from './adminUi'
import { cardCls, inputCls, primaryBtn, secondaryBtn } from './adminConstants'

const CEILINGS = [
  { key: 'line_discount', label: 'Line-level discount ceiling', hint: 'any single pack / add-on line' },
  { key: 'overall_discount', label: 'Proposal-level discount ceiling', hint: 'overall subscription / services discount' },
  { key: 'gm_floor', label: 'Gross margin floor', hint: 'shown on Pricing screen' },
]

function formFrom(wf) {
  const ceilings = {}
  for (const c of CEILINGS) {
    const v = wf.ceilings[c.key]?.value_pct
    ceilings[c.key] = v === null || v === undefined ? '' : String(v)
  }
  return {
    ceilings,
    test_effective_discount: wf.test_effective_discount,
    sla: {
      sla_hours: wf.sla.sla_hours ?? '',
      reminder_hours: wf.sla.reminder_hours ?? '',
      escalate_hours: wf.sla.escalate_hours ?? '',
      escalation_role: wf.sla.escalation_role ?? '',
    },
    stages: Object.fromEntries(wf.stages.map((s) => [s.stage_code, s.approver_role])),
  }
}

function validate(form) {
  for (const c of CEILINGS) {
    const v = form.ceilings[c.key]
    if (v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 100) return `${c.label} must be between 0 and 100.`
  }
  const { sla_hours: s, reminder_hours: r, escalate_hours: e } = form.sla
  for (const [label, v] of [['Approval SLA', s], ['Send reminder after', r], ['Escalate after', e]]) {
    if (v !== '' && (!Number.isInteger(Number(v)) || Number(v) <= 0)) return `${label} must be a whole number of hours above 0.`
  }
  if (s !== '' && r !== '' && Number(r) > Number(s)) return 'Send reminder after must not be later than the approval SLA.'
  if (s !== '' && e !== '' && Number(e) < Number(s)) return 'Escalate after must not be earlier than the approval SLA.'
  return ''
}

/** Admin → Approval Workflow: ceilings, approval matrix, SLA & escalation, regional Business Heads. */
export function ApprovalWorkflowTab({ meta }) {
  const [wf, setWf] = useState(null)
  const [form, setForm] = useState(null)
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ kind: 'success', text: '' })
  const [regionDrafts, setRegionDrafts] = useState({})
  const [newRegion, setNewRegion] = useState({ name: '', sub_regions: '' })

  async function load() {
    try {
      const w = await adminApi.getWorkflow()
      setWf(w)
      setForm(formFrom(w))
      setRegionDrafts({})
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not load the approval workflow.') })
    }
  }

  useEffect(() => {
    let alive = true
    adminApi
      .getWorkflow()
      .then((w) => {
        if (!alive) return
        setWf(w)
        setForm(formFrom(w))
      })
      .catch((e) => alive && setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not load the approval workflow.') }))
    adminApi.listUsers().then((u) => alive && setUsers(u)).catch(() => alive && setUsers([]))
    return () => {
      alive = false
    }
  }, [])

  const dirty = useMemo(() => wf && form && JSON.stringify(formFrom(wf)) !== JSON.stringify(form), [wf, form])
  const businessHeads = users.filter((u) => u.is_active && u.roles.includes('business_head'))
  const roleLabel = Object.fromEntries(meta.roles.map((r) => [r.code, r.label]))

  async function saveWorkflow() {
    if (saving) return
    const err = validate(form)
    if (err) {
      setMessage({ kind: 'error', text: err })
      return
    }
    setSaving(true)
    try {
      const ceilings = {}
      for (const c of CEILINGS) if (form.ceilings[c.key] !== '') ceilings[c.key] = Number(form.ceilings[c.key])
      const num = (v) => (v === '' ? null : Number(v))
      const w = await adminApi.saveWorkflow({
        ceilings,
        test_effective_discount: form.test_effective_discount,
        sla: {
          sla_hours: num(form.sla.sla_hours),
          reminder_hours: num(form.sla.reminder_hours),
          escalate_hours: num(form.sla.escalate_hours),
          escalation_role: form.sla.escalation_role || null,
        },
        stages: Object.entries(form.stages).map(([stage_code, approver_role]) => ({ stage_code, approver_role })),
      })
      setWf(w)
      setForm(formFrom(w))
      setMessage({ kind: 'success', text: `Saved ${new Date().toLocaleTimeString()}. Applies to proposals submitted from now on.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not save the workflow.') })
    } finally {
      setSaving(false)
    }
  }

  async function saveRegion(region) {
    const d = { ...regionFields(region), ...(regionDrafts[region.id] || {}) }
    setSaving(true)
    try {
      await adminApi.updateRegion(region.id, d)
      await load()
      setMessage({ kind: 'success', text: `Region ${d.name} saved.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not save the region.') })
    } finally {
      setSaving(false)
    }
  }

  async function addRegion(e) {
    e.preventDefault()
    if (!newRegion.name.trim() || saving) return
    setSaving(true)
    try {
      await adminApi.createRegion({ name: newRegion.name.trim(), sub_regions: newRegion.sub_regions.trim() || null })
      setNewRegion({ name: '', sub_regions: '' })
      await load()
      setMessage({ kind: 'success', text: 'Region added.' })
    } catch (err) {
      setMessage({ kind: 'error', text: adminErrorMessage(err, 'Could not add the region.') })
    } finally {
      setSaving(false)
    }
  }

  async function deleteRegion(region) {
    if (saving || !window.confirm(`Delete region ${region.name}? Its countries will have no region.`)) return
    setSaving(true)
    try {
      await adminApi.deleteRegion(region.id)
      await load()
      setMessage({ kind: 'success', text: `Region ${region.name} deleted.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not delete the region.') })
    } finally {
      setSaving(false)
    }
  }

  function regionFields(r) {
    return {
      name: r.name,
      sub_regions: r.sub_regions || '',
      business_head_user_id: r.business_head_user_id,
      country_ids: r.countries.map((c) => c.id),
    }
  }

  function draftRegion(id, patch) {
    setRegionDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }))
  }

  if (!wf || !form) {
    return message.text ? <Notice kind={message.kind}>{message.text}</Notice> : <p className="text-sm text-slate-500">Loading…</p>
  }

  const requiredPreview = wf.stages.filter((s) => s.is_active)

  return (
    <section aria-label="Approval workflow">
      <SectionHeader
        title="Approval Workflow"
        description="Discount ceilings decide when commercial approval is needed; the matrix decides who approves each step. Business Head steps route by the proposal’s Region (ADR)."
        actions={
          <button type="button" className={primaryBtn} onClick={saveWorkflow} disabled={saving || !dirty}>
            <Save className="w-4 h-4" aria-hidden="true" /> {saving ? 'Saving…' : 'Save workflow'}
          </button>
        }
      />
      <div className="mb-3 space-y-2">
        <Notice kind={message.kind}>{message.text}</Notice>
        {dirty && <Notice kind="info">You have unsaved changes.</Notice>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
        <div className="space-y-5">
          <div className={cardCls}>
            <h2 className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">% Discount ceilings</h2>
            <div className="p-5 space-y-4">
              {CEILINGS.map((c) => {
                const info = wf.ceilings[c.key]
                return (
                  <div key={c.key} className="flex items-center justify-between gap-3">
                    <label htmlFor={`ceil-${c.key}`} className="text-[14px] text-slate-700">
                      {c.label} <span className="text-slate-400">— {c.hint}</span>
                      {!info.configured && (
                        <span className="block text-[12px] text-amber-700">
                          Not configured — enter a value and save.
                          {c.key !== 'gm_floor' && ' Proposals cannot be submitted until it is set.'}
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`ceil-${c.key}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className={`${inputCls} w-24 text-center`}
                        value={form.ceilings[c.key]}
                        placeholder="—"
                        onChange={(e) => setForm({ ...form, ceilings: { ...form.ceilings, [c.key]: e.target.value } })}
                      />
                      <span className="text-slate-500">%</span>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-slate-700" id="eff-label">Also test the whole-proposal effective discount against the proposal ceiling</span>
                <button
                  type="button"
                  role="switch"
                  aria-labelledby="eff-label"
                  aria-checked={form.test_effective_discount}
                  onClick={() => setForm({ ...form, test_effective_discount: !form.test_effective_discount })}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${form.test_effective_discount ? 'bg-emerald-700' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${form.test_effective_discount ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <h2 className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">⏱ SLA & escalation</h2>
            <div className="p-5 space-y-4">
              {[
                ['sla_hours', 'Approval SLA per step'],
                ['reminder_hours', 'Send reminder after'],
              ].map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <label htmlFor={`sla-${k}`} className="text-[14px] text-slate-700">{label}</label>
                  <div className="flex items-center gap-2">
                    <input id={`sla-${k}`} type="number" min="1" step="1" className={`${inputCls} w-24 text-center`} value={form.sla[k]}
                      onChange={(e) => setForm({ ...form, sla: { ...form.sla, [k]: e.target.value } })} />
                    <span className="text-slate-500">hrs</span>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="sla-escalate_hours" className="text-[14px] text-slate-700">Escalate after</label>
                <div className="flex items-center gap-2">
                  <input id="sla-escalate_hours" type="number" min="1" step="1" className={`${inputCls} w-24 text-center`} value={form.sla.escalate_hours}
                    onChange={(e) => setForm({ ...form, sla: { ...form.sla, escalate_hours: e.target.value } })} />
                  <span className="text-slate-500">hrs to</span>
                  <select aria-label="Escalation recipient role" className={`${inputCls} w-40`} value={form.sla.escalation_role}
                    onChange={(e) => setForm({ ...form, sla: { ...form.sla, escalation_role: e.target.value } })}>
                    <option value="">Not set</option>
                    {meta.roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[12px] text-slate-500">
                Stored for the reminder / escalation job. Automatic reminders are not running yet.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className={cardCls}>
            <h2 className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">Approval matrix</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]" aria-label="Approval matrix">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Stage</th>
                    <th className="text-left px-4 py-2 font-semibold">When</th>
                    <th className="text-left px-4 py-2 font-semibold">Approver role</th>
                    <th className="text-left px-4 py-2 font-semibold">Routing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wf.stages.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-[13px] text-slate-500">
                        No approval stages are configured, so proposals cannot be submitted. An administrator applies
                        the approved initial setup with <code className="font-mono">python -m scripts.setup_admin_defaults --apply</code>.
                      </td>
                    </tr>
                  )}
                  {wf.stages.map((s) => (
                    <tr key={s.stage_code}>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">{s.label}</div>
                        {s.sub_label && <div className="text-[12px] text-slate-500">{s.sub_label}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {s.stage_code === 'commercial_line' && form.ceilings.line_discount !== ''
                          ? `Any line > ${form.ceilings.line_discount}%`
                          : s.stage_code === 'commercial_proposal' && form.ceilings.overall_discount !== ''
                            ? `Overall > ${form.ceilings.overall_discount}%`
                            : s.condition_text}
                      </td>
                      <td className="px-4 py-2.5">
                        <select aria-label={`Approver role for ${s.label} ${s.sub_label || ''}`} className={`${inputCls} w-44`}
                          value={form.stages[s.stage_code]}
                          onChange={(e) => setForm({ ...form, stages: { ...form.stages, [s.stage_code]: e.target.value } })}>
                          {meta.roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-medium ${s.routing === 'regional' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-700'}`}>
                          {s.routing === 'regional' ? 'Regional' : 'Global'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[13px] text-slate-500 border-t border-slate-100">
              Any rejection returns the proposal to Sales with a comment. Resubmission restarts the route; commercial items are re-evaluated against current discounts. Proposals already submitted keep their existing approvals.
            </p>
          </div>

          <div className={cardCls}>
            <h2 className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">
              Route preview <span className="font-normal text-[13px] text-slate-500">proposal with line + proposal breaches</span>
            </h2>
            <ol className="p-5 flex flex-wrap gap-4 items-start" aria-label="Route preview">
              <li className="flex flex-col items-center text-center w-24">
                <span className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center"><Check className="w-4 h-4" aria-hidden="true" /></span>
                <span className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Submit</span>
                <span className="text-[12px] font-semibold">
                  {wf.submitter_roles?.length
                    ? wf.submitter_roles.map((r) => r.label).join(' / ')
                    : 'No role can submit (Roles & Permissions)'}
                </span>
              </li>
              {requiredPreview.length === 0 && (
                <li className="self-center text-[13px] text-slate-500">No active approval stages.</li>
              )}
              {requiredPreview.map((s, i) => (
                <li key={s.stage_code} className="flex flex-col items-center text-center w-24">
                  <span className="w-9 h-9 rounded-full border-2 border-emerald-600 text-emerald-700 flex items-center justify-center font-semibold">{i + 2}</span>
                  <span className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{s.label}</span>
                  <span className="text-[12px] font-semibold">{roleLabel[form.stages[s.stage_code]]}</span>
                  {s.sub_label && <span className="text-[11px] text-slate-500">{s.sub_label}</span>}
                </li>
              ))}
              <li className="flex flex-col items-center text-center w-24">
                <span className="w-9 h-9 rounded-full border-2 border-slate-300 text-slate-500 flex items-center justify-center"><Check className="w-4 h-4" aria-hidden="true" /></span>
                <span className="mt-1 text-[12px] font-semibold">Approved</span>
              </li>
            </ol>
          </div>
        </div>
      </div>

      <div className={`${cardCls} mt-5`}>
        <h2 className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">Regional Business Heads</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]" aria-label="Regional Business Heads">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Region (ADR)</th>
                <th className="text-left px-4 py-2 font-semibold">Sub-regions</th>
                <th className="text-left px-4 py-2 font-semibold">Business Head</th>
                <th className="text-left px-4 py-2 font-semibold">Countries</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wf.regions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-5 text-center text-slate-500">No regions yet. Add the first region below.</td></tr>
              )}
              {wf.regions.map((r) => {
                const d = { ...regionFields(r), ...(regionDrafts[r.id] || {}) }
                const changed = Boolean(regionDrafts[r.id])
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2"><input aria-label={`Region name ${r.name}`} className={inputCls} value={d.name} onChange={(e) => draftRegion(r.id, { name: e.target.value })} /></td>
                    <td className="px-4 py-2"><input aria-label={`Sub-regions of ${r.name}`} className={inputCls} value={d.sub_regions} onChange={(e) => draftRegion(r.id, { sub_regions: e.target.value })} /></td>
                    <td className="px-4 py-2">
                      <select aria-label={`Business Head for ${r.name}`} className={inputCls} value={d.business_head_user_id ?? ''}
                        onChange={(e) => draftRegion(r.id, { business_head_user_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">Not assigned</option>
                        {businessHeads.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                        {d.business_head_user_id && !businessHeads.some((u) => u.id === d.business_head_user_id) && (
                          <option value={d.business_head_user_id}>{r.business_head_name || `User ${d.business_head_user_id}`}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select multiple aria-label={`Countries in ${r.name}`} className={`${inputCls} h-20`} value={d.country_ids.map(String)}
                        onChange={(e) => draftRegion(r.id, { country_ids: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
                        {meta.countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-right">
                      <button type="button" className={secondaryBtn} disabled={!changed || saving} onClick={() => saveRegion(r)}>Save</button>
                      <button type="button" aria-label={`Delete region ${r.name}`} className="ml-2 p-2 rounded-md text-slate-400 hover:text-rose-700 hover:bg-rose-50" disabled={saving} onClick={() => deleteRegion(r)}>
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <form onSubmit={addRegion} className="flex flex-wrap items-end gap-3 px-5 py-4 border-t border-slate-100" aria-label="Add region">
          <label className="text-[12px] font-medium text-slate-600">Region name
            <input className={`${inputCls} w-48`} value={newRegion.name} onChange={(e) => setNewRegion({ ...newRegion, name: e.target.value })} />
          </label>
          <label className="text-[12px] font-medium text-slate-600">Sub-regions
            <input className={`${inputCls} w-64`} value={newRegion.sub_regions} onChange={(e) => setNewRegion({ ...newRegion, sub_regions: e.target.value })} />
          </label>
          <button type="submit" className={secondaryBtn} disabled={saving || !newRegion.name.trim()}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Add region
          </button>
        </form>
        <p className="px-5 pb-4 text-[12px] text-slate-500">
          A proposal’s region is the region of its primary country. Only users with the Business Head role can be selected.
        </p>
      </div>
    </section>
  )
}

export default ApprovalWorkflowTab
