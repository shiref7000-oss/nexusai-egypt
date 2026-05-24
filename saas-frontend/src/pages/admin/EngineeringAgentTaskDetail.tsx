import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { ArrowLeft, Loader2, RefreshCw, Rocket, Send, RotateCcw } from 'lucide-react';
import {
  adminApi,
  type EngineeringAgentTaskDetail,
  type EngineeringTaskArtifact,
  type EngineeringVerificationCheck,
} from '@/lib/adminApi';
import { apiUrl, authHeaders } from '@/lib/api';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trackRender } from '@/lib/perfProbe';
import { EngineeringPipelineBar } from '@/components/admin/EngineeringPipelineBar';
import { EngineeringRiskPanel } from '@/components/admin/EngineeringRiskPanel';
import { EngineeringAITelemetryPanel } from '@/components/admin/EngineeringAITelemetryPanel';
import { EngineeringSubtaskOrchestrationPanel } from '@/components/admin/EngineeringSubtaskOrchestrationPanel';
import { EngineeringCollaborationPanel } from '@/components/admin/EngineeringCollaborationPanel';
import { PIPELINE_PHASE_LABELS } from '@/lib/engineeringPipeline';

type Tab =
  | 'overview'
  | 'conversation'
  | 'timeline'
  | 'activity'
  | 'reasoning'
  | 'files'
  | 'build'
  | 'verification'
  | 'browser_evidence'
  | 'screenshots'
  | 'dom_search'
  | 'bundle_validation'
  | 'api_checks'
  | 'report'
  | 'pipeline';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'verification', label: 'Verification' },
  { id: 'browser_evidence', label: 'Browser Evidence' },
  { id: 'screenshots', label: 'Screenshots' },
  { id: 'dom_search', label: 'DOM Search' },
  { id: 'bundle_validation', label: 'Bundle Validation' },
  { id: 'api_checks', label: 'API Checks' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'activity', label: 'Activity' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'files', label: 'Files changed' },
  { id: 'build', label: 'Build output' },
  { id: 'report', label: 'Final report' },
  { id: 'pipeline', label: 'Pipeline' },
];

function statusBadge(status: string | null | undefined) {
  if (status === 'passed') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (status === 'failed') return 'text-red-400 bg-red-500/10 border-red-500/30';
  return 'text-zinc-400 bg-zinc-800/50 border-zinc-700';
}

