import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Search, ArrowUpDown, Package,
  MessageCircle, Phone, CheckCircle, XCircle, Truck,
  Activity, Brain, BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useState, useEffect } from 'react'
import { ordersApi } from '@/lib/api'

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: typeof CheckCircle }> = {
  new: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'New', icon: Package },
  confirmed: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Confirmed', icon: CheckCircle },
  shipped: { color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Shipped', icon: Truck },
  delivered: { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Delivered', icon: CheckCircle },
  returned: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Returned', icon: XCircle },
  cancelled: { color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Cancelled', icon: XCircle },
}

const statusFilters = ['all', 'new', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled']

const sidebarItems = [
  { icon: Activity, label: 'Dashboard', active: false, path: '/dashboard' },
  { icon: ShoppingCart, label: 'Orders', active: true, path: '/orders' },
  { icon: Brain, label: 'AI Agents', active: false, path: '/agents' },
  { icon: BarChart3, label: 'Analytics', active: false, path: '/analytics' },
]

export default function Orders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [ordersRes, statsRes] = await Promise.all([
        ordersApi.list(),
        ordersApi.stats(),
      ])
      if (ordersRes.success) setOrders(ordersRes.data || [])
      if (statsRes.success) setStats(statsRes.data || {})
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const filtered = orders
    .filter((o: any) => statusFilter === 'all' || o.status === statusFilter)
    .filter((o: any) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (o.order_id + o.customer_name + o.product + o.city + o.customer_phone).toLowerCase().includes(q)
    })
    .sort((a: any, b: any) => {
      if (!sortField) return 0
      const cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''))
      return sortAsc ? cmp : -cmp
    })

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const statCards = [
    { label: 'Total', value: stats.total || 0, icon: ShoppingCart, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'New', value: stats.new || 0, icon: Package, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Confirmed', value: stats.confirmed || 0, icon: CheckCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Shipped', value: stats.shipped || 0, icon: Truck, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Delivered', value: stats.delivered || 0, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Returned', value: stats.returned || 0, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  ]

  return (
    <div className="min-h-screen bg-[#060B18] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0f1a] border-r border-white/5 fixed h-full hidden lg:flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-white/5">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold">NexusAI</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(item => (
            <button key={item.label} onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${item.active ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon className="w-4 h-4" />{item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 lg:ml-64">
        <header className="sticky top-0 z-30 bg-[#060B18]/80 backdrop-blur-lg border-b border-white/5 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Orders</h1>
            <p className="text-xs text-gray-500">Manage COD orders across Egypt</p>
          </div>
          <Button onClick={() => navigate('/')} variant="ghost" size="sm" className="text-gray-400 hover:text-white">Exit</Button>
        </header>

        <div className="p-6 space-y-6">
          {loading && <div className="text-center py-12 text-gray-500">Loading orders...</div>}

          {!loading && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {statCards.map(s => (
                  <Card key={s.label} className="bg-[#0d1321] border-white/5">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center shrink-0`}>
                        <s.icon className={`w-4 h-4 ${s.color}`} />
                      </div>
                      <div><div className="text-lg font-bold text-white">{s.value}</div><div className="text-xs text-gray-500">{s.label}</div></div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Search + Filters */}
              <Card className="bg-[#0d1321] border-white/5">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="pl-10 bg-[#060B18] border-white/10 text-white placeholder:text-gray-600" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {statusFilters.map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Table */}
              <Card className="bg-[#0d1321] border-white/5">
                <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Orders ({filtered.length})</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-white/5">
                          {['order_id', 'customer_name', null, 'product', 'amount'].map((f, i) => (
                            <th key={i} className="pb-3 pr-4">
                              {f ? <button onClick={() => toggleSort(f)} className="flex items-center gap-1 cursor-pointer hover:text-white">{f.replace('_', ' ')}<ArrowUpDown className="w-3 h-3" /></button> : 'Contact'}
                            </th>
                          ))}
                          <th className="pb-3 pr-4">Status</th>
                          <th className="pb-3 pr-4">City</th>
                          <th className="pb-3 pr-4">Shipping</th>
                          <th className="pb-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((order: any) => {
                          const cfg = statusConfig[order.status]
                          const StatusIcon = cfg.icon
                          return (
                            <tr key={order.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                              <td className="py-3 pr-4 text-sm font-mono text-cyan-400">{order.order_id}</td>
                              <td className="py-3 pr-4 text-sm text-white font-medium">{order.customer_name}</td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-400">{order.customer_phone}</span>
                                  <button className="text-green-400 hover:text-green-300"><MessageCircle className="w-3.5 h-3.5" /></button>
                                  <button className="text-blue-400 hover:text-blue-300"><Phone className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-sm text-gray-300">{order.product}</td>
                              <td className="py-3 pr-4 text-sm text-white font-semibold">EGP {order.amount?.toLocaleString()}</td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                                  <StatusIcon className="w-3 h-3" />{cfg.label}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-sm text-gray-400">{order.city}</td>
                              <td className="py-3 pr-4 text-sm text-gray-400">{order.shipping_carrier}</td>
                              <td className="py-3">
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-cyan-400 hover:text-cyan-300">Details</Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filtered.length === 0 && (
                    <div className="text-center py-12 text-gray-500"><Package className="w-8 h-8 mx-auto mb-3 opacity-50" /><p className="text-sm">No orders match</p></div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
