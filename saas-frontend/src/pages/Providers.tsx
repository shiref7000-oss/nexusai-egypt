import { useEffect, useState } from 'react';
import { Cpu, CheckCircle, XCircle } from 'lucide-react';
import { agentsApi } from '@/lib/agentsApi';
import { Card, CardBody } from '@/components/ui/card';

export default function ProvidersPage() {
  const [providers, setProviders] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    agentsApi
      .providerStatus()
      .then((r) => setProviders(Array.isArray(r.data) ? r.data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Providers</h1>
        <p className="text-gray-400 text-sm mt-0.5">Manage your AI provider connections</p>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading provider health…</p>
      ) : providers.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-gray-400 space-y-2">
            <p>Provider health is reported from the API runtime configuration.</p>
            <p>
              Configure keys in server environment (OpenAI, Groq, Gemini, OpenRouter) to enable
              multi-provider routing.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-3">
          {providers.map((p, i) => {
            const row = p as Record<string, unknown>;
            const healthy = row.healthy === true || row.status === 'ok';
            return (
              <Card key={i}>
                <CardBody className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-brand" />
                    <div>
                      <p className="font-medium">{String(row.id || row.name || `Provider ${i + 1}`)}</p>
                      {row.model != null && (
                        <p className="text-xs text-gray-500">{String(row.model)}</p>
                      )}
                    </div>
                  </div>
                  {healthy ? (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle className="w-4 h-4" /> Healthy
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400 text-sm">
                      <XCircle className="w-4 h-4" /> Unavailable
                    </span>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