function CheckList({ checks }: { checks: EngineeringVerificationCheck[] }) {
  trackRender('CheckList');
  if (!checks.length) return <p className="text-zinc-500 text-sm">No checks recorded.</p>;
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.id} className="rounded border border-zinc-800 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-zinc-200">{c.name}</span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded border',
                statusBadge(c.status)
              )}
            >
              {c.status}
            </span>
          </div>
          {c.message && <p className="text-zinc-500 text-xs mt-1">{c.message}</p>}
          {c.completed_at && (
            <p className="text-[10px] text-zinc-600 mt-1">
              {new Date(c.completed_at).toLocaleString()}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function artifactSrc(artifact: EngineeringTaskArtifact, taskId: string): string {
  const path =
    artifact.downloadUrl ||
    `/api/admin/engineering-agent/tasks/${taskId}/artifacts/${artifact.id}/file`;
  return apiUrl(path);
}

export default function EngineeringAgentTaskDetailPage() {
  trackRender('EngineeringAgentTaskDetail');
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<EngineeringAgentTaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [reVerifying, setReVerifying] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const lastActivityAtRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoadError(null);
      const res = await adminApi.engineeringAgentTask(id);
      setData(res.data);
      if (res.data.activity.length > 0) {
        const at = res.data.activity[res.data.activity.length - 1].createdAt;
        setLastActivityAt(at);
        lastActivityAtRef.current = at;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load task';
      setLoadError(msg);
      setData(null);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const pollSummary = useCallback(async () => {
    if (!id) return;
    try {
      const res = await adminApi.engineeringAgentTaskSummary(id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              overview: {
                ...prev.overview,
                ...res.data.overview,
                resultReport: res.data.overview.resultReport ?? prev.overview.resultReport,
              },
            }
          : prev
      );
    } catch {
      /* ignore */
    }
  }, [id]);

  const pollActivity = useCallback(async () => {
    if (!id) return;
    const since = lastActivityAtRef.current || lastActivityAt || undefined;
    try {
      const res = await adminApi.engineeringAgentActivity(id, since);
      if (res.data.length > 0) {
        const at = res.data[res.data.length - 1].createdAt;
        lastActivityAtRef.current = at;
        setLastActivityAt(at);
        setData((prev) =>
          prev
            ? {
                ...prev,
                activity: [...prev.activity, ...res.data],
              }
            : prev
        );
        await pollSummary();
      }
    } catch {
      /* ignore poll errors */
    }
  }, [id, lastActivityAt, pollSummary]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data?.overview.executionMode === 'verification') {
      setTab('verification');
    }
  }, [data?.overview.executionMode]);

  useEffect(() => {
    const fast = setInterval(() => {
      void pollActivity();
      void pollSummary();
    }, 4000);
    const slow = setInterval(() => {
      void load();
    }, 30_000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [load, pollActivity, pollSummary]);

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[40vh] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading task…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-shell max-w-6xl mx-auto space-y-4 pb-10">
        <Link to="/admin/engineering-agent">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Monitor
          </Button>
        </Link>
        <Card>
          <CardBody className="text-sm text-zinc-400">
            {loadError || 'Task not found or failed to load.'}
          </CardBody>
        </Card>
      </div>
    );
  }

  const o = data.overview;
  const isVerificationMode = o.executionMode === 'verification';
  const canDeploy = o.canDeploy === true && !isVerificationMode;
  const checks = data.verification || [];
  const domChecks = checks.filter((c) => c.check_type === 'dom' || c.check_type === 'route');
  const browserChecks = checks.filter((c) => c.check_type === 'browser');
  const bundleChecks = checks.filter((c) => c.check_type === 'bundle');
  const apiChecks = checks.filter((c) => c.check_type === 'api');
  const artifacts = data.artifacts || [];
  const screenshots = artifacts.filter((a) => a.artifactType.startsWith('screenshot'));

  const handleReVerify = async () => {
    if (!id) return;
    setReVerifying(true);
    try {
      const mode =
        /production|live|deployed/i.test(o.prompt || '') ? 'post_deploy' : 'pre_deploy';
      const res = await adminApi.engineeringAgentReVerify(id, mode);
      toast.success(res.data.passed ? 'Verification passed' : 'Verification failed');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Verification run failed');
    } finally {
      setReVerifying(false);
    }
  };

  const handleSendFollowUp = async () => {
    if (!id || !followUp.trim()) return;
    setSending(true);
    try {
      await adminApi.engineeringAgentSendMessage(id, followUp.trim());
      toast.success('Follow-up queued — same task session');
      setFollowUp('');
      await load();
      setTab('conversation');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send follow-up');
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async () => {
    if (!id) return;
    if (!confirm('Retry will re-run the full original task. Use Send follow-up to continue with context instead.')) {
      return;
    }
    setRetrying(true);
    try {
      await adminApi.engineeringAgentRetry(id);
      toast.success('Full retry queued');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const handleDeploy = async () => {
    if (!id) return;
    if (
      !confirm(
        'Deploy this task\'s changes to production? Backups will be created first. This cannot be undone automatically.'
      )
    ) {
      return;
    }
    setDeploying(true);
    try {
      await adminApi.engineeringDeployTask(id);
      toast.success('Deployment completed');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="page-shell max-w-6xl mx-auto space-y-6 pb-10">
      <Toaster position="top-center" richColors />
      <div className="flex items-center gap-3">
        <Link to="/admin/engineering-agent">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Monitor
          </Button>
        </Link>
        <Link to="/admin/engineering-agent/deployments">
          <Button variant="ghost" size="sm">
            Deployments
          </Button>
        </Link>
        {canDeploy && (
          <Button variant="primary" size="sm" disabled={deploying} onClick={() => void handleDeploy()}>
            {deploying ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Rocket className="h-4 w-4 mr-1" />
            )}
            Deploy To Production
          </Button>
        )}
        <Button variant="secondary" size="sm" disabled={retrying} onClick={() => void handleRetry()}>
          {retrying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          <span className="ml-2">Retry</span>
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <PageHeader
        title={o.title || 'Engineering task'}
        description={`${(o.taskType || 'implementation').replace(/^./, (c) => c.toUpperCase())} · ${o.pipelinePhaseLabel || o.currentStep || o.currentPhase} · ${o.progressPercent}% · ${o.userEmail || ''}`}
      />

      <div className="flex flex-wrap gap-1 border-b border-zinc-800 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2 text-sm rounded-t-lg',
              tab === t.id ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Card>
          <CardBody className="space-y-3 text-sm">
            <EngineeringAITelemetryPanel data={data.aiTelemetry} />
            <EngineeringSubtaskOrchestrationPanel taskId={o.id} />
            <EngineeringCollaborationPanel taskId={o.id} />
            <EngineeringRiskPanel
              taskId={o.id}
              riskScore={o.riskScore}
              riskCategory={o.riskCategory}
              riskReport={o.riskReport}
              riskApprovalStatus={o.riskApprovalStatus}
              agentGitBranch={o.agentGitBranch}
              rollbackAvailable={o.rollbackAvailable}
              onApproved={() => void load()}
            />
            <div className="rounded border border-zinc-800 p-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wide mb-2">
                Mandatory pipeline · {o.pipelinePhaseLabel || 'starting'}
              </p>
              <EngineeringPipelineBar
                currentPhase={o.pipelinePhase}
                understandingConfidence={o.understandingConfidence}
                implementationConfidence={o.implementationConfidence}
                verificationConfidence={o.verificationConfidencePct}
              />
            </div>
            <p>
              <span className="text-zinc-500">ID:</span>{' '}
              <span className="font-mono text-zinc-300">{o.id}</span>
            </p>
            <p>
              <span className="text-zinc-500">Task type:</span>{' '}
              <span className="px-2 py-0.5 rounded border border-zinc-700 text-xs capitalize">
                {o.taskType || 'implementation'}
              </span>
              {isVerificationMode && (
                <span className="ml-2 text-amber-400 text-xs">Verification mode (no build/git)</span>
              )}
            </p>
            <p>
              <span className="text-zinc-500">Prompt:</span> {o.prompt}
            </p>
            <p>
              <span className="text-zinc-500">Status:</span> {o.status}
              {o.riskApprovalStatus === 'pending' ? (
                <span className="ml-2 text-amber-400 text-xs">— awaiting risk approval</span>
              ) : (
                <> · {o.currentPhase}</>
              )}
            </p>
            <p>
              <span className="text-zinc-500">Files:</span> read {o.filesReadCount}, written{' '}
              {o.filesWrittenCount}
            </p>
            <p>
              <span className="text-zinc-500">Build:</span>{' '}
              {isVerificationMode ? 'skipped (verification-only)' : o.buildStatus || '—'}
              {!isVerificationMode && o.buildDurationMs != null ? ` (${o.buildDurationMs}ms)` : ''}
            </p>
            <p>
              <span className="text-zinc-500">Verification:</span>{' '}
              <span
                className={cn(
                  'px-2 py-0.5 rounded border text-xs',
                  statusBadge(o.verificationStatus)
                )}
              >
                {o.verificationStatus || 'pending'}
              </span>
            </p>
            <p>
              <span className="text-zinc-500">Deploy stage:</span>{' '}
              {o.deployStage ? o.deployStage.replace(/_/g, ' ') : '—'}
              {canDeploy && (
                <span className="ml-2 text-emerald-400 text-xs">Ready for admin deploy</span>
              )}
            </p>
            {o.confidenceScore != null && (
              <p>
                <span className="text-zinc-500">Confidence:</span> {o.confidenceScore}
                {o.deploymentBlocked && (
                  <span className="ml-2 text-red-400 text-xs">Deployment blocked</span>
                )}
              </p>
            )}
            {o.reliability && typeof o.reliability === 'object' && (
              <div className="rounded border border-zinc-800 p-3 space-y-2">
                <p className="text-zinc-500 text-xs uppercase tracking-wide">Reliability (Phase 5)</p>
                {'budget' in o.reliability && (
                  <pre className="text-[10px] text-zinc-400 overflow-x-auto">
                    {JSON.stringify((o.reliability as { budget?: unknown }).budget, null, 2)}
                  </pre>
                )}
                {'dryRun' in o.reliability && (
                  <p className="text-xs text-zinc-400">
                    Dry-run risk:{' '}
                    {String(
                      (o.reliability as { dryRun?: { riskScore?: number } }).dryRun?.riskScore ?? '—'
                    )}
                    /100
                  </p>
                )}
                {'scores' in o.reliability && (
                  <p className="text-xs text-zinc-400">
                    Scores:{' '}
                    {JSON.stringify((o.reliability as { scores?: unknown }).scores)}
                  </p>
                )}
              </div>
            )}
            {o.errorMessage && <p className="text-red-400">{o.errorMessage}</p>}
          </CardBody>
        </Card>
      )}

      {tab === 'conversation' && (
        <Card>
          <CardHeader
            title="Conversation"
            description="Multi-turn session on this task. Follow-ups keep context — no new task required."
          />
          <CardBody className="space-y-4">
            {data.session?.sessionSummary && (
              <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
                <p className="text-zinc-500 uppercase tracking-wide mb-1">Session summary</p>
                <p className="whitespace-pre-wrap text-zinc-300">{data.session.sessionSummary}</p>
              </div>
            )}
            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
              {(data.messages || []).length === 0 && (
                <p className="text-sm text-zinc-500">No messages yet. Send a follow-up below.</p>
              )}
              {(data.messages || []).map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-lg border p-3 text-sm',
                    m.role === 'user'
                      ? 'border-brand/30 bg-brand/5 ml-4'
                      : m.role === 'assistant'
                        ? 'border-zinc-700 bg-zinc-900/50 mr-4'
                        : 'border-zinc-800 bg-zinc-950/80 text-zinc-500 text-xs'
                  )}
                >
                  <div className="flex justify-between gap-2 mb-1">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">{m.role}</span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(m.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-zinc-200 prose-invert max-w-none text-sm">
                    {m.content.length > 8000 ? `${m.content.slice(0, 8000)}…` : m.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <label className="text-xs text-zinc-500">Send follow-up</label>
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder="e.g. Use admin JWT and retry verification"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                disabled={sending}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={sending || !followUp.trim()}
                  onClick={() => void handleSendFollowUp()}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  Send follow-up
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={reVerifying}
                  onClick={() => {
                    setFollowUp('Retry verification with current context');
                    void handleReVerify();
                  }}
                >
                  Quick re-verify
                </Button>
              </div>
              <p className="text-[10px] text-zinc-600">
                Continue = new instruction, same session. Retry = full re-run of original prompt.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'timeline' && (
        <Card>
          <CardHeader title="Execution timeline" />
          <CardBody>
            <ol className="relative border-l border-zinc-700 ml-3 space-y-4">
              {data.timeline.map((ev, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-brand" />
                  <p className="text-sm text-zinc-200">{ev.label}</p>
                  {ev.message && ev.message !== ev.label && (
                    <p className="text-xs text-zinc-500 mt-0.5">{ev.message}</p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-1">
                    {new Date(ev.at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          <CardHeader title="Activity stream" description="Tool calls, searches, terminal, errors (live)" />
          <CardBody className="max-h-[60vh] overflow-y-auto space-y-2 font-mono text-xs">
            {data.activity.map((a) => (
              <div
                key={a.id}
                className={cn(
                  'rounded border p-2',
                  a.level === 'error' ? 'border-red-500/30 bg-red-500/5' : 'border-zinc-800'
                )}
              >
                <span className="text-zinc-600">{new Date(a.createdAt).toLocaleTimeString()}</span>{' '}
                <span className="text-brand">{a.eventType}</span>{' '}
                <span className="text-zinc-400">{a.message}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'reasoning' && (
        <Card>
          <CardHeader
            title="Agent reasoning"
            description="Structured summaries only — not raw model chain-of-thought"
          />
          <CardBody className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-zinc-500 uppercase mb-1">Planning summary</p>
              <p className="text-zinc-300">{data.reasoning.planningSummary}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase mb-1">Why files were chosen</p>
              <ul className="space-y-1">
                {(data.reasoning.selectedFiles || []).map((f) => (
                  <li key={f.path} className="text-zinc-400">
                    <span className="text-zinc-200 font-mono">{f.path}</span> — {f.reason}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase mb-1">Execution plan</p>
              <p className="text-zinc-300">{data.reasoning.executionPlanSummary}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase mb-1">Build-fix attempts</p>
              <p className="text-zinc-300">{data.reasoning.buildFixAttempts ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase mb-1">Final decision</p>
              <p className="text-zinc-300">{data.reasoning.finalDecision}</p>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'files' && (
        <Card>
          <CardHeader title="Files changed" />
          <CardBody>
            <ul className="text-sm font-mono text-zinc-300 space-y-1">
              {data.filesChanged.length === 0 && <li className="text-zinc-500">None</li>}
              {data.filesChanged.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {tab === 'build' && (
        <Card>
          <CardHeader title="Build output" />
          <CardBody className="space-y-4">
            {isVerificationMode && (
              <p className="text-zinc-500 text-sm">
                Build was not run — this is a verification-only task.
              </p>
            )}
            {!isVerificationMode && data.buildOutput.length === 0 && (
              <p className="text-zinc-500 text-sm">No build logs</p>
            )}
            {data.buildOutput.map((b, i) => (
              <div key={i} className="rounded border border-zinc-800 p-3">
                <p className="text-xs text-brand font-mono mb-2">{b.command}</p>
                <pre className="text-xs text-zinc-500 whitespace-pre-wrap overflow-x-auto max-h-48">
                  {b.output || '(no output)'}
                </pre>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'verification' && (
        <Card>
          <CardHeader
            title="Verification pipeline"
            description="Build, DOM, browser, bundle, and API gates before completion"
            action={
              <Button variant="secondary" size="sm" disabled={reVerifying} onClick={() => void handleReVerify()}>
                {reVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Re-run verification'}
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <p className="text-sm">
              Status:{' '}
              <span className={cn('px-2 py-0.5 rounded border', statusBadge(o.verificationStatus))}>
                {o.verificationStatus || 'pending'}
              </span>
            </p>
            <CheckList checks={checks} />
          </CardBody>
        </Card>
      )}

      {tab === 'browser_evidence' && (
        <Card>
          <CardHeader title="Browser evidence" description="Screenshots and hydration checks" />
          <CardBody>
            <CheckList checks={browserChecks} />
          </CardBody>
        </Card>
      )}

      {tab === 'screenshots' && (
        <Card>
          <CardHeader title="Screenshots" description="Before, after, and production captures" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {screenshots.length === 0 && (
              <p className="text-zinc-500 text-sm">No screenshots stored for this task.</p>
            )}
            {screenshots.map((a) => (
              <div key={a.id} className="rounded border border-zinc-800 p-2 space-y-2">
                <p className="text-xs text-zinc-500">{a.label || a.artifactType}</p>
                {/\.(png|jpe?g|webp)$/i.test(a.filePath) ? (
                  <img
                    src={artifactSrc(a, o.id)}
                    alt={a.artifactType}
                    className="w-full rounded border border-zinc-700"
                    crossOrigin="use-credentials"
                    onError={(e) => {
                      const img = e.currentTarget;
                      fetch(artifactSrc(a, o.id), { headers: authHeaders() as HeadersInit })
                        .then((r) => r.blob())
                        .then((blob) => {
                          img.src = URL.createObjectURL(blob);
                        })
                        .catch(() => undefined);
                    }}
                  />
                ) : (
                  <p className="text-xs text-zinc-500 font-mono">{a.filePath}</p>
                )}
                <p className="text-[10px] text-zinc-600">
                  {new Date(a.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === 'dom_search' && (
        <Card>
          <CardHeader title="DOM search" description="Text presence, visibility, and route checks" />
          <CardBody>
            <CheckList checks={domChecks} />
          </CardBody>
        </Card>
      )}

      {tab === 'bundle_validation' && (
        <Card>
          <CardHeader title="Bundle validation" description="Feature strings in deployed JS bundles" />
          <CardBody>
            <CheckList checks={bundleChecks} />
          </CardBody>
        </Card>
      )}

      {tab === 'api_checks' && (
        <Card>
          <CardHeader title="API checks" description="Health and admin API validation" />
          <CardBody>
            <CheckList checks={apiChecks} />
          </CardBody>
        </Card>
      )}

      {tab === 'pipeline' && (
        <Card>
          <CardHeader
            title="Execution pipeline"
            description="Phases 1–4 complete before any code write. Evidence stored per phase."
          />
          <CardBody className="space-y-4">
            <EngineeringPipelineBar
              currentPhase={o.pipelinePhase}
              understandingConfidence={o.understandingConfidence}
              implementationConfidence={o.implementationConfidence}
              verificationConfidence={o.verificationConfidencePct}
            />
            <div className="space-y-3">
              {Object.entries(data.pipeline?.phases || {}).map(([key, val]) => {
                const artifact = val as {
                  completedAt?: string;
                  evidence?: string[];
                  data?: Record<string, unknown>;
                };
                return (
                  <div key={key} className="rounded border border-zinc-800 p-3">
                    <p className="font-mono text-sm text-cyan-300">
                      {PIPELINE_PHASE_LABELS[key as keyof typeof PIPELINE_PHASE_LABELS] || key}
                    </p>
                    {artifact.completedAt && (
                      <p className="text-[10px] text-zinc-600">
                        {new Date(artifact.completedAt).toLocaleString()}
                      </p>
                    )}
                    {artifact.evidence?.length ? (
                      <ul className="text-xs text-zinc-500 mt-2 list-disc pl-4">
                        {artifact.evidence.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    ) : null}
                    {artifact.data && (
                      <pre className="text-[10px] text-zinc-400 mt-2 overflow-x-auto max-h-48">
                        {JSON.stringify(artifact.data, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
              {!Object.keys(data.pipeline?.phases || {}).length && (
                <p className="text-zinc-500 text-sm">Pipeline not started or legacy task.</p>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'report' && (
        <Card>
          <CardHeader title="Final report" />
          <CardBody>
            <pre className="text-sm text-zinc-400 whitespace-pre-wrap">
              {o.resultReport || 'Report not generated yet.'}
            </pre>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
