import { Card, CardBody, CardHeader } from '@/components/ui/card';

export function AgentSmokeTestCard() {
  return (
    <Card>
      <CardBody>
        <CardHeader
          title="Agent Smoke Test"
          description="Smoke test card for the engineering agent monitor."
        />
        <p className="text-sm text-zinc-500">
          This card is only rendered on the Engineering Agent Monitor page.
        </p>
      </CardBody>
    </Card>
  );
}
