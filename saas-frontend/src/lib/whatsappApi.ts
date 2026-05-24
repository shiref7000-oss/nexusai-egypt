import { apiFetchWithTimeout } from './fetchWithTimeout';

export type WhatsAppSettings = {
  codEnabled: boolean;
  codDelaySeconds: number;
  codTemplateKey: string;
  confirmKeywords: string[];
  cancelKeywords: string[];
};

export type WhatsAppConnection = {
  connected: boolean;
  status: string;
  metaAppId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhone: string | null;
  businessName: string | null;
  webhookVerified: boolean;
  webhookVerifiedAt: string | null;
  codFlowEnabled: boolean;
  lastError: string | null;
  settings?: WhatsAppSettings;
  lastTemplateSyncAt?: string | null;
};

export type WhatsAppTemplate = {
  key: string;
  metaName: string;
  languageCode?: string;
  category?: string;
  status: string;
  metaStatus: string | null;
  rejectionReason: string | null;
  lastSyncedAt: string | null;
  testOnly?: boolean;
  sendAllowed?: boolean;
  layout?: {
    header: { type: string; format?: string; text?: string } | null;
    footer: { text?: string } | null;
    buttons: Array<{ type: string; text?: string }>;
  };
  flow?: string;
  catalog?: {
    key: string;
    label: string;
    description: string;
    sampleBody: string;
    flow?: string;
  };
};

export type WhatsAppWebhookAudit = {
  webhookUrl: string;
  httpsReachable: boolean;
  getVerifyStatus: number | null;
  getVerifyReturnsChallenge: boolean;
  verifyTokenMatchesDb: boolean;
  webhookVerifiedInDb: boolean;
  webhookVerifiedAt: string | null;
  wabaSubscribedApps: Array<{ id?: string; name?: string }>;
  wabaSubscribeAttempt: { ok: boolean; message: string };
  metaAppSecretConfigured: boolean;
  recommendedMetaFields: string[];
  issues: string[];
  hints: string[];
};

export type WhatsAppTestVerification = {
  selectedTemplate: string;
  metaTemplateName: string;
  languageCode: string;
  detectedVariableCount: number;
  generatedPayload: Record<string, unknown>;
  metaApiResponse: unknown;
  deliveryStatus: string;
  messageId?: string;
  messageRecordId?: string;
  layout: {
    header: { type: string; format?: string; text?: string } | null;
    footer: { text?: string } | null;
    buttons: Array<{ type: string; text?: string }>;
  };
};

export type WhatsAppStats = {
  sent: number;
  delivered: number;
  read: number;
  confirmed: number;
  failed: number;
};

export type WhatsAppAnalytics = {
  today: { sent: number; delivered: number; read: number; failed: number; inbound: number };
  period30d: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    inbound: number;
    deliveryPct: number;
    readPct: number;
    failedPct: number;
    confirmationPct: number;
  };
  topTemplates: Array<{ key: string; count: number }>;
};

export type WhatsAppActivity = {
  id: string;
  direction: string;
  messageType: string;
  templateKey: string | null;
  status: string;
  bodyPreview: string;
  errorMessage?: string | null;
  phone: string | null;
  orderId: string | null;
  orderExternalId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
};

export type WhatsAppQueueHealth = {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  healthy: boolean;
  status: string;
};

export type WhatsAppWorkerHealth = {
  redisReady: boolean;
  workerReachable: boolean;
  workerRole: string;
  note: string;
};

