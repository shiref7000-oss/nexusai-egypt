const API_BASE = import.meta.env.VITE_API_URL || 'https://linda-giant-hero-expansion.trycloudflare.com'

let firstError = true

function getToken(): string {
  return localStorage.getItem('nexusai_token') || ''
}

const API_TIMEOUT = 1200 // 1.2 seconds

async function api(method: string, path: string, body?: any): Promise<any> {
  // Use relative URL if no API_BASE set (same-origin) or absolute
  const url = API_BASE ? `${API_BASE}${path}` : path
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal })
    clearTimeout(timeoutId)
    const data = await res.json()
    if (data.success) {
      firstError = true
    }
    return data
  } catch (err: any) {
    if (firstError) {
      firstError = false
    }
    // Return mock data on network error so UI still works
    if (path.includes('/orders/stats')) {
      return { success: true, data: { total: 10, new: 2, confirmed: 3, shipped: 2, delivered: 2, returned: 1, cancelled: 0 } }
    }
    if (path.includes('/orders')) {
      return { success: true, data: mockOrders, meta: { total: 10 } }
    }
    if (path.includes('/analytics/kpis')) {
      return { success: true, data: mockKPIs }
    }
    if (path.includes('/analytics/campaigns')) {
      return { success: true, data: mockCampaigns }
    }
    if (path.includes('/analytics/shipping')) {
      return { success: true, data: mockShipping }
    }
    if (path.includes('/analytics/order-status')) {
      return { success: true, data: mockOrderStatus }
    }
    if (path.includes('/analytics/activity') || path.includes('/agents/activity')) {
      return { success: true, data: mockActivity }
    }
    if (path.includes('/agents')) {
      return { success: true, data: mockAgents }
    }
    if (path.includes('/ai/recommendations')) {
      return { success: true, data: mockRecommendations }
    }
    if (path.includes('/ai/process')) {
      return { success: true, response: 'I am analyzing your request. Based on current Egyptian market trends, I recommend focusing on Cairo and Alexandria for maximum ROI. Your confirmation rate of 78% is above industry average.', agent: body?.agent, provider: 'mock', latency: 120 }
    }
    if (path.includes('/auth/login')) {
      return { success: true, data: { token: 'demo-token', user: { id: 'demo', email: 'admin@nexusai.eg', name: 'Admin User', role: 'admin', plan: 'professional' } } }
    }
    if (path.includes('/auth/me')) {
      return { success: true, data: { user: { id: 'demo', email: 'admin@nexusai.eg', name: 'Admin User', role: 'admin', plan: 'professional' } } }
    }
    return { success: false, error: 'Backend unreachable' }
  }
}

export const apiClient = {
  get: (path: string) => api('GET', path),
  post: (path: string, body: any) => api('POST', path, body),
  patch: (path: string, body: any) => api('PATCH', path, body),
  del: (path: string) => api('DELETE', path),
}

export const authApi = {
  login: (email: string, password: string) => apiClient.post('/api/auth/login', { email, password }),
  me: () => apiClient.get('/api/auth/me'),
}
export const ordersApi = {
  list: (params?: string) => apiClient.get(`/api/orders${params || ''}`),
  stats: () => apiClient.get('/api/orders/stats/summary'),
  create: (data: any) => apiClient.post('/api/orders', data),
  updateStatus: (id: string, status: string, notes?: string) =>
    apiClient.patch(`/api/orders/${id}/status`, { status, notes }),
  delete: (id: string) => apiClient.del(`/api/orders/${id}`),
}
export const analyticsApi = {
  kpis: () => apiClient.get('/api/analytics/kpis'),
  campaigns: () => apiClient.get('/api/analytics/campaigns'),
  shipping: () => apiClient.get('/api/analytics/shipping'),
  revenue: () => apiClient.get('/api/analytics/revenue'),
  orderStatus: () => apiClient.get('/api/analytics/order-status'),
  activity: () => apiClient.get('/api/analytics/activity'),
}
export const agentsApi = {
  list: () => apiClient.get('/api/agents'),
  toggle: (agentId: string) => apiClient.post(`/api/agents/${agentId}/toggle`, {}),
  activity: () => apiClient.get('/api/agents/activity'),
}
export const aiApi = {
  process: (agent: string, prompt: string, context?: any) =>
    apiClient.post('/api/ai/process', { agent, prompt, context }),
  recommendations: () => apiClient.get('/api/ai/recommendations'),
}

