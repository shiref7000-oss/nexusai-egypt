import { apiFetch } from './api';

export type AdminPlan = 'free' | 'basic' | 'pro' | 'enterprise';
export type AdminStatus = 'active' | 'suspended' | 'pending';

export interface AdminUser {
  id: number;
  email: string;
  full_name?: string | null;
  role: string;
  plan: string;
  status: string;
  created_at?: string;
  last_login?: string | null;
  login_count?: number;
  monthly_request_limit?: number;
  monthly_requests_used?: number;
  usage?: { monthlyUsed: number; monthlyLimit: number };
}

export interface AdminUsersResponse {
  success: boolean;
  data: {
    users: AdminUser[];
    pagination: { page: number; limit: number; total: number; pages: number };
  };
}

function adminPath(path: string) {
  return `/api/admin${path}`;
}

export type PlatformFlags = {
  agents_enabled: boolean;
  beta_workflows: boolean;
  onboarding_enabled: boolean;
  experimental_ui: boolean;
  maintenance_mode: boolean;
};

export type EngineeringAgentTaskRow = {
  id: string;
  userId: number;
  userEmail?: string;
  title: string;
  prompt: string;
  status: string;
  currentPhase: string;
  currentStep?: string;
  progressPercent: number;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  filesReadCount: number;
  filesWrittenCount: number;
  filesModified: string[];
  buildStatus: string | null;
  buildDurationMs: number | null;
  deployStage?: string | null;
  deployStageLabel?: string;
  taskType?: string;
  executionMode?: string;
  verificationStatus?: string | null;
  verificationSummary?: Record<string, unknown> | null;
  confidenceScore?: number | null;
  deploymentBlocked?: boolean;
  parentTaskId?: string | null;
  reliability?: Record<string, unknown> | null;
  canDeploy?: boolean;
  pipelinePhase?: string | null;
  pipelinePhaseLabel?: string | null;
  pipelineState?: Record<string, unknown> | null;
  understandingConfidence?: number | null;
  implementationConfidence?: number | null;
  verificationConfidencePct?: number | null;
  riskScore?: number | null;
  riskCategory?: string | null;
  riskReport?: Record<string, unknown> | null;
  riskApprovalStatus?: string | null;
  agentGitBranch?: string | null;
  rollbackAvailable?: boolean;
};

export type EngineeringVerificationCheck = {
  id: string;
  check_type: string;
  name: string;
  status: string;
  message: string | null;
  evidence: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
};

export type EngineeringTaskArtifact = {
  id: string;
  artifactType: string;
  label: string | null;
  filePath: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  downloadUrl: string;
};

