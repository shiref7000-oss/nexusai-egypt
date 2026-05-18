import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Search, ArrowUpDown, Package,
  MessageCircle, Phone, CheckCircle, XCircle, Truck,
  DollarSign, Activity, Users, BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

const allOrders = [
  { id: 'ORD-2856', customer: 'Mohamed Ali', phone: '+20 100 123 4567', product: 'iPhone 15 Pro Case', amount: 650, status: 'new', city: 'Cairo', date: '2025-05-18', shipping: 'Bosta', notes: '' },
  { id: 'ORD-2855', customer: 'Sara Ahmed', phone: '+20 101 234 5678', product: 'Vitamin C Serum 30ml', amount: 320, status: 'confirmed', city: 'Alexandria', date: '2025-05-18', shipping: 'Aramex', notes: 'Customer confirmed via WhatsApp' },
  { id: 'ORD-2854', customer: 'Khaled Omar', phone: '+20 102 345 6789', product: 'Wireless Earbuds Pro', amount: 780, status: 'shipped', city: 'Giza', date: '2025-05-17', shipping: 'Bosta', notes: 'Tracking: BST-8847321' },
  { id: 'ORD-2853', customer: 'Nour Hassan', phone: '+20 103 456 7890', product: 'LED Desk Lamp RGB', amount: 290, status: 'delivered', city: 'Mansoura', date: '2025-05-16', shipping: 'VHub', notes: 'Delivered successfully' },
  { id: 'ORD-2852', customer: 'Amr Khaled', phone: '+20 104 567 8901', product: 'Running Shoes Nike', amount: 1200, status: 'returned', city: 'Tanta', date: '2025-05-15', shipping: 'Bosta', notes: 'Wrong size - initiate exchange' },
  { id: 'ORD-2851', customer: 'Fatima Saeed', phone: '+20 105 678 9012', product: 'Ceramic Coffee Set', amount: 450, status: 'cancelled', city: 'Port Said', date: '2025-05-15', shipping: 'Aramex', notes: 'Customer cancelled - out of stock' },
  { id: 'ORD-2850', customer: 'Omar Ibrahim', phone: '+20 106 789 0123', product: 'Mechanical Keyboard', amount: 890, status: 'confirmed', city: 'Cairo', date: '2025-05-18', shipping: 'Bosta', notes: 'VIP customer - priority handling' },
  { id: 'ORD-2849', customer: 'Laila Mahmoud', phone: '+20 107 890 1234', product: 'Skincare Bundle x3', amount: 560, status: 'new', city: 'Alexandria', date: '2025-05-18', shipping: 'VHub', notes: '' },
  { id: 'ORD-2848', customer: 'Hassan Farouk', phone: '+20 108 901 2345', product: 'Smart Watch Gen 4', amount: 1500, status: 'shipped', city: 'Giza', date: '2025-05-17', shipping: 'Aramex', notes: 'Tracking: ARX-9923847' },
  { id: 'ORD-2847', customer: 'Mariam Adel', phone: '+20 109 012 3456', product: 'Bluetooth Speaker', amount: 340, status: 'delivered', city: 'Cairo', date: '2025-05-16', shipping: 'Bosta', notes: 'COD collected EGP 340' },
]

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
  { icon: BarChart3, label: 'Analytics', active: false, path: '/analytics' },
  { icon: DollarSign, label: 'Finance', active: false, path: '#' },
  { icon: Truck, label: 'Shipping', active: false, path: '#' },
  { icon: MessageCircle, label: 'WhatsApp', active: false, path: '#' },
  { icon: Users, label: 'Customers', active: false, path: '#' },
]

export default function Orders() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  const filtered = allOrders
    .filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          o.id.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.product.toLowerCase().includes(q) ||
          o.city.toLowerCase().includes(q) ||
          o.phone.includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      if (!sortField) return 0
      const aVal = a[sortField as keyof typeof a]
      const bVal = b[sortField as keyof typeof b]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal
      }
      return 0
    })

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const stats = [
    { label: 'Total Orders', value: allOrders.length.toString(), icon: ShoppingCart, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'New', value: allOrders.filter((o) => o.status === 'new').length.toString(), icon: Package, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Confirmed', value: allOrders.filter((o) => o.status === 'confirmed').length.toString(), icon: CheckCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Shipped', value: allOrders.filter((o) => o.status === 'shipped').length.toString(), icon: Truck, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Delivered', value: allOrders.filter((o) => o.status === 'delivered').length.toString(), icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Returned', value: allOrders.filter((o) => o.status === 'returned').length.toString(), icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
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
          {sidebarItems.map((item) => (
            <button
              key={item.label}
              onClick={() => item.path !== '#' && navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                item.active ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-xs font-bold">A</div>
            <div>
              <div className="text-sm font-medium">Admin User</div>
              <div className="text-xs text-gray-500">Pro Plan</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 lg:ml-64">
        <header className="sticky top-0 z-30 bg-[#060B18]/80 backdrop-blur-lg border-b border-white/5 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Orders</h1>
            <p className="text-xs text-gray-500">Manage COD orders across Egypt</p>
          </div>
          <Button onClick={() => navigate('/')} variant="ghost" size="sm" className="text-gray-400 hover:text-white">Exit to Site</Button>
        </header>

        <div className="p-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {stats.map((s) => (
              <Card key={s.label} className="bg-[#0d1321] border-white/5">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center shrink-0`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{s.value}</div>
                    <div className="text-xs text-gray-500">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search by order ID, customer, product, city..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-[#060B18] border-white/10 text-white placeholder:text-gray-600"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {statusFilters.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                        statusFilter === s ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Orders ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-white/5">
                      <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => toggleSort('id')}>
                        <div className="flex items-center gap-1">Order ID <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => toggleSort('customer')}>
                        <div className="flex items-center gap-1">Customer <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="pb-3 pr-4">Contact</th>
                      <th className="pb-3 pr-4">Product</th>
                      <th className="pb-3 pr-4 cursor-pointer hover:text-white" onClick={() => toggleSort('amount')}>
                        <div className="flex items-center gap-1">Amount <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">City</th>
                      <th className="pb-3 pr-4">Shipping</th>
                      <th className="pb-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((order) => {
                      const cfg = statusConfig[order.status]
                      const StatusIcon = cfg.icon
                      return (
                        <tr key={order.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="py-3 pr-4 text-sm font-mono text-cyan-400">{order.id}</td>
                          <td className="py-3 pr-4 text-sm text-white font-medium">{order.customer}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400">{order.phone}</span>
                              <button className="text-green-400 hover:text-green-300">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              <button className="text-blue-400 hover:text-blue-300">
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-sm text-gray-300">{order.product}</td>
                          <td className="py-3 pr-4 text-sm text-white font-semibold">EGP {order.amount.toLocaleString()}</td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                              <StatusIcon className="w-3 h-3" /> {cfg.label}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-gray-400">{order.city}</td>
                          <td className="py-3 pr-4 text-sm text-gray-400">{order.shipping}</td>
                          <td className="py-3">
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-cyan-400 hover:text-cyan-300">
                              Details
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No orders match your filters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
