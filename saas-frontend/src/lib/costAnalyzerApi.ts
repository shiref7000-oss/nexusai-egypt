import { apiFetchWithTimeout } from './fetchWithTimeout';
import { apiUrl, authHeadersMultipart } from './api';

export type CostAnalyzerUsage = {
  yearMonth: string;
  used: number;
  limit: number;
  remaining: number;
  canAnalyze: boolean;
};

export type ProductCost = {
  id: number;
  productName: string;
  normalizedName: string;
  sku: string | null;
  costPerUnit: number;
  currency: string;
  lastUpdatedAt: string;
};

export type ReportItem = {
  productName: string;
  normalizedName: string;
  quantity: number;
  revenue: number;
  unitCost: number;
  totalCost: number;
  profit: number;
  marginPct: number | null;
};

export type ReportTotals = {
  totalRevenue: number;
  totalProductCost: number;
  grossProfit: number;
  grossMarginPct: number;
  costPct: number;
  totalUnits: number;
  totalOrders: number | null;
};

export type RevenueMode = 'collected' | 'line_total' | 'unit_price_x_qty';

export type ColumnMappingConfig = {
  product: string;
  quantity: string | null;
  revenue: string;
  revenueMode: RevenueMode;
  unitPrice: string | null;
  orderId: string | null;
  status: string | null;
  bundleMultiplier: string | null;
  shippedItemCount: string | null;
  orderFilters: {
    excludeCancelled: boolean;
    excludeReturned: boolean;
    includeOnlyStatuses: string[];
  };
};

export type Reconciliation = {
  rowsInFile: number;
  rowsProcessed: number;
  rowsExcluded: number;
  ordersCounted: number | null;
  unitsCounted: number;
  revenueColumn: string;
  revenueMode: RevenueMode;
  revenueTotal: number;
  excludedByStatus: Record<string, number>;
  quantityMismatches: number;
  expectedUnitsTotal: number | null;
  parsedUnitsTotal: number;
  columnMapping: ColumnMappingConfig;
};

export type ExtractionPreviewLine = {
  rowIndex: number;
  originalDescription: string;
  parsedProduct: string;
  parsedQuantity: number;
  confidence: number;
  ambiguous: boolean;
  included: boolean;
};

export type ExtractionPreview = {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  mapping: ColumnMappingConfig;
  candidates: Record<string, Array<{ header: string; score: number; reason: string }>>;
  detectedStatuses: string[];
  reconciliation: Reconciliation;
  previewProducts: Array<{ productName: string; normalizedName: string; quantity: number; revenue: number }>;
  parsedLines: ExtractionPreviewLine[];
  revenueModeLabels: Record<RevenueMode, string>;
};

export type CostReport = {
  id: string;
  title: string;
  fileName: string;
  status: string;
  publicStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  processingStep?: string;
  insightsStatus?: 'ok' | 'failed' | 'pending' | null;
  currency: string;
  totals: ReportTotals;
  reconciliation?: Reconciliation;
  missingCosts?: string[];
  draftProducts?: ReportItem[];
  errorMessage?: string | null;
  extraction?: {
    columnMapping?: ColumnMappingConfig;
    reconciliation?: Reconciliation;
    notes?: string;
  };
  aiInsights?: {
    executiveSummary?: string;
    bullets?: string[];
    mostProfitable?: string;
    lowestMargin?: string;
    highestSelling?: string;
    repricingSuggestions?: string[];
    _meta?: { status?: string; error?: string };
  };
  items: ReportItem[];
  createdAt: string;
  updatedAt?: string;
};

export type UploadResult = {
  reportId: string;
  fileName: string;
  rowCount: number;
  headers: string[];
  status: string;
};

/** Analyze runs row extraction + optional AI insights — allow up to 5 minutes */
const ANALYZE_TIMEOUT_MS = 300000;

