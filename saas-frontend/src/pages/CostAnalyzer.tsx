import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Upload,
  RefreshCw,
  Sparkles,
  Download,
  AlertCircle,
  Check,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Trash2,
  List,
  RotateCcw,
  LogOut,
} from 'lucide-react';
import {
  costAnalyzerApi,
  COST_ANALYZER_SESSION_KEY,
  type ColumnMappingConfig,
  type CostAnalyzerUsage,
  type CostReport,
  type ExtractionPreview,
  type Reconciliation,
  type ReportItem,
  type UploadResult,
} from '@/lib/costAnalyzerApi';
import { ExtractionPreviewPanel } from '@/components/cost-analyzer/ExtractionPreview';
import { PageHeader, StatCard } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BarChartProducts } from '@/components/cost-analyzer/BarChartProducts';
import { cn } from '@/lib/utils';
import { authHeaders } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { getWorkspaceUserId } from '@/lib/workspaceContext';
import { resetCostAnalyzerPersistence } from '@/lib/costAnalyzerSession';

const ANALYZE_WATCHDOG_MS = 6 * 60 * 1000;

type Step = 'upload' | 'preview' | 'analyze' | 'costs' | 'report';
type SortKey = 'profit' | 'margin' | 'quantity' | 'revenue';

type ProgressPhase =
  | 'idle'
  | 'uploading'
  | 'uploaded'
  | 'extracting'
  | 'calculating'
  | 'insights'
  | 'complete'
  | 'error';

type SessionSnapshot = {
  reportId: string;
  fileName: string;
  rowCount?: number;
};

const PROGRESS_STEPS: { phase: ProgressPhase; label: string }[] = [
  { phase: 'uploading', label: 'Uploading…' },
  { phase: 'extracting', label: 'Extracting products…' },
  { phase: 'calculating', label: 'Calculating costs…' },
  { phase: 'insights', label: 'Generating insights…' },
];

function stepFromReportStatus(status: string, hasItems = false): Step {
  switch (status) {
    case 'uploaded':
    case 'pending':
      return 'preview';
    case 'extracting':
    case 'processing':
    case 'analyzing':
    case 'generating_insights':
      return hasItems ? 'report' : 'preview';
    case 'failed':
      return hasItems ? 'report' : 'preview';
    case 'needs_costs':
      return 'costs';
    case 'completed':
      return 'report';
    default:
      return 'upload';
  }
}

function progressPhaseFromStep(step: string | undefined): ProgressPhase | null {
  if (!step) return null;
  if (step === 'extracting' || step === 'pending') return 'extracting';
  if (step === 'calculating' || step === 'awaiting_costs') return 'calculating';
  if (step === 'generating_insights') return 'insights';
  return null;
}

