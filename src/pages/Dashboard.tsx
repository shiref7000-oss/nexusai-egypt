import { useNavigate } from 'react-router-dom'
import {
  DollarSign, ShoppingCart, Users,
  Truck, Target, MessageCircle, Activity, ArrowUpRight,
  ArrowDownRight, CreditCard, Clock, BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'

const kpiData = [
  { title: 'Total Revenue', value: 'EGP 847,320', change: '+12.5%', trend: 'up' as const, icon: DollarSign, subtitle: 'vs last month' },
  { title: 'Active Orders', value: '156', change: '+8.2%', trend: 'up' as const, icon: ShoppingCart, subtitle: '23 pending confirmation' },
  { title: 'Confirmation Rate', value: '78.4%', change: '-2.1%', trend: 'down' as const, icon: Target, subtitle: 'target: 80%' },
  { title: 'Delivery Rate', value: '52.1%', change: '+3.8%', trend: 'up' as const, icon: Truck, subtitle: 'of confirmed orders' },
  { title: 'Meta Ad Spend', value: 'EGP 124,500', change: '+15.3%', trend: 'up' as const, icon: CreditCard, subtitle: 'this month' },
  { title: 'ROAS', value: '3.2x', change: '+0.4x', trend: 'up' as const, icon: BarChart3, subtitle: 'avg. return' },
  { title: 'WhatsApp Messages', value: '2,847', change: '+24.6%', trend: 'up' as const, icon: MessageCircle, subtitle: 'sent this week' },
  { title: 'Avg. Fulfillment', value: '2.4 days', change: '-0.3 days', trend: 'up' as const, icon: Clock, subtitle: 'improvement' },
]

const revenueData = [
  { name: 'Week 1', revenue: 145000, adSpend: 28000 },
  { name: 'Week 2', revenue: 168000, adSpend: 32000 },
  { name: 'Week 3', revenue: 192000, adSpend: 35000 },
  { name: 'Week 4', revenue: 210000, adSpend: 29000 },
  { name: 'Week 5', revenue: 132320, adSpend: 0 },
]

const orderStatusData = [
  { name: 'Delivered', value: 52, color: '#06b6d4' },
  { name: 'Confirmed', value: 26, color: '#3b82f6' },
  { name: 'Pending', value: 12, color: '#f59e0b' },
  { name: 'Returned', value: 6, color: '#ef4444' },
  { name: 'Cancelled', value: 4, color: '#6b7280' },
]

const campaignData = [
  { name: 'Cairo - Cosmetics', spend: 45000, revenue: 180000, roas: 4.0 },
  { name: 'Alex - Electronics', spend: 32000, revenue: 96000, roas: 3.0 },
  { name: 'Giza - Fashion', spend: 28000, revenue: 78400, roas: 2.8 },
  { name: 'Delta - Home', spend: 19500, revenue: 48750, roas: 2.5 },
]

const recentOrders = [
  { id: 'ORD-2847', customer: 'Mohamed Ali', product: 'iPhone 15 Case', amount: 450, status: 'confirmed', city: 'Cairo', time: '2 min ago' },
  { id: 'ORD-2846', customer: 'Sara Ahmed', product: 'Vitamin C Serum', amount: 320, status: 'new', city: 'Alexandria', time: '5 min ago' },
  { id: 'ORD-2845', customer: 'Khaled Omar', product: 'Wireless Earbuds', amount: 680, status: 'shipped', city: 'Giza', time: '12 min ago' },
  { id: 'ORD-2844', customer: 'Nour Hassan', product: 'LED Desk Lamp', amount: 290, status: 'delivered', city: 'Mansoura', time: '18 min ago' },
  { id: 'ORD-2843', customer: 'Amr Khaled', product: 'Running Shoes', amount: 890, status: 'returned', city: 'Tanta', time: '32 min ago' },
]

const recentActivity = [
  { icon: MessageCircle, text: 'Moderator AI confirmed order #2847 via WhatsApp', time: '2 min ago', color: 'text-green-400', bg: 'bg-green-400/10' },
  { icon: Target, text: 'Meta Ads Live: ROAS dropped to 2.8x on Campaign "Giza"', time: '8 min ago', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { icon: Truck, text: 'Shipping Agent: Bosta delivered 12 orders in Cairo zone', time: '15 min ago', color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  { icon: DollarSign, text: 'Finance Agent: Daily P&L report generated (EGP +12,400)', time: '1 hour ago', color: 'text-blue-400', bg: 'bg-blue-400/10' },
]

const statusColors: Record<string, string> = {
  new: 'bg-amber-500/10 text-amber-400',
  confirmed: 'bg-blue-500/10 text-blue-400',
  shipped: 'bg-purple-500/10 text-purple-400',
  delivered: 'bg-green-500/10 text-green-400',
  returned: 'bg-red-500/10 text-red-400',
  cancelled: 'bg-gray-500/10 text-gray-400',
}

const sidebarItems = [
  { icon: Activity, label: 'Dashboard', active: true, path: '/dashboard' },
  { icon: ShoppingCart, label: 'Orders', active: false, path: '/orders' },
  { icon: BarChart3, label: 'Analytics', active: false, path: '/analytics' },
  { icon: DollarSign, label: 'Finance', active: false, path: '#' },
  { icon: Truck, label: 'Shipping', active: false, path: '#' },
  { icon: MessageCircle, label: 'WhatsApp', active: false, path: '#' },
  { icon: Users, label: 'Customers', active: false, path: '#' },
]

export default function Dashboard() {
  const navigate = useNavigate()

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
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-xs font-bold">
              A
            </div>
            <div>
              <div className="text-sm font-medium">Admin User</div>
              <div className="text-xs text-gray-500">Pro Plan</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#060B18]/80 backdrop-blur-lg border-b border-white/5 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-xs text-gray-500">Real-time overview of your e-commerce operations</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-green-500/10 rounded-full px-3 py-1.5">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </div>
            <Button onClick={() => navigate('/')} variant="ghost" size="sm" className="text-gray-400 hover:text-white">
              Exit to Site
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* KPI Grid */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {kpiData.map((kpi) => (
              <Card key={kpi.title} className="bg-[#0d1321] border-white/5 hover:border-cyan-500/20 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                      <kpi.icon className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${kpi.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                      {kpi.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {kpi.change}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-white mb-0.5">{kpi.value}</div>
                  <div className="text-xs text-gray-500">{kpi.subtitle}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Revenue Chart */}
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
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#06b6d4" fill="url(#revGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="adSpend" stroke="#3b82f6" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Order Status Pie */}
            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Order Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={orderStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {orderStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {orderStatusData.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-gray-400">{s.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Campaign Performance */}
            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Campaign Performance</CardTitle>
                  <Button onClick={() => navigate('/analytics')} variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300 text-xs h-7">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={campaignData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#475569" fontSize={11} />
                    <YAxis stroke="#475569" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#0d1321', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                    <Bar dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="revenue" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="bg-[#0d1321] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">AI Agent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentActivity.map((act, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-8 h-8 ${act.bg} rounded-lg flex items-center justify-center shrink-0 mt-0.5`}>
                      <act.icon className={`w-4 h-4 ${act.color}`} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-300">{act.text}</p>
                      <p className="text-xs text-gray-500">{act.time}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders Table */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Recent Orders</CardTitle>
                <Button onClick={() => navigate('/orders')} variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300 text-xs h-7">
                  View All Orders
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-white/5">
                      <th className="pb-3 pr-4">Order ID</th>
                      <th className="pb-3 pr-4">Customer</th>
                      <th className="pb-3 pr-4">Product</th>
                      <th className="pb-3 pr-4">Amount</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">City</th>
                      <th className="pb-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pr-4 text-sm font-mono text-cyan-400">{order.id}</td>
                        <td className="py-3 pr-4 text-sm text-white">{order.customer}</td>
                        <td className="py-3 pr-4 text-sm text-gray-400">{order.product}</td>
                        <td className="py-3 pr-4 text-sm text-white">EGP {order.amount}</td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColors[order.status]}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-sm text-gray-400">{order.city}</td>
                        <td className="py-3 text-xs text-gray-500">{order.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
