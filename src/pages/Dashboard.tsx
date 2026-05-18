import {
  DollarSign, ShoppingCart, Target, Truck, CreditCard,
  BarChart3, MessageCircle, Clock, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2, Package
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useState, useEffect } from 'react'
import { analyticsApi } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'

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

const kpiMeta = [
  { key: 'totalRevenue', title: 'Total Revenue', icon: DollarSign, subtitle: 'vs last month', format: (v: number) => `EGP ${(v || 0).toLocaleString()}`, changeKey: 'revenueChange' },
  { key: 'activeOrders', title: 'Active Orders', icon: ShoppingCart, subtitle: 'total orders', format: (v: number) => `${v || 0}`, changeKey: 'ordersChange' },
  { key: 'confirmationRate', title: 'Confirmation Rate', icon: Target, subtitle: 'target: 80%', format: (v: number) => `${v || 0}%`, changeKey: 'confirmationChange' },
  { key: 'deliveryRate', title: 'Delivery Rate', icon: Truck, subtitle: 'of confirmed', format: (v: number) => `${v || 0}%`, changeKey: 'deliveryChange' },
  { key: 'metaAdSpend', title: 'Meta Ad Spend', icon: CreditCard, subtitle: 'this month', format: (v: number) => `EGP ${(v || 0).toLocaleString()}`, changeKey: 'adSpendChange' },
  { key: 'roas', title: 'ROAS', icon: BarChart3, subtitle: 'avg. return', format: (v: number) => `${v || 0}x`, changeKey: 'roasChange' },
  { key: 'whatsappMessages', title: 'WhatsApp Msgs', icon: MessageCircle, subtitle: 'this week', format: (v: number) => `${(v || 0).toLocaleString()}`, changeKey: 'whatsappChange' },
  { key: 'avgFulfillment', title: 'Avg Fulfillment', icon: Clock, subtitle: 'delivery avg', format: (v: number) => `${v || 0} days`, changeKey: 'fulfillmentChange' },
]

export default function Dashboard() {
  const [kpis, setKpis] = useState<Record<string, number>>({})
  const [orderStatus, setOrderStatus] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [kpiRes, statusRes, actRes] = await Promise.all([
        analyticsApi.kpis(),
        analyticsApi.orderStatus(),
        analyticsApi.activity(),
      ])
      if (kpiRes.success) setKpis(kpiRes.data || {})
      if (statusRes.success) setOrderStatus(statusRes.data || [])
      if (actRes.success) setActivity(actRes.data || [])
    } catch (e) {
      console.error('Dashboard load error:', e)
    }
    setLoading(false)
  }

  const recentActivity = activity.slice(0, 5).map((act: any) => {
    let icon = Package
    let color = 'text-gray-400'
    let bg = 'bg-white/5'
    if (act.status === 'success') { icon = CheckCircle2; color = 'text-green-400'; bg = 'bg-green-500/10' }
    else if (act.status === 'warning') { icon = AlertTriangle; color = 'text-amber-400'; bg = 'bg-amber-500/10' }
    else if (act.status === 'error') { icon = AlertTriangle; color = 'text-red-400'; bg = 'bg-red-500/10' }
    return { ...act, icon, color, bg }
  })

  return (
    <AppLayout title="Dashboard" subtitle="Real-time overview of your e-commerce operations">
      {loading ? (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="bg-[#0d1321] border-white/5">
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-9 w-9 rounded-lg bg-white/5" />
                  <Skeleton className="h-7 w-24 bg-white/5" />
                  <Skeleton className="h-4 w-16 bg-white/5" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-[#0d1321] border-white/5"><CardContent className="p-4"><Skeleton className="h-[240px] w-full bg-white/5" /></CardContent></Card>
            <Card className="bg-[#0d1321] border-white/5"><CardContent className="p-4"><Skeleton className="h-[240px] w-full bg-white/5" /></CardContent></Card>
          </div>
        </>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {kpiMeta.map((kpi) => {
              const value = kpis[kpi.key] || 0
              const change = (kpis as any)[kpi.changeKey] || 0
              const isUp = change > 0
              return (
                <Card key={kpi.key} className="bg-[#0d1321] border-white/5 hover:border-white/10 transition-all">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between mb-2.5">
                      <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                        <kpi.icon className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className={`flex items-center gap-0.5 text-[11px] font-medium ${isUp ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {isUp ? <ArrowUpRight className="w-3 h-3" /> : change < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                        {change > 0 ? '+' : ''}{change}
                      </div>
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-white leading-tight">{kpi.format(value)}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{kpi.subtitle}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Charts Row */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Revenue vs Ad Spend</CardTitle>
                  <span className="text-[11px] text-gray-500">This Month</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#475569" fontSize={11} />
                    <YAxis stroke="#475569" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#06b6d4" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                    <Area type="monotone" dataKey="adSpend" stroke="#3b82f6" fill="transparent" strokeWidth={2} strokeDasharray="4 4" name="Ad Spend" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold">Order Status</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={orderStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {orderStatus.map((entry, i) => (
                        <Cell key={i} fill={orderStatusColors[entry.name] || '#06b6d4'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                  {orderStatus.map(s => (
                    <div key={s.name} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-[11px] text-gray-400">{s.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold">AI Agent Activity</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No recent activity</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((act: any, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-8 h-8 ${act.bg} rounded-lg flex items-center justify-center shrink-0 mt-0.5`}>
                        <act.icon className={`w-4 h-4 ${act.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-300 truncate">{act.action}</p>
                        <p className="text-[11px] text-gray-500">
                          {act.agent_name} — {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppLayout>
  )
}