function persistSession(snapshot: SessionSnapshot | null) {
  if (!snapshot) {
    sessionStorage.removeItem(COST_ANALYZER_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(COST_ANALYZER_SESSION_KEY, JSON.stringify(snapshot));
}

function readSession(): SessionSnapshot | null {
  try {
    const raw = sessionStorage.getItem(COST_ANALYZER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (parsed?.reportId) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export default function CostAnalyzerPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [usage, setUsage] = useState<CostAnalyzerUsage | null>(null);
  const [reports, setReports] = useState<CostReport[]>([]);
  const [report, setReport] = useState<CostReport | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [reportId, setReportId] = useState<string | null>(null);
  const [uploadMeta, setUploadMeta] = useState<UploadResult | null>(null);
  const [progressPhase, setProgressPhase] = useState<ProgressPhase>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [sort, setSort] = useState<SortKey>('profit');
  const [missingCosts, setMissingCosts] = useState<string[]>([]);
  const [costDraft, setCostDraft] = useState<Record<string, string>>({});
  const [draftProducts, setDraftProducts] = useState<ReportItem[]>([]);
  const [previewData, setPreviewData] = useState<ExtractionPreview | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMappingConfig | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showReportsList, setShowReportsList] = useState(false);
  const analyzePhaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const analyzeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportFromUrl = searchParams.get('report');

  const setActiveReport = useCallback(
    (id: string, fileName: string, rowCount?: number) => {
      setReportId(id);
      persistSession({ reportId: id, fileName, rowCount });
      if (reportFromUrl !== id) {
        const next = new URLSearchParams(searchParams);
        next.set('report', id);
        setSearchParams(next, { replace: true });
      }
    },
    [reportFromUrl, searchParams, setSearchParams]
  );

  const clearActiveReport = useCallback(() => {
    setReportId(null);
    setUploadMeta(null);
    setReport(null);
    setLastError(null);
    setProgressPhase('idle');
    setAnalyzing(false);
    stopAnalyzeProgressTimers();
    persistSession(null);
    const next = new URLSearchParams(searchParams);
    next.delete('report');
    setSearchParams(next, { replace: true });
    setStep('upload');
    setPreviewData(null);
    setReconciliation(null);
    setColumnMapping(null);
  }, [searchParams, setSearchParams]);

  const resetAnalyzerState = useCallback(() => {
    if (analyzeWatchdogRef.current) clearTimeout(analyzeWatchdogRef.current);
    resetCostAnalyzerPersistence();
    clearActiveReport();
    setShowReportsList(true);
    toast.message('Analyzer state reset');
  }, [clearActiveReport]);

  function stopAnalyzeProgressTimers() {
    for (const t of analyzePhaseTimers.current) clearTimeout(t);
    analyzePhaseTimers.current = [];
  }

  function startAnalyzeWatchdog() {
    if (analyzeWatchdogRef.current) clearTimeout(analyzeWatchdogRef.current);
    analyzeWatchdogRef.current = setTimeout(() => {
      setAnalyzing(false);
      stopAnalyzeProgressTimers();
      setProgressPhase('error');
      setLastError('Analysis timed out in the browser. Use Retry or Reset Analyzer State.');
      toast.error('Analysis timed out — you can retry or pick another report.');
    }, ANALYZE_WATCHDOG_MS);
  }

  function clearAnalyzeWatchdog() {
    if (analyzeWatchdogRef.current) {
      clearTimeout(analyzeWatchdogRef.current);
      analyzeWatchdogRef.current = null;
    }
  }

  const loadPreview = useCallback(async (id: string, mapping?: Partial<ColumnMappingConfig>) => {
    const res = await costAnalyzerApi.preview(id, mapping);
    setPreviewData(res.data);
    setColumnMapping(res.data.mapping);
    setReconciliation(res.data.reconciliation);
    return res.data;
  }, []);

  const loadMeta = useCallback(async () => {
    const [u, r] = await Promise.all([costAnalyzerApi.usage(), costAnalyzerApi.listReports()]);
    setUsage(u.data);
    setReports(r.data);
    return r.data;
  }, []);

  const applyLoadedReport = useCallback(
    (data: CostReport, snapshot?: SessionSnapshot | null) => {
      console.log('[CostAnalyzer] state update', { reportId: data.id, status: data.status });
      setReport(data);
      setReportId(data.id);
      setUploadMeta({
        reportId: data.id,
        fileName: data.fileName || snapshot?.fileName || 'Uploaded file',
        rowCount: snapshot?.rowCount ?? 0,
        headers: [],
        status: data.status,
      });
      setLastError(data.status === 'failed' ? data.errorMessage || 'Analysis failed' : null);
      setAnalyzing(false);

      if (data.status === 'needs_costs') {
        const missing = data.missingCosts || [];
        setMissingCosts(missing);
        setDraftProducts(data.draftProducts || data.items || []);
        const draft: Record<string, string> = {};
        for (const p of missing) draft[p] = '';
        setCostDraft(draft);
        setStep('costs');
        setProgressPhase('idle');
        return;
      }

      const hasItems = (data.items?.length ?? 0) > 0;
      const nextStep = stepFromReportStatus(data.status, hasItems);
      setStep(nextStep);
      if (data.status === 'completed' || (hasItems && data.publicStatus === 'completed')) {
        setProgressPhase('idle');
        if (data.extraction?.reconciliation) setReconciliation(data.extraction.reconciliation);
        else if (data.reconciliation) setReconciliation(data.reconciliation);
        if (data.extraction?.columnMapping) setColumnMapping(data.extraction.columnMapping);
      } else if (data.status === 'uploaded' || data.status === 'pending') {
        setProgressPhase('uploaded');
        if (data.id) loadPreview(data.id).catch((e) => console.warn('[CostAnalyzer] preview load failed', e));
      } else if (data.status === 'failed' || data.publicStatus === 'failed') {
        setProgressPhase('error');
        if (hasItems) setStep('report');
      } else if (
        data.status === 'extracting' ||
        data.status === 'processing' ||
        data.processingStep === 'generating_insights'
      ) {
        const phase = progressPhaseFromStep(data.processingStep);
        setProgressPhase(phase || 'idle');
      } else {
        setProgressPhase('idle');
      }
    },
    [loadPreview]
  );

  const restoreActiveReport = useCallback(
    async (id: string, snapshot?: SessionSnapshot | null) => {
      console.log('[CostAnalyzer] request start GET /reports/' + id);
      try {
        const res = await costAnalyzerApi.getReport(id);
        console.log('[CostAnalyzer] response received', res.data.status);
        applyLoadedReport(res.data, snapshot);
        setActiveReport(id, res.data.fileName || snapshot?.fileName || '', snapshot?.rowCount);
      } catch (e: unknown) {
        resetCostAnalyzerPersistence();
        setReportId(null);
        setReport(null);
        setAnalyzing(false);
        setProgressPhase('idle');
        const msg = e instanceof Error ? e.message : 'Report not found';
        setLastError(msg);
        toast.error(msg);
      }
    },
    [applyLoadedReport, setActiveReport]
  );

  const handleRefresh = useCallback(async () => {
    console.log('[CostAnalyzer] refresh click');
    const id = reportFromUrl || reportId;
    console.log('[CostAnalyzer] refresh reportId', { reportFromUrl, reportId: id });
    setRefreshing(true);
    setLastError(null);
    try {
      console.log('[CostAnalyzer] request start (usage + list + report)');
      await loadMeta();
      if (id) {
        const res = await costAnalyzerApi.getReport(id);
        console.log('[CostAnalyzer] response received', res.data.status, 'items:', res.data.items?.length);
        applyLoadedReport(res.data);
      } else {
        console.log('[CostAnalyzer] no reportId — refreshed usage and saved reports only');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Refresh failed';
      console.error('[CostAnalyzer] refresh failed', msg);
      setLastError(msg);
      toast.error(msg);
    } finally {
      setRefreshing(false);
      console.log('[CostAnalyzer] loading complete');
    }
  }, [reportFromUrl, reportId, loadMeta, applyLoadedReport]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadMeta();
        if (searchParams.get('fresh') === '1') {
          resetCostAnalyzerPersistence();
          return;
        }
        const session = readSession();
        const id = reportFromUrl || session?.reportId;
        if (id && !cancelled) {
          await restoreActiveReport(id, session);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load';
          setLastError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportFromUrl, searchParams, loadMeta, restoreActiveReport]);

  useEffect(() => {
    const onWorkspace = () => {
      setRestoring(true);
      clearActiveReport();
      loadMeta()
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to reload'))
        .finally(() => setRestoring(false));
    };
    window.addEventListener('nexusai-workspace-changed', onWorkspace);
    return () => window.removeEventListener('nexusai-workspace-changed', onWorkspace);
  }, [clearActiveReport, loadMeta]);

  useEffect(() => {
    return () => {
      for (const t of analyzePhaseTimers.current) clearTimeout(t);
    };
  }, []);

  const sortedItems = useMemo(() => {
    const items = [...(report?.items || draftProducts)];
    switch (sort) {
      case 'quantity':
        return items.sort((a, b) => b.quantity - a.quantity);
      case 'revenue':
        return items.sort((a, b) => b.revenue - a.revenue);
      case 'margin':
        return items.sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0)).reverse();
      default:
        return items.sort((a, b) => b.profit - a.profit);
    }
  }, [report, draftProducts, sort]);

  function startAnalyzeProgressTimers() {
    for (const t of analyzePhaseTimers.current) clearTimeout(t);
    analyzePhaseTimers.current = [];
    setProgressPhase('extracting');
    analyzePhaseTimers.current.push(
      setTimeout(() => setProgressPhase('calculating'), 4000),
      setTimeout(() => setProgressPhase('insights'), 10000)
    );
  }

  const onAnalyze = useCallback(
    async (id?: string, mapping?: ColumnMappingConfig) => {
      const rid = id || reportId;
      if (!rid) return;
      if (usage && !usage.canAnalyze) {
        const msg = 'You have reached your monthly AI analysis limit.';
        setLastError(msg);
        toast.error(msg);
        return;
      }

      setAnalyzing(true);
      setLastError(null);
      setShowReportsList(false);
      startAnalyzeProgressTimers();
      startAnalyzeWatchdog();

      try {
        const res = await costAnalyzerApi.analyze(rid, {
          columnMapping: mapping || columnMapping || undefined,
          useAiMapping: !mapping && !columnMapping,
        });
        stopAnalyzeProgressTimers();
        clearAnalyzeWatchdog();

        if (res.data.extraction?.reconciliation) {
          setReconciliation(res.data.extraction.reconciliation);
        }
        if (res.data.extraction?.columnMapping) {
          setColumnMapping(res.data.extraction.columnMapping);
        }

        if (res.data.status === 'needs_costs') {
          setMissingCosts(res.data.missingCosts || []);
          setDraftProducts(res.data.products || []);
          const draft: Record<string, string> = {};
          for (const p of res.data.missingCosts || []) {
            draft[p] = '';
          }
          setCostDraft(draft);
          setStep('costs');
          setProgressPhase('idle');
          toast.info('Enter unit costs for products not in your library');
        } else if (res.data.report) {
          applyLoadedReport(res.data.report);
          if (res.data.reconciliation) setReconciliation(res.data.reconciliation);
          toast.success('Analysis complete');
        }
        if (res.data.usage) setUsage(res.data.usage);
        await loadMeta();
      } catch (e: unknown) {
        stopAnalyzeProgressTimers();
        clearAnalyzeWatchdog();
        const msg = e instanceof Error ? e.message : 'Analysis failed';
        setLastError(msg);
        setProgressPhase('error');
        toast.error(msg);
        if (reportId) {
          try {
            const latest = await costAnalyzerApi.getReport(reportId);
            if ((latest.data.items?.length ?? 0) > 0) {
              applyLoadedReport(latest.data);
              toast.message('Showing saved report data — insights may be incomplete.');
            }
          } catch {
            /* ignore */
          }
        }
      } finally {
        setAnalyzing(false);
        clearAnalyzeWatchdog();
      }
    },
    [reportId, usage, loadMeta, columnMapping, applyLoadedReport]
  );

  async function onUpload(file: File) {
    setLastError(null);
    setProgressPhase('uploading');
    setUploadMeta(null);

    try {
      const res = await costAnalyzerApi.upload(file);
      const data = res.data;
      setUploadMeta(data);
      setActiveReport(data.reportId, data.fileName, data.rowCount);
      setStep('preview');
      setProgressPhase('uploaded');
      toast.success(`Upload successful — ${data.rowCount} rows detected`);

      const u = await costAnalyzerApi.usage();
      setUsage(u.data);
      await loadPreview(data.reportId);

      if (!u.data.canAnalyze) {
        setLastError('Monthly AI analysis limit reached. Confirm columns below; run analysis when quota resets.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setLastError(msg);
      setProgressPhase('error');
      toast.error(msg);
    }
  }

  async function onSaveCostsAndCalculate() {
    if (!reportId) return;
    setAnalyzing(true);
    setLastError(null);
    setShowReportsList(false);
    setProgressPhase('calculating');
    startAnalyzeWatchdog();
    try {
      const saveCosts = Object.entries(costDraft)
        .filter(([, v]) => v !== '' && !Number.isNaN(Number(v)))
        .map(([productName, v]) => ({ productName, costPerUnit: Number(v) }));

      const overrides: Record<string, number> = {};
      for (const [name, val] of Object.entries(costDraft)) {
        if (val !== '') overrides[name.toLowerCase().trim()] = Number(val);
      }

      setProgressPhase('insights');
      const res = await costAnalyzerApi.calculate(reportId, { saveCosts, costOverrides: overrides });
      applyLoadedReport(res.data);
      setMissingCosts([]);
      toast.success('Report calculated and saved');
      await loadMeta();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Calculation failed';
      setLastError(msg);
      setProgressPhase('error');
      toast.error(msg);
      if (reportId) {
        try {
          const latest = await costAnalyzerApi.getReport(reportId);
          if ((latest.data.items?.length ?? 0) > 0) applyLoadedReport(latest.data);
        } catch {
          /* ignore */
        }
      }
    } finally {
      setAnalyzing(false);
      clearAnalyzeWatchdog();
    }
  }

  async function deleteCurrentReport() {
    if (!reportId) return;
    if (!window.confirm('Delete this report permanently?')) return;
    try {
      await costAnalyzerApi.deleteReport(reportId);
      toast.success('Report deleted');
      resetAnalyzerState();
      await loadMeta();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function retryCurrentReport() {
    if (!reportId) return;
    setAnalyzing(false);
    setProgressPhase('idle');
    clearAnalyzeWatchdog();
    try {
      const res = await costAnalyzerApi.retryReport(reportId);
      applyLoadedReport(res.data);
      toast.success('Report reset — run analysis again');
      if (res.data.status === 'needs_costs') setStep('costs');
      else if (res.data.status === 'uploaded') {
        setStep('preview');
        await loadPreview(reportId);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    }
  }

  async function openReport(id: string) {
    setLastError(null);
    try {
      const res = await costAnalyzerApi.getReport(id);
      applyLoadedReport(res.data);
      setActiveReport(id, res.data.fileName);

      if (res.data.status === 'uploaded') {
        await loadPreview(id);
      }
      if (res.data.reconciliation) setReconciliation(res.data.reconciliation);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load report';
      setLastError(msg);
      toast.error(msg);
    }
  }

  function downloadExport(format: 'xlsx' | 'csv' | 'pdf' | 'debug') {
    if (!report?.id) return;
    const url = costAnalyzerApi.exportUrl(report.id, format);
    fetch(url, { headers: authHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error || 'Export failed');
        }
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = format === 'debug' ? 'cost-report-debug.csv' : `cost-report.${format === 'xlsx' ? 'xlsx' : format}`;
        a.click();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Export failed'));
  }

  const currency = report?.currency || 'EGP';
  const t = report?.totals;
  const showWorkflow = step !== 'upload' || uploadMeta || reportId;
  const activePhaseIndex = PROGRESS_STEPS.findIndex((s) => s.phase === progressPhase);

  if (restoring) {
    return (
      <div className="admin-page-shell flex items-center justify-center min-h-[40vh] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading your reports…
      </div>
    );
  }

  return (
    <div className="admin-page-shell space-y-6">
      <PageHeader
        title="AI Cost Analyzer"
        description="Upload monthly closing sheets — AI extracts products, maps COGS, and generates profit insights."
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={refreshing || analyzing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowReportsList(true)}>
          <List className="h-4 w-4 mr-1" />
          View reports list
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={resetAnalyzerState}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset analyzer state
        </Button>
        {reportId && (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => void retryCurrentReport()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry analysis
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearActiveReport}>
              <LogOut className="h-4 w-4 mr-1" />
              Leave report
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void deleteCurrentReport()}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete report
            </Button>
          </>
        )}
      </div>

      {isAdmin && !getWorkspaceUserId() && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90"
        >
          Select a merchant workspace in the sidebar to load that tenant&apos;s cost reports. Your admin
          account has no merchant uploads by default.
        </div>
      )}

      {usage && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2',
            usage.canAnalyze
              ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          )}
        >
          <span>
            AI analyses this month: <strong className="text-white">{usage.used}</strong> / {usage.limit}
          </span>
          {!usage.canAnalyze && (
            <span className="flex items-center gap-1 text-amber-300">
              <AlertCircle className="h-4 w-4" />
              Monthly limit reached — upload still works; run analysis after limit resets or contact support.
            </span>
          )}
        </div>
      )}

      {lastError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex gap-3 items-start"
        >
          <XCircle className="h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="font-medium text-red-100">Something went wrong</p>
            <p className="mt-1 text-red-200/90">{lastError}</p>
          </div>
        </div>
      )}

      {showWorkflow && (uploadMeta || reportId) && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-emerald-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>
              <strong className="text-white">{uploadMeta?.fileName || report?.fileName || 'Report'}</strong>
              {uploadMeta?.rowCount ? (
                <span className="text-emerald-200/80"> · {uploadMeta.rowCount} rows</span>
              ) : null}
            </span>
          </div>
          {reportId && (
            <p className="mt-1 text-xs text-zinc-500 font-mono">
              Report ID: <span className="text-zinc-400">{reportId}</span>
            </p>
          )}
        </div>
      )}

      {showReportsList && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-medium text-white">All saved reports</h3>
          </CardHeader>
          <CardBody className="space-y-2 max-h-[60vh] overflow-y-auto">
            {reports.length === 0 && <p className="text-xs text-zinc-500">No reports yet.</p>}
            {reports.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex items-center gap-2 rounded border p-2',
                  reportId === r.id ? 'border-brand bg-brand/5' : 'border-zinc-800'
                )}
              >
                <button type="button" onClick={() => { setShowReportsList(false); void openReport(r.id); }} className="flex-1 text-left text-xs min-w-0">
                  <span className="text-zinc-200 block truncate">{r.title || r.fileName}</span>
                  <span className="text-zinc-600 capitalize">
                    {(r.publicStatus || r.status).replace(/_/g, ' ')}
                    {r.processingStep ? ` · ${r.processingStep}` : ''} ·{' '}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Delete report"
                  onClick={async () => {
                    if (!window.confirm('Delete this report?')) return;
                    try {
                      await costAnalyzerApi.deleteReport(r.id);
                      if (reportId === r.id) resetAnalyzerState();
                      else await loadMeta();
                      toast.success('Deleted');
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : 'Delete failed');
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {(analyzing || refreshing || progressPhase === 'uploading' || progressPhase === 'uploaded') &&
        !showReportsList &&
        step !== 'report' && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Progress</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                setAnalyzing(false);
                stopAnalyzeProgressTimers();
                clearAnalyzeWatchdog();
                setProgressPhase('idle');
              }}
            >
              Dismiss
            </Button>
          </div>
          <ol className="space-y-2">
            {PROGRESS_STEPS.map((s, i) => {
              const done =
                progressPhase === 'complete' ||
                (activePhaseIndex >= 0 && i < activePhaseIndex) ||
                (progressPhase === 'uploaded' && s.phase === 'uploading');
              const active = s.phase === progressPhase;
              return (
                <li
                  key={s.phase}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    done && 'text-emerald-400',
                    active && 'text-white font-medium',
                    !done && !active && 'text-zinc-600'
                  )}
                >
                  {done ? (
                    <Check className="h-4 w-4" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-zinc-700" />
                  )}
                  {s.label}
                </li>
              );
            })}
            {progressPhase === 'complete' && (
              <li className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
                <Check className="h-4 w-4" />
                Complete
              </li>
            )}
          </ol>
        </div>
      )}

      {!showReportsList && (
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-medium text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-brand" />
              {step === 'upload' && 'Upload closing sheet'}
              {step === 'preview' && 'Extraction preview — confirm columns'}
              {step === 'analyze' && 'Run AI analysis'}
              {step === 'costs' && 'Product unit costs'}
              {step === 'report' && (report?.title || 'Profit report')}
            </h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {step === 'upload' && (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-xl p-12 cursor-pointer hover:border-brand/50 transition-colors">
                <Upload className="h-10 w-10 text-zinc-500 mb-3" />
                <span className="text-sm text-zinc-300">Drop XLSX, XLS, or CSV (max 10MB)</span>
                <span className="text-xs text-zinc-500 mt-1">Analysis starts automatically after upload</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  disabled={progressPhase === 'uploading' || analyzing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.target.value = '';
                  }}
                />
                {progressPhase === 'uploading' && (
                  <p className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                  </p>
                )}
              </label>
            )}

            {(step === 'preview' || step === 'analyze') && reportId && (
              <ExtractionPreviewPanel
                reportId={reportId}
                initial={previewData}
                analyzing={analyzing}
                canAnalyze={usage?.canAnalyze !== false}
                onConfirm={(mapping) => {
                  setColumnMapping(mapping);
                  onAnalyze(reportId, mapping);
                }}
              />
            )}

            {step === 'preview' && (
              <Button type="button" variant="secondary" size="sm" onClick={clearActiveReport} className="mt-2">
                Upload a different file
              </Button>
            )}

            {step === 'costs' && (
              <div className="space-y-4">
                <p className="text-sm text-amber-200/90">
                  Enter unit cost ({currency}) for each product not in your library. Values are saved for next
                  month.
                </p>
                {missingCosts.length === 0 && (
                  <p className="text-sm text-zinc-500">Loading products… reopen this report from Saved reports.</p>
                )}
                <ul className="space-y-3 max-h-80 overflow-y-auto">
                  {missingCosts.map((name) => (
                    <li key={name} className="flex gap-2 items-center">
                      <span className="text-sm text-zinc-300 flex-1 truncate">{name}</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Unit cost"
                        className="w-32"
                        value={costDraft[name] ?? ''}
                        onChange={(e) => setCostDraft((d) => ({ ...d, [name]: e.target.value }))}
                      />
                    </li>
                  ))}
                </ul>
                <Button type="button" size="lg" onClick={onSaveCostsAndCalculate} disabled={analyzing}>
                  {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Calculate &amp; view report
                </Button>
              </div>
            )}

            {step === 'report' && report && (
              <div className="space-y-4">
                {(!t || t.totalRevenue === 0) && report.items.length === 0 ? (
                  <p className="text-sm text-zinc-500">Report has no line items yet. Run analysis again.</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadExport('xlsx')}>
                    <Download className="h-4 w-4 mr-1" /> Excel
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadExport('csv')}>
                    <Download className="h-4 w-4 mr-1" /> CSV
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadExport('pdf')}>
                    <Download className="h-4 w-4 mr-1" /> PDF
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => downloadExport('debug')}>
                    <Download className="h-4 w-4 mr-1" /> Debug CSV
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={clearActiveReport}>
                    New analysis
                  </Button>
                </div>

                {(reconciliation || report.extraction?.reconciliation) && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm space-y-2">
                    <p className="font-medium text-white">Reconciliation</p>
                    {(() => {
                      const rec = reconciliation || report.extraction?.reconciliation;
                      if (!rec) return null;
                      const m = rec.columnMapping;
                      return (
                        <>
                          <p className="text-xs text-zinc-500">
                            Product: <span className="text-zinc-300">{m.product}</span> · Quantity:{' '}
                            <span className="text-zinc-300">{m.quantity || '(1 per row)'}</span> · Revenue:{' '}
                            <span className="text-zinc-300">{m.revenue}</span> ({m.revenueMode}) · Status:{' '}
                            <span className="text-zinc-300">{m.status || '—'}</span>
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-zinc-400">
                            <span>Rows used: {rec.rowsProcessed}</span>
                            <span>Excluded: {rec.rowsExcluded}</span>
                            <span>Orders: {rec.ordersCounted ?? '—'}</span>
                            <span>Units: {rec.unitsCounted}</span>
                            <span>Revenue total: {rec.revenueTotal}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {report.insightsStatus === 'failed' && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                    AI insights could not be generated. Totals and line items below are still valid.
                    {report.aiInsights?._meta?.error ? (
                      <span className="block text-xs text-amber-200/70 mt-1">{report.aiInsights._meta.error}</span>
                    ) : null}
                  </div>
                )}

                {report.aiInsights && report.insightsStatus !== 'failed' && (
                  <div className="rounded-lg border border-brand/20 bg-brand/5 p-4 text-sm">
                    <p className="font-medium text-white mb-2 flex items-center gap-1">
                      <Sparkles className="h-4 w-4 text-brand" /> AI insights
                    </p>
                    <p className="text-zinc-300">{report.aiInsights.executiveSummary}</p>
                    <ul className="mt-2 list-disc list-inside text-zinc-400 space-y-1">
                      {report.aiInsights.bullets?.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.aiInsights && report.insightsStatus === 'failed' && report.aiInsights.executiveSummary && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
                    <p className="font-medium text-zinc-400 mb-2">Fallback summary</p>
                    <p className="text-zinc-500">{report.aiInsights.executiveSummary}</p>
                  </div>
                )}

                {report.items.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {(['profit', 'revenue', 'quantity', 'margin'] as SortKey[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSort(k)}
                          className={cn(
                            'px-2 py-1 rounded border',
                            sort === k
                              ? 'border-brand text-brand bg-brand/10'
                              : 'border-zinc-700 text-zinc-500'
                          )}
                        >
                          Sort: {k}
                        </button>
                      ))}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-900 text-zinc-500 text-xs uppercase">
                          <tr>
                            <th className="text-left p-3">Product</th>
                            <th className="text-right p-3">Qty</th>
                            <th className="text-right p-3">Revenue</th>
                            <th className="text-right p-3">Unit cost</th>
                            <th className="text-right p-3">Total cost</th>
                            <th className="text-right p-3">Profit</th>
                            <th className="text-right p-3">Margin %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedItems.map((row) => (
                            <tr key={row.normalizedName} className="border-t border-zinc-800/80">
                              <td className="p-3 text-zinc-200">{row.productName}</td>
                              <td className="p-3 text-right tabular-nums">{row.quantity}</td>
                              <td className="p-3 text-right tabular-nums">{row.revenue}</td>
                              <td className="p-3 text-right tabular-nums">{row.unitCost}</td>
                              <td className="p-3 text-right tabular-nums">{row.totalCost}</td>
                              <td
                                className={cn(
                                  'p-3 text-right tabular-nums font-medium',
                                  row.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                                )}
                              >
                                {row.profit}
                              </td>
                              <td className="p-3 text-right tabular-nums">
                                {row.marginPct != null ? `${row.marginPct}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          {step === 'report' && t && report && report.items.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Revenue" value={`${t.totalRevenue} ${currency}`} />
                <StatCard label="Product cost" value={`${t.totalProductCost} ${currency}`} />
                <StatCard label="Gross profit" value={`${t.grossProfit} ${currency}`} />
                <StatCard label="Gross margin" value={`${t.grossMarginPct}%`} />
                <StatCard label="Units sold" value={t.totalUnits} />
                <StatCard label="Cost %" value={`${t.costPct}%`} />
              </div>

              <Card>
                <CardHeader>
                  <h3 className="text-sm font-medium text-white">Revenue by product</h3>
                </CardHeader>
                <CardBody>
                  <BarChartProducts
                    items={sortedItems.map((i) => ({
                      label: i.productName,
                      value: i.revenue,
                      color: '#22d3ee',
                    }))}
                    formatValue={(n) => `${n} ${currency}`}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-medium text-white">Profit by product</h3>
                </CardHeader>
                <CardBody>
                  <BarChartProducts
                    items={sortedItems.map((i) => ({
                      label: i.productName,
                      value: Math.max(0, i.profit),
                      color: '#34d399',
                    }))}
                    formatValue={(n) => `${n} ${currency}`}
                  />
                </CardBody>
              </Card>
            </>
          )}

          <Card>
            <CardHeader>
              <h3 className="text-sm font-medium text-white">Saved reports</h3>
            </CardHeader>
            <CardBody className="space-y-2 max-h-64 overflow-y-auto">
              {reports.length === 0 && <p className="text-xs text-zinc-500">No reports yet.</p>}
              {reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openReport(r.id)}
                  className={cn(
                    'w-full text-left text-xs p-2 rounded border hover:bg-zinc-800/50',
                    reportId === r.id ? 'border-brand bg-brand/5' : 'border-zinc-800'
                  )}
                >
                  <span className="text-zinc-200 block truncate">{r.title || r.fileName}</span>
                  <span className="text-zinc-600 capitalize">
                    {r.status.replace('_', ' ')} · {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
