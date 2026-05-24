import type { ReactNode } from 'react';
import { extractCustomerArabic } from '@/lib/aiCustomerMessage';

export function ChatMessage({
  role,
  content,
  structured,
  time,
  debugMode,
  children,
}: {
  role: 'user' | 'assistant';
  content: string;
  structured?: unknown;
  time?: string;
  debugMode?: boolean;
  children?: ReactNode;
}) {
  const isUser = role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-elevated border border-white/[0.08] px-4 py-3 shadow-soft">
          <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap" dir="auto">
            {content}
          </p>
          {time && <p className="text-[11px] text-zinc-500 mt-2 text-right">{time}</p>}
        </div>
      </div>
    );
  }

  const arabic = debugMode ? null : extractCustomerArabic(content, structured);

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[min(100%,32rem)] w-full">
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <span className="w-5 h-5 rounded-md bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-zinc-400">
            AI
          </span>
          <span className="text-[11px] text-zinc-500">Assistant</span>
        </div>
        <div className="rounded-2xl rounded-bl-md bg-panel border border-white/[0.06] px-4 py-3.5 shadow-soft">
          {children ?? (
            <p
              className="text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap"
              dir="auto"
            >
              {arabic || content}
            </p>
          )}
        </div>
        {time && <p className="text-[11px] text-zinc-600 mt-1.5 px-1">{time}</p>}
      </div>
    </div>
  );
}

export function ChatTypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md bg-panel border border-white/[0.06] px-4 py-3.5">
        <div className="flex gap-1.5 items-center h-5">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse-soft" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse-soft [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse-soft [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
