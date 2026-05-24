import { apiFetch } from './api';

export type UserPreferences = {
  notifications: {
    emailDigest: boolean;
    agentAlerts: boolean;
    billingAlerts: boolean;
    productUpdates: boolean;
  };
  language: string;
  timezone: string;
  workspace: {
    defaultAgent: string;
    compactSidebar: boolean;
    arabicResponses: boolean;
  };
  paymentMethod: { brand: string; last4: string; exp: string } | null;
};

export type AccountSettings = {
  profile: {
    name: string;
    email: string;
    phone: string;
    avatarUrl: string;
    plan: string;
    role: string;
  };
  preferences: UserPreferences;
  apiKeys: { id: number; name: string; key_prefix: string; last_used_at: string | null; created_at: string }[];
  connectedAccounts: {
    id: number;
    name: string;
    provider: string;
    status: string;
    connectedAt: string;
  }[];
  usage: { monthlyLimit: number; monthlyUsed: number; remaining: number; percentUsed: number } | null;
};

export type BillingData = {
  currentPlan: {
    slug: string;
    name: string;
    priceUsdMonthly: number;
    status: string;
    periodEnd: string | null;
  };
  usage: { monthlyLimit: number; monthlyUsed: number; percentUsed: number };
  limits: { monthlyRequests: number; agents: number; integrations: number; workflows: number };
  paymentMethod: UserPreferences['paymentMethod'];
  invoices: {
    id: string;
    period: string;
    amountUsd: number;
    status: string;
    requests: number;
    tokens: number;
  }[];
  plans: {
    slug: string;
    name: string;
    priceUsdMonthly: number;
    monthlyRequests: number;
    features: unknown;
  }[];
};

export const accountApi = {
  settings: () =>
    apiFetch<{ success: boolean; data: AccountSettings }>('/api/account/settings'),
  patchProfile: (body: Partial<AccountSettings['profile']>) =>
    apiFetch<{ success: boolean; data: { profile: AccountSettings['profile'] } }>(
      '/api/account/profile',
      { method: 'PATCH', body: JSON.stringify(body) }
    ),
  patchPreferences: (body: Partial<UserPreferences>) =>
    apiFetch<{ success: boolean; data: { preferences: UserPreferences } }>(
      '/api/account/preferences',
      { method: 'PATCH', body: JSON.stringify(body) }
    ),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch('/api/account/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  createApiKey: (name: string) =>
    apiFetch<{
      success: boolean;
      data: { key: { id: number; name: string; key_prefix: string; secret: string }; message: string };
    }>(
      '/api/account/api-keys',
      { method: 'POST', body: JSON.stringify({ name }) }
    ),
  revokeApiKey: (id: number) =>
    apiFetch(`/api/account/api-keys/${id}`, { method: 'DELETE' }),
  billing: () => apiFetch<{ success: boolean; data: BillingData }>('/api/account/billing'),
};
