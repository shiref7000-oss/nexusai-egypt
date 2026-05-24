import { useEffect, useState } from 'react';
import { Loader2, MessagesSquare } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function EngineeringCollaborationPanel({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof adminApi.engineeringAgentCollaboration>>['data']
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await adminApi.engineeringAgentCollaboration(taskId);
        setItems(res.data);
      } finally {
        setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex gap-2 text-zinc-500 text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading collaboration…
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <Card>
      <CardHeader
        title="Agent collaboration"
        description="PM → Developer → Reviewer → QA (max 3 revisions)"
      />
      <CardBody>
        <ul className="space-y-2 text-xs max-h-48 overflow-y-auto">
          {items.map((m) => (
            <li key={m.id} className="border-b border-zinc-800/60 pb-2">
              <div className="flex items-center gap-2">
                <MessagesSquare className="h-3 w-3 text-zinc-500" />
                <span className="font-mono text-zinc-400">
                  {m.fromRole}
                  {m.toRole ? ` → ${m.toRole}` : ''}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded border text-[10px] capitalize',
                    m.messageType === 'reject' && 'border-red-500/40 text-red-400',
                    m.messageType === 'approve' && 'border-emerald-500/40 text-emerald-400'
                  )}
                >
                  {m.messageType}
                </span>
                <span className="text-zinc-600 ml-auto">
                  {new Date(m.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-zinc-400 mt-1">{m.body}</p>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
