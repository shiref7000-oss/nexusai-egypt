const API_BASE = import.meta.env.VITE_API_URL || 'http://178.16.129.216';

function getToken(): string {
  return localStorage.getItem('nexusai_token') || '';
}

async function api(method: string, path: string, body?: any): Promise<any> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error('API error:', err.message);
    return { success: false, error: err.message };
  }
}

export const apiClient = {
  get: (path: string) => api('GET', path),
  post: (path: string, body: any) => api('POST', path, body),
  patch: (path: string, body: any) => api('PATCH', path, body),
  del: (path: string) => api('DELETE', path),
};

export const authApi = {
  login: (email: string, password: string) => apiClient.post('/api/auth/login', { email, password }),
  register: (email: string, password: string, name: string) => apiClient.post('/api/auth/register', { email, password, name }),
  guest: () => apiClient.post('/api/auth/guest', {}),
  me: () => apiClient.get('/api/auth/me'),
};

export const ordersApi = {
  list: (params?: string) => apiClient.get(`/api/orders${params || ''}`),
  stats: () => apiClient.get('/api/orders/stats/summary'),
  create: (data: any) => apiClient.post('/api/orders', data),
  updateStatus: (id: string, status: string, notes?: string) =>
    apiClient.patch(`/api/orders/${id}/status`, { status, notes }),
  delete: (id: string) => apiClient.del(`/api/orders/${id}`),
};

export const analyticsApi = {
  kpis: () => apiClient.get('/api/analytics/kpis'),
  campaigns: () => apiClient.get('/api/analytics/campaigns'),
  shipping: () => apiClient.get('/api/analytics/shipping'),
  revenue: () => apiClient.get('/api/analytics/revenue'),
  orderStatus: () => apiClient.get('/api/analytics/order-status'),
  activity: () => apiClient.get('/api/analytics/activity'),
};

export const agentsApi = {
  list: () => apiClient.get('/api/agents'),
  toggle: (agentId: string) => apiClient.post(`/api/agents/${agentId}/toggle`, {}),
  activity: () => apiClient.get('/api/agents/activity'),
};

export const aiApi = {
  process: (agent: string, prompt: string, context?: any) =>
    apiClient.post('/api/ai/process', { agent, prompt, context }),
  recommendations: () => apiClient.get('/api/ai/recommendations'),
  markRead: (id: string) => apiClient.patch(`/api/ai/recommendations/${id}/read`, {}),
};

export const setToken = (token: string) => localStorage.setItem('nexusai_token', token);
export const clearToken = () => localStorage.removeItem('nexusai_token');
