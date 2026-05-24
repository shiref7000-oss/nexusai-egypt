import { useMemo, useState, type ReactNode } from 'react';
import { Code2, Copy, Check } from 'lucide-react';
import { parseAiContent, structuredToMarkdown, type ParsedAiContent } from '@/lib/parseAiContent';
import { extractCustomerArabic } from '@/lib/aiCustomerMessage';
import { Button } from '@/components/ui/button';

type Props = {
  content: string;
  structured?: unknown;
  /** Customer UI: Arabic only. Admin/playground: full structured view + raw JSON. */
  debugMode?: boolean;
  emptyLabel?: string;
  className?: string;
};

const SECTION_LABELS: Record<string, string> = {
  insights: 'Insights',
  recommendations: 'Recommendations',
  alerts: 'Alerts',
  risks: 'Risks',
  scaling_opportunities: 'Scaling opportunities',
  trending_products: 'Trending products',
  variations: 'Ad variations',
  team_metrics: 'Team metrics',
};

const TEXT_KEYS = [
  'summary',
  'insight',
  'response_ar',
  'response_en',
  'response',
  'confirmation_message',
  'english_version',
  'suggested_action',
  'delivery_estimate',
];

export function AiResponseView({
  content,
  structured,
  debugMode = false,
  emptyLabel = 'Response will appear here.',
  className = '',
}: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const customerArabic = useMemo(
    () => extractCustomerArabic(content, structured),
    [content, structured]
  );

  const parsed = useMemo(
    () => parseAiContent(content, structured),
    [content, structured]
  );

  const rawDisplay = useMemo(() => {
    if (structured != null && typeof structured === 'object') {
      try {
        return JSON.stringify(structured, null, 2);
      } catch {
        /* fall through */
      }
    }
    return content || '';
  }, [content, structured]);

  const displayMarkdown = useMemo(() => {
    if (parsed.mode === 'json') return structuredToMarkdown(parsed.value);
    if (parsed.mode === 'markdown') return parsed.text;
    if (parsed.mode === 'text') return parsed.text;
    return '';
  }, [parsed]);

  if (!debugMode) {
    if (!customerArabic) {
      return <p className={`text-[15px] text-zinc-500 ${className}`}>{emptyLabel}</p>;
    }
    return (
      <p
        className={`text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap ${className}`}
        dir="auto"
      >
        {customerArabic}
      </p>
    );
  }

  async function copyText() {
    const text = showRaw ? rawDisplay : displayMarkdown || content;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (parsed.mode === 'empty' && !showRaw) {
    return <p className={`text-sm text-gray-500 ${className}`}>{emptyLabel}</p>;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-end gap-1 border-b border-white/[0.06] pb-3 mb-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-zinc-500 h-8"
          onClick={() => setShowRaw((v) => !v)}
        >
          <Code2 className="w-3.5 h-3.5 mr-1" />
          {showRaw ? 'Formatted' : 'Raw JSON'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-zinc-500 h-8"
          onClick={copyText}
        >
          {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {showRaw ? (
        <pre
          className="text-xs text-gray-300 bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto max-h-[min(70vh,520px)] overflow-y-auto font-mono whitespace-pre-wrap break-words"
          dir="ltr"
        >
          {rawDisplay || emptyLabel}
        </pre>
      ) : (
        <FormattedBody parsed={parsed} fallbackMarkdown={displayMarkdown} />
      )}
    </div>
  );
}

function FormattedBody({
  parsed,
  fallbackMarkdown,
}: {
  parsed: ParsedAiContent;
  fallbackMarkdown: string;
}) {
  if (parsed.mode === 'json') {
    return <JsonBody value={parsed.value} />;
  }
  if (parsed.mode === 'markdown' || parsed.mode === 'text') {
    const text = parsed.mode === 'markdown' ? parsed.text : parsed.text;
    return <MarkdownBody text={text} />;
  }
  if (fallbackMarkdown) return <MarkdownBody text={fallbackMarkdown} />;
  return null;
}

function JsonBody({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value === 'string') {
    return (
      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap" dir="auto">
        {value}
      </p>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-2 text-sm text-gray-200" dir="auto">
        {value.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand shrink-0">•</span>
            <span>{renderJsonValue(item)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value !== 'object') {
    return <p className="text-sm text-gray-200" dir="auto">{String(value)}</p>;
  }

  const obj = value as Record<string, unknown>;
  const headline = pickStr(obj.headline, obj.title);
  const usedKeys = new Set<string>([
    'headline',
    'title',
    'grade',
    'confidence',
    ...TEXT_KEYS,
    ...Object.keys(SECTION_LABELS),
  ]);

  return (
    <article className="space-y-4 text-sm" dir="auto">
      {headline && (
        <h2 className="text-lg font-semibold text-white leading-snug">{headline}</h2>
      )}
      {obj.grade != null && (
        <span className="inline-flex items-center rounded-full bg-brand/15 text-brand text-xs font-medium px-2.5 py-0.5 border border-brand/25">
          Grade: {String(obj.grade)}
        </span>
      )}
      {TEXT_KEYS.map((key) => {
        const v = obj[key];
        if (typeof v !== 'string' || !v.trim()) return null;
        return (
          <section key={key} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
              {labelForKey(key)}
            </p>
            <p className="text-gray-100 leading-relaxed whitespace-pre-wrap">{v}</p>
          </section>
        );
      })}
      {Object.entries(SECTION_LABELS).map(([key, label]) => {
        const arr = obj[key];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return (
          <section key={key} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <h3 className="text-sm font-medium text-brand mb-2">{label}</h3>
            <ul className="space-y-2 text-gray-200">
              {arr.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-brand shrink-0">•</span>
                  <span className="min-w-0">{renderJsonValue(item)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {Object.entries(obj)
        .filter(([k, v]) => !usedKeys.has(k) && v != null && v !== '')
        .map(([k, v]) => (
          <section key={k} className="rounded-lg border border-white/5 bg-black/20 p-3">
            <p className="text-xs text-gray-500 mb-1">{humanizeKey(k)}</p>
            <div className="text-gray-300">{renderJsonValue(v)}</div>
          </section>
        ))}
      {obj.confidence != null && (
        <p className="text-xs text-gray-500 italic">Confidence: {String(obj.confidence)}</p>
      )}
    </article>
  );
}

function renderJsonValue(v: unknown): ReactNode {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((x) => formatInline(x)).join(', ');
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const title = pickStr(o.hook, o.headline, o.title);
    const sub = pickStr(o.primaryText, o.text, o.cta, o.angle);
    if (title) return sub ? `${title} — ${sub}` : title;
    return JSON.stringify(v);
  }
  return String(v ?? '');
}

function formatInline(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v) return JSON.stringify(v);
  return String(v ?? '');
}

function MarkdownBody({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  return (
    <article className="space-y-3 text-sm text-gray-100 leading-relaxed max-h-[min(70vh,520px)] overflow-y-auto pr-1" dir="auto">
      {blocks}
    </article>
  );
}

function parseMarkdownBlocks(text: string): ReactNode[] {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let listItems: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    out.push(
      <ul key={`ul-${key++}`} className="space-y-1.5 pl-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand shrink-0">•</span>
            <span>{inlineFormat(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushList();
      if (inCode) {
        out.push(
          <pre
            key={`code-${key++}`}
            className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto font-mono"
            dir="ltr"
          >
            {codeLines.join('\n')}
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const level = line.match(/^#+/)?.[0].length ?? 2;
      const content = line.replace(/^#+\s*/, '');
      if (level <= 2) {
        out.push(
          <h2 key={`h-${key++}`} className="text-lg font-semibold text-white mt-2">
            {inlineFormat(content)}
          </h2>
        );
      } else {
        out.push(
          <h3 key={`h-${key++}`} className="text-sm font-medium text-brand mt-2">
            {inlineFormat(content)}
          </h3>
        );
      }
      continue;
    }
    if (/^[-*]\s/.test(line.trim())) {
      listItems.push(line.trim().replace(/^[-*]\s+/, ''));
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    out.push(
      <p key={`p-${key++}`} className="whitespace-pre-wrap">
        {inlineFormat(line)}
      </p>
    );
  }
  flushList();
  if (inCode && codeLines.length) {
    out.push(
      <pre
        key={`code-${key++}`}
        className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto font-mono"
        dir="ltr"
      >
        {codeLines.join('\n')}
      </pre>
    );
  }
  return out;
}

function inlineFormat(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return (
        <em key={i} className="text-gray-400 not-italic text-xs">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function labelForKey(key: string): string {
  const map: Record<string, string> = {
    response_ar: 'Arabic',
    response_en: 'English',
    confirmation_message: 'Confirmation',
    english_version: 'English',
    suggested_action: 'Suggested action',
    delivery_estimate: 'Delivery estimate',
  };
  return map[key] || humanizeKey(key);
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
