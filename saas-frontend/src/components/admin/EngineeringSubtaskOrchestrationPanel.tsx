import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, GitBranch } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type OrchestrationData = NonNullable<
  Awaited<ReturnType<typeof adminApi.engineeringAgentOrchestration>>['data']
>;

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-zinc-400 border-zinc-600',
  running: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  completed: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  failed: 'text-red-400 border-red-500/40 bg-red-500/10',
  blocked: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
};

export function EngineeringSubtaskOrchestrationPanel({ taskId }: { taskId: string }) {
  const [data, setData] = useState<OrchestrationData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await adminApi.engineeringAgentOrchestration(taskId);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading orchestration…
      </div>
    );
  }

  if (!data) return null;

  const { progress, currentlyRunning, subtasks, edges, activity } = data;

  return (
    <Card>
      <CardHeader
        title="Subtask orchestration"
        description="Parent dependency graph — one eligible subtask runs at a time"
      />
      <CardBody className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500/80 transition-all"
              style={{ width: `${progress.percent}%` }}
              title={`${progress.completed} of ${progress.total} completed`}
            />
          </div>
          <span className="text-zinc-300 font-mono text-xs whitespace-nowrap">
            {progress.completed}/{progress.total} ({progress.percent}%)
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2 text-xs text-center">
          {(
            [
              ['pending', progress.pending],
              ['running', progress.running],
              ['completed', progress.completed],
              ['failed', progress.failed],
              ['blocked', progress.blocked],
            ] as const
          ).map(([label, count]) => (
            <div key={label} className="rounded border border-zinc-800 p-2">
              <p className="text-zinc-500 capitalize">{label}</p>
              <p className="text-zinc-200 font-medium">{count}</p>
            </div>
          ))}
        </div>

        {currentlyRunning && (
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-400/90 uppercase tracking-wide mb-1">Currently running</p>
            <p className="font-mono text-zinc-200">{currentlyRunning.slug}</p>
            <p className="text-zinc-500 text-xs mt-1">{currentlyRunning.title}</p>
            {currentlyRunning.child_task_id && (
              <Link
                to={`/admin/engineering-agent/task/${currentlyRunning.child_task_id}`}
                className="text-xs text-amber-400 hover:underline mt-2 inline-block"
              >
                Open child task →
              </Link>
            )}
          </div>
        )}

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            Dependency graph
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {subtasks.map((st) => (
              <div
                key={st.id}
                className={cn(
                  'flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs',
                  STATUS_STYLES[st.status] || STATUS_STYLES.pending
                )}
              >
                <div className="min-w-0">
                  <span className="font-mono">{st.slug}</span>
                  {st.depends_on.length > 0 && (
                    <span className="text-zinc-500 ml-2">← {st.depends_on.join(', ')}</span>
                  )}
                  {st.retry_count > 0 && (
                    <span className="text-zinc-500 ml-1">retry {st.retry_count}/{st.max_retries}</span>
                  )}
                </div>
                <span className="capitalize shrink-0">{st.status}</span>
              </div>
            ))}
          </div>
          {edges.length > 0 && (
            <p className="text-[10px] text-zinc-600 mt-2">
              Edges: {edges.map((e) => `${e.from}→${e.to}`).join(', ')}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Activity stream</p>
          <ul className="space-y-1 max-h-36 overflow-y-auto text-xs text-zinc-400">
            {(activity ?? []).slice(-20).reverse().map((a) => (
              <li key={a.id}>
                <span className="text-zinc-600">{new Date(a.createdAt).toLocaleTimeString()}</span>{' '}
                <span className="text-zinc-500 font-mono">{a.eventType}</span> — {a.message}
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
