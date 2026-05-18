import { useNavigate } from 'react-router-dom'
import {
  DollarSign, ShoppingCart, Users, Truck, Target, MessageCircle,
  Activity, CreditCard, Clock, BarChart3, Brain
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useState, useEffect } from 'react'
import { analyticsApi } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'

interface KPI {
  title: string; value: string; change: string; trend: 'up' | 'down'; icon: any; subtitle: string;
}

const revenueData = [
  { name: 'Week 1', revenue: 145000, adSpend: 28000 },
  { name: 'Week 2', revenue: 168000, adSpend: 32000 },
  { name: 'Week 3', revenue: 192000, adSpend: 35000 },
  { name: 'Week 4', revenue: 210000, adSpend: 29000 },
  { name: 'Week 5', revenue: 132320, adSpend: 0 },
]

const orderStatusColors: Record<string, string> = {
  Delivered: '#06b6d4', Confirmed: '#3b82f6', Pending: '#f59e0b', Returned: '#ef4444', Cancelled: '#6b7280',
}

const sidebarItems = [
  { icon: Activity, label: 'Dashboard', active: true, path: '/dashboard' },
  { icon: ShoppingCart, label: 'Orders', active: false, path: '/orders' },
  { icon: Brain, label: 'AI Agents', active: false, path: '/agents' },
  { icon: BarChart3, label: 'Analytics', active: false, path: '/analytics' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<KPI[]>([])
  const [orderStatus, setOrderStatus] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const kpiRes = await analyticsApi.kpis()
        if (kpiRes.success && kpiRes.data) {
          const d = kpiRes.data
          setKpis([
            { title: 'Total Revenue', value: `EGP ${d.totalRevenue?.toLocaleString() || 0}`, change: `${d.revenueChange > 0 ? '+' : ''}${d.revenueChange}%`, trend: d.revenueChange > 0 ? 'up' : 'down', icon: DollarSign, subtitle: 'vs last month' },
            { title: 'Active Orders', value: `${d.activeOrders || 0}`, change: `${d.ordersChange > 0 ? '+' : ''}${d.ordersChange}%`, trend: d.ordersChange > 0 ? 'up' : 'down', icon: ShoppingCart, subtitle: 'total orders' },
            { title: 'Confirmation Rate', value: `${d.confirmationRate || 0}%`, change: `${d.confirmationChange > 0 ? '+' : ''}${d.confirmationChange}%`, trend: d.confirmationChange > 0 ? 'up' : 'down', icon: Target, subtitle: 'target: 80%' },
            { title: 'Delivery Rate', value: `${d.deliveryRate || 0}%`, change: `${d.deliveryChange > 0 ? '+' : ''}${d.deliveryChange}%`, trend: d.deliveryChange > 0 ? 'up' : 'down', icon: Truck, subtitle: 'of confirmed' },
            { title: 'Meta Ad Spend', value: `EGP ${d.metaAdSpend?.toLocaleString() || 0}`, change: `${d.adSpendChange > 0 ? '+' : ''}${d.adSpendChange}%`, trend: d.adSpendChange > 0 ? 'up' : 'down', icon: CreditCard, subtitle: 'this month' },
            { title: 'ROAS', value: `${d.roas || 0}x`, change: `+${d.roasChange}x`, trend: 'up', icon: BarChart3, subtitle: 'avg. return' },
            { title: 'WhatsApp Messages', value: `${d.whatsappMessages?.toLocaleString() || 0}`, change: `+${d.whatsappChange}%`, trend: 'up', icon: MessageCircle, subtitle: 'this week' },
            { title: 'Avg. Fulfillment', value: `${d.avgFulfillment || 0} days`, change: `${d.fulfillmentChange} days`, trend: 'up', icon: Clock, subtitle: 'delivery avg' },
          ])
        }

        const statusRes = await analyticsApi.orderStatus()
        if (statusRes.success) setOrderStatus(statusRes.data || [])

        const actRes = await analyticsApi.activity()
        if (actRes.success) setActivity(actRes.data || [])
      } catch (e) {
        console.error('Dashboard load error:', e)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('nexusai_token')
    navigate('/signin')
  }

  return (
    <div className="min-h-screen bg-[#060B18] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0f1a] border-r border-white/5 fixed h-full hidden lg:flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-white/5">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
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
        <div className="p-4 border-t border-white/5">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <Users className="w-4 h-4" />Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 lg:ml-64">
        <header className="sticky top-0 z-30 bg-[#060B18]/80 backdrop-blur-lg border-b border-white/5 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-xs text-gray-500">Real-time overview of your operations</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-green-500/10 rounded-full px-3 py-1.5">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </div>
            <Button onClick={() => navigate('/')} variant="ghost" size="sm" className="text-gray-400 hover:text-white">Exit</Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {loading && <div className="text-center py-12 text-gray-500">Loading dashboard data...</div>}

          {/* KPI Grid */}
          {!loading && kpis.length > 0 && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {kpis.map(kpi => (
                <Card key={kpi.title} className="bg-[#0d1321] border-white/5 hover:border-cyan-500/20 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                        <kpi.icon className="w-4 h-4 text-cyan-400" />
                      </div>
                      <span className={`text-xs ${kpi.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                        {kpi.change}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-white mb-0.5">{kpi.value}</div>
                    <div className="text-xs text-gray-500">{kpi.subtitle}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Charts Row */}
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Revenue vs Ad Spend</CardTitle>
                  <span className="text-xs text-gray-500">This Month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#06b6d4" fill="url(#revGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="adSpend" stroke="#3b82f6" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Order Status</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={orderStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {orderStatus.map((entry, i) => (
                        <Cell key={i} fill={orderStatusColors[entry.name] || '#06b6d4'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {orderStatus.map(s => (
                    <div key={s.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-gray-400">{s.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">AI Agent Activity</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {activity.length === 0 && <p className="text-sm text-gray-500">No recent activity</p>}
              {activity.slice(0, 5).map((act: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${act.status === 'success' ? 'bg-green-500/10' : act.status === 'warning' ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
                    <Activity className={`w-4 h-4 ${act.status === 'success' ? 'text-green-400' : act.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">{act.action}</p>
                    <p className="text-xs text-gray-500">{new Date(act.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
