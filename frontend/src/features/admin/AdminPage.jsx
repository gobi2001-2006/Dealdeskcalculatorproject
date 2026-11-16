import { Settings, Shield, Sliders, Database } from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'

export function AdminPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 font-sans">
      {/* 1. Header Navigation */}
      <CatalogueTopNav activeSection="admin" />

      {/* 2. Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Page Title & Status Strip */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-semibold border border-slate-300">
                Administration
              </span>
              <span className="text-slate-400 text-xs">/</span>
              <span className="text-xs text-slate-500 font-medium">System Configuration</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Settings className="w-6 h-6 text-slate-700" aria-hidden="true" />
              Administration & System Settings
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage organization parameters, integration settings, audit logs, and system preferences.
            </p>
          </div>
        </div>

        {/* Informational Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
                <Shield className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Configured
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Access Control</h3>
            <p className="text-xs text-slate-600">
              User roles, permission scopes, and authentication policies for commercial desk analysts.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
                <Sliders className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                Defaults
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Commercial Parameters</h3>
            <p className="text-xs text-slate-600">
              Default currency preferences, contract duration limits, and standard inflation indexes.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
                <Database className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Healthy
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">System Health</h3>
            <p className="text-xs text-slate-600">
              Database connectivity, cache status, and calculation engine performance metrics.
            </p>
          </div>
        </div>

        {/* Main admin settings panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-2xl mx-auto shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 mx-auto mb-3 flex items-center justify-center">
            <Settings className="w-6 h-6 text-slate-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Deal Desk Environment Active</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto mb-4">
            System configuration is loaded from environment variables and backend database configuration. Commercial parameters can be reviewed across the Masters section.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Commercial Engine v2.0
          </div>
        </div>
      </main>
    </div>
  )
}

export default AdminPage

