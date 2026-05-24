import { CheckCircle2, Clock, Eye, MessageSquare, Send, XCircle } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { WhatsAppMessage } from '@/lib/whatsappApi';

function stepIcon(status: string, direction: string) {
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === 'read') return <Eye className="h-4 w-4 text-violet-400" />;
  if (status === 'delivered') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === 'sent') return <Send className="h-4 w-4 text-sky-400" />;
  if (direction === 'inbound') return <MessageSquare className="h-4 w-4 text-zinc-400" />;
  return <Clock className="h-4 w-4 text-amber-400" />;
}

export function MessageTimeline({ messages }: { messages: WhatsAppMessage[] }) {
  if (!messages.length) {
    return (
      <p className="text-sm text-zinc-500 py-4 text-center">
        No WhatsApp messages for this order yet.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-zinc-800 ml-2 space-y-4">
      {messages.map((m) => (
        <li key={m.id} className="ml-6">
          <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 border border-zinc-700">
            {stepIcon(m.status, m.direction)}
          </span>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusBadge status={m.direction === 'inbound' ? 'received' : m.status} />
            {m.templateKey && (
              <span className="text-xs text-zinc-500 font-mono">{m.templateKey}</span>
            )}
            <span className="text-xs text-zinc-600">
              {new Date(m.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-zinc-300">{m.bodyPreview || '—'}</p>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-zinc-500">
            {m.sentAt && <span>Sent {new Date(m.sentAt).toLocaleTimeString()}</span>}
            {m.deliveredAt && <span>Delivered {new Date(m.deliveredAt).toLocaleTimeString()}</span>}
            {m.readAt && <span>Read {new Date(m.readAt).toLocaleTimeString()}</span>}
            {m.failedAt && <span className="text-red-400">Failed</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
