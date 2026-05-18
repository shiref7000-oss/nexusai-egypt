import { useState, useEffect } from 'react'
import {
  BarChart3, Target, Eye, MousePointer, ShoppingCart,
  TrendingUp, Truck
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { analyticsApi } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts'

const kpiCards = [
  { key: 'spend', title: 'Ad Spend', icon: BarChart3, color: '#3b82f6' },
  { key: 'revenue', title: 'Revenue', icon: TrendingUp, color: '#06b6d4' },
  { key: 'roas', title: 'ROAS', icon: Target, color: '#10b981' },
  { key: 'ctr', title: 'Avg CTR', icon: Eye, color: '#f59e0b' },
  { key: 'cpa', title: 'Avg CPA', icon: MousePointer, color: '#8b5cf6' },
  { key: 'conversions', title: 'Conversions', icon: ShoppingCart, color: '#ec4899' },
]

const revenueData = [
  { day: 'Mon', spend: 18500, revenue: 72000 },
  { day: 'Tue', spend: 21200, revenue: 89000 },
  { day: 'Wed', spend: 19800, revenue: 81000 },
  { day: 'Thu', spend: 22400, revenue: 95000 },
  { day: 'Fri', spend: 25100, revenue: 102000 },
  { day: 'Sat', spend: 16800, revenue: 68000 },
  { day: 'Sun', spend: 14200, revenue: 54000 },
]

export default function Analytics() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [shipping, setShipping] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('media')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [campRes, shipRes] = await Promise.all([
        analyticsApi.campaigns(),
        analyticsApi.shipping(),
      ])
      if (campRes.success) setCampaigns(campRes.data || [])
      if (shipRes.success) setShipping(shipRes.data || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const totalSpend = campaigns.reduce((s, c: any) => s + (c.spend || 0), 0)
  const totalRevenue = campaigns.reduce((s, c: any) => s + (c.revenue || 0), 0)
  const avgRoas = campaigns.length > 0 ? (campaigns.reduce((s, c: any) => s + (c.roas || 0), 0) / campaigns.length) : 0
  const avgCpa = campaigns.length > 0 ? Math.round(campaigns.reduce((s, c: any) => s + (c.cpa || 0), 0) / campaigns.length) : 0
  const avgCtr = campaigns.length > 0 ? (campaigns.reduce((s, c: any) => s + (c.ctr || 0), 0) / campaigns.length).toFixed(2) : 0
  const totalConversions = campaigns.reduce((s, c: any) => s + (c.conversions || 0), 0)

  const kpis = { spend: totalSpend, revenue: totalRevenue, roas: avgRoas, cpa: avgCpa, ctr: avgCtr, conversions: totalConversions }

  return (
    <AppLayout title="Analytics" subtitle="Media buying & shipping performance">
      {/* KPI Row */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-[#0d1321] border-white/5"><CardContent className="p-3 space-y-2">
              <Skeleton className="h-8 w-8 rounded-lg bg-white/5" />
              <Skeleton className="h-5 w-16 bg-white/5" />
              <Skeleton className="h-3 w-12 bg-white/5" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpiCards.map(kpi => (
            <Card key={kpi.key} className="bg-[#0d1321] border-white/5 hover:border-white/10 transition-all">
              <CardContent className="p-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: kpi.color + '15' }}>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
                </div>
                <div className="text-lg font-bold text-white leading-tight">
                  {kpi.key === 'spend' || kpi.key === 'revenue' || kpi.key === 'cpa'
                    ? `EGP ${(kpis as any)[kpi.key]?.toLocaleString() || 0}`
                    : kpi.key === 'roas' ? `${(kpis as any)[kpi.key]?.toFixed(1) || 0}x`
                    : kpi.key === 'ctr' ? `${(kpis as any)[kpi.key]}%`
                    : (kpis as any)[kpi.key]?.toLocaleString() || 0}
                </div>
                <div className="text-[11px] text-gray-500">{kpi.title}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-[#0d1321] border border-white/5 h-9 p-0.5">
          <TabsTrigger value="media" className="text-xs data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 h-7 px-3">
            <BarChart3 className="w-3 h-3 mr-1.5" />Media Buying
          </TabsTrigger>
          <TabsTrigger value="shipping" className="text-xs data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 h-7 px-3">
            <Truck className="w-3 h-3 mr-1.5" />Shipping
          </TabsTrigger>
        </TabsList>

        {/* Media Buying */}
        <TabsContent value="media" className="space-y-4 mt-4">
          {/* Chart */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold">Daily Spend vs Revenue</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" stroke="#475569" fontSize={11} />
                  <YAxis stroke="#475569" fontSize={11} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="spend" stroke="#3b82f6" fill="url(#spGrad)" strokeWidth={2} name="Ad Spend" />
                  <Area type="monotone" dataKey="revenue" stroke="#06b6d4" fill="url(#rvGrad)" strokeWidth={2} name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Campaign Table */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold">Campaign Performance</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full bg-white/5" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] text-gray-500 border-b border-white/5">
                        {['Campaign', 'Spend', 'Revenue', 'ROAS', 'CPA', 'CTR', 'Conv'].map(h => (
                          <th key={h} className="pb-2.5 pr-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c: any) => (
                        <tr key={c.id} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.01]">
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${c.status === 'active' ? 'bg-green-400' : c.status === 'paused' ? 'bg-amber-400' : 'bg-gray-500'}`} />
                              <span className="text-xs text-white font-medium">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-gray-400">EGP {c.spend?.toLocaleString()}</td>
                          <td className="py-2.5 pr-4 text-xs text-cyan-400">EGP {c.revenue?.toLocaleString()}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`text-xs font-semibold ${c.roas >= 3 ? 'text-green-400' : c.roas >= 2.5 ? 'text-cyan-400' : 'text-amber-400'}`}>{c.roas}x</span>
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-gray-400">EGP {c.cpa}</td>
                          <td className="py-2.5 pr-4 text-xs text-gray-400">{c.ctr}%</td>
                          <td className="py-2.5 text-xs text-white">{c.conversions?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shipping */}
        <TabsContent value="shipping" className="space-y-4 mt-4">
          {loading ? (
            <div className="grid sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="bg-[#0d1321] border-white/5"><CardContent className="p-4 space-y-3">
                  <Skeleton className="h-6 w-20 bg-white/5" />
                  {Array.from({ length: 5 }).map((_, j) => <Skeleton key={j} className="h-4 w-full bg-white/5" />)}
                </CardContent></Card>
              ))}
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                {shipping.map((s: any) => (
                  <Card key={s.carrier} className="bg-[#0d1321] border-white/5">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold">{s.carrier}</h3>
                        <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                          <Truck className="w-4 h-4 text-cyan-400" />
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        {[
                          ['Orders', s.orders, 'text-white'],
                          ['Delivered', s.delivered, 'text-green-400'],
                          ['Returned', s.returned, 'text-red-400'],
                          ['COD Collection', `${s.cod}%`, 'text-cyan-400'],
                          ['Avg Delivery', `${s.avgDays} days`, 'text-white'],
                        ].map(([label, value, color]) => (
                          <div key={label as string} className="flex justify-between text-xs">
                            <span className="text-gray-400">{label}</span>
                            <span className={`font-medium ${color}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">Delivery Rate</span>
                          <span className="text-green-400 font-medium">{s.deliveryRate}%</span>
                        </div>
                        <div className="mt-1.5 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-400 to-green-400 rounded-full transition-all" style={{ width: `${s.deliveryRate}%` }} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Carrier Comparison Chart */}
              <Card className="bg-[#0d1321] border-white/5">
                <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-sm font-semibold">Carrier Comparison</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={shipping}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="carrier" stroke="#475569" fontSize={11} />
                      <YAxis stroke="#475569" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="orders" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Total" />
                      <Bar dataKey="delivered" fill="#10b981" radius={[4, 4, 0, 0]} name="Delivered" />
                      <Bar dataKey="returned" fill="#ef4444" radius={[4, 4, 0, 0]} name="Returned" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  )
}
