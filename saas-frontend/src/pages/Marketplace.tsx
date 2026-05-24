import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, Bot, Check, ArrowRight } from 'lucide-react';
import { agentsApi, type AgentConfig } from '@/lib/agentsApi';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** Agent template catalog — install/activate agents for your workspace */
export default function MarketplacePage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    agentsApi
      .list()
      .then((r) => setAgents(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  async function activate(agentId: string) {
    setActivating(agentId);
    try {
      await agentsApi.toggle(agentId);
      const r = await agentsApi.list();
      setAgents(r.data || []);
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="w-7 h-7 text-brand" />
          Agent Marketplace
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Browse and activate AI agents for ecommerce, ads, support, and operations.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading catalog…</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="hover:border-brand/30 transition-colors">
              <CardBody className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand/20 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-brand" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{agent.agent_name}</h3>
                    <p className="text-xs text-gray-500 capitalize">{agent.agent_id} agent</p>
                  </div>
                </div>
                <ul className="text-sm text-gray-400 space-y-1">
                  {(agent.capabilities || []).map((c) => (
                    <li key={c} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-brand mt-0.5 shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant={agent.is_active ? 'outline' : 'default'}
                    disabled={activating === agent.agent_id}
                    onClick={() => activate(agent.agent_id)}
                  >
                    {agent.is_active ? 'Installed' : 'Activate'}
                  </Button>
                  <Link to="/agents">
                    <Button variant="outline" size="icon" title="Open in Agents">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Configure agents in{' '}
        <Link to="/agents" className="text-brand hover:underline">
          AI Agents
        </Link>{' '}
        or test prompts in{' '}
        <Link to="/playground" className="text-brand hover:underline">
          AI Playground
        </Link>
        .
      </p>
    </div>
  );
}