export type WhatsAppMessage = {
  id: string;
  direction: string;
  messageType: string;
  templateKey: string | null;
  status: string;
  bodyPreview: string;
  waMessageId?: string | null;
  orderId?: string | null;
  errorMessage?: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type WhatsAppConversation = {
  customerPhone: string;
  customerName: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  lastDirection: string;
  lastMessageType: string;
  lastStatus: string;
  unreadCount: number;
};

export type WhatsAppConversationsPayload = {
  conversations: WhatsAppConversation[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  serverTime: string;
};

export type WhatsAppConversationMessagesPayload = {
  customerPhone: string;
  customerName: string | null;
  messages: WhatsAppMessage[];
  hasMore: boolean;
  serverTime: string;
};

export type WhatsAppInboxTemplate = {
  key: string;
  metaName: string;
  languageCode: string;
  bodyVariableCount: number;
  label: string;
};

export type WhatsAppSyncSummary = {
  templatesUpdated: number;
  templatesTotal: number;
  remoteTemplateCount: number;
  phoneUpdated: boolean;
  unmatchedLocal: string[];
  remoteTemplates: Array<{ name: string; status: string; language: string }>;
  message: string;
  _timingMs?: number;
};

export type WhatsAppStatusPayload = {
  connection: WhatsAppConnection;
  webhookUrl: string;
  templates: WhatsAppTemplate[];
  templateSync: {
    lastSyncedAt: string | null;
    approved: number;
    pending: number;
    rejected: number;
    total: number;
  };
  stats: WhatsAppStats;
  analytics: WhatsAppAnalytics;
  activity: WhatsAppActivity[];
  queue: WhatsAppQueueHealth;
  worker?: WhatsAppWorkerHealth;
  settings: WhatsAppSettings;
  flows: Record<string, { enabled?: boolean; ready?: boolean; note?: string }>;
  sync?: WhatsAppSyncSummary;
};

const opts = { timeoutMs: 20000 };

export const whatsappApi = {
  status: () =>
    apiFetchWithTimeout<{ success: boolean; data: WhatsAppStatusPayload }>('/api/whatsapp/status', opts),

  /** Pull templates + phone profile from Meta, then return full dashboard payload. */
  syncFromMeta: () =>
    apiFetchWithTimeout<{ success: boolean; data: WhatsAppStatusPayload }>('/api/whatsapp/sync', {
      timeoutMs: 30000,
      method: 'POST',
    }),

  testConnection: (phoneNumberId: string, accessToken: string, wabaId?: string) =>
    apiFetchWithTimeout<{
      success: boolean;
      data: {
        ok: boolean;
        displayPhone?: string;
        verifiedName?: string;
        resolvedPhoneNumberId?: string;
        hint?: string;
        message?: string;
        _timingMs?: number;
        worker?: WhatsAppWorkerHealth;
      };
    }>('/api/whatsapp/test-connection', {
      timeoutMs: 14000,
      method: 'POST',
      body: JSON.stringify({ phoneNumberId, accessToken, ...(wabaId ? { wabaId } : {}) }),
    }),

  connect: (body: {
    metaAppId: string;
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
    webhookVerifyToken: string;
    displayPhone?: string;
    businessName?: string;
  }) =>
    apiFetchWithTimeout<{ success: boolean; data: { connection: WhatsAppConnection; webhookUrl: string } }>(
      '/api/whatsapp/connect',
      { ...opts, method: 'POST', body: JSON.stringify(body) }
    ),

  disconnect: () =>
    apiFetchWithTimeout<{ success: boolean; data: { connection: WhatsAppConnection } }>('/api/whatsapp/disconnect', {
      ...opts,
      method: 'POST',
    }),

  updateSettings: (settings: Partial<WhatsAppSettings>) =>
    apiFetchWithTimeout<{ success: boolean; data: { settings: WhatsAppSettings } }>('/api/whatsapp/settings', {
      ...opts,
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  syncTemplates: () =>
    apiFetchWithTimeout<{
      success: boolean;
      data: {
        templates: WhatsAppTemplate[];
        templateSync: WhatsAppStatusPayload['templateSync'];
        connection: WhatsAppConnection;
        sync: WhatsAppSyncSummary;
      };
    }>('/api/whatsapp/templates/sync', {
      timeoutMs: 30000,
      method: 'POST',
    }),

  mapTemplate: (templateKey: string, metaTemplateName: string) =>
    apiFetchWithTimeout<{ success: boolean; data: { templates: WhatsAppTemplate[] } }>(
      `/api/whatsapp/templates/${templateKey}`,
      { ...opts, method: 'PATCH', body: JSON.stringify({ metaTemplateName }) }
    ),

  webhookAudit: () =>
    apiFetchWithTimeout<{ success: boolean; data: { audit: WhatsAppWebhookAudit } }>(
      '/api/whatsapp/webhook-audit',
      opts
    ),

  webhookSetup: (verifyToken?: string) =>
    apiFetchWithTimeout<{ success: boolean; data: { audit: WhatsAppWebhookAudit } }>(
      '/api/whatsapp/webhook-setup',
      {
        ...opts,
        method: 'POST',
        body: JSON.stringify(verifyToken ? { verifyToken } : {}),
      }
    ),

  testMessage: (body: { phone: string; templateKey?: string; bodyParameters?: string[] }) =>
    apiFetchWithTimeout<{
      success: boolean;
      data: {
        queued?: boolean;
        sent?: boolean;
        jobId?: string;
        message?: string;
        verification?: WhatsAppTestVerification;
        worker?: WhatsAppWorkerHealth;
        _timingMs?: number;
      };
    }>('/api/whatsapp/test-message', {
      timeoutMs: 20000,
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resendFailed: () =>
    apiFetchWithTimeout<{ success: boolean; data: { queued: number; totalFailed: number } }>(
      '/api/whatsapp/messages/resend-failed',
      { ...opts, method: 'POST' }
    ),

  orderMessages: (orderId: string) =>
    apiFetchWithTimeout<{ success: boolean; data: { messages: WhatsAppMessage[] } }>(
      `/api/whatsapp/orders/${orderId}/messages`,
      opts
    ),

  resendConfirmation: (orderId: string) =>
    apiFetchWithTimeout<{ success: boolean; data: { queued: boolean; reason?: string } }>(
      `/api/whatsapp/orders/${orderId}/resend-confirmation`,
      { ...opts, method: 'POST' }
    ),

  conversations: (params?: { q?: string; page?: number; limit?: number; since?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.page) sp.set('page', String(params.page));
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.since) sp.set('since', params.since);
    const qs = sp.toString();
    return apiFetchWithTimeout<{ success: boolean; data: WhatsAppConversationsPayload }>(
      `/api/whatsapp/conversations${qs ? `?${qs}` : ''}`,
      opts
    );
  },

  conversationMessages: (
    phone: string,
    params?: { limit?: number; before?: string; since?: string }
  ) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.before) sp.set('before', params.before);
    if (params?.since) sp.set('since', params.since);
    const qs = sp.toString();
    const encoded = encodeURIComponent(phone.replace(/\D/g, ''));
    return apiFetchWithTimeout<{ success: boolean; data: WhatsAppConversationMessagesPayload }>(
      `/api/whatsapp/conversations/${encoded}/messages${qs ? `?${qs}` : ''}`,
      opts
    );
  },

  markConversationRead: (phone: string) => {
    const encoded = encodeURIComponent(phone.replace(/\D/g, ''));
    return apiFetchWithTimeout<{ success: boolean; data: { customerPhone: string } }>(
      `/api/whatsapp/conversations/${encoded}/read`,
      { ...opts, method: 'POST' }
    );
  },

  sendConversationText: (phone: string, text: string) => {
    const encoded = encodeURIComponent(phone.replace(/\D/g, ''));
    return apiFetchWithTimeout<{ success: boolean; data: { message: WhatsAppMessage } }>(
      `/api/whatsapp/conversations/${encoded}/messages`,
      { ...opts, method: 'POST', body: JSON.stringify({ text }) }
    );
  },

  sendConversationTemplate: (
    phone: string,
    body: { templateKey: string; bodyParameters?: string[] }
  ) => {
    const encoded = encodeURIComponent(phone.replace(/\D/g, ''));
    return apiFetchWithTimeout<{ success: boolean; data: { message: WhatsAppMessage } }>(
      `/api/whatsapp/conversations/${encoded}/template`,
      { ...opts, method: 'POST', body: JSON.stringify(body) }
    );
  },

  inboxTemplates: () =>
    apiFetchWithTimeout<{ success: boolean; data: { templates: WhatsAppInboxTemplate[] } }>(
      '/api/whatsapp/conversations/templates',
      opts
    ),
};
