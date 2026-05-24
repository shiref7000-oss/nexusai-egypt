import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bot,
  ListTodo,
  Activity,
  Brain,
  Send,
  RefreshCw,
  Loader2,
  Code2,
} from 'lucide-react';
import {
  engineeringAgentApi,
  type AgentMemory,
  type EngineeringTask,
  type TaskLog,
} from '@/lib/engineeringAgentApi';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

type Tab = 'chat' | 'tasks' | 'activity' | 'memory';

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: 'chat', label: 'Chat', icon: Bot },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'memory', label: 'Memory', icon: Brain },
];

function statusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'text-emerald-400';
    case 'failed':
      return 'text-red-400';
    case 'running':
    case 'planning':
      return 'text-amber-300';
    default:
      return 'text-zinc-400';
  }
}

export default function EngineeringAgentPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'chat';
  const taskIdParam = searchParams.get('task');

  const [message, setMessage] = useState('');
  const [askReply, setAskReply] = useState('');
  const [sending, setSending] = useState(false);
  const [tasks, setTasks] = useState<EngineeringTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<EngineeringTask | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [memory, setMemory] = useState<AgentMemory[]>([]);
  const [repoRoot, setRepoRoot] = useState('');
  const [loading, setLoading] = useState(true);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  const loadTasks = useCallback(async () => {
    const res = await engineeringAgentApi.tasks();
    setTasks(res.data);
    if (taskIdParam) {
      const found = res.data.find((t) => t.id === taskIdParam);
      if (found) setSelectedTask(found);
    }
  }, [taskIdParam]);

  const loadLogs = useCallback(async (id: string) => {
    const res = await engineeringAgentApi.logs(id);
    setLogs(res.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const st = await engineeringAgentApi.status();
        setRepoRoot(st.data.repoRoot);
        await loadTasks();
        const mem = await engineeringAgentApi.memory('platform');
        setMemory(mem.data);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to load engineering agent');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedTask?.id) return;
    loadLogs(selectedTask.id).catch(() => setLogs([]));
    const t = setInterval(() => {
      engineeringAgentApi
        .task(selectedTask.id)
        .then((r) => setSelectedTask(r.data))
        .catch(() => undefined);
      loadLogs(selectedTask.id).catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [selectedTask?.id, loadLogs]);

  async function submitTask() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await engineeringAgentApi.chat(message.trim());
      const taskId = res.data?.taskId;
      if (!taskId) {
        throw new Error('Server did not return a task id');
      }
      toast.success(res.data.message || 'Task queued');
      setMessage('');
      setTab('tasks');
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'tasks');
      next.set('task', taskId);
      setSearchParams(next, { replace: true });
      void loadTasks().then(() => engineeringAgentApi.task(taskId).then((t) => setSelectedTask(t.data))).catch(() => undefined);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to start task');
    } finally {
      setSending(false);
    }
  }

  async function quickAsk() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await engineeringAgentApi.ask(message.trim());
      setAskReply(res.data.response);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ask failed');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[40vh] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading AI Developer…
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        title="AI Developer"
        description="Full-stack developer agent powered by Gemini — search, plan, edit, build, and report."
        action={
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono max-w-[240px] truncate">
            <Code2 className="h-4 w-4 shrink-0" />
            {repoRoot || 'repo'}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-white/[0.06] pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg transition-colors',
              tab === id
                ? 'bg-white/[0.08] text-foreground'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'chat' && (
        <Card>
          <CardHeader title="Submit a development task" description="Describe what to build or fix. The agent runs in the background." />
          <CardBody className="space-y-4">
            <textarea
              className="w-full min-h-[140px] rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200"
              placeholder="e.g. Add a health check endpoint for the engineering agent and wire it in server.ts"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submitTask()} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Run developer agent
              </Button>
              <Button variant="secondary" onClick={() => void quickAsk()} disabled={sending}>
                Quick ask (no tools)
              </Button>
            </div>
            {askReply && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300 whitespace-pre-wrap">
                {askReply}
              </div>
            )}
            <p className="text-xs text-zinc-600">
              Signed in as {user?.email}. The agent searches the codebase first, edits only relevant files, runs builds,
              and produces a markdown report. It will not access secrets, deploy, push git, or change deployed migrations.
            </p>
          </CardBody>
        </Card>
      )}

      {tab === 'tasks' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title="Tasks"
              description="pending → planning → running → review/completed"
              action={
                <Button variant="ghost" size="sm" onClick={() => void loadTasks()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              }
            />
            <CardBody className="space-y-2 max-h-[60vh] overflow-y-auto">
              {tasks.length === 0 && <p className="text-xs text-zinc-500">No tasks yet.</p>}
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTask(t);
                    const next = new URLSearchParams(searchParams);
                    next.set('task', t.id);
                    setSearchParams(next, { replace: true });
                  }}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border text-sm',
                    selectedTask?.id === t.id ? 'border-brand bg-brand/5' : 'border-zinc-800 hover:bg-zinc-900/50'
                  )}
                >
                  <p className="font-medium text-zinc-200 truncate">{t.title}</p>
                  <p className={cn('text-xs capitalize mt-1', statusColor(t.status))}>{t.status}</p>
                </button>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Task detail"
              action={
                selectedTask && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={selectedTask.status === 'running' || selectedTask.status === 'planning'}
                    onClick={async () => {
                      await engineeringAgentApi.retry(selectedTask.id);
                      toast.success('Retry queued');
                      await loadTasks();
                    }}
                  >
                    Retry
                  </Button>
                )
              }
            />
            <CardBody className="space-y-3 text-sm max-h-[60vh] overflow-y-auto">
              {!selectedTask && <p className="text-zinc-500">Select a task</p>}
              {selectedTask && (
                <>
                  <p className="text-zinc-400">{selectedTask.prompt}</p>
                  {selectedTask.error_message && (
                    <p className="text-red-400 text-xs">{selectedTask.error_message}</p>
                  )}
                  {selectedTask.result_report && (
                    <pre className="text-xs text-zinc-400 whitespace-pre-wrap bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 max-h-96 overflow-auto">
                      {selectedTask.result_report}
                    </pre>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Card>
          <CardHeader title="Activity" description="Tool calls, file edits, terminal output" />
          <CardBody className="max-h-[70vh] overflow-y-auto space-y-2">
            {!selectedTask && (
              <p className="text-xs text-zinc-500">Select a task from the Tasks tab to view logs.</p>
            )}
            {logs.map((log) => (
              <div key={log.id} className="text-xs border border-zinc-800 rounded p-2 font-mono">
                <span className="text-zinc-600">{new Date(log.created_at).toLocaleTimeString()}</span>{' '}
                <span className="text-brand">{log.event_type}</span>{' '}
                <span className="text-zinc-400">{log.message}</span>
                {log.payload != null && (
                  <pre className="mt-1 text-zinc-600 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(log.payload, null, 2).slice(0, 1500)}
                  </pre>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'memory' && (
        <Card>
          <CardHeader title="Platform memory" description="Architecture and module knowledge for the developer agent" />
          <CardBody className="grid sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
            {memory.map((m) => (
              <div key={m.id} className="rounded-lg border border-zinc-800 p-3 text-sm">
                <p className="text-xs text-zinc-500">
                  {m.category} / {m.key}
                </p>
                <p className="text-zinc-300 mt-1">{m.content}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