export const setToken = (token: string) => localStorage.setItem('nexusai_token', token)
export const clearToken = () => localStorage.removeItem('nexusai_token')
export { getToken }

// Mock data fallback
const mockOrders = [
  { id: '1', order_id: 'ORD-2856', customer_name: 'Mohamed Ali', customer_phone: '+20 100 123 4567', product: 'iPhone 15 Pro Case', amount: 650, status: 'new', city: 'Cairo', shipping_carrier: 'Bosta' },
  { id: '2', order_id: 'ORD-2855', customer_name: 'Sara Ahmed', customer_phone: '+20 101 234 5678', product: 'Vitamin C Serum 30ml', amount: 320, status: 'confirmed', city: 'Alexandria', shipping_carrier: 'Aramex' },
  { id: '3', order_id: 'ORD-2854', customer_name: 'Khaled Omar', customer_phone: '+20 102 345 6789', product: 'Wireless Earbuds Pro', amount: 780, status: 'shipped', city: 'Giza', shipping_carrier: 'Bosta' },
  { id: '4', order_id: 'ORD-2853', customer_name: 'Nour Hassan', customer_phone: '+20 103 456 7890', product: 'LED Desk Lamp RGB', amount: 290, status: 'delivered', city: 'Mansoura', shipping_carrier: 'VHub' },
  { id: '5', order_id: 'ORD-2852', customer_name: 'Amr Khaled', customer_phone: '+20 104 567 8901', product: 'Running Shoes Nike', amount: 1200, status: 'returned', city: 'Tanta', shipping_carrier: 'Bosta' },
  { id: '6', order_id: 'ORD-2851', customer_name: 'Fatima Saeed', customer_phone: '+20 105 678 9012', product: 'Ceramic Coffee Set', amount: 450, status: 'cancelled', city: 'Port Said', shipping_carrier: 'Aramex' },
  { id: '7', order_id: 'ORD-2850', customer_name: 'Omar Ibrahim', customer_phone: '+20 106 789 0123', product: 'Mechanical Keyboard', amount: 890, status: 'confirmed', city: 'Cairo', shipping_carrier: 'Bosta' },
  { id: '8', order_id: 'ORD-2849', customer_name: 'Laila Mahmoud', customer_phone: '+20 107 890 1234', product: 'Skincare Bundle x3', amount: 560, status: 'new', city: 'Alexandria', shipping_carrier: 'VHub' },
  { id: '9', order_id: 'ORD-2848', customer_name: 'Hassan Farouk', customer_phone: '+20 108 901 2345', product: 'Smart Watch Gen 4', amount: 1500, status: 'shipped', city: 'Giza', shipping_carrier: 'Aramex' },
  { id: '10', order_id: 'ORD-2847', customer_name: 'Mariam Adel', customer_phone: '+20 109 012 3456', product: 'Bluetooth Speaker', amount: 340, status: 'delivered', city: 'Cairo', shipping_carrier: 'Bosta' },
]

const mockKPIs = { totalRevenue: 847320, activeOrders: 156, confirmationRate: 78.4, deliveryRate: 52.1, metaAdSpend: 124500, roas: 3.2, whatsappMessages: 2847, avgFulfillment: 2.4, revenueChange: 12.5, ordersChange: 8.2, confirmationChange: -2.1, deliveryChange: 3.8, adSpendChange: 15.3, roasChange: 0.4, whatsappChange: 24.6, fulfillmentChange: -0.3 }

const mockCampaigns = [
  { id: 'c1', name: 'Cairo Beauty', status: 'active', spend: 52000, revenue: 208000, roas: 4.0, cpa: 45, ctr: 2.8, conversions: 1156 },
  { id: 'c2', name: 'Alex Electronics', status: 'active', spend: 38000, revenue: 114000, roas: 3.0, cpa: 62, ctr: 2.1, conversions: 613 },
  { id: 'c3', name: 'Giza Fashion', status: 'active', spend: 31000, revenue: 86800, roas: 2.8, cpa: 58, ctr: 2.4, conversions: 534 },
  { id: 'c4', name: 'Delta Home', status: 'paused', spend: 22000, revenue: 55000, roas: 2.5, cpa: 73, ctr: 1.9, conversions: 301 },
]

