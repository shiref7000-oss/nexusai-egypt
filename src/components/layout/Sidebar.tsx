import { useNavigate, useLocation } from 'react-router-dom'
import {
  Activity, ShoppingCart, Brain, BarChart3, DollarSign, Truck,
  MessageCircle, Users, LogOut, Menu, X, ChevronRight, Zap
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { icon: Activity, label: 'Dashboard', path: '/dashboard' },
  { icon: ShoppingCart, label: 'Orders', path: '/orders' },
  { icon: Brain, label: 'AI Agents', path: '/agents' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
]

const bottomItems = [
  { icon: DollarSign, label: 'Finance', path: '#' },
  { icon: Truck, label: 'Shipping', path: '#' },
  { icon: MessageCircle, label: 'WhatsApp', path: '#' },
  { icon: Users, label: 'Customers', path: '#' },
]

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [currentPath, setCurrentPath] = useState('')

  useEffect(() => {
    setCurrentPath(location.pathname)
  }, [location])

  const isActive = (path: string) => currentPath === path

  const handleNav = (path: string) => {
    if (path === '#') return
    navigate(path)
    onMobileClose()
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b border-white/5">
        <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div className="overflow-hidden">
          <span className="text-base font-bold tracking-tight">NexusAI</span>
          <p className="text-[10px] text-gray-500 -mt-0.5">E-Commerce OS</p>
        </div>
        <button onClick={onMobileClose} className="lg:hidden ml-auto text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Main</p>
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => handleNav(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
              isActive(item.path)
                ? 'bg-cyan-500/10 text-cyan-400 font-medium'
                : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <item.icon className={`w-[18px] h-[18px] shrink-0 ${isActive(item.path) ? 'text-cyan-400' : 'text-gray-500'}`} />
            <span className="flex-1 text-left">{item.label}</span>
            {isActive(item.path) && <ChevronRight className="w-3.5 h-3.5 text-cyan-400/50" />}
          </button>
        ))}

        <p className="px-3 py-2 mt-4 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Operations</p>
        {bottomItems.map((item) => (
          <button
            key={item.label}
            onClick={() => handleNav(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-gray-500 ${
              item.path === '#' ? 'cursor-not-allowed opacity-40' : 'hover:text-white hover:bg-white/[0.03]'
            }`}
          >
            <item.icon className="w-[18px] h-[18px] shrink-0 text-gray-600" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.path === '#' && <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-gray-600">Soon</span>}
          </button>
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.name || 'Admin'}</p>
            <p className="text-[10px] text-gray-500 capitalize">{user?.plan || 'Pro'} Plan</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut className="w-[18px] h-[18px]" />
          <span>Logout</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 bg-[#0a0f1a] border-r border-white/5 fixed top-0 left-0 h-full z-40 flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-[#0a0f1a] border-r border-white/5 z-50 flex-col lg:hidden transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  )
}

export function MobileHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[#0a0f1a]/80 backdrop-blur-lg border-b border-white/5 sticky top-0 z-30">
      <button onClick={onMenuOpen} className="p-2 -ml-2 rounded-lg hover:bg-white/5 text-gray-400">
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-bold">NexusAI</span>
      </div>
    </div>
  )
}