export type EngineeringDeploymentRow = {
  id: string;
  taskId: string;
  taskTitle?: string;
  taskStatus?: string;
  taskBuildStatus?: string | null;
  status: string;
  deployStage: string | null;
  startedByUserId: number | null;
  startedByEmail: string;
  backupId: string | null;
  healthChecks: Array<{ name: string; ok: boolean; detail?: string; at: string }>;
  commandsLog: Array<{
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    at: string;
  }>;
  errorMessage: string | null;
  rollbackOfDeploymentId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

export type EngineeringDeploymentDetail = {
  deployment: EngineeringDeploymentRow;
  logs: Array<{
    id: number;
    level: string;
    message: string;
    payload: unknown;
    createdAt: string;
  }>;
  backup: {
    id: string;
    stamp: string;
    appBackupPath: string | null;
    dbBackupPath: string | null;
    metadata: Record<string, unknown>;
    createdByEmail: string;
    createdAt: string;
  } | null;
};

export type EngineeringAgentActivityItem = {
  id: number;
  level: string;
  eventType: string;
  message: string | null;
  payload: unknown;
  createdAt: string;
};

export type EngineeringSessionMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type EngineeringTaskSession = {
  id: string;
  status: string;
  sessionSummary?: string | null;
  summaryUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EngineeringAICompressionMetrics = {
  originalContextTokens: number | null;
  compressedContextTokens: number | null;
  savedContextTokens: number | null;
  compressionPct: number | null;
  avgCompressionPct: number | null;
  telemetryError: string | null;
};

export type EngineeringAIPhaseUsage = {
  phase: string;
  engineeringTask: string;
  model: string | null;
  calls: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  originalContextTokens: number | null;
  compressedContextTokens: number | null;
  savedContextTokens: number | null;
  compressionPct: number | null;
  telemetryError: string | null;
};

export type EngineeringAIExecution = {
  id: number;
  phase: string;
  engineeringTask: string;
  model: string;
  modelTier: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  originalContextTokens: number | null;
  compressedContextTokens: number | null;
  savedContextTokens: number | null;
  compressionPct: number | null;
  telemetryError: string | null;
  success: boolean;
  createdAt: string;
};

export type EngineeringAITelemetry = {
  calls: number;
  totalTokens: number | null;
  totalCostUsd: number | null;
  totalLatencyMs: number;
  flashCalls: number;
  proCalls: number;
  compression: EngineeringAICompressionMetrics;
  byPhase: EngineeringAIPhaseUsage[];
  byTask: Array<{
    engineeringTask: string;
    model: string;
    tokens: number | null;
    costUsd: number | null;
  }>;
  executions?: EngineeringAIExecution[];
};

export type EngineeringAgentTaskDetail = {
  overview: EngineeringAgentTaskRow & {
    userName?: string;
    errorMessage?: string | null;
    resultReport?: string | null;
    taskType?: string;
    executionMode?: string;
    verificationStatus?: string | null;
    verificationSummary?: Record<string, unknown> | null;
    confidenceScore?: number | null;
    deploymentBlocked?: boolean;
    reliability?: Record<string, unknown> | null;
    parentTaskId?: string | null;
    pipelinePhase?: string | null;
    pipelinePhaseLabel?: string | null;
    pipelineState?: Record<string, unknown> | null;
    understandingConfidence?: number | null;
    implementationConfidence?: number | null;
    verificationConfidencePct?: number | null;
  };
  pipeline?: {
    currentPhase: string | null;
    state: Record<string, unknown> | null;
    phases: Record<string, unknown>;
  };
  aiTelemetry?: EngineeringAITelemetry | null;
  timeline: Array<{ label: string; message: string | null; eventType: string; at: string }>;
  activity: EngineeringAgentActivityItem[];
  reasoning: {
    planningSummary?: string;
    selectedFiles?: Array<{ path: string; reason: string }>;
    executionPlanSummary?: string;
    buildFixAttempts?: number;
    finalDecision?: string;
  };
  filesChanged: string[];
  buildOutput: Array<{ command?: string; output?: string; at: string; ok?: boolean }>;
  plan: unknown;
  verification?: EngineeringVerificationCheck[];
  artifacts?: EngineeringTaskArtifact[];
  session?: EngineeringTaskSession | null;
  messages?: EngineeringSessionMessage[];
};

export type AuditLog = {
  id: number;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  target_email: string | null;
  created_at: string;
};

export type AIProviderId = 'gemini' | 'groq' | 'openai' | 'openrouter';

export type AISettings = {
  primaryProvider: AIProviderId;
  fallbackProvider: AIProviderId;
  primaryModel: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  softLimitUsd: number;
  hardLimitUsd: number;
  jsonMode: boolean;
  structuredOutput: boolean;
  debugMode: boolean;
  openaiEnabled: boolean;
  extendedFallback: boolean;
  responseVerbosity: 'concise' | 'balanced' | 'deep-analysis';
  updatedAt: string;
  apiKeys: {
    gemini: { configured: boolean; masked: string | null };
    groq: { configured: boolean; masked: string | null };
    openai: { configured: boolean; masked: string | null };
  };
};

export type AISettingsPayload = Partial<
  Omit<AISettings, 'updatedAt' | 'apiKeys'> & {
    apiKeys?: Partial<{ gemini?: string; groq?: string; openai?: string }>;
  }
>;

export type AITestResult = {
  response: string;
  provider: string;
  model?: string;
  latencyMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  cached?: boolean;
  debug?: unknown;
};

export const adminApi = {
  dashboard: () => apiFetch(adminPath('/dashboard')),
  ops: () => apiFetch<{ success: boolean; data: Record<string, unknown> }>(adminPath('/ops')),
  platformFlags: () =>
    apiFetch<{ success: boolean; data: PlatformFlags }>(adminPath('/platform/feature-flags')),
  updatePlatformFlags: (flags: Partial<PlatformFlags>) =>
    apiFetch<{ success: boolean; data: PlatformFlags }>(adminPath('/platform/feature-flags'), {
      method: 'PUT',
      body: JSON.stringify(flags),
    }),
  auditLogs: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<{
      success: boolean;
      data: { logs: AuditLog[]; pagination: { page: number; limit: number; total: number } };
    }>(adminPath(`/audit-logs${q}`));
  },
  plans: () => apiFetch<{ success: boolean; data: unknown[] }>(adminPath('/plans')),
  users: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<AdminUsersResponse>(adminPath(`/users${q}`));
  },
  updateUser: (id: number, body: Record<string, string>) =>
    apiFetch<{ success: boolean; data: { user: AdminUser } }>(adminPath(`/users/${id}`), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  patchPlan: (id: number, plan: AdminPlan) =>
    apiFetch<{ success: boolean; data: { user: AdminUser } }>(adminPath(`/users/${id}/plan`), {
      method: 'PATCH',
      body: JSON.stringify({ plan: planToApi(plan) }),
    }),
  patchStatus: (id: number, status: AdminStatus) =>
    apiFetch<{ success: boolean; data: { user: AdminUser } }>(adminPath(`/users/${id}/status`), {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  resetPassword: (id: number, newPassword: string) =>
    apiFetch(adminPath(`/users/${id}/reset-password`), {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    }),
  deleteUser: (id: number) =>
    apiFetch(adminPath(`/users/${id}`), { method: 'DELETE' }),
  impersonate: (id: number) =>
    apiFetch<{ success: boolean; data: { token: string; user: AdminUser } }>(
      adminPath(`/users/${id}/impersonate`),
      { method: 'POST' }
    ),
  aiSettings: () =>
    apiFetch<{
      success: boolean;
      data: {
        settings: AISettings;
        modelOptions: Record<string, { label: string; models: string[] }>;
      };
    }>(adminPath('/ai-settings')),
  updateAISettings: (body: AISettingsPayload) =>
    apiFetch<{ success: boolean; data: AISettings }>(adminPath('/ai-settings'), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  engineeringAgentMonitor: () =>
    apiFetch<{
      success: boolean;
      data: {
        metrics: {
          totalTasks: number;
          runningTasks: number;
          completedTasks: number;
          failedTasks: number;
          avgCompletionMs: number;
          filesModifiedToday: number;
          buildSuccessRate: number | null;
          scorecard?: Record<string, unknown> | null;
        };
        tasks: EngineeringAgentTaskRow[];
      };
    }>(adminPath('/engineering-agent/monitor')),

  engineeringAgentTaskSummary: (id: string) =>
    apiFetch<{
      success: boolean;
      data: { overview: EngineeringAgentTaskDetail['overview']; updatedAt: string };
    }>(adminPath(`/engineering-agent/tasks/${id}/summary`)),

  engineeringAnalytics: (period: 'daily' | 'weekly' | 'monthly' = 'weekly') =>
    apiFetch<{ success: boolean; data: Record<string, unknown> }>(
      adminPath(`/engineering-agent/analytics?period=${period}`)
    ),

  engineeringAgentCollaboration: (taskId: string) =>
    apiFetch<{
      success: boolean;
      data: Array<{
        id: number;
        taskId: string;
        fromRole: string;
        toRole: string | null;
        messageType: string;
        body: string;
        metadata: Record<string, unknown>;
        createdAt: string;
      }>;
    }>(adminPath(`/engineering-agent/tasks/${taskId}/collaboration`)),

  engineeringIntelligence: (sinceHours = 168) =>
    apiFetch<{
      success: boolean;
      data: {
        sinceHours: number;
        modelUsage: {
          calls: number;
          totalTokens: number | null;
          totalCostUsd: number | null;
          avgLatencyMs: number;
          flashCalls: number;
          proCalls: number;
          byPhase: Array<{
            phase: string;
            model: string | null;
            promptTokens: number | null;
            completionTokens: number | null;
            totalTokens: number | null;
            originalContextTokens: number | null;
            compressedContextTokens: number | null;
          }>;
          compression: unknown;
        };
        taskStatistics: {
          totalTasks: number;
          runningTasks: number;
          completedTasks: number;
          failedTasks: number;
          reviewTasks: number;
        };
        riskOverview: {
          avgRisk: number | null;
          pendingDeployApprovals: number;
          bands: { auto: number; verify: number; deployApproval: number; admin: number };
        };
        learningMemory: Array<{
          id: string;
          title: string;
          whatWorked?: string | null;
          whatFailed?: string | null;
        }>;
        agentActivity: Array<{ role: string; status: string; count: number }>;
        costAnalytics: Array<{ day: string; costUsd: number; tokens: number }>;
      };
    }>(adminPath(`/engineering-agent/intelligence?sinceHours=${sinceHours}`)),

  engineeringAgentAITelemetry: (sinceHours = 168) =>
    apiFetch<{
      success: boolean;
      data: EngineeringAITelemetry & { sinceHours: number };
    }>(adminPath(`/engineering-agent/ai-telemetry?sinceHours=${sinceHours}`)),

  engineeringAgentTaskAITelemetry: (id: string) =>
    apiFetch<{ success: boolean; data: EngineeringAITelemetry }>(
      adminPath(`/engineering-agent/tasks/${id}/ai-telemetry`)
    ),

  engineeringAgentMetrics: () =>
    apiFetch<{
      success: boolean;
      data: {
        totalTasks: number;
        runningTasks: number;
        completedTasks: number;
        failedTasks: number;
        reviewTasks: number;
        avgCompletionMs: number;
        filesModifiedToday: number;
        buildSuccessRate: number | null;
        scorecard?: {
          taskSuccessRate: number | null;
          buildPassRate: number | null;
          verificationPassRate: number | null;
          deploymentBlockedCount: number;
          avgConfidenceScore: number;
          periodDays: number;
        } | null;
      };
    }>(adminPath('/engineering-agent/metrics')),

  engineeringAgentTasks: (params?: { limit?: string; offset?: string }) => {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<{ success: boolean; data: EngineeringAgentTaskRow[] }>(
      adminPath(`/engineering-agent/tasks${q}`)
    );
  },

  engineeringAgentTask: (id: string) =>
    apiFetch<{ success: boolean; data: EngineeringAgentTaskDetail }>(
      adminPath(`/engineering-agent/tasks/${id}`)
    ),

  engineeringAgentOrchestration: (id: string) =>
    apiFetch<{
      success: boolean;
      data: {
        parentTaskId: string;
        parentStatus: string;
        orchestrationStatus: string | null;
        progress: {
          total: number;
          completed: number;
          running: number;
          failed: number;
          blocked: number;
          pending: number;
          percent: number;
        };
        currentlyRunning: {
          id: string;
          slug: string;
          title: string;
          status: string;
          child_task_id: string | null;
          depends_on: string[];
          retry_count: number;
          max_retries: number;
        } | null;
        subtasks: Array<{
          id: string;
          slug: string;
          title: string;
          category: string | null;
          status: string;
          depends_on: string[];
          child_task_id: string | null;
          retry_count: number;
          max_retries: number;
          error_message: string | null;
        }>;
        edges: Array<{ from: string; to: string }>;
        activity: Array<{
          id: string;
          eventType: string;
          message: string | null;
          payload: unknown;
          createdAt: string;
        }>;
      } | null;
    }>(adminPath(`/engineering-agent/tasks/${id}/orchestration`)),

  engineeringAgentActivity: (id: string, since?: string) => {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiFetch<{ success: boolean; data: EngineeringAgentActivityItem[] }>(
      adminPath(`/engineering-agent/tasks/${id}/activity${q}`)
    );
  },

  engineeringAgentVerification: (id: string) =>
    apiFetch<{
      success: boolean;
      data: {
        status: string | null;
        summary: Record<string, unknown> | null;
        checks: EngineeringVerificationCheck[];
        groups: {
          dom: EngineeringVerificationCheck[];
          browser: EngineeringVerificationCheck[];
          bundle: EngineeringVerificationCheck[];
          api: EngineeringVerificationCheck[];
        };
      };
    }>(adminPath(`/engineering-agent/tasks/${id}/verification`)),

  engineeringAgentReVerify: (id: string, mode: 'pre_deploy' | 'post_deploy' = 'pre_deploy') =>
    apiFetch<{ success: boolean; data: { passed: boolean; failedChecks: string[] } }>(
      adminPath(`/engineering-agent/tasks/${id}/verify`),
      { method: 'POST', body: JSON.stringify({ mode }) }
    ),

  engineeringAgentSendMessage: (id: string, message: string) =>
    apiFetch<{
      success: boolean;
      data: { taskId: string; status: string; message: string };
    }>(adminPath(`/engineering-agent/tasks/${id}/message`), {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  engineeringAgentRetry: (id: string) =>
    apiFetch<{
      success: boolean;
      data: { taskId: string; status: string; message: string };
    }>(adminPath(`/engineering-agent/tasks/${id}/retry`), { method: 'POST' }),

  engineeringApproveRisk: (id: string) =>
    apiFetch<{
      success: boolean;
      data: { taskId: string; status: string; message: string };
    }>(adminPath(`/engineering-agent/tasks/${id}/approve-risk`), { method: 'POST' }),

  engineeringRiskSettings: () =>
    apiFetch<{
      success: boolean;
      data: { allowHighRiskExecution: boolean; branchIsolationEnabled: boolean };
    }>(adminPath('/engineering-agent/risk-settings')),

  engineeringUpdateRiskSettings: (body: { allowHighRiskExecution?: boolean }) =>
    apiFetch<{
      success: boolean;
      data: { allowHighRiskExecution: boolean; branchIsolationEnabled: boolean };
    }>(adminPath('/engineering-agent/risk-settings'), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  engineeringDeployments: (params?: { limit?: string; offset?: string }) => {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch<{ success: boolean; data: EngineeringDeploymentRow[] }>(
      adminPath(`/engineering-agent/deployments${q}`)
    );
  },

  engineeringDeploymentCurrent: () =>
    apiFetch<{
      success: boolean;
      data: { running: EngineeringDeploymentRow | null; latest: EngineeringDeploymentRow | null };
    }>(adminPath('/engineering-agent/deployments/current')),

  engineeringDeployment: (id: string) =>
    apiFetch<{ success: boolean; data: EngineeringDeploymentDetail }>(
      adminPath(`/engineering-agent/deployments/${id}`)
    ),

  engineeringDeployTask: (taskId: string) =>
    apiFetch<{ success: boolean; data: EngineeringDeploymentDetail }>(
      adminPath(`/engineering-agent/tasks/${taskId}/deploy`),
      { method: 'POST' }
    ),

  engineeringRollbackDeployment: (deploymentId: string) =>
    apiFetch<{ success: boolean; data: EngineeringDeploymentDetail }>(
      adminPath(`/engineering-agent/deployments/${deploymentId}/rollback`),
      { method: 'POST' }
    ),

  testAISettings: (body: {
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    jsonMode?: boolean;
    structuredOutput?: boolean;
  }) =>
    apiFetch<{ success: boolean; data: AITestResult }>(adminPath('/ai-settings/test'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ── TikTok Inbox ──

export interface TikTokConversation {
  id: number;
  tiktok_user_id: string;
  tiktok_username: string;
  tiktok_avatar_url: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TikTokMessage {
  id: number;
  conversation_id: number;
  tiktok_message_id: string | null;
  direction: 'incoming' | 'outgoing';
  content: string;
  read: boolean;
  ai_suggestion: string | null;
  ai_suggestion_approved: boolean | null;
  approved_by: number | null;
  sent: boolean;
  created_at: string;
}

export interface TikTokInboxStats {
  unreadCount: number;
  conversationCount: number;
  lastPollAt: string | null;
  sessionValid: boolean;
  errorMessage: string | null;
}

export const tikTokInboxApi = {
  conversations: () =>
    apiFetch<{ success: boolean; data: { conversations: TikTokConversation[] } }>(
      adminPath('/inbox/tiktok/conversations')
    ),

  messages: (conversationId: number) =>
    apiFetch<{ success: boolean; data: { messages: TikTokMessage[] } }>(
      adminPath(`/inbox/tiktok/conversations/${conversationId}/messages`)
    ),

  markRead: (conversationId: number) =>
    apiFetch<{ success: boolean }>(
      adminPath(`/inbox/tiktok/conversations/${conversationId}/read`),
      { method: 'POST' }
    ),

  saveSuggestion: (messageId: number, suggestion: string) =>
    apiFetch<{ success: boolean }>(
      adminPath(`/inbox/tiktok/messages/${messageId}/suggest`),
      { method: 'POST', body: JSON.stringify({ suggestion }) }
    ),

  approveSuggestion: (messageId: number) =>
    apiFetch<{ success: boolean }>(
      adminPath(`/inbox/tiktok/messages/${messageId}/approve`),
      { method: 'POST' }
    ),

  markSent: (messageId: number) =>
    apiFetch<{ success: boolean }>(
      adminPath(`/inbox/tiktok/messages/${messageId}/send`),
      { method: 'POST' }
    ),

  stats: () =>
    apiFetch<{ success: boolean; data: TikTokInboxStats }>(
      adminPath('/inbox/tiktok/stats')
    ),
};

// ── TikTok Connect (Session Management) ──

export interface TikTokSessionStatus {
  connected: boolean;
  sessionId: number | null;
  username: string | null;
  lastLoginAt: string | null;
  lastHealthAt: string | null;
  status: string;
  errorMessage: string | null;
  browserActive: boolean;
}

export interface TikTokAuditEvent {
  id: number;
  session_id: number | null;
  account_id: number;
  event_type: string;
  details: any;
  created_at: string;
}

export const tikTokConnectApi = {
  sessionStatus: () =>
    apiFetch<{ success: boolean; data: TikTokSessionStatus }>(
      adminPath('/tiktok/session')
    ),

  connect: () =>
    apiFetch<{ success: boolean; data: { sessionId: number; screenshot: string; currentUrl: string } }>(
      adminPath('/tiktok/connect'),
      { method: 'POST' }
    ),

  screenshot: () =>
    apiFetch<{ success: boolean; data: { screenshot: string; currentUrl: string } }>(
      adminPath('/tiktok/screenshot')
    ),

  click: (x: number, y: number) =>
    apiFetch<{ success: boolean }>(
      adminPath('/tiktok/click'),
      { method: 'POST', body: JSON.stringify({ x, y }) }
    ),

  type: (text: string) =>
    apiFetch<{ success: boolean }>(
      adminPath('/tiktok/type'),
      { method: 'POST', body: JSON.stringify({ text }) }
    ),

  key: (key: string) =>
    apiFetch<{ success: boolean }>(
      adminPath('/tiktok/key'),
      { method: 'POST', body: JSON.stringify({ key }) }
    ),

  focusField: (field: 'email' | 'password' | 'login-button') =>
    apiFetch<{ success: boolean }>(
      adminPath('/tiktok/focus-field'),
      { method: 'POST', body: JSON.stringify({ field }) }
    ),

  checkLogin: () =>
    apiFetch<{ success: boolean; data: { loggedIn: boolean; username: string | null; url: string } }>(
      adminPath('/tiktok/check-login')
    ),

  disconnect: () =>
    apiFetch<{ success: boolean }>(
      adminPath('/tiktok/disconnect'),
      { method: 'POST' }
    ),

  healthCheck: () =>
    apiFetch<{ success: boolean; data: { healthy: boolean } }>(
      adminPath('/tiktok/health-check'),
      { method: 'POST' }
    ),

  auditLog: () =>
    apiFetch<{ success: boolean; data: { events: TikTokAuditEvent[] } }>(
      adminPath('/tiktok/audit')
    ),
};

/** Map UI plan label to API value (DB uses `starter` for Basic). */
export function planToApi(plan: AdminPlan): string {
  if (plan === 'basic') return 'starter';
  return plan;
}

/** Map API plan to UI select value. */
export function planFromApi(plan?: string): AdminPlan {
  if (!plan || plan === 'free') return 'free';
  if (plan === 'starter' || plan === 'basic') return 'basic';
  if (plan === 'enterprise') return 'enterprise';
  if (plan === 'pro') return 'pro';
  return 'free';
}
