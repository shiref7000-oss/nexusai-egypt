import { useNavigate } from 'react-router-dom'
import {
  BarChart3, TrendingUp, DollarSign, Target, Eye, MousePointer,
  ShoppingCart, Truck, ArrowUpRight,
  MapPin, Calendar
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts'

const dailySpendData = [
  { day: 'Mon', spend: 18500, revenue: 72000, impressions: 245000, clicks: 3200 },
  { day: 'Tue', spend: 21200, revenue: 89000, impressions: 278000, clicks: 3800 },
  { day: 'Wed', spend: 19800, revenue: 81000, impressions: 262000, clicks: 3500 },
  { day: 'Thu', spend: 22400, revenue: 95000, impressions: 290000, clicks: 4100 },
  { day: 'Fri', spend: 25100, revenue: 102000, impressions: 310000, clicks: 4500 },
  { day: 'Sat', spend: 16800, revenue: 68000, impressions: 198000, clicks: 2800 },
  { day: 'Sun', spend: 14200, revenue: 54000, impressions: 175000, clicks: 2400 },
]

const campaignData = [
  { name: 'Cairo Beauty', spend: 52000, revenue: 208000, roas: 4.0, cpa: 45, ctr: 2.8, conversions: 1156 },
  { name: 'Alex Tech', spend: 38000, revenue: 114000, roas: 3.0, cpa: 62, ctr: 2.1, conversions: 613 },
  { name: 'Giza Fashion', spend: 31000, revenue: 86800, roas: 2.8, cpa: 58, ctr: 2.4, conversions: 534 },
  { name: 'Delta Home', spend: 22000, revenue: 55000, roas: 2.5, cpa: 73, ctr: 1.9, conversions: 301 },
  { name: 'Upper Egypt', spend: 15000, revenue: 36000, roas: 2.4, cpa: 79, ctr: 1.7, conversions: 190 },
]

const cityData = [
  { city: 'Cairo', orders: 456, revenue: 342000, delivery: 94, cod: 98 },
  { city: 'Alexandria', orders: 234, revenue: 156000, delivery: 91, cod: 97 },
  { city: 'Giza', orders: 189, revenue: 128000, delivery: 89, cod: 96 },
  { city: 'Mansoura', orders: 98, revenue: 67000, delivery: 87, cod: 95 },
  { city: 'Tanta', orders: 67, revenue: 45000, delivery: 85, cod: 94 },
  { city: 'Port Said', orders: 54, revenue: 38000, delivery: 88, cod: 93 },
]

const shippingData = [
  { carrier: 'Bosta', orders: 623, delivered: 589, returned: 24, cod: 98.2, avgDays: 2.1 },
  { carrier: 'Aramex', orders: 312, delivered: 291, returned: 15, cod: 97.8, avgDays: 2.4 },
  { carrier: 'VHub', orders: 198, delivered: 182, returned: 12, cod: 96.5, avgDays: 2.8 },
]

const funnelData = [
  { stage: 'Ad View', value: 2450000, color: '#06b6d4' },
  { stage: 'Click', value: 32000, color: '#3b82f6' },
  { stage: 'Add to Cart', value: 8400, color: '#8b5cf6' },
  { stage: 'Initiate Checkout', value: 5200, color: '#f59e0b' },
  { stage: 'Confirmed', value: 2180, color: '#10b981' },
  { stage: 'Delivered', value: 1135, color: '#22c55e' },
]

const kpiCards = [
  { title: 'Total Ad Spend', value: 'EGP 157,500', change: '+12.3%', trend: 'up' as const, icon: DollarSign },
  { title: 'Total Revenue', value: 'EGP 591,800', change: '+18.7%', trend: 'up' as const, icon: TrendingUp },
  { title: 'Overall ROAS', value: '3.76x', change: '+0.4x', trend: 'up' as const, icon: Target },
  { title: 'Avg CPA', value: 'EGP 58', change: '-EGP 7', trend: 'up' as const, icon: MousePointer },
  { title: 'Avg CTR', value: '2.33%', change: '+0.15%', trend: 'up' as const, icon: Eye },
  { title: 'Conversions', value: '2,794', change: '+22.1%', trend: 'up' as const, icon: ShoppingCart },
]

export default function Analytics() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#060B18] text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#060B18]/80 backdrop-blur-lg border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-xs text-gray-500">Media buying & shipping performance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-400">Last 30 days</span>
          </div>
          <Button onClick={() => navigate('/')} variant="ghost" size="sm" className="text-gray-400 hover:text-white">Exit to Site</Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.title} className="bg-[#0d1321] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                    <kpi.icon className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-green-400">
                    <ArrowUpRight className="w-3 h-3" />
                    {kpi.change}
                  </div>
                </div>
                <div className="text-2xl font-bold text-white mb-0.5">{kpi.value}</div>
                <div className="text-xs text-gray-500">{kpi.title}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="media" className="w-full">
          <TabsList className="bg-[#0d1321] border border-white/5 mb-4">
            <TabsTrigger value="media" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Media Buying
            </TabsTrigger>
            <TabsTrigger value="shipping" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              <Truck className="w-3.5 h-3.5 mr-1.5" /> Shipping
            </TabsTrigger>
            <TabsTrigger value="funnel" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              <Target className="w-3.5 h-3.5 mr-1.5" /> Funnel
            </TabsTrigger>
            <TabsTrigger value="cities" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              <MapPin className="w-3.5 h-3.5 mr-1.5" /> Cities
            </TabsTrigger>
          </TabsList>

          {/* Media Buying Tab */}
          <TabsContent value="media" className="space-y-6">
            {/* Spend vs Revenue Chart */}
            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Daily Spend vs Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dailySpendData}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="spend" stroke="#3b82f6" fill="url(#spendGrad)" strokeWidth={2} name="Ad Spend" />
                    <Area type="monotone" dataKey="revenue" stroke="#06b6d4" fill="url(#revGrad2)" strokeWidth={2} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Campaign Table */}
            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Campaign Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-white/5">
                        <th className="pb-3 pr-4">Campaign</th>
                        <th className="pb-3 pr-4">Spend</th>
                        <th className="pb-3 pr-4">Revenue</th>
                        <th className="pb-3 pr-4">ROAS</th>
                        <th className="pb-3 pr-4">CPA</th>
                        <th className="pb-3 pr-4">CTR</th>
                        <th className="pb-3">Conversions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignData.map((c) => (
                        <tr key={c.name} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="py-3 pr-4 text-sm font-medium text-white">{c.name}</td>
                          <td className="py-3 pr-4 text-sm text-gray-400">EGP {c.spend.toLocaleString()}</td>
                          <td className="py-3 pr-4 text-sm text-cyan-400">EGP {c.revenue.toLocaleString()}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-sm font-semibold ${c.roas >= 3 ? 'text-green-400' : c.roas >= 2.5 ? 'text-cyan-400' : 'text-amber-400'}`}>
                              {c.roas}x
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-gray-400">EGP {c.cpa}</td>
                          <td className="py-3 pr-4 text-sm text-gray-400">{c.ctr}%</td>
                          <td className="py-3 text-sm text-white">{c.conversions.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shipping Tab */}
          <TabsContent value="shipping" className="space-y-6">
            <div className="grid lg:grid-cols-3 gap-4">
              {shippingData.map((s) => (
                <Card key={s.carrier} className="bg-[#0d1321] border-white/5">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-white">{s.carrier}</h3>
                      <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                        <Truck className="w-4 h-4 text-cyan-400" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Orders</span>
                        <span className="text-white font-medium">{s.orders}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Delivered</span>
                        <span className="text-green-400 font-medium">{s.delivered}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Returned</span>
                        <span className="text-red-400 font-medium">{s.returned}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">COD Collection</span>
                        <span className="text-cyan-400 font-medium">{s.cod}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Avg. Delivery</span>
                        <span className="text-white font-medium">{s.avgDays} days</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Delivery Rate</span>
                        <span className="text-green-400 font-medium">{((s.delivered / s.orders) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="mt-2 w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-400 to-green-400 rounded-full" style={{ width: `${(s.delivered / s.orders) * 100}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Carrier Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={shippingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="carrier" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Bar dataKey="orders" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Total Orders" />
                    <Bar dataKey="delivered" fill="#10b981" radius={[4, 4, 0, 0]} name="Delivered" />
                    <Bar dataKey="returned" fill="#ef4444" radius={[4, 4, 0, 0]} name="Returned" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Funnel Tab */}
          <TabsContent value="funnel" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="bg-[#0d1321] border-white/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Conversion Funnel</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {funnelData.map((stage, i) => {
                      const prev = i > 0 ? funnelData[i - 1].value : stage.value
                      const dropoff = i > 0 ? (((prev - stage.value) / prev) * 100).toFixed(1) : '0'
                      const maxVal = funnelData[0].value
                      return (
                        <div key={stage.stage}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-white">{stage.stage}</span>
                            <div className="flex items-center gap-3">
                              {i > 0 && <span className="text-xs text-red-400">-{dropoff}%</span>}
                              <span className="text-sm font-semibold text-white">{(stage.value / 1000).toFixed(0)}k</span>
                            </div>
                          </div>
                          <div className="w-full h-6 bg-white/5 rounded-lg overflow-hidden relative">
                            <div className="h-full rounded-lg flex items-center px-2" style={{ width: `${(stage.value / maxVal) * 100}%`, backgroundColor: stage.color + '40', border: `1px solid ${stage.color}` }}>
                              <span className="text-xs font-medium" style={{ color: stage.color }}>
                                {((stage.value / maxVal) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#0d1321] border-white/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Key Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Eye className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm text-gray-300">View to Click</span>
                    </div>
                    <span className="text-sm font-semibold text-white">1.31%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <MousePointer className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-gray-300">Click to Cart</span>
                    </div>
                    <span className="text-sm font-semibold text-white">26.25%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <ShoppingCart className="w-4 h-4 text-purple-400" />
                      <span className="text-sm text-gray-300">Cart to Checkout</span>
                    </div>
                    <span className="text-sm font-semibold text-white">61.90%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-gray-300">Checkout to Confirm</span>
                    </div>
                    <span className="text-sm font-semibold text-white">41.92%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Truck className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-gray-300">Confirm to Deliver</span>
                    </div>
                    <span className="text-sm font-semibold text-white">52.06%</span>
                  </div>
                  <div className="pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Overall Conversion</span>
                      <span className="text-lg font-bold text-green-400">0.046%</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">Views to delivered orders</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Cities Tab */}
          <TabsContent value="cities" className="space-y-6">
            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">City Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-white/5">
                        <th className="pb-3 pr-4">City</th>
                        <th className="pb-3 pr-4">Orders</th>
                        <th className="pb-3 pr-4">Revenue</th>
                        <th className="pb-3 pr-4">Delivery %</th>
                        <th className="pb-3">COD Collection %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cityData.map((c) => (
                        <tr key={c.city} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-cyan-400" />
                              <span className="text-sm font-medium text-white">{c.city}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-sm text-white">{c.orders}</td>
                          <td className="py-3 pr-4 text-sm text-cyan-400">EGP {c.revenue.toLocaleString()}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-green-400 rounded-full" style={{ width: `${c.delivery}%` }} />
                              </div>
                              <span className="text-sm text-green-400">{c.delivery}%</span>
                            </div>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${c.cod}%` }} />
                              </div>
                              <span className="text-sm text-cyan-400">{c.cod}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Revenue by City</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={cityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#475569" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                    <YAxis dataKey="city" type="category" stroke="#475569" fontSize={12} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Bar dataKey="revenue" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
