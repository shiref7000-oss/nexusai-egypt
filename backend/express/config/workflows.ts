/**
 * Canonical workflow registry — maps agents to n8n workflow names and webhook paths.
 * n8n workflow `name` must match `n8nName` after import.
 */
export type WorkflowDefinition = {
  key: string;
  agent: string;
  displayName: string;
  n8nName: string;
  /** Published n8n workflow UUID (set after import on production). */
  n8nWorkflowId?: string;
  webhookPath: string;
  description: string;
};

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    key: 'customer-support',
    agent: 'support',
    displayName: 'Customer Support Agent',
    n8nName: 'Customer Support Agent',
    n8nWorkflowId: '07cfcc14-b3b0-49a6-bf2a-8ec44eabcd5e',
    webhookPath: 'customer-support-agent',
    description: 'WhatsApp / chat support automation',
  },
  {
    key: 'order-confirmation',
    agent: 'confirmation',
    displayName: 'Order Confirmation Agent',
    n8nName: 'Order Confirmation Agent',
    n8nWorkflowId: 'd5957ebd-280c-4c1d-ad35-933697b28b09',
    webhookPath: 'order-confirmation-agent',
    description: 'Order validation and confirmation messages',
  },
  {
    key: 'ads-creative',
    agent: 'ads',
    displayName: 'Ads Creative Agent',
    n8nName: 'Ads Creative Agent',
    n8nWorkflowId: 'e46f8010-b3ea-46b0-8603-ce372b7a7a14',
    webhookPath: 'ads-creative-agent',
    description: 'Ad copy and creative generation',
  },
  {
    key: 'shipping-tracking',
    agent: 'shipping',
    displayName: 'Shipping Tracking Agent',
    n8nName: 'Shipping Tracking Agent',
    n8nWorkflowId: '9ea70128-d20c-4620-bf8a-e88fe44862f0',
    webhookPath: 'shipping-tracking-agent',
    description: 'Shipment status and COD tracking',
  },
  {
    key: 'analytics',
    agent: 'meta',
    displayName: 'Analytics Agent',
    n8nName: 'Analytics Agent',
    n8nWorkflowId: '93a95621-09ab-4e57-914b-44e78f944201',
    webhookPath: 'analytics-agent',
    description: 'Revenue and ads metrics analysis',
  },
];

export function getWorkflowByKey(key: string): WorkflowDefinition | undefined {
  return WORKFLOW_DEFINITIONS.find((w) => w.key === key);
}

export function getWorkflowByN8nName(name: string): WorkflowDefinition | undefined {
  return WORKFLOW_DEFINITIONS.find((w) => w.n8nName === name);
}

export function getWorkflowByWebhookPath(path: string): WorkflowDefinition | undefined {
  return WORKFLOW_DEFINITIONS.find((w) => w.webhookPath === path);
}

/** Maps integration queue job names to registry entries. */
export const WORKFLOW_NAME_TO_KEY: Record<string, string> = {
  'Customer Support': 'customer-support',
  'Customer Support Agent': 'customer-support',
  'Order Confirmation': 'order-confirmation',
  'Order Confirmation Agent': 'order-confirmation',
  'Ads Creative': 'ads-creative',
  'Ads Creative Agent': 'ads-creative',
  'Shipping Tracking': 'shipping-tracking',
  'Shipping Tracking Agent': 'shipping-tracking',
  Analytics: 'analytics',
  'Analytics Agent': 'analytics',
};
