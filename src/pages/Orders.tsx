import { useState, useEffect } from 'react'
import {
  ShoppingCart, Search, ArrowUpDown, Package, MessageCircle, Phone,
  CheckCircle, XCircle, Truck, Plus, Trash2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ordersApi } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout'

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: typeof CheckCircle }> = {
  new: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'New', icon: Package },
  confirmed: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Confirmed', icon: CheckCircle },
  shipped: { color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Shipped', icon: Truck },
  delivered: { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Delivered', icon: CheckCircle },
  returned: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Returned', icon: XCircle },
  cancelled: { color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Cancelled', icon: XCircle },
}

const statusFilters = ['all', 'new', 'confirmed', 'shipped', 'delivered', 'returned', 'cancelled']

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortField, setSortField] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', product: '', amount: '', city: '', shipping_carrier: 'Bosta', notes: '' })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [ordersRes, statsRes] = await Promise.all([
        ordersApi.list().catch(() => ({ success: true, data: [], meta: { total: 0 } })),
        ordersApi.stats().catch(() => ({ success: true, data: {} }))
      ])
      if (ordersRes.success) setOrders(ordersRes.data || [])
      if (statsRes.success) setStats(statsRes.data || {})
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    const res = await ordersApi.create({ ...form, amount: parseFloat(form.amount) })
    if (res.success) {
      setShowForm(false)
      setForm({ customer_name: '', customer_phone: '', product: '', amount: '', city: '', shipping_carrier: 'Bosta', notes: '' })
      loadData()
    }
    setCreating(false)
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    const res = await ordersApi.updateStatus(id, newStatus)
    if (res.success) loadData()
  }

  const handleDelete = async (id: string) => {
    const res = await ordersApi.delete(id)
    if (res.success) loadData()
  }

  const filtered = orders
    .filter((o: any) => statusFilter === 'all' || o.status === statusFilter)
    .filter((o: any) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (o.order_id + o.customer_name + o.product + o.city).toLowerCase().includes(q)
    })
    .sort((a: any, b: any) => {
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
    <AppLayout title="Orders" subtitle="Manage COD orders across Egypt">
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-[#0d1321] border-white/5"><CardContent className="p-3"><Skeleton className="h-10 w-full bg-white/5" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {statCards.map(s => (
            <Card key={s.label} className="bg-[#0d1321] border-white/5">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <div className="text-lg font-bold text-white leading-tight">{s.value}</div>
                  <div className="text-[11px] text-gray-500">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <Card className="bg-[#0d1321] border-white/5">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
              <Input placeholder="Search orders..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 bg-[#060B18] border-white/10 text-white placeholder:text-gray-600 h-9 text-sm" />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {statusFilters.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                  {s}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setShowForm(!showForm)}
              className="shrink-0 bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:opacity-90 h-9 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />{showForm ? 'Cancel' : 'New'}
            </Button>
          </div>

          {/* Inline Create Form */}
          {showForm && (
            <form onSubmit={handleCreate} className="mt-4 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input required placeholder="Customer Name" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})}
                className="bg-[#060B18] border-white/10 text-white h-9 text-sm" />
              <Input required placeholder="Phone (+20...)" value={form.customer_phone} onChange={e => setForm({...form, customer_phone: e.target.value})}
                className="bg-[#060B18] border-white/10 text-white h-9 text-sm" />
              <Input required placeholder="Product" value={form.product} onChange={e => setForm({...form, product: e.target.value})}
                className="bg-[#060B18] border-white/10 text-white h-9 text-sm" />
              <div className="flex gap-3">
                <Input required type="number" min="0" placeholder="Amount (EGP)" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
                  className="bg-[#060B18] border-white/10 text-white h-9 text-sm flex-1" />
                <Input required placeholder="City" value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                  className="bg-[#060B18] border-white/10 text-white h-9 text-sm flex-1" />
              </div>
              <select value={form.shipping_carrier} onChange={e => setForm({...form, shipping_carrier: e.target.value})}
                className="h-9 px-3 rounded-md bg-[#060B18] border border-white/10 text-white text-sm">
                {['Bosta', 'Aramex', 'VHub'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Button type="submit" disabled={creating}
                className="bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold h-9 text-sm">
                {creating ? 'Creating...' : 'Create Order'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Orders Table */}
      {loading ? (
        <Card className="bg-[#0d1321] border-white/5">
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-white/5" />)}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#0d1321] border-white/5">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">Orders ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {/* Mobile */}
            <div className="sm:hidden space-y-3">
              {filtered.map((order: any) => {
                const cfg = statusConfig[order.status]
                const StatusIcon = cfg.icon
                return (
                  <div key={order.id} className="bg-white/[0.02] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-cyan-400">{order.order_id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon className="w-3 h-3 inline mr-1" />{cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-white font-medium">{order.customer_name}</p>
                    <p className="text-xs text-gray-400">{order.product} — {order.city}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">EGP {order.amount?.toLocaleString()}</span>
                      <select value={order.status} onChange={e => handleStatusChange(order.id, e.target.value)}
                        className="h-7 px-2 rounded bg-white/5 border border-white/10 text-[11px] text-white">
                        {Object.keys(statusConfig).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] text-gray-500 border-b border-white/5">
                    <th className="pb-2.5 pr-3"><button onClick={() => toggleSort('order_id')} className="flex items-center gap-1 hover:text-white">Order <ArrowUpDown className="w-3 h-3" /></button></th>
                    <th className="pb-2.5 pr-3"><button onClick={() => toggleSort('customer_name')} className="flex items-center gap-1 hover:text-white">Customer <ArrowUpDown className="w-3 h-3" /></button></th>
                    <th className="pb-2.5 pr-3">Contact</th>
                    <th className="pb-2.5 pr-3">Product</th>
                    <th className="pb-2.5 pr-3">Amount</th>
                    <th className="pb-2.5 pr-3">Status</th>
                    <th className="pb-2.5 pr-3">City</th>
                    <th className="pb-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order: any) => {
                    const cfg = statusConfig[order.status]
                    const StatusIcon = cfg.icon
                    return (
                      <tr key={order.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.01]">
                        <td className="py-2.5 pr-3 text-xs font-mono text-cyan-400">{order.order_id}</td>
                        <td className="py-2.5 pr-3 text-xs text-white font-medium">{order.customer_name}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-gray-400">{order.customer_phone}</span>
                            <MessageCircle className="w-3 h-3 text-green-400" />
                            <Phone className="w-3 h-3 text-blue-400" />
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-gray-300 max-w-[120px] truncate">{order.product}</td>
                        <td className="py-2.5 pr-3 text-xs text-white font-semibold">EGP {order.amount?.toLocaleString()}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />{cfg.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-gray-400">{order.city}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1">
                            <select value={order.status} onChange={e => handleStatusChange(order.id, e.target.value)}
                              className="h-7 px-2 rounded bg-white/5 border border-white/10 text-[11px] text-white">
                              {Object.keys(statusConfig).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button onClick={() => handleDelete(order.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-10 text-gray-500"><Package className="w-8 h-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No orders found</p></div>
            )}
          </CardContent>
        </Card>
      )}
    </AppLayout>
  )
}
