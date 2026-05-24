import { useEffect, useState, useCallback, useRef } from 'react';
import { tikTokInboxApi, type TikTokConversation, type TikTokMessage, type TikTokInboxStats } from '@/lib/adminApi';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'secondary' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        variant === 'default'
          ? 'bg-primary/10 text-primary border border-primary/20'
          : 'bg-muted text-muted-foreground border border-border'
      }`}
    >
      {children}
    </span>
  );
}

export default function TikTokInboxPage() {
  const [conversations, setConversations] = useState<TikTokConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<number | null>(null);
  const [messages, setMessages] = useState<TikTokMessage[]>([]);
  const [stats, setStats] = useState<TikTokInboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const [convRes, statsRes] = await Promise.all([
        tikTokInboxApi.conversations(),
        tikTokInboxApi.stats(),
      ]);
      if (convRes.success) setConversations(convRes.data.conversations);
      if (statsRes.success) setStats(statsRes.data);
    } catch {
      // silent — keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (convId: number) => {
    setMessagesLoading(true);
    try {
      const res = await tikTokInboxApi.messages(convId);
      if (res.success) setMessages(res.data.messages);
    } catch {
      toast.error('Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    pollRef.current = setInterval(loadConversations, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadConversations]);

  const handleSelectConv = async (conv: TikTokConversation) => {
    setSelectedConv(conv.id);
    await loadMessages(conv.id);
    try {
      await tikTokInboxApi.markRead(conv.id);
      loadConversations();
    } catch { /* silent */ }
  };

  const handleGenerateSuggestion = async (msg: TikTokMessage) => {
    setGenerating((prev) => ({ ...prev, [msg.id]: true }));
    try {
      const suggestion = generateMockReply(msg.content);
      await tikTokInboxApi.saveSuggestion(msg.id, suggestion);
      await loadMessages(selectedConv!);
      toast.success('Reply suggestion saved');
    } catch {
      toast.error('Failed to generate suggestion');
    } finally {
      setGenerating((prev) => ({ ...prev, [msg.id]: false }));
    }
  };

  const handleApproveAndSend = async (msg: TikTokMessage) => {
    try {
      await tikTokInboxApi.approveSuggestion(msg.id);
      await tikTokInboxApi.markSent(msg.id);
      await loadMessages(selectedConv!);
      toast.success('Reply approved and marked as sent');
    } catch {
      toast.error('Failed to send reply');
    }
  };

  const handleManualReply = async (msg: TikTokMessage) => {
    const text = replyText[msg.id];
    if (!text?.trim()) return;
    try {
      await tikTokInboxApi.saveSuggestion(msg.id, text.trim());
      await tikTokInboxApi.approveSuggestion(msg.id);
      await tikTokInboxApi.markSent(msg.id);
      setReplyText((prev) => ({ ...prev, [msg.id]: '' }));
      await loadMessages(selectedConv!);
      toast.success('Reply sent');
    } catch {
      toast.error('Failed to send reply');
    }
  };

  const selectedConversation = conversations.find((c) => c.id === selectedConv);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 p-4">
      {/* Left: Conversation List */}
      <Card className="w-80 flex-shrink-0 flex flex-col">
        <CardHeader
          title="TikTok Inbox"
          action={
            stats && (
              <Badge variant={stats.unreadCount > 0 ? 'default' : 'secondary'}>
                {stats.unreadCount} unread
              </Badge>
            )
          }
          description={
            stats
              ? `${stats.conversationCount} conversation${stats.conversationCount !== 1 ? 's' : ''}${stats.sessionValid ? ' · Session OK' : ' · Session expired'}${stats.errorMessage ? ` · ${stats.errorMessage}` : ''}`
              : undefined
          }
        />
        <div className="flex-1 overflow-y-auto">
          <CardBody className="p-0">
            {loading ? (
              <div className="p-4 text-sm text-subtle">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-sm text-subtle">
                No conversations yet. Connect TikTok to start receiving DMs.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConv(conv)}
                  className={`w-full text-left p-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${
                    selectedConv === conv.id ? 'bg-white/[0.05]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate max-w-[170px]">
                      {conv.tiktok_username}
                    </span>
                    {conv.unread_count > 0 && (
                      <Badge variant="default">{conv.unread_count}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-subtle truncate mt-1">
                    {conv.last_message_text || 'No messages'}
                  </p>
                  {conv.last_message_at && (
                    <p className="text-xs text-subtle mt-0.5">
                      {new Date(conv.last_message_at).toLocaleString()}
                    </p>
                  )}
                </button>
              ))
            )}
          </CardBody>
        </div>
      </Card>

      {/* Right: Message Thread */}
      <Card className="flex-1 flex flex-col">
        <CardHeader
          title={
            selectedConversation
              ? `Chat with ${selectedConversation.tiktok_username}`
              : 'Select a conversation'
          }
        />
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedConv ? (
            <div className="flex items-center justify-center h-full text-subtle">
              Select a conversation to view messages
            </div>
          ) : messagesLoading ? (
            <div className="p-4 text-sm text-subtle">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="p-4 text-sm text-subtle">No messages yet</div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'incoming' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      msg.direction === 'incoming'
                        ? 'bg-panel border border-white/[0.06]'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {new Date(msg.created_at).toLocaleString()}
                    </p>

                    {/* AI Suggestion Panel */}
                    {msg.direction === 'incoming' && (
                      <div className="mt-2 border-t border-white/[0.08] pt-2">
                        {msg.ai_suggestion ? (
                          <div className="space-y-2">
                            <div className="bg-white/[0.05] rounded p-2 text-xs">
                              <span className="font-semibold">AI Suggestion:</span>{' '}
                              {msg.ai_suggestion}
                            </div>
                            {msg.ai_suggestion_approved ? (
                              <Badge variant="secondary">
                                {msg.sent ? 'Sent' : 'Approved'}
                              </Badge>
                            ) : (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleApproveAndSend(msg)}
                                  className="h-7 text-xs"
                                >
                                  Approve &amp; Send
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleGenerateSuggestion(msg)}
                                  disabled={generating[msg.id]}
                                  className="h-7 text-xs"
                                >
                                  {generating[msg.id] ? '...' : 'Regenerate'}
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenerateSuggestion(msg)}
                              disabled={generating[msg.id]}
                              className="h-7 text-xs w-full"
                            >
                              {generating[msg.id] ? 'Generating...' : 'AI Reply'}
                            </Button>
                            <div className="flex gap-1">
                              <Input
                                placeholder="Type manual reply..."
                                value={replyText[msg.id] || ''}
                                onChange={(e) =>
                                  setReplyText((prev) => ({ ...prev, [msg.id]: e.target.value }))
                                }
                                className="h-7 text-xs"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleManualReply(msg)}
                                className="h-7 text-xs"
                              >
                                Send
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── MVP: Mock AI reply generator ──

function generateMockReply(incomingMessage: string): string {
  const lower = incomingMessage.toLowerCase();

  if (lower.includes('order') || lower.includes('track') || lower.includes('delivery')) {
    return 'Thank you for reaching out! I can help you track your order. Please share your order number and I will look it up right away.';
  }
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
    return 'Great question! Our prices vary depending on the product. Could you let me know which item you are interested in? I will get you the best available price.';
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return 'Hello! Thank you for contacting us. How can I assist you today?';
  }
  if (lower.includes('return') || lower.includes('refund')) {
    return 'I understand you have a question about returns or refunds. Our policy allows returns within 14 days. Could you share your order number so I can assist you further?';
  }
  if (lower.includes('shipping') || lower.includes('delivery time')) {
    return 'Shipping typically takes 3-7 business days depending on your location. Would you like me to check the delivery status for your area?';
  }
  if (lower.includes('thanks') || lower.includes('thank you')) {
    return 'You are most welcome! Is there anything else I can help you with?';
  }

  return 'Thank you for your message! A member of our team will review and respond shortly. If this is urgent, please let us know and we will prioritize your request.';
}
