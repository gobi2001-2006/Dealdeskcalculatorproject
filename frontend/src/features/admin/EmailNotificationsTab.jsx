import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Send } from 'lucide-react'
import { adminApi, adminErrorMessage } from '../../api/adminApi'
import { Notice, SectionHeader } from './adminUi'
import { cardCls, inputCls, primaryBtn, secondaryBtn } from './adminConstants'

const SUB_TABS = [
  { key: 'rules', label: 'Notification rules' },
  { key: 'log', label: 'Email log' },
  { key: 'sender', label: 'Sender settings' },
]

/** Admin → Email Notifications: rules + templates, email log, sender settings. */
export function EmailNotificationsTab({ meta }) {
  const [sub, setSub] = useState('rules')
  const [rules, setRules] = useState(null)
  const [log, setLog] = useState(null)
  const [message, setMessage] = useState({ kind: 'success', text: '' })

  useEffect(() => {
    adminApi.listRules().then(setRules).catch((e) => setMessage({ kind: 'error', text: adminErrorMessage(e) }))
    adminApi.emailLog({ limit: 200 }).then(setLog).catch(() => setLog([]))
  }, [])

  const refreshLog = () => adminApi.emailLog({ limit: 200 }).then(setLog).catch(() => {})

  return (
    <section aria-label="Email notifications">
      <SectionHeader
        title="Email Notifications"
        description="Choose which events send email, who receives them and what they say. “Sales” means the proposal owner; Business Head and Presales resolve to the proposal’s Region (ADR)."
      />
      <div className="flex gap-1 border-b border-slate-200 mb-4" role="tablist" aria-label="Email notification sections">
        {SUB_TABS.map((t) => {
          const count = t.key === 'rules' ? rules?.length : t.key === 'log' ? log?.length : null
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={sub === t.key}
              onClick={() => {
                setSub(t.key)
                if (t.key === 'log') refreshLog()
              }}
              className={`px-4 py-2.5 text-[15px] font-medium -mb-px border-b-2 ${sub === t.key ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
            >
              {t.label}
              {count !== null && count !== undefined && <span className="ml-2 text-[12px] font-mono text-slate-500">{count}</span>}
            </button>
          )
        })}
      </div>
      <div className="mb-3"><Notice kind={message.kind}>{message.text}</Notice></div>
      {sub === 'rules' && rules && <RulesPanel rules={rules} setRules={setRules} meta={meta} setMessage={setMessage} onSent={refreshLog} />}
      {sub === 'rules' && !rules && !message.text && <p className="text-sm text-slate-500">Loading…</p>}
      {sub === 'log' && <LogPanel log={log} rules={rules || []} />}
      {sub === 'sender' && <SenderPanel setMessage={setMessage} />}
    </section>
  )
}

function RulesPanel({ rules, setRules, meta, setMessage, onSent }) {
  const [selected, setSelected] = useState(rules[0]?.event_code)
  const [busy, setBusy] = useState(null)
  const rule = rules.find((r) => r.event_code === selected)

  if (rules.length === 0) {
    return (
      <div className={`${cardCls} p-6 text-[14px] text-slate-600`} role="status">
        No notification rules are configured, so no workflow email is sent. An administrator applies the approved
        initial setup with <code className="font-mono">python -m scripts.setup_admin_defaults --apply</code>.
      </div>
    )
  }

  async function patch(r, body) {
    if (busy) return
    setBusy(r.event_code)
    try {
      const updated = await adminApi.updateRule(r.event_code, body)
      setRules((list) => list.map((x) => (x.event_code === r.event_code ? updated : x)))
      setMessage({ kind: 'success', text: `“${updated.label}” saved.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not save the rule.') })
    } finally {
      setBusy(null)
    }
  }

  function toggleRecipient(r, role) {
    const set = new Set(r.recipient_roles)
    if (set.has(role)) set.delete(role)
    else set.add(role)
    patch(r, { recipient_roles: meta.recipient_roles.filter((x) => set.has(x)) })
  }

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] gap-5">
      <div className={`${cardCls} overflow-x-auto`}>
        <table className="w-full text-[14px]" aria-label="Notification rules">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold text-left">On</th>
              <th className="px-4 py-3 font-semibold text-left">Event</th>
              {meta.recipient_roles.map((role) => (
                <th key={role} className="px-2 py-3 font-semibold text-center">{meta.recipient_labels?.[role] || role}</th>
              ))}
              <th className="px-2 py-3 font-semibold text-center">Approve links</th>
              <th className="px-2 py-3"><span className="sr-only">Edit template</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) => (
              <tr key={r.event_code} className={selected === r.event_code ? 'bg-emerald-50/60' : ''}>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.is_enabled}
                    aria-label={`Enable ${r.label}`}
                    disabled={busy === r.event_code}
                    onClick={() => patch(r, { is_enabled: !r.is_enabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full ${r.is_enabled ? 'bg-emerald-700' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${r.is_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <button type="button" className="text-left" onClick={() => setSelected(r.event_code)}>
                    <div className="font-semibold text-slate-900">{r.label}</div>
                    <div className="text-[12px] text-slate-500">{r.description}</div>
                  </button>
                </td>
                {meta.recipient_roles.map((role) => (
                  <td key={role} className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-emerald-600"
                      aria-label={`${r.label}: send to ${meta.recipient_labels?.[role] || role}`}
                      checked={r.recipient_roles.includes(role)}
                      disabled={busy === r.event_code}
                      onChange={() => toggleRecipient(r, role)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2.5 text-center text-slate-400">
                  {r.include_approve_links ? (
                    <span className="inline-flex w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 items-center justify-center" title="Includes Approve / Reject links">
                      <Check className="w-3.5 h-3.5" aria-label="Includes approve links" />
                    </span>
                  ) : '—'}
                </td>
                <td className="px-2 py-2.5">
                  <button type="button" aria-label={`Edit template: ${r.label}`} onClick={() => setSelected(r.event_code)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100">
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rule && <TemplateEditor key={rule.event_code} rule={rule} meta={meta} setRules={setRules} setMessage={setMessage} onSent={onSent} />}
    </div>
  )
}

function TemplateEditor({ rule, meta, setRules, setMessage, onSent }) {
  const [subject, setSubject] = useState(rule.subject_template)
  const [body, setBody] = useState(rule.body_template)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState([])
  const [testUser, setTestUser] = useState('')
  const bodyRef = useRef(null)
  const dirty = subject !== rule.subject_template || body !== rule.body_template

  useEffect(() => {
    adminApi.listUsers().then((u) => setUsers(u.filter((x) => x.is_active))).catch(() => setUsers([]))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      adminApi
        .previewRule(rule.event_code, { subject_template: subject, body_template: body })
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 300)
    return () => clearTimeout(t)
  }, [rule.event_code, subject, body])

  function insertField(field) {
    const token = `{{${field}}}`
    const el = bodyRef.current
    if (!el) {
      setBody((b) => b + token)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    setBody(body.slice(0, start) + token + body.slice(end))
  }

  async function save() {
    if (saving) return
    if (!subject.trim() || !body.trim()) {
      setMessage({ kind: 'error', text: 'Subject and body are required.' })
      return
    }
    setSaving(true)
    try {
      const updated = await adminApi.updateRule(rule.event_code, { subject_template: subject, body_template: body })
      setRules((list) => list.map((x) => (x.event_code === rule.event_code ? updated : x)))
      setMessage({ kind: 'success', text: `Template “${updated.label}” saved.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not save the template.') })
    } finally {
      setSaving(false)
    }
  }

  async function resetTemplate() {
    if (saving || !window.confirm('Replace this subject and body with the approved initial template (v3.1)?')) return
    setSaving(true)
    try {
      const updated = await adminApi.resetRuleTemplate(rule.event_code)
      setRules((list) => list.map((x) => (x.event_code === rule.event_code ? updated : x)))
      setSubject(updated.subject_template)
      setBody(updated.body_template)
      setMessage({ kind: 'success', text: `Template “${updated.label}” reset to the approved initial template.` })
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not reset the template.') })
    } finally {
      setSaving(false)
    }
  }

  async function testSend() {
    if (!testUser || saving) return
    if (dirty) {
      setMessage({ kind: 'error', text: 'Save the template before sending a test.' })
      return
    }
    setSaving(true)
    try {
      const sent = await adminApi.testSend(rule.event_code, Number(testUser), preview?.proposal_id)
      setMessage({
        kind: sent.error ? 'error' : 'success',
        text: sent.error
          ? `Test email logged with a warning: ${sent.error}`
          : `Test email to ${sent.recipient_email} written to the Email log (simulated — not delivered).`,
      })
      onSent?.()
    } catch (e) {
      setMessage({ kind: 'error', text: adminErrorMessage(e, 'Could not send the test email.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${cardCls} flex flex-col`} aria-label={`Template — ${rule.label}`}>
      <h2 className="px-5 py-4 border-b border-slate-100 font-semibold text-slate-900">✎ Template — {rule.label}</h2>
      <div className="p-5 space-y-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Subject
          <input className={`${inputCls} mt-1 normal-case tracking-normal font-normal`} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Body</div>
          <div className="flex flex-wrap gap-1.5 mb-2" aria-label="Merge fields">
            {meta.merge_fields.map((f) => (
              <button key={f} type="button" onClick={() => insertField(f)} className="px-2 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 text-[12px] font-mono hover:bg-emerald-100">
                {`{{${f}}}`}
              </button>
            ))}
          </div>
          <textarea ref={bodyRef} aria-label="Email body" rows={9} className={`${inputCls} font-mono text-[13px]`} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button type="button" className={primaryBtn} onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save template'}</button>
          <button type="button" className={secondaryBtn} onClick={() => { setSubject(rule.subject_template); setBody(rule.body_template) }} disabled={!dirty || saving}>Discard</button>
          <button type="button" className={secondaryBtn} onClick={resetTemplate} disabled={saving}>↺ Reset template</button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="Live preview">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            {preview?.proposal_code
              ? `Live preview · using ${preview.proposal_code}`
              : 'Live preview · no proposal yet — merge fields are shown unfilled'}
          </div>
          {preview && (
            <dl className="text-[12px] text-slate-600 mb-2 space-y-0.5">
              <div>
                <dt className="inline font-semibold text-slate-800">From: </dt>
                <dd className="inline">
                  {preview.from_email
                    ? `${preview.from_name ? `${preview.from_name} ` : ''}<${preview.from_email}>`
                    : 'Not configured (Sender settings)'}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-slate-800">To: </dt>
                <dd className="inline">
                  {preview.recipients?.length
                    ? preview.recipients
                        .map((r) => `${r.name} <${r.email}> · ${meta.recipient_labels?.[r.role] || r.role}`)
                        .join(', ')
                    : 'No recipient resolves for this proposal'}
                </dd>
              </div>
            </dl>
          )}
          <div className="text-[13px] font-semibold text-slate-900">{preview?.subject ?? '…'}</div>
          <pre className="mt-1 whitespace-pre-wrap text-[13px] text-slate-700 font-sans">{preview?.body ?? ''}</pre>
        </div>
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="text-[12px] font-medium text-slate-600">Test send to
            <select className={`${inputCls} w-56`} value={testUser} onChange={(e) => setTestUser(e.target.value)} aria-label="Test send recipient">
              <option value="">Select a user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} — {u.email}</option>)}
            </select>
          </label>
          <button type="button" className={secondaryBtn} onClick={testSend} disabled={!testUser || saving}>
            <Send className="w-4 h-4" aria-hidden="true" /> Send test
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_TONE = {
  simulated: 'bg-sky-50 text-sky-800 border-sky-200',
  sent: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  failed: 'bg-rose-50 text-rose-800 border-rose-200',
  skipped: 'bg-amber-50 text-amber-800 border-amber-200',
}

function LogPanel({ log, rules }) {
  const [event, setEvent] = useState('')
  const labels = Object.fromEntries(rules.map((r) => [r.event_code, r.label]))
  const rows = (log || []).filter((e) => !event || e.event_code === event)
  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
        <p className="text-[13px] text-slate-500">Simulated outbox: emails are recorded here and are not delivered until a mail relay is configured.</p>
        <select aria-label="Filter by event" className={`${inputCls} w-64`} value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">All events</option>
          {rules.map((r) => <option key={r.event_code} value={r.event_code}>{r.label}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" aria-label="Email log">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Created</th>
              <th className="text-left px-4 py-2 font-semibold">Event</th>
              <th className="text-left px-4 py-2 font-semibold">Proposal</th>
              <th className="text-left px-4 py-2 font-semibold">Recipient</th>
              <th className="text-left px-4 py-2 font-semibold">Subject</th>
              <th className="text-left px-4 py-2 font-semibold">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {log === null && <tr><td colSpan={7} className="px-4 py-5 text-center text-slate-500">Loading…</td></tr>}
            {log && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-5 text-center text-slate-500">No emails yet.</td></tr>}
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 whitespace-nowrap text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
                <td className="px-4 py-2">{labels[e.event_code] || e.event_code}{e.is_test && <span className="ml-1 text-[11px] text-slate-500">(test)</span>}</td>
                <td className="px-4 py-2">{e.proposal_id ?? '—'}</td>
                <td className="px-4 py-2">
                  <div>{e.recipient_name || '—'}</div>
                  <div className="text-[12px] text-slate-500">{e.recipient_email || e.recipient_role}</div>
                </td>
                <td className="px-4 py-2">{e.subject}</td>
                <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full border text-[12px] ${STATUS_TONE[e.status] || ''}`}>{e.status}</span></td>
                <td className="px-4 py-2 text-[12px] text-rose-700">{e.error || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const SENDER_FIELDS = [
  ['from_name', 'From name', 'text'],
  ['from_email', 'From email', 'email'],
  ['reply_to', 'Reply-to', 'email'],
  ['always_cc', 'Always CC (optional)', 'email'],
  ['deal_desk_url', 'Deal Desk URL (for links)', 'url'],
]

function SenderPanel({ setMessage }) {
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminApi
      .getSender()
      .then((s) => {
        const f = Object.fromEntries(SENDER_FIELDS.map(([k]) => [k, s[k] || '']))
        setForm(f)
        setSaved({ ...f, delivery_mode: s.delivery_mode })
      })
      .catch((e) => setMessage({ kind: 'error', text: adminErrorMessage(e) }))
  }, [setMessage])

  if (!form) return <p className="text-sm text-slate-500">Loading…</p>
  const dirty = SENDER_FIELDS.some(([k]) => form[k] !== saved[k])

  async function save(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const s = await adminApi.saveSender(Object.fromEntries(SENDER_FIELDS.map(([k]) => [k, form[k].trim() || null])))
      const f = Object.fromEntries(SENDER_FIELDS.map(([k]) => [k, s[k] || '']))
      setForm(f)
      setSaved({ ...f, delivery_mode: s.delivery_mode })
      setMessage({ kind: 'success', text: 'Sender settings saved.' })
    } catch (err) {
      setMessage({ kind: 'error', text: adminErrorMessage(err, 'Could not save sender settings.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className={`${cardCls} p-5 max-w-4xl`} aria-label="Sender settings">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SENDER_FIELDS.map(([k, label, type]) => (
          <label key={k} className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}
            <input type={type} className={`${inputCls} mt-1 normal-case tracking-normal font-normal`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Delivery</div>
      <p className="text-[13px] text-slate-600 mt-1">
        {saved.delivery_mode === 'simulated'
          ? 'Simulated — emails are written to the Email log and are not delivered. A production mail relay (Microsoft 365 / SMTP) has not been configured; Approve / Reject links will still require sign-in.'
          : `Delivery mode: ${saved.delivery_mode}`}
      </p>
      <div className="mt-4">
        <button type="submit" className={primaryBtn} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save sender settings'}</button>
      </div>
    </form>
  )
}

export default EmailNotificationsTab
