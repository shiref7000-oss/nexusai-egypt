import type {
  AccountHealthSummary,
  PerformanceInsight,
} from '../adsPlatforms/types';
import type { CampaignPerformanceRow } from './metricsRepository';
import type { MetricTotals } from '../adsPlatforms/types';

const MIN_SPEND_FOR_RULE = 50;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function gradeFromRoas(roas: number): AccountHealthSummary['grade'] {
  if (roas >= 3) return 'A';
  if (roas >= 2) return 'B';
  if (roas >= 1) return 'C';
  if (roas >= 0.5) return 'D';
  return 'F';
}

export function buildRuleBasedInsights(
  account: MetricTotals,
  campaigns: CampaignPerformanceRow[],
  priorAccount?: MetricTotals | null
): { insights: PerformanceInsight[]; health: AccountHealthSummary } {
  const insights: PerformanceInsight[] = [];
  let idSeq = 0;
  const nextId = () => `rule-${++idSeq}`;

  const spenders = campaigns.filter((c) => c.metrics.spend >= MIN_SPEND_FOR_RULE);
  const ctrs = spenders.map((c) => c.metrics.ctr).filter((v) => v > 0);
  const cpms = spenders.map((c) => c.metrics.cpm).filter((v) => v > 0);
  const roasList = spenders.map((c) => c.metrics.roas).filter((v) => v > 0);

  const medianCtr = median(ctrs);
  const medianCpm = median(cpms);
  const medianRoas = median(roasList);

  for (const c of spenders) {
    const m = c.metrics;
    const cpa = m.purchases > 0 ? m.spend / m.purchases : 0;
    const velocity = account.spend > 0 ? m.spend / account.spend : 0;
    const confidence = Math.min(1, Math.max(0.2, m.spend / 4000));

    if (medianCtr > 0 && m.ctr > 0 && m.ctr < medianCtr * 0.5) {
      insights.push({
        id: nextId(),
        severity: 'warning',
        category: 'weak_ctr',
        title: `Weak CTR: ${c.name}`,
        message: `CTR ${m.ctr.toFixed(2)}% is well below account median (${medianCtr.toFixed(2)}%). Review creative and audience fit.`,
        suggestedAction: 'TEST_MORE',
        reason: `CTR is ${(1 - m.ctr / medianCtr) * 100 > 0 ? ((1 - m.ctr / medianCtr) * 100).toFixed(0) : '0'}% below account median.`,
        confidenceScore: confidence,
        entityType: 'campaign',
        entityId: c.campaign_id,
        entityName: c.name,
        metrics: { ctr: m.ctr, spend: m.spend, median_ctr: medianCtr },
      });
    }

    if (medianCpm > 0 && m.cpm > medianCpm * 1.5) {
      insights.push({
        id: nextId(),
        severity: 'warning',
        category: 'cpm_spike',
        title: `High CPM: ${c.name}`,
        message: `CPM ${m.cpm.toFixed(0)} is ${((m.cpm / medianCpm - 1) * 100).toFixed(0)}% above median. Check auction competition and targeting breadth.`,
        suggestedAction: 'WATCH',
        reason: `Auction cost inflation: CPM exceeds account median by ${((m.cpm / medianCpm - 1) * 100).toFixed(0)}%.`,
        confidenceScore: confidence,
        entityType: 'campaign',
        entityId: c.campaign_id,
        entityName: c.name,
        metrics: { cpm: m.cpm, spend: m.spend },
      });
    }

    if (m.roas >= 2 && m.spend >= MIN_SPEND_FOR_RULE && medianRoas > 0 && m.roas >= medianRoas * 1.4) {
      insights.push({
        id: nextId(),
        severity: 'scaling_winner',
        category: 'scalable',
        title: `Scale candidate: ${c.name}`,
        message: `ROAS ${m.roas.toFixed(2)} with ${m.spend.toFixed(0)} spend — outperforming account median. Consider gradual budget increase.`,
        suggestedAction: 'KEEP_SCALING',
        reason: `ROAS is ${(m.roas / medianRoas).toFixed(2)}x account median with meaningful spend.`,
        confidenceScore: confidence,
        entityType: 'campaign',
        entityId: c.campaign_id,
        entityName: c.name,
        metrics: { roas: m.roas, spend: m.spend, median_roas: medianRoas, velocity },
      });
    }

    if (m.frequency >= 3 && m.spend >= MIN_SPEND_FOR_RULE) {
      insights.push({
        id: nextId(),
        severity: m.frequency >= 4 ? 'critical' : 'warning',
        category: 'ad_fatigue',
        title: `Ad fatigue risk: ${c.name}`,
        message: `Frequency ${m.frequency.toFixed(2)} suggests audience saturation. Refresh creatives or expand targeting.`,
        suggestedAction: 'TEST_MORE',
        reason: `Frequency above 3.0 indicates repeat exposure with risk of CTR decay.`,
        confidenceScore: confidence,
        entityType: 'campaign',
        entityId: c.campaign_id,
        entityName: c.name,
        metrics: { frequency: m.frequency, ctr: m.ctr },
      });
    }

    if (m.spend >= MIN_SPEND_FOR_RULE * 2 && m.purchases === 0) {
      insights.push({
        id: nextId(),
        severity: 'critical',
        category: 'no_conversions',
        title: `Spend without conversions: ${c.name}`,
        message: `${m.spend.toFixed(0)} spent with zero purchases. Pause or restructure offer/landing page.`,
        suggestedAction: m.spend >= 5000 ? 'KILL' : 'PAUSE',
        reason: `High spend with zero purchases in selected window.`,
        confidenceScore: Math.min(1, Math.max(0.5, m.spend / 3000)),
        entityType: 'campaign',
        entityId: c.campaign_id,
        entityName: c.name,
        metrics: { spend: m.spend, purchases: 0 },
      });
    }

    if (m.roas > 0 && m.roas < 0.5 && m.spend >= MIN_SPEND_FOR_RULE) {
      insights.push({
        id: nextId(),
        severity: 'critical',
        category: 'low_roas',
        title: `Underperforming ROAS: ${c.name}`,
        message: `ROAS ${m.roas.toFixed(2)} below break-even threshold. Consider pausing until creative/offer is fixed.`,
        suggestedAction: m.spend >= 2000 ? 'KILL' : 'PAUSE',
        reason: `ROAS below 0.5 with spend ${m.spend.toFixed(0)} and CPA ${cpa.toFixed(0)}.`,
        confidenceScore: confidence,
        entityType: 'campaign',
        entityId: c.campaign_id,
        entityName: c.name,
        metrics: { roas: m.roas, spend: m.spend, cpa },
      });
    }

    if (medianRoas > 0 && m.roas >= medianRoas * 1.15 && m.ctr >= medianCtr && m.cpm <= medianCpm * 1.1) {
      insights.push({
        id: nextId(),
        severity: 'opportunity',
        category: 'scaling_opportunity',
        title: `Opportunity: ${c.name}`,
        message: `ROAS and CTR are above median while CPM remains stable.`,
        suggestedAction: 'KEEP_SCALING',
        reason: `High relative efficiency with stable auction cost profile.`,
        confidenceScore: confidence,
        entityType: 'campaign',
        entityId: c.campaign_id,
        entityName: c.name,
        metrics: { roas: m.roas, ctr: m.ctr, cpm: m.cpm, median_roas: medianRoas, median_ctr: medianCtr },
      });
    }
  }

  if (priorAccount && priorAccount.spend > 0 && account.spend > 0) {
    const roasChange = account.roas - priorAccount.roas;
    const pct = priorAccount.roas > 0 ? (roasChange / priorAccount.roas) * 100 : 0;
    if (pct <= -25) {
      insights.push({
        id: nextId(),
        severity: 'critical',
        category: 'roas_drop',
        title: 'Account ROAS dropped sharply',
        message: `ROAS fell ${Math.abs(pct).toFixed(0)}% vs prior period (${priorAccount.roas.toFixed(2)} → ${account.roas.toFixed(2)}).`,
        suggestedAction: 'WATCH',
        reason: 'Period-over-period efficiency deterioration detected.',
        confidenceScore: 0.9,
        metrics: { roas: account.roas, prior_roas: priorAccount.roas },
      });
    }
  }

  const grade = gradeFromRoas(account.roas);
  const health: AccountHealthSummary = {
    grade,
    headline:
      grade === 'A' || grade === 'B'
        ? 'Account performance is healthy'
        : grade === 'C'
          ? 'Mixed performance — optimize underperformers'
          : 'Account needs immediate optimization',
    summary: `Spend ${account.spend.toFixed(0)} · ROAS ${account.roas.toFixed(2)} · ${account.purchases.toFixed(0)} purchases · CTR ${account.ctr.toFixed(2)}%`,
    spend: account.spend,
    roas: account.roas,
    purchases: account.purchases,
    ctr: account.ctr,
    cpm: account.cpm,
  };

  const severityOrder = { critical: 0, warning: 1, opportunity: 2, scaling_winner: 3 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { insights, health };
}

export type AlertCandidate = {
  alert_type: string;
  severity: PerformanceInsight['severity'];
  title: string;
  message: string;
  entity_type?: string;
  entity_external_id?: string;
  metric_snapshot?: Record<string, number>;
};

export function insightsToAlertCandidates(insights: PerformanceInsight[]): AlertCandidate[] {
  const alertCategories = new Set([
    'roas_drop',
    'cpm_spike',
    'no_conversions',
    'low_roas',
    'ad_fatigue',
  ]);

  return insights
    .filter((i) => alertCategories.has(i.category))
    .map((i) => ({
      alert_type: i.category,
      severity: i.severity,
      title: i.title,
      message: i.message,
      entity_type: i.entityType,
      entity_external_id: i.entityId,
      metric_snapshot: i.metrics,
    }));
}
