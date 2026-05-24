import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RiskReport = {
  riskScore?: number;
  riskCategory?: string;
  blockingReason?: string | null;
  reasons?: string[];
  filesAffected?: string[];
  databaseImpact?: string;
  rollbackAvailable?: boolean;
  branchName?: string | null;
  safeExecutionMode?: boolean;
  requiresApproval?: boolean;
};

type Props = {
  taskId: string;
  riskScore?: number | null;
  riskCategory?: string | null;
  riskReport?: RiskReport | Record<string, unknown> | null;
  riskApprovalStatus?: string | null;
  agentGitBranch?: string | null;
  rollbackAvailable?: boolean;
  onApproved?: () => void;
};

function categoryColor(cat: string | null | undefined) {
  if (cat === 'CRITICAL') return 'text-red-400 border-red-500/40 bg-red-500/10';
  if (cat === 'HIGH') return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
  if (cat === 'MEDIUM') return 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
  return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
}

export function EngineeringRiskPanel({
  taskId,
  riskScore,
  riskCategory,
  riskReport,
  riskApprovalStatus,
  agentGitBranch,
  rollbackAvailable,
  onApproved,
}: Props) {
  const [approving, setApproving] = useState(false);
  const [allowHighRisk, setAllowHighRisk] = useState<boolean | null>(null);
  const report = (riskReport || {}) as RiskReport;

  const loadSettings = async () => {
    try {
      const res = await adminApi.engineeringRiskSettings();
      setAllowHighRisk(res.data.allowHighRiskExecution);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await adminApi.engineeringApproveRisk(taskId);
      toast.success('Approved — implementation resuming');
      onApproved?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setApproving(false);
    }
  };

  const toggleHighRisk = async () => {
    try {
      const res = await adminApi.engineeringUpdateRiskSettings({
        allowHighRiskExecution: !allowHighRisk,
      });
      setAllowHighRisk(res.data.allowHighRiskExecution);
      toast.success(
        res.data.allowHighRiskExecution
          ? 'Allow High Risk Execution enabled'
          : 'Allow High Risk Execution disabled'
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update setting');
    }
  };

  if (riskScore == null && !riskCategory) {
    return <p className="text-zinc-500 text-sm">Risk assessment not run yet.</p>;
  }

  return (
    <div className="rounded border border-zinc-800 p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-500">Risk score</span>
        <strong className="text-zinc-100">{riskScore ?? '—'}/100</strong>
        <span
          className={cn(
            'px-2 py-0.5 rounded border text-xs font-mono',
            categoryColor(riskCategory || report.riskCategory)
          )}
        >
          {riskCategory || report.riskCategory || '—'}
        </span>
        {riskApprovalStatus === 'pending' && (
          <span className="text-amber-400 text-xs">Awaiting approval</span>
        )}
        {riskApprovalStatus === 'auto_approved' && (
          <span className="text-emerald-400 text-xs">Auto-executed (LOW/MEDIUM)</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-400">
        <p>
          <span className="text-zinc-500">Blocking reason:</span>{' '}
          {report.blockingReason || '—'}
        </p>
        <p>
          <span className="text-zinc-500">Database impact:</span>{' '}
          {report.databaseImpact || '—'}
        </p>
        <p>
          <span className="text-zinc-500">Rollback:</span>{' '}
          {rollbackAvailable || report.rollbackAvailable ? 'Yes' : 'No'}
        </p>
        <p>
          <span className="text-zinc-500">Branch:</span>{' '}
          <span className="font-mono">{agentGitBranch || report.branchName || '—'}</span>
        </p>
      </div>

      {report.reasons && report.reasons.length > 0 && (
        <div>
          <p className="text-zinc-500 text-xs uppercase mb-1">Reasons</p>
          <ul className="list-disc pl-4 text-xs text-zinc-400 space-y-0.5">
            {report.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {report.filesAffected && report.filesAffected.length > 0 && (
        <div>
          <p className="text-zinc-500 text-xs uppercase mb-1">
            Files affected ({report.filesAffected.length})
          </p>
          <ul className="font-mono text-[10px] text-zinc-500 max-h-24 overflow-y-auto">
            {report.filesAffected.slice(0, 15).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {riskApprovalStatus === 'pending' && (
        <Button variant="primary" size="sm" disabled={approving} onClick={() => void handleApprove()}>
          {approving ? 'Approving…' : 'Approve & Continue implementation'}
        </Button>
      )}

      <div className="pt-2 border-t border-zinc-800 flex items-center gap-2">
        <label className="text-xs text-zinc-500 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allowHighRisk === true}
            onChange={() => void toggleHighRisk()}
            className="rounded"
          />
          Allow High Risk Execution (platform)
        </label>
      </div>
    </div>
  );
}