export const costAnalyzerApi = {
  usage: () =>
    apiFetchWithTimeout<{ success: boolean; data: CostAnalyzerUsage }>('/api/cost-analyzer/usage'),

  productCosts: () =>
    apiFetchWithTimeout<{ success: boolean; data: ProductCost[] }>('/api/cost-analyzer/product-costs'),

  saveProductCosts: (costs: Array<{ productName: string; costPerUnit: number; sku?: string }>) =>
    apiFetchWithTimeout<{ success: boolean; data: { saved: number } }>('/api/cost-analyzer/product-costs', {
      method: 'POST',
      body: JSON.stringify({ costs }),
    }),

  listReports: () =>
    apiFetchWithTimeout<{ success: boolean; data: CostReport[] }>('/api/cost-analyzer/reports'),

  getReport: (id: string) =>
    apiFetchWithTimeout<{ success: boolean; data: CostReport }>(`/api/cost-analyzer/reports/${id}`),

  preview: (reportId: string, columnMapping?: Partial<ColumnMappingConfig>) =>
    apiFetchWithTimeout<{ success: boolean; data: ExtractionPreview }>(
      `/api/cost-analyzer/reports/${reportId}/preview`,
      {
        method: 'POST',
        body: JSON.stringify({ columnMapping: columnMapping || undefined }),
      }
    ),

  upload: async (file: File, title?: string): Promise<{ success: boolean; data: UploadResult }> => {
    const fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);
    const res = await fetch(apiUrl('/api/cost-analyzer/upload'), {
      method: 'POST',
      headers: authHeadersMultipart(),
      body: fd,
    });

    let json: { success?: boolean; error?: string; data?: UploadResult };
    try {
      json = await res.json();
    } catch {
      throw new Error(
        res.status === 413
          ? 'File too large (max 10MB)'
          : `Upload failed — invalid server response (${res.status})`
      );
    }

    if (res.status === 401) {
      throw new Error('Session expired — please sign in again');
    }
    if (!res.ok || !json.success || !json.data?.reportId) {
      throw new Error(json.error || `Upload failed (${res.status})`);
    }
    return json as { success: boolean; data: UploadResult };
  },

  analyze: (
    reportId: string,
    body?: { costOverrides?: Record<string, number>; columnMapping?: Partial<ColumnMappingConfig>; useAiMapping?: boolean }
  ) =>
    apiFetchWithTimeout<{
      success: boolean;
      data: {
        status: string;
        report?: CostReport;
        extraction?: { reconciliation?: Reconciliation; columnMapping?: ColumnMappingConfig };
        missingCosts?: string[];
        products?: ReportItem[];
        usage?: CostAnalyzerUsage;
      };
    }>(`/api/cost-analyzer/reports/${reportId}/analyze`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
      timeoutMs: ANALYZE_TIMEOUT_MS,
    }),

  calculate: (
    reportId: string,
    body: { costOverrides?: Record<string, number>; saveCosts?: Array<{ productName: string; costPerUnit: number }> }
  ) =>
    apiFetchWithTimeout<{ success: boolean; data: CostReport }>(
      `/api/cost-analyzer/reports/${reportId}/calculate`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: ANALYZE_TIMEOUT_MS,
      }
    ),

  exportUrl: (reportId: string, format: 'xlsx' | 'csv' | 'pdf' | 'debug') =>
    apiUrl(`/api/cost-analyzer/reports/${reportId}/export?format=${format}`),

  deleteReport: (reportId: string) =>
    apiFetchWithTimeout<{ success: boolean; data: { deleted: boolean; reportId: string } }>(
      `/api/cost-analyzer/reports/${reportId}`,
      { method: 'DELETE' }
    ),

  retryReport: (reportId: string) =>
    apiFetchWithTimeout<{ success: boolean; data: CostReport }>(
      `/api/cost-analyzer/reports/${reportId}/retry`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
};

export const COST_ANALYZER_SESSION_KEY = 'nexusai_cost_analyzer_active_report';
