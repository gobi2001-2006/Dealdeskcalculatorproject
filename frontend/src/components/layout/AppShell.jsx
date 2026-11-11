import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Info } from 'lucide-react'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar (dark navy) */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main app column */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Global Demo Notice Banner */}
        <div className="bg-emerald-50/70 border-b border-emerald-100 px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] text-emerald-900 gap-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                <strong>DEMO DATA:</strong> Illustrative sample data.
              </span>
            </div>
            <span className="hidden md:inline-block font-mono text-[10px] text-emerald-700 uppercase tracking-wider font-semibold">
              Commercial Operations Engine
            </span>
          </div>
        </div>

        {/* Workspace body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell
