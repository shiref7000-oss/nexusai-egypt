/**
 * @deprecated Mock store removed — all runtime data must come from PostgreSQL.
 * Importing this module throws to catch leftover demo paths at development time.
 */
function rejectMockAccess(): never {
  throw new Error(
    'mockStore is disabled. Use PostgreSQL services (agentsDb, ordersDb, userPersistence, workflowRuntime).',
  );
}

export const mockStore = new Proxy(
  {} as Record<string, never>,
  {
    get() {
      return rejectMockAccess();
    },
    set() {
      return rejectMockAccess();
    },
  },
);
