import { useEffect, useState } from 'react';
import { aiApi } from '@/lib/aiApi';
import { AiResponseView } from '@/components/ai/AiResponseView';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page';
import { ChatTypingIndicator } from '@/components/chat/ChatMessage';

const AGENTS = [
  'ceo',
  'ads',
  'meta',
  'moderator',
  'support',
  'product',
  'finance',
  'shipping',
  'hr',
  'confirmation',
];

export default function PlaygroundPage() {
  const [agent, setAgent] = useState('ceo');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [structured, setStructured] = useState<unknown>(undefined);
  const [meta, setMeta] = useState<{ provider?: string; latency?: number; model?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (agent === 'ceo') {
      setSystemPrompt('');
    }
  }, [agent]);

  async function run() {
    if (!prompt.trim()) return;
    setLoading(true);
    setResponse('');
    setStructured(undefined);
    setMeta(null);
    setError(null);
    try {
      const res = await aiApi.process(agent, prompt, {
        ...(systemPrompt.trim() ? { systemPrompt: systemPrompt.trim() } : {}),
      });
      if (!res.success && res.error) {
        setError(res.error);
        return;
      }
      setResponse(res.response || '');
      setStructured(res.structured);
      setMeta({ provider: res.provider, latency: res.latency, model: res.model });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-shell-wide animate-fade-in">
      <PageHeader
        title="Playground"
        description="Developer sandbox with formatted output and raw JSON toggle"
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardBody className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Agent</label>
              <Select value={agent} onChange={(e) => setAgent(e.target.value)}>
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">
                System context {agent === 'ceo' && '(optional — CEO uses built-in strategist)'}
              </label>
              <Textarea
                className="min-h-[88px]"
                placeholder={
                  agent === 'ceo'
                    ? 'Leave empty for the NexusAI CEO strategist prompt…'
                    : 'Optional system instructions…'
                }
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                dir="auto"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Your prompt</label>
              <Textarea
                className="min-h-[140px]"
                placeholder="Ask your agent anything…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                dir="auto"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    run();
                  }
                }}
              />
              <p className="text-[11px] text-zinc-600">⌘/Ctrl + Enter to run</p>
            </div>
            <Button onClick={run} disabled={loading} className="w-full" size="lg">
              {loading ? 'Running…' : 'Run'}
            </Button>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3" variant="elevated">
          <CardBody className="flex min-h-[min(70vh,520px)] flex-col">
            <CardHeader
              title="Response"
              description={
                meta
                  ? [meta.provider, meta.model, meta.latency != null ? `${meta.latency}ms` : null]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Output appears here'
              }
            />
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-300/90">
                {error}
              </div>
            )}
            <div className="flex-1 rounded-xl border border-white/[0.06] bg-surface/60 p-4 sm:p-5">
              {loading ? (
                <ChatTypingIndicator />
              ) : (
                <AiResponseView
                  content={response}
                  structured={structured}
                  debugMode
                  emptyLabel="Send a prompt to see the formatted response."
                />
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
