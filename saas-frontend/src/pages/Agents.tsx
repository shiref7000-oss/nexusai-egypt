import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Power, ArrowUpRight } from 'lucide-react';
import {
  agentsApi,
  workflowStateClass,
  workflowStateLabel,
  type AgentConfig,
  type AgentActivity,
  type WorkflowStatus,
} from '@/lib/agentsApi';
import { aiApi } from '@/lib/aiApi';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, Skeleton, EmptyState } from '@/components/ui/page';
import { ChatMessage, ChatTypingIndicator } from '@/components/chat/ChatMessage';

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; structured?: unknown; time: string }>
  >([]);
  const [chatLoading, setChatLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, act, wf] = await Promise.all([
        agentsApi.list(),
        agentsApi.activity(),
        agentsApi.workflowStatus(),
      ]);
      setAgents(list.data || []);
      setActivity(act.data || []);
      setWorkflows(wf.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function toggleAgent(agentId: string) {
    setToggling(agentId);
    try {
      await agentsApi.toggle(agentId);
      await load();
    } finally {
      setToggling(null);
    }
  }

  async function sendChat() {
    if (!selected || !chatInput.trim()) return;
    const userMsg = {
      role: 'user' as const,
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatLog((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await aiApi.process(selected, userMsg.text);
      setChatLog((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.response || res.error || 'No response',
          structured: res.structured,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {
      setChatLog((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: e instanceof Error ? e.message : 'Something went wrong',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  const activeCount = agents.filter((a) => a.is_active).length;
  const selectedAgent = agents.find((a) => a.agent_id === selected);

  return (
    <div className="page-shell-wide animate-fade-in">
      <PageHeader
        title="AI Agents"
        description={`${activeCount} of ${agents.length} agents active · Select an agent to start a conversation`}
        action={
          <Link to="/marketplace">
            <Button variant="secondary" size="sm">
              Marketplace
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => {
              const isSelected = selected === agent.agent_id;
              return (
                <Card
                  key={agent.id}
                  variant={isSelected ? 'elevated' : 'default'}
                  className={`cursor-pointer transition-all ${
                    isSelected ? 'ring-1 ring-white/15' : 'hover:border-white/[0.1]'
                  }`}
                  onClick={() => setSelected(agent.agent_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(agent.agent_id);
                    }
                  }}
                >
                  <CardBody className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-elevated">
                          <Bot className="h-4 w-4 text-zinc-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-medium text-foreground">{agent.agent_name}</h3>
                          <p className="text-xs text-zinc-500">{agent.agent_id}</p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          agent.is_active
                            ? 'bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-500 border border-white/[0.06]'
                        }`}
                      >
                        {agent.is_active ? 'On' : 'Off'}
                      </span>
                    </div>
                    {(agent.capabilities || []).length > 0 && (
                      <p className="line-clamp-2 text-xs text-zinc-500 leading-relaxed">
                        {(agent.capabilities || []).slice(0, 3).join(' · ')}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={toggling === agent.agent_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAgent(agent.agent_id);
                      }}
                      className="w-full"
                    >
                      <Power className="mr-1.5 h-3 w-3" />
                      {agent.is_active ? 'Pause' : 'Activate'}
                    </Button>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {selected && (
            <Card className="mt-8" variant="elevated">
              <CardBody className="space-y-5">
                <CardHeader
                  title={selectedAgent?.agent_name || selected}
                  description="Test responses in Arabic — customer-facing output only"
                />
                <div className="max-h-[min(50vh,420px)] space-y-4 overflow-y-auto pr-1 scrollbar-thin rounded-xl border border-white/[0.04] bg-surface/50 p-4">
                  {chatLog.length === 0 && !chatLoading && (
                    <EmptyState
                      title="Start a conversation"
                      description="Ask a question to see how this agent responds to your customers."
                    />
                  )}
                  {chatLog.map((m, i) => (
                    <ChatMessage
                      key={i}
                      role={m.role}
                      content={m.text}
                      structured={m.structured}
                      time={m.time}
                    />
                  ))}
                  {chatLoading && <ChatTypingIndicator />}
                </div>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Type your message…"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                    dir="auto"
                  />
                  <Button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                    Send
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardBody>
                <CardHeader title="Recent activity" description="Latest agent actions" />
                <ul className="max-h-64 space-y-3 overflow-y-auto text-sm scrollbar-thin">
                  {activity.length === 0 && (
                    <li className="text-xs text-zinc-500">No activity yet</li>
                  )}
                  {activity.slice(0, 12).map((a) => (
                    <li key={a.id} className="border-b border-white/[0.04] pb-3 last:border-0">
                      <p className="text-zinc-300">{a.action}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <CardHeader title="Workflows" description="Automation runtime status" />
                <ul className="space-y-3 text-sm">
                  {workflows.length === 0 && (
                    <li className="text-xs text-zinc-500">No workflow data</li>
                  )}
                  {workflows.map((w) => (
                    <li key={w.path} className="flex flex-col gap-1 border-b border-white/[0.04] pb-3 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-300">{w.name}</span>
                        <span
                          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${workflowStateClass(w.status)}`}
                        >
                          {workflowStateLabel(w.status)}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600">
                        {w.executionCount != null ? `${w.executionCount} runs` : '—'}
                        {w.avgRuntimeMs != null ? ` · ${w.avgRuntimeMs}ms avg` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
