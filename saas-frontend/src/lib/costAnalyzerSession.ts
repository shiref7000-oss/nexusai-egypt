import { COST_ANALYZER_SESSION_KEY } from './costAnalyzerApi';

/** Clears persisted analyzer session so refresh does not reopen a stuck report. */
export function clearCostAnalyzerSession(): void {
  try {
    sessionStorage.removeItem(COST_ANALYZER_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function clearCostAnalyzerReportFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('report')) return;
  url.searchParams.delete('report');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function resetCostAnalyzerPersistence(): void {
  clearCostAnalyzerSession();
  clearCostAnalyzerReportFromUrl();
}
