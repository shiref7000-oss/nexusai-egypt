import { useNavigate } from 'react-router-dom'
import {
  Brain, Zap, TrendingUp, MessageCircle, ShieldCheck, Search,
  DollarSign, Truck, Users, Activity, ShoppingCart, BarChart3,
  Play, Pause, Settings, Clock, CheckCircle2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useState } from 'react'

const agentsData = [
  {
    id: 'ceo', name: 'CEO Agent', role: 'Strategic Intelligence',
    description: 'Strategic decision-making with Egyptian market intelligence. Analyzes market trends, competitor moves, and business performance to recommend optimal strategies.',
    icon: Brain, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20',
    status: 'active', lastActive: '2 min ago', tasksCompleted: 1247,
    capabilities: ['Market analysis', 'Competitor tracking', 'P&L forecasting', 'Strategic recommendations'],
    todayStats: { actions: 23, success: '98%' }
  },
  {
    id: 'ads', name: 'AI Ads Engine', role: 'Campaign Generation',
    description: 'Franco-Arabic copy & winning campaign generation. Creates culturally-relevant ad copy that converts Egyptian audiences.',
    icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20',
    status: 'active', lastActive: '5 min ago', tasksCompleted: 3421,
    capabilities: ['Franco-Arabic copy', 'Audience targeting', 'A/B test creation', 'Budget optimization'],
    todayStats: { actions: 45, success: '94%' }
  },
  {
    id: 'meta', name: 'Meta Ads Live', role: 'Real-time Analytics',
    description: 'Real-time CPA/ROAS/CTR from live Meta accounts. Pulls live data and alerts on performance changes.',
    icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
    status: 'active', lastActive: '1 min ago', tasksCompleted: 5620,
    capabilities: ['Live CPA tracking', 'ROAS monitoring', 'CTR analysis', 'Auto-alerts'],
    todayStats: { actions: 112, success: '99%' }
  },
  {
    id: 'moderator', name: 'Moderator AI', role: 'Customer Service',
    description: 'Egyptian dialect customer service automation. Handles inquiries in Egyptian Arabic with natural, culturally-aware responses.',
    icon: MessageCircle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20',
    status: 'active', lastActive: '30 sec ago', tasksCompleted: 8934,
    capabilities: ['Egyptian dialect', 'Order inquiries', 'Product questions', 'Complaint handling'],
    todayStats: { actions: 89, success: '96%' }
  },
  {
    id: 'support', name: 'AI Support', role: 'Policy & Disputes',
    description: 'Policy enforcement & dispute resolution. Handles returns, refunds, and escalations automatically.',
    icon: ShieldCheck, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20',
    status: 'idle', lastActive: '15 min ago', tasksCompleted: 2156,
    capabilities: ['Return processing', 'Refund approval', 'Dispute resolution', 'Policy checks'],
    todayStats: { actions: 12, success: '92%' }
  },
  {
    id: 'product', name: 'Product Hunter', role: 'Market Research',
    description: 'Winning product discovery & market analysis. Finds trending products with high margin potential in Egypt.',
    icon: Search, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20',
    status: 'active', lastActive: '8 min ago', tasksCompleted: 876,
    capabilities: ['Trend analysis', 'Margin calculation', 'Supplier scouting', 'Competitor monitoring'],
    todayStats: { actions: 18, success: '89%' }
  },
  {
    id: 'finance', name: 'Finance Agent', role: 'Accounting & VAT',
    description: 'P&L tracking, taxes & Egyptian VAT compliance. Automated financial reporting and Egyptian tax calculations.',
    icon: DollarSign, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20',
    status: 'active', lastActive: '1 hour ago', tasksCompleted: 3420,
    capabilities: ['P&L tracking', 'VAT calculation', 'Tax reporting', 'Cash flow analysis'],
    todayStats: { actions: 8, success: '100%' }
  },
  {
    id: 'shipping', name: 'Shipping Agent', role: 'Logistics & COD',
    description: 'Bosta, Aramex, VHub tracking & COD reconciliation. Manages deliveries across all Egyptian carriers.',
    icon: Truck, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20',
    status: 'active', lastActive: '3 min ago', tasksCompleted: 12450,
    capabilities: ['Multi-carrier tracking', 'COD reconciliation', 'Delivery optimization', 'Return management'],
    todayStats: { actions: 67, success: '97%' }
  },
  {
    id: 'hr', name: 'HR & Team Agent', role: 'Team Management',
    description: 'Payroll, attendance & performance management. Tracks team productivity and manages Egyptian labor compliance.',
    icon: Users, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20',
    status: 'idle', lastActive: '2 hours ago', tasksCompleted: 567,
    capabilities: ['Payroll tracking', 'Attendance monitoring', 'Performance reviews', 'Labor compliance'],
    todayStats: { actions: 5, success: '100%' }
  },
]

