export type ReportStatus =
  | 'uploaded'
  | 'pending'
  | 'processing'
  | 'extracting'
  | 'analyzing'
  | 'generating_insights'
  | 'needs_costs'
  | 'calculated'
  | 'completed'
  | 'failed';

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
  /** Optional column with expected total pieces/items per order row */
  shippedItemCount: string | null;
  orderFilters: {
    excludeCancelled: boolean;
    excludeReturned: boolean;
    includeOnlyStatuses: string[];
  };
};

export type ColumnCandidate = {
  header: string;
  score: number;
  reason: string;
};

export type ColumnDetectionResult = {
  mapping: ColumnMappingConfig;
  candidates: {
    product: ColumnCandidate[];
    quantity: ColumnCandidate[];
    revenue: ColumnCandidate[];
    status: ColumnCandidate[];
    orderId: ColumnCandidate[];
    bundleMultiplier: ColumnCandidate[];
    unitPrice: ColumnCandidate[];
  };
  detectedStatuses: string[];
};

export type ExtractedProduct = {
  productName: string;
  normalizedName: string;
  quantity: number;
  revenue: number;
};

export type ReportItemRow = ExtractedProduct & {
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

export type AiInsightsPayload = {
  executiveSummary: string;
  bullets: string[];
  mostProfitable?: string;
  lowestMargin?: string;
  highestSelling?: string;
  repricingSuggestions?: string[];
  _meta?: { status: 'ok' | 'failed' | 'skipped'; error?: string };
};

export type ParsedLineProduct = {
  productName: string;
  quantity: number;
  confidence: number;
  ambiguous: boolean;
  quantitySource?: string;
};

export type ParsedLineDebug = {
  rowIndex: number;
  included: boolean;
  excludeReason?: string;
  productName: string;
  quantity: number;
  revenue: number;
  orderId?: string;
  status?: string;
  originalDescription?: string;
  parsedProducts?: ParsedLineProduct[];
  confidence?: number;
  ambiguous?: boolean;
  quantityMismatch?: boolean;
  original: Record<string, unknown>;
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

export type ExtractionResult = {
  products: ExtractedProduct[];
  currency: string;
  notes?: string;
  columnMapping: ColumnMappingConfig;
  reconciliation: Reconciliation;
  debugLines?: ParsedLineDebug[];
  previewLines?: ExtractionPreviewLine[];
  processingStep?: string;
};
