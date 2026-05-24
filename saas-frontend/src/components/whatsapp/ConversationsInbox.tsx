import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  CheckCheck,
  ChevronLeft,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import {
  whatsappApi,
  type WhatsAppConversation,
  type WhatsAppInboxTemplate,
  type WhatsAppMessage,
} from '@/lib/whatsappApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LIST_POLL_MS = 8000;
const THREAD_POLL_MS = 4000;

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('20') && d.length >= 12) return `+${d}`;
  return d ? `+${d}` : phone;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function displayName(c: WhatsAppConversation): string {
  return c.customerName?.trim() || formatPhone(c.customerPhone);
}

function DeliveryTicks({ message }: { message: WhatsAppMessage }) {
  if (message.direction === 'inbound') return null;
  if (message.status === 'failed') {
    return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" aria-label="Failed" />;
  }
  if (message.status === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-violet-400 shrink-0" aria-label="Read" />;
  }
  if (message.status === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5 text-emerald-500/80 shrink-0" aria-label="Delivered" />;
  }
  if (message.status === 'sent') {
    return <Check className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-label="Sent" />;
  }
  return <Clock className="h-3.5 w-3.5 text-amber-500/80 shrink-0" aria-label="Pending" />;
}

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const outbound = message.direction === 'outbound';
  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] sm:max-w-[72%] rounded-2xl px-3 py-2 shadow-sm',
          outbound
            ? 'bg-brand/90 text-white rounded-br-md'
            : 'bg-zinc-800 text-zinc-100 rounded-bl-md border border-zinc-700/80'
        )}
      >
        {message.messageType === 'template' && message.templateKey && (
          <span className="text-[10px] uppercase tracking-wide opacity-70 block mb-1 font-mono">
            {message.templateKey}
          </span>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message.bodyPreview || '—'}</p>
        <div
          className={cn(
            'flex items-center gap-1.5 mt-1 text-[10px]',
            outbound ? 'text-white/70 justify-end' : 'text-zinc-500'
          )}
        >
          <span>{new Date(message.createdAt).toLocaleString()}</span>
          <span className="opacity-60">·</span>
          <span className="capitalize">{message.messageType}</span>
          {outbound && <DeliveryTicks message={message} />}
        </div>
        {message.status === 'failed' && message.errorMessage && (
          <p className="text-[11px] text-red-200 mt-1">{message.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

export function ConversationsInbox({ connected }: { connected: boolean }) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [threadName, setThreadName] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppInboxTemplate[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);

  const listSinceRef = useRef<string | null>(null);
  const threadSinceRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(
    async (opts?: { silent?: boolean; resetPage?: boolean }) => {
      if (!connected) {
        setListLoading(false);
        return;
      }
      if (!opts?.silent) setListLoading(true);
      try {
        const p = opts?.resetPage ? 1 : page;
        const res = await whatsappApi.conversations({
          q: searchDebounced || undefined,
          page: p,
          limit: 30,
          since: opts?.silent ? listSinceRef.current || undefined : undefined,
        });
        listSinceRef.current = res.data.serverTime;
        if (opts?.silent && opts?.resetPage !== true) {
          setConversations((prev) => {
            const map = new Map(prev.map((c) => [c.customerPhone, c]));
            for (const c of res.data.conversations) map.set(c.customerPhone, c);
            return Array.from(map.values()).sort(
              (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
            );
          });
        } else {
          setConversations(res.data.conversations);
        }
        setTotalPages(res.data.pagination.totalPages);
        if (opts?.resetPage) setPage(1);
      } catch (e: unknown) {
        if (!opts?.silent) toast.error(e instanceof Error ? e.message : 'Failed to load conversations');
      } finally {
        setListLoading(false);
      }
    },
    [connected, page, searchDebounced]
  );

  const loadThread = useCallback(
    async (phone: string, opts?: { silent?: boolean; before?: string }) => {
      if (!connected) return;
      if (!opts?.silent && !opts?.before) setThreadLoading(true);
      try {
        const res = await whatsappApi.conversationMessages(phone, {
          limit: 50,
          before: opts?.before,
          since: opts?.silent && !opts?.before ? threadSinceRef.current || undefined : undefined,
        });
        threadSinceRef.current = res.data.serverTime;
        setThreadName(res.data.customerName);
        if (opts?.before) {
          setMessages((prev) => [...res.data.messages, ...prev]);
        } else if (opts?.silent) {
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const m of res.data.messages) map.set(m.id, m);
            return Array.from(map.values()).sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          });
        } else {
          setMessages(res.data.messages);
        }
        setHasMore(res.data.hasMore);
        if (!opts?.before) {
          await whatsappApi.markConversationRead(phone);
          setConversations((prev) =>
            prev.map((c) =>
              c.customerPhone === phone ? { ...c, unreadCount: 0 } : c
            )
          );
        }
      } catch (e: unknown) {
        if (!opts?.silent) toast.error(e instanceof Error ? e.message : 'Failed to load messages');
      } finally {
        setThreadLoading(false);
        setLoadingMore(false);
      }
    },
    [connected]
  );

  useEffect(() => {
    loadList({ resetPage: true });
  }, [searchDebounced]);

  useEffect(() => {
    loadList();
  }, [page]);

  useEffect(() => {
    if (!connected) return;
    const iv = setInterval(() => loadList({ silent: true }), LIST_POLL_MS);
    return () => clearInterval(iv);
  }, [connected, loadList]);

  useEffect(() => {
    if (!selectedPhone) return;
    threadSinceRef.current = null;
    loadThread(selectedPhone);
    const iv = setInterval(() => loadThread(selectedPhone, { silent: true }), THREAD_POLL_MS);
    return () => clearInterval(iv);
  }, [selectedPhone]);

  useEffect(() => {
    if (!templateOpen || !connected) return;
    whatsappApi
      .inboxTemplates()
      .then((r) => setTemplates(r.data.templates))
      .catch(() => setTemplates([]));
  }, [templateOpen, connected]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedPhone]);

  const selectedConv = conversations.find((c) => c.customerPhone === selectedPhone);

  const handleSendText = async () => {
    if (!selectedPhone || !compose.trim()) return;
    setSending(true);
    try {
      const res = await whatsappApi.sendConversationText(selectedPhone, compose.trim());
      setMessages((prev) => [...prev, res.data.message]);
      setCompose('');
      loadList({ silent: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleSendTemplate = async () => {
    if (!selectedPhone || !selectedTemplate) return;
    setSending(true);
    try {
      const res = await whatsappApi.sendConversationTemplate(selectedPhone, {
        templateKey: selectedTemplate,
        bodyParameters: templateParams.filter((p) => p.length > 0),
      });
      setMessages((prev) => [...prev, res.data.message]);
      setTemplateOpen(false);
      setSelectedTemplate('');
      setTemplateParams([]);
      loadList({ silent: true });
      toast.success('Template sent');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Template send failed');
    } finally {
      setSending(false);
    }
  };

  const tplMeta = templates.find((t) => t.key === selectedTemplate);

  if (!connected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500">
        Connect WhatsApp to use the conversations inbox.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[480px] max-h-[900px] rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="flex flex-1 min-h-0">
        {/* List */}
        <aside
          className={cn(
            'w-full md:w-[320px] lg:w-[360px] flex flex-col border-r border-zinc-800 shrink-0',
            selectedPhone && 'hidden md:flex'
          )}
        >
          <div className="p-3 border-b border-zinc-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Conversations</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => loadList({ resetPage: true })}
                aria-label="Refresh"
              >
                <RefreshCw className={cn('h-4 w-4', listLoading && 'animate-spin')} />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="search"
                placeholder="Search name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-700 pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {listLoading && !conversations.length ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              </div>
            ) : !conversations.length ? (
              <p className="text-sm text-zinc-500 text-center py-12 px-4">No conversations yet.</p>
            ) : (
              <ul>
                {conversations.map((c) => (
                  <li key={c.customerPhone}>
                    <button
                      type="button"
                      onClick={() => setSelectedPhone(c.customerPhone)}
                      className={cn(
                        'w-full text-left px-3 py-3 border-b border-zinc-800/60 hover:bg-zinc-900/80 transition-colors',
                        selectedPhone === c.customerPhone && 'bg-zinc-900'
                      )}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-white text-sm truncate">{displayName(c)}</span>
                        <span className="text-[11px] text-zinc-500 shrink-0">
                          {formatRelativeTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{formatPhone(c.customerPhone)}</p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-xs text-zinc-400 truncate flex-1">{c.lastMessagePreview}</p>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-[11px] font-medium text-white flex items-center justify-center">
                            {c.unreadCount > 99 ? '99+' : c.unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {totalPages > 1 && (
            <div className="p-2 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-500">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </aside>

        {/* Thread */}
        <section
          className={cn(
            'flex-1 flex flex-col min-w-0',
            !selectedPhone && 'hidden md:flex'
          )}
        >
          {!selectedPhone ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-2">
              <MessageSquare className="h-12 w-12 opacity-40" />
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              <header className="px-3 py-2.5 border-b border-zinc-800 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="md:hidden p-1 text-zinc-400"
                  onClick={() => setSelectedPhone(null)}
                  aria-label="Back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {threadName || selectedConv?.customerName || formatPhone(selectedPhone)}
                  </h3>
                  <p className="text-xs text-zinc-500">{formatPhone(selectedPhone)}</p>
                </div>
              </header>

              <div ref={threadScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-950/80">
                {hasMore && (
                  <div className="flex justify-center pb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loadingMore}
                      onClick={() => {
                        const oldest = messages[0];
                        if (!oldest) return;
                        setLoadingMore(true);
                        loadThread(selectedPhone, { before: oldest.id });
                      }}
                    >
                      {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load older messages'}
                    </Button>
                  </div>
                )}
                {threadLoading && !messages.length ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                  </div>
                ) : (
                  messages.map((m) => <MessageBubble key={m.id} message={m} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              <footer className="p-3 border-t border-zinc-800 space-y-2 shrink-0 bg-zinc-900/50">
                {templateOpen && (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
                    <select
                      value={selectedTemplate}
                      onChange={(e) => {
                        setSelectedTemplate(e.target.value);
                        const t = templates.find((x) => x.key === e.target.value);
                        setTemplateParams(Array(t?.bodyVariableCount || 0).fill(''));
                      }}
                      className="w-full rounded-md bg-zinc-950 border border-zinc-700 text-sm text-white px-2 py-1.5"
                    >
                      <option value="">Choose template…</option>
                      {templates.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.key} ({t.languageCode})
                        </option>
                      ))}
                    </select>
                    {tplMeta && tplMeta.bodyVariableCount > 0 && (
                      <div className="space-y-1">
                        {templateParams.map((_, i) => (
                          <input
                            key={i}
                            placeholder={`Variable {{${i + 1}}}`}
                            value={templateParams[i] || ''}
                            onChange={(e) => {
                              const next = [...templateParams];
                              next[i] = e.target.value;
                              setTemplateParams(next);
                            }}
                            className="w-full rounded-md bg-zinc-950 border border-zinc-700 text-sm text-white px-2 py-1.5"
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSendTemplate} disabled={sending || !selectedTemplate}>
                        Send template
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setTemplateOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setTemplateOpen((o) => !o)}
                    title="Send template"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  <textarea
                    value={compose}
                    onChange={(e) => setCompose(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendText();
                      }
                    }}
                    placeholder="Type a message…"
                    rows={2}
                    className="flex-1 resize-none rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 self-end"
                    disabled={sending || !compose.trim()}
                    onClick={() => void handleSendText()}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
