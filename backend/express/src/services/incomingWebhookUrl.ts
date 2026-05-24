export function incomingOrderWebhookUrl(integrationId: number): string {
  const base = (process.env.API_BASE_URL || 'https://nexus-ai.group/api').replace(/\/$/, '');
  return `${base}/public/orders/${integrationId}`;
}

export function formatIntegrationRow(row: Record<string, unknown>) {
  const { incoming_secret: _secret, ...rest } = row;
  const id = Number(row.id);
  return {
    ...rest,
    incoming_webhook_url: incomingOrderWebhookUrl(id),
  };
}