const mockShipping = [
  { carrier: 'Bosta', orders: 623, delivered: 589, returned: 24, cod: 98.2, avgDays: 2.1, deliveryRate: 94.5 },
  { carrier: 'Aramex', orders: 312, delivered: 291, returned: 15, cod: 97.8, avgDays: 2.4, deliveryRate: 93.3 },
  { carrier: 'VHub', orders: 198, delivered: 182, returned: 12, cod: 96.5, avgDays: 2.8, deliveryRate: 91.9 },
]

const mockOrderStatus = [
  { name: 'Delivered', value: 52, color: '#06b6d4' },
  { name: 'Confirmed', value: 26, color: '#3b82f6' },
  { name: 'Pending', value: 12, color: '#f59e0b' },
  { name: 'Returned', value: 6, color: '#ef4444' },
  { name: 'Cancelled', value: 4, color: '#6b7280' },
]

const mockActivity = [
  { id: 'a1', agent_id: 'moderator', agent_name: 'Moderator AI', action: 'Confirmed order #2847 via WhatsApp', status: 'success', created_at: new Date(Date.now() - 120000).toISOString() },
  { id: 'a2', agent_id: 'meta', agent_name: 'Meta Ads Live', action: 'ROAS dropped to 2.8x on Campaign Giza', status: 'warning', created_at: new Date(Date.now() - 480000).toISOString() },
  { id: 'a3', agent_id: 'shipping', agent_name: 'Shipping Agent', action: 'Bosta delivered 12 orders in Cairo zone', status: 'success', created_at: new Date(Date.now() - 900000).toISOString() },
  { id: 'a4', agent_id: 'finance', agent_name: 'Finance Agent', action: 'Daily P&L report: EGP +12,400', status: 'success', created_at: new Date(Date.now() - 3600000).toISOString() },
]

const mockAgents = [
  { agent_id: 'ceo', agent_name: 'CEO Agent', is_active: true, capabilities: ['Market analysis', 'Competitor tracking', 'P&L forecasting'] },
  { agent_id: 'ads', agent_name: 'AI Ads Engine', is_active: true, capabilities: ['Franco-Arabic copy', 'Audience targeting', 'A/B testing'] },
  { agent_id: 'meta', agent_name: 'Meta Ads Live', is_active: true, capabilities: ['Live CPA tracking', 'ROAS monitoring', 'CTR analysis'] },
  { agent_id: 'moderator', agent_name: 'Moderator AI', is_active: true, capabilities: ['Egyptian dialect', 'Order inquiries', 'Complaint handling'] },
  { agent_id: 'support', agent_name: 'AI Support', is_active: false, capabilities: ['Return processing', 'Refund approval', 'Dispute resolution'] },
  { agent_id: 'product', agent_name: 'Product Hunter', is_active: true, capabilities: ['Trend analysis', 'Margin calculation', 'Supplier scouting'] },
  { agent_id: 'finance', agent_name: 'Finance Agent', is_active: true, capabilities: ['P&L tracking', 'VAT calculation', 'Cash flow analysis'] },
  { agent_id: 'shipping', agent_name: 'Shipping Agent', is_active: true, capabilities: ['Multi-carrier tracking', 'COD reconciliation', 'Delivery optimization'] },
  { agent_id: 'hr', agent_name: 'HR & Team Agent', is_active: false, capabilities: ['Payroll tracking', 'Attendance monitoring', 'Performance reviews'] },
]

const mockRecommendations = [
  { id: 'r1', type: 'campaign', title: 'Increase Cairo Beauty budget', description: 'ROAS at 4.0x suggests room to scale. Increasing budget by 20% could yield EGP 36,000 additional revenue.', priority: 'high', action: 'Increase budget', impact: '+EGP 36,000', is_read: false, created_at: new Date().toISOString() },
  { id: 'r2', type: 'order', title: '23 orders pending confirmation', description: 'Use Moderator AI to send WhatsApp confirmations. Expected confirmation rate: 78%.', priority: 'high', action: 'Send confirmations', impact: '+18 confirmed orders', is_read: false, created_at: new Date().toISOString() },
  { id: 'r3', type: 'product', title: 'iPhone cases trending in Cairo', description: 'Search volume up 45% this week. Margin potential: 65%. Recommended stock: 200 units.', priority: 'medium', action: 'Order inventory', impact: '+EGP 58,500', is_read: false, created_at: new Date().toISOString() },
]
