import { useState } from 'react'
import {
  X,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Download,
  Building2,
  Calendar,
  Layers,
  ShieldCheck,
  Paperclip,
  ExternalLink,
} from 'lucide-react'

export function ProposalPreviewModal({
  isOpen,
  onClose,
  proposalData,
  sections,
  attachments = [],
  totals,
  onNavigateSection,
  onExportDocx,
}) {
  if (!isOpen) return null

  const customerName =
    proposalData?.clientName || proposalData?.companyName || 'Enterprise Client'
  const proposalCode = proposalData?.proposalCode || `PROP-${proposalData?.proposalId || 'DRAFT'}`
  const proposalDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const repCurr = totals?.currency || proposalData?.currency || 'INR'

  // Extract section values
  const exec = typeof sections?.executive_summary === 'object' ? sections.executive_summary : {}
  const sow = typeof sections?.scope_of_work === 'object' ? sections.scope_of_work : {}
  const ci = typeof sections?.customization_integration === 'object' ? sections.customization_integration : {}
  const tc = typeof sections?.terms_conditions === 'object' ? sections.terms_conditions : {}
  const fit = typeof sections?.fitment_document === 'object' ? sections.fitment_document : {}

  const custItems = (ci?.items || []).filter((i) => i.type === 'Customization')
  const integItems = (ci?.items || []).filter((i) => i.type === 'Integration')
  const milestones = tc?.payment_milestones || []
  const crRates = tc?.change_request_rates || []

  // Missing fields validation
  const missingFields = []
  if (!exec?.customer_introduction && !sections?.executive_summary) {
    missingFields.push({ section: 'executive_summary', label: 'Customer Introduction' })
  }
  if (!exec?.customer_objectives && !sections?.executive_summary) {
    missingFields.push({ section: 'executive_summary', label: 'Customer Objectives' })
  }
  if (!sow?.license && !sections?.scope_of_work) {
    missingFields.push({ section: 'scope_of_work', label: 'License Scope' })
  }
  if (!sow?.implementation_plan && !sections?.scope_of_work) {
    missingFields.push({ section: 'scope_of_work', label: 'Implementation Plan' })
  }
  if (!ci?.none_required && (!ci?.items || ci.items.length === 0)) {
    missingFields.push({ section: 'customization_integration', label: 'Customization/Integration specifications or None Required confirmation' })
  }
  const milestoneSum = milestones.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0)
  if (milestones.length > 0 && Math.abs(milestoneSum - 100) > 0.01) {
    missingFields.push({ section: 'terms_conditions', label: `Payment Milestones must sum to 100% (currently ${milestoneSum}%)` })
  }
  if (!tc?.commercial_tc && !sections?.terms_conditions) {
    missingFields.push({ section: 'terms_conditions', label: 'Commercial Terms & Conditions' })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 id="preview-modal-title" className="text-base font-bold text-white leading-tight">
                Proposal Document Preview
              </h2>
              <p className="text-[11px] text-slate-400">
                Word template layout mirror · Verified against authoritative pricing snapshot
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onExportDocx && (
              <button
                type="button"
                onClick={onExportDocx}
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export Word (.docx)
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Missing Fields Banner if any */}
        {missingFields.length > 0 && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900 flex items-start gap-3 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Missing required sections before final submission:</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {missingFields.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onClose()
                      onNavigateSection && onNavigateSection(f.section)
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 rounded-md text-[11px] font-semibold text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-colors shadow-2xs cursor-pointer"
                  >
                    <span>{f.label}</span>
                    <ExternalLink className="w-3 h-3 text-amber-700" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Document Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 bg-[#FAFAFA]">
          {/* Cover Page Header Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-orange-600">
                  Commercial Proposal & Solution Blueprint
                </span>
                <h1 className="text-2xl font-black text-slate-900">{customerName}</h1>
                <p className="text-[13px] text-slate-500">
                  Adrenalin AI-First Human Capital Management Platform
                </p>
              </div>
              <div className="text-right space-y-1">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                  {proposalData?.status || 'Draft Version 1.0'}
                </span>
                <div className="text-[11px] font-mono text-slate-500">Ref: {proposalCode}</div>
                <div className="text-[11px] text-slate-400">{proposalDate}</div>
              </div>
            </div>

            {/* Proposal Parameters Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px] pt-1">
              <div>
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Deployment</span>
                <div className="font-semibold text-slate-800">{proposalData?.deploymentModel || 'Cloud SaaS (Azure)'}</div>
              </div>
              <div>
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Contract Term</span>
                <div className="font-semibold text-slate-800">{proposalData?.contractDurationDisplay || '36 Months (3 Years)'}</div>
              </div>
              <div>
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Licensed Headcount</span>
                <div className="font-semibold text-slate-800">{proposalData?.totalHeadcount ? Number(proposalData.totalHeadcount).toLocaleString() : 'Per Schedule'}</div>
              </div>
              <div>
                <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Grand Contract FCV</span>
                <div className="font-bold font-mono text-emerald-700">{totals?.contractTotalFormatted || 'Calculated in Snapshot'}</div>
              </div>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                  01
                </span>
                Executive Summary
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onNavigateSection && onNavigateSection('executive_summary')
                }}
                className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                Edit Section
              </button>
            </div>

            <div className="space-y-3 text-[13px] leading-relaxed text-slate-700">
              {exec?.customer_introduction && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Customer Introduction</h4>
                  <p className="whitespace-pre-line">{exec.customer_introduction}</p>
                </div>
              )}
              {exec?.customer_objectives && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Customer Objectives</h4>
                  <p className="whitespace-pre-line">{exec.customer_objectives}</p>
                </div>
              )}
              {exec?.value_proposition && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Adrenalin Value Proposition</h4>
                  <p className="whitespace-pre-line">{exec.value_proposition}</p>
                </div>
              )}
              {exec?.conclusion && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Executive Conclusion</h4>
                  <p className="whitespace-pre-line">{exec.conclusion}</p>
                </div>
              )}
              {!exec?.customer_introduction && typeof sections?.executive_summary === 'string' && (
                <p className="whitespace-pre-line">{sections.executive_summary}</p>
              )}
            </div>
          </section>

          {/* Customer Challenges Preview */}
          {Boolean(sections?.customer_challenges?.trim()) && (
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                    02
                  </span>
                  Customer Challenges & Pain Points
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigateSection && onNavigateSection('customer_challenges')
                  }}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  Edit Section
                </button>
              </div>
              <div className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">
                {sections.customer_challenges}
              </div>
            </section>
          )}

          {/* Proposed Solution Preview */}
          {Boolean(sections?.proposed_solution?.trim()) && (
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                    03
                  </span>
                  Proposed Solution & Platform Architecture
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigateSection && onNavigateSection('proposed_solution')
                  }}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  Edit Section
                </button>
              </div>
              <div className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">
                {sections.proposed_solution}
              </div>
            </section>
          )}

          {/* Product Features Preview */}
          {Boolean(sections?.product_features?.trim()) && (
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                    04
                  </span>
                  Product Features & Module Coverage
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigateSection && onNavigateSection('product_features')
                  }}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  Edit Section
                </button>
              </div>
              <div className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">
                {sections.product_features}
              </div>
            </section>
          )}

          {/* Implementation Methodology Preview */}
          {Boolean(sections?.implementation_methodology?.trim()) && (
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                    05
                  </span>
                  Implementation Methodology (ARM)
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigateSection && onNavigateSection('implementation_methodology')
                  }}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  Edit Section
                </button>
              </div>
              <div className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">
                {sections.implementation_methodology}
              </div>
            </section>
          )}

          {/* Implementation Plan Preview */}
          {Boolean(sections?.implementation_plan?.trim()) && (
            <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                    06
                  </span>
                  Implementation Timeline & Plan
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onNavigateSection && onNavigateSection('implementation_plan')
                  }}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  Edit Section
                </button>
              </div>
              <div className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">
                {sections.implementation_plan}
              </div>
            </section>
          )}

          {/* Section 2: Scope of Work */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                  02
                </span>
                Scope of Work & Deliverables
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onNavigateSection && onNavigateSection('scope_of_work')
                }}
                className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                Edit Section
              </button>
            </div>

            <div className="space-y-3 text-[13px] leading-relaxed text-slate-700">
              {sow?.license && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">License Scope</h4>
                  <p className="whitespace-pre-line">{sow.license}</p>
                </div>
              )}
              {sow?.implementation_plan && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Implementation Plan</h4>
                  <p className="whitespace-pre-line">{sow.implementation_plan}</p>
                </div>
              )}
              {sow?.implementation_approach && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Implementation Approach & Governance</h4>
                  <p className="whitespace-pre-line">{sow.implementation_approach}</p>
                </div>
              )}
              {sow?.in_scope && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">In-Scope Activities</h4>
                  <p className="whitespace-pre-line">{sow.in_scope}</p>
                </div>
              )}
              {sow?.out_of_scope && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Out-of-Scope Activities</h4>
                  <p className="whitespace-pre-line">{sow.out_of_scope}</p>
                </div>
              )}
              {!sow?.license && typeof sections?.scope_of_work === 'string' && (
                <p className="whitespace-pre-line">{sections.scope_of_work}</p>
              )}
            </div>
          </section>

          {/* Section 3: Customization & Integrations */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                  03
                </span>
                Customization & System Integrations
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onNavigateSection && onNavigateSection('customization_integration')
                }}
                className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                Edit Section
              </button>
            </div>

            {ci?.none_required ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-600">
                ✓ No customizations or third-party integrations required. All requirements met out-of-the-box.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Customizations Table */}
                {custItems.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-2">Customization Scope</h4>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-[12px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <tr>
                            <th className="p-2.5">Title</th>
                            <th className="p-2.5">Module / System</th>
                            <th className="p-2.5">Description</th>
                            <th className="p-2.5 text-right">Effort</th>
                            <th className="p-2.5 text-center">Chargeable</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {custItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-semibold text-slate-900">{item.title}</td>
                              <td className="p-2.5 text-slate-600">{item.module} ({item.system})</td>
                              <td className="p-2.5 text-slate-600">{item.description}</td>
                              <td className="p-2.5 text-right font-mono font-semibold">{item.effort_days} Days</td>
                              <td className="p-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.chargeable ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'}`}>
                                  {item.chargeable ? 'Yes' : 'No'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Integrations Table */}
                {integItems.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-2">System Integrations</h4>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-[12px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <tr>
                            <th className="p-2.5">Title</th>
                            <th className="p-2.5">Target System</th>
                            <th className="p-2.5">Description</th>
                            <th className="p-2.5 text-right">Effort</th>
                            <th className="p-2.5 text-center">Chargeable</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {integItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2.5 font-semibold text-slate-900">{item.title}</td>
                              <td className="p-2.5 text-slate-600">{item.system} ({item.module})</td>
                              <td className="p-2.5 text-slate-600">{item.description}</td>
                              <td className="p-2.5 text-right font-mono font-semibold">{item.effort_days} Days</td>
                              <td className="p-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.chargeable ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'}`}>
                                  {item.chargeable ? 'Yes' : 'No'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 4: Terms & Conditions */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                  04
                </span>
                Terms & Conditions & Payment Milestones
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onNavigateSection && onNavigateSection('terms_conditions')
                }}
                className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                Edit Section
              </button>
            </div>

            <div className="space-y-4 text-[13px] leading-relaxed text-slate-700">
              {tc?.commercial_tc && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Commercial Assumptions & Taxes</h4>
                  <p className="whitespace-pre-line">{tc.commercial_tc}</p>
                </div>
              )}

              {/* Payment Milestones Table */}
              {milestones.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-2">Payment Milestones Schedule (100% Fee)</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <tr>
                          <th className="p-2.5">Milestone / Event</th>
                          <th className="p-2.5 text-right">Fee %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {milestones.map((m, idx) => (
                          <tr key={idx}>
                            <td className="p-2.5 font-semibold text-slate-800">{m.milestone}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">{m.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Change Request Rates Table */}
              {crRates.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-2">Change Request Rates</h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <tr>
                          <th className="p-2.5">Role</th>
                          <th className="p-2.5 text-right">Rate / Day</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {crRates.map((cr, idx) => (
                          <tr key={idx}>
                            <td className="p-2.5 font-semibold text-slate-800">{cr.role}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                              {Number(cr.rate_per_day || 0).toLocaleString()} {cr.currency || repCurr}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tc?.proposal_validity_days && (
                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-[12px] text-amber-900">
                  <span className="font-bold">Proposal Validity:</span> This proposal and associated commercials are valid for {tc.proposal_validity_days} calendar days from issuance.
                </div>
              )}
            </div>
          </section>

          {/* Section 5: Fitment Document */}
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-orange-100 text-orange-700 text-[11px] flex items-center justify-center font-bold">
                  05
                </span>
                Annexure 1 – Product Fitment Document
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onNavigateSection && onNavigateSection('fitment_document')
                }}
                className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                Edit Section
              </button>
            </div>

            <div className="space-y-3 text-[13px] leading-relaxed text-slate-700">
              {fit?.fitment_text && <p className="whitespace-pre-line">{fit.fitment_text}</p>}
              {fit?.customer_requirements && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Customer Requirements</h4>
                  <p className="whitespace-pre-line">{fit.customer_requirements}</p>
                </div>
              )}
              {fit?.solution_fitment && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Solution Fitment</h4>
                  <p className="whitespace-pre-line">{fit.solution_fitment}</p>
                </div>
              )}
              {fit?.remarks && (
                <div>
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-1">Remarks & Technical Assumptions</h4>
                  <p className="whitespace-pre-line">{fit.remarks}</p>
                </div>
              )}

              {/* Attachments List */}
              {attachments.length > 0 && (
                <div className="pt-2">
                  <h4 className="font-bold text-slate-900 text-[12px] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-orange-600" />
                    Attached Fitment Documentation ({attachments.length})
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50">
                    {attachments.map((att) => (
                      <div key={att.id} className="p-2.5 flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-slate-800">{att.file_name}</span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {((att.file_size_bytes || 0) / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[12px] text-slate-500">
            {missingFields.length === 0 ? (
              <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                All required sections complete and verified.
              </span>
            ) : (
              <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {missingFields.length} missing field{missingFields.length > 1 ? 's' : ''} detected.
              </span>
            )}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProposalPreviewModal

