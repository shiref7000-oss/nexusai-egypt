import { useState } from 'react'
import Sidebar, { MobileHeader } from './Sidebar'
import { Toaster } from 'sonner'
import type { ReactNode } from 'react'

export default function AppLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#060B18] text-white">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0d1321',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0',
            fontSize: '13px',
          },
        }}
      />
      <MobileHeader onMenuOpen={() => setMobileOpen(true)} />
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <main className="lg:ml-60">
        <header className="sticky top-0 z-20 bg-[#060B18]/90 backdrop-blur-lg border-b border-white/5 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold truncate">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 bg-green-500/10 rounded-full px-2.5 py-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-green-400 font-medium">Live</span>
            </div>
          </div>
        </header>
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {children}
        </div>
      </main>
    </div>
  )
}
