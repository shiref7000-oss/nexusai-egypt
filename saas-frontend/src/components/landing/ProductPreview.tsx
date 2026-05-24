import { ChatMessage, ChatTypingIndicator } from '@/components/chat/ChatMessage';

/** Static product preview for landing — AI-native chat demo */
export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent opacity-60 blur-sm" />
      <div className="relative rounded-2xl border border-white/[0.08] bg-panel/90 backdrop-blur-xl shadow-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
          <span className="ml-2 text-[11px] font-medium text-zinc-500">Moderator · Live</span>
        </div>
        <div className="space-y-4 p-4 min-h-[220px]">
          <ChatMessage
            role="user"
            content="مرحبا، عايز اعرف حالة طلبي"
            time="now"
          />
          <ChatMessage
            role="assistant"
            content="مرحبا! ابعتيلي رقم الطلب أو رقم الموبايل وهنتابع معاكي فوراً."
            time="now"
          />
          <div className="opacity-40 scale-95 origin-left">
            <ChatTypingIndicator />
          </div>
        </div>
      </div>
    </div>
  );
}