const sidebarItems = [
  { icon: Activity, label: 'Dashboard', active: false, path: '/dashboard' },
  { icon: ShoppingCart, label: 'Orders', active: false, path: '/orders' },
  { icon: Brain, label: 'AI Agents', active: true, path: '/agents' },
  { icon: BarChart3, label: 'Analytics', active: false, path: '/analytics' },
  { icon: DollarSign, label: 'Finance', active: false, path: '#' },
  { icon: Truck, label: 'Shipping', active: false, path: '#' },
  { icon: MessageCircle, label: 'WhatsApp', active: false, path: '#' },
  { icon: Users, label: 'Customers', active: false, path: '#' },
]

export default function Agents() {
  const navigate = useNavigate()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const activeCount = agentsData.filter((a) => a.status === 'active').length
  const idleCount = agentsData.filter((a) => a.status === 'idle').length
  const totalTasks = agentsData.reduce((sum, a) => sum + a.tasksCompleted, 0)

  return (
    <div className="min-h-screen bg-[#060B18] text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0f1a] border-r border-white/5 fixed h-full hidden lg:flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-white/5">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
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
            <h1 className="text-xl font-bold">AI Agents</h1>
            <p className="text-xs text-gray-500">9 specialized agents working 24/7</p>
          </div>
          <Button onClick={() => navigate('/')} variant="ghost" size="sm" className="text-gray-400 hover:text-white">Exit to Site</Button>
        </header>

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="bg-[#0d1321] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                    <Brain className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{agentsData.length}</div>
                    <div className="text-xs text-gray-500">Total Agents</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0d1321] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{activeCount}</div>
                    <div className="text-xs text-gray-500">Active Now</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0d1321] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{idleCount}</div>
                    <div className="text-xs text-gray-500">Idle</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0d1321] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{(totalTasks / 1000).toFixed(1)}k</div>
                    <div className="text-xs text-gray-500">Tasks Completed</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Agents Grid */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agentsData.map((agent) => (
              <Card
                key={agent.id}
                className={`bg-[#0d1321] ${selectedAgent === agent.id ? `border-2 ${agent.border}` : 'border-white/5 hover:border-white/10'} cursor-pointer transition-all`}
                onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${agent.bg} rounded-lg flex items-center justify-center`}>
                        <agent.icon className={`w-5 h-5 ${agent.color}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{agent.name}</h3>
                        <p className="text-xs text-gray-500">{agent.role}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${agent.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
                      <span className="text-xs capitalize">{agent.status}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-4">{agent.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>Last active: {agent.lastActive}</span>
                    <span>{agent.tasksCompleted.toLocaleString()} tasks</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className={`h-7 text-xs ${agent.color} hover:bg-white/5`}>
                      {agent.status === 'active' ? <><Pause className="w-3 h-3 mr-1" /> Pause</> : <><Play className="w-3 h-3 mr-1" /> Start</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-400 hover:text-white hover:bg-white/5">
                      <Settings className="w-3 h-3 mr-1" /> Configure
                    </Button>
                  </div>
                  {selectedAgent === agent.id && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs text-gray-500">Today: <span className="text-white font-medium">{agent.todayStats.actions} actions</span></div>
                        <div className="text-xs text-gray-500">Success: <span className="text-green-400 font-medium">{agent.todayStats.success}</span></div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.capabilities.map((cap) => (
                          <span key={cap} className="text-xs bg-white/5 text-gray-400 px-2 py-0.5 rounded-md">{cap}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
