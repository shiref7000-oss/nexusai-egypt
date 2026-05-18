import { useState, useEffect } from 'react'
import {
  Brain, Zap, TrendingUp, MessageCircle, ShieldCheck, Search,
  DollarSign, Truck, Users, Play, Pause, Activity,
  Send, Bot, X, Loader2
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { agentsApi, aiApi } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout'
import { toast } from 'sonner'

const agentIcons: Record<string, typeof Brain> = {
  ceo: Brain, ads: Zap, meta: TrendingUp, moderator: MessageCircle,
  support: ShieldCheck, product: Search, finance: DollarSign, shipping: Truck, hr: Users,
}

const agentColors: Record<string, string> = {
  ceo: 'cyan', ads: 'purple', meta: 'blue', moderator: 'amber',
  support: 'green', product: 'red', finance: 'orange', shipping: 'indigo', hr: 'pink',
}

const colorMap: Record<string, { text: string; bg: string; border: string }> = {
  cyan:    { text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  purple:  { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  blue:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  green:   { text: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20' },
  red:     { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  orange:  { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  indigo:  { text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  pink:    { text: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20' },
}

export default function Agents() {
  const [agents, setAgents] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [workflowStatus, setWorkflowStatus] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [agentsRes, actRes, wfRes] = await Promise.all([
        agentsApi.list(),
        agentsApi.activity(),
        agentsApi.workflowStatus(),
      ])
      if (agentsRes.success) setAgents(agentsRes.data || [])
      if (actRes.success) setActivity(actRes.data || [])
      if (wfRes.success) setWorkflowStatus(wfRes.data || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleToggle = async (agentId: string) => {
    setToggling(agentId)
    const res = await agentsApi.toggle(agentId)
    if (res.success) {
      toast.success(res.message || 'Agent updated')
      loadData()
    }
    setToggling(null)
  }

  const handleAgentClick = (agentId: string) => {
    setSelectedAgent(agentId)
    setChatOpen(true)
  }

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedAgent) return
    const userMsg = { role: 'user', text: chatInput, time: new Date().toLocaleTimeString() }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    const res = await aiApi.process(selectedAgent, userMsg.text)
    if (res.success) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        text: res.response,
        agent: selectedAgent,
        provider: res.provider,
        latency: res.latency,
        time: new Date().toLocaleTimeString(),
      }])
    }
    setChatLoading(false)
  }

  const activeCount = agents.filter((a: any) => a.is_active).length
  const selected = agents.find((a: any) => a.agent_id === selectedAgent)
  const selectedName = selected?.agent_name || 'AI Agent'

  return (
    <AppLayout title="AI Agents" subtitle={`${activeCount} of ${agents.length} agents active`}>
      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="bg-[#0d1321] border-white/5">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-10 w-10 rounded-lg bg-white/5" />
                <Skeleton className="h-4 w-24 bg-white/5" />
                <Skeleton className="h-3 w-full bg-white/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Agent Grid */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {agents.map((agent: any) => {
              const AgentIcon = agentIcons[agent.agent_id] || Brain
              const colors = colorMap[agentColors[agent.agent_id]] || colorMap.cyan
              const isToggling = toggling === agent.agent_id
              return (
                <Card
                  key={agent.agent_id}
                  className={`bg-[#0d1321] border transition-all cursor-pointer ${
                    selectedAgent === agent.agent_id ? `${colors.border} border-2` : 'border-white/5 hover:border-white/10'
                  }`}
                  onClick={() => handleAgentClick(agent.agent_id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center shrink-0`}>
                          <AgentIcon className={`w-5 h-5 ${colors.text}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white text-sm truncate">{agent.agent_name}</h3>
                          <p className="text-[11px] text-gray-500">{agent.capabilities?.[0] || 'AI Agent'}</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${agent.is_active ? 'bg-green-500/10' : 'bg-gray-500/10'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${agent.is_active ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                        <span className={`text-[10px] ${agent.is_active ? 'text-green-400' : 'text-gray-500'}`}>
                          {agent.is_active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(agent.capabilities || []).slice(0, 3).map((cap: string) => (
                        <span key={cap} className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">{cap}</span>
                      ))}
                    </div>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 text-[11px] ${agent.is_active ? 'text-amber-400 hover:bg-amber-500/10' : 'text-green-400 hover:bg-green-500/10'}`}
                        onClick={() => handleToggle(agent.agent_id)}
                        disabled={isToggling}
                      >
                        {isToggling ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> :
                          agent.is_active ? <><Pause className="w-3 h-3 mr-1" />Pause</> : <><Play className="w-3 h-3 mr-1" />Start</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-cyan-400 hover:bg-cyan-500/10"
                        onClick={() => handleAgentClick(agent.agent_id)}
                      >
                        <MessageCircle className="w-3 h-3 mr-1" />Chat
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* n8n Workflow Status */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">n8n Automation Workflows</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-green-400">Live</span>
                </div>
              </div>
              {workflowStatus.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">Workflow status unavailable</p>
              ) : (
                <div className="space-y-2">
                  {workflowStatus.map((wf: any) => (
                    <div key={wf.path} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${wf.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
                        <div>
                          <p className="text-xs text-gray-300 font-medium">{wf.name}</p>
                          <p className="text-[10px] text-gray-500">{wf.path}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${wf.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {wf.status === 'active' ? 'Active' : 'Error'}
                        </span>
                        {wf.lastRun && (
                          <p className="text-[9px] text-gray-500 mt-1">
                            {new Date(wf.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card className="bg-[#0d1321] border-white/5">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Recent Activity</h3>
              {activity.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {activity.slice(0, 8).map((act: any, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        act.status === 'success' ? 'bg-green-500/10' : act.status === 'warning' ? 'bg-amber-500/10' : 'bg-red-500/10'
                      }`}>
                        <Activity className={`w-3.5 h-3.5 ${
                          act.status === 'success' ? 'text-green-400' : act.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-300">{act.action}</p>
                        <p className="text-[10px] text-gray-500">{act.agent_name} — {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Chat Drawer */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setChatOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        </div>
      )}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-[#0a0f1a] border-l border-white/5 z-50 flex flex-col transition-transform duration-300 ${
        chatOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{selectedName}</h3>
            <p className="text-[10px] text-gray-500">AI Assistant</p>
          </div>
          <button onClick={() => setChatOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="w-8 h-8 mx-auto mb-2 text-cyan-400/40" />
              <p className="text-sm text-gray-500">Start a conversation with {selectedName}</p>
              <p className="text-xs text-gray-600 mt-1">Ask about campaigns, orders, or market insights</p>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-cyan-500/20 text-white ml-4'
                  : 'bg-white/5 text-gray-300 mr-4'
              }`}>
                <p className="text-xs leading-relaxed">{msg.text}</p>
                {msg.provider && (
                  <p className="text-[9px] text-gray-500 mt-1">{msg.provider} — {msg.latency}ms</p>
                )}
                <p className="text-[9px] text-gray-600 mt-0.5 text-right">{msg.time}</p>
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">Processing...</span>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="p-3 border-t border-white/5 shrink-0">
          <form onSubmit={e => { e.preventDefault(); handleSend() }} className="flex gap-2">
            <Input
              placeholder={`Ask ${selectedName}...`}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              className="flex-1 bg-[#060B18] border-white/10 text-white placeholder:text-gray-600 h-9 text-sm"
            />
            <Button type="submit" size="sm" disabled={chatLoading || !chatInput.trim()}
              className="h-9 w-9 p-0 bg-gradient-to-r from-cyan-400 to-blue-500 text-black hover:opacity-90">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  )
}
