export interface KpiCard {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
}

export interface Order {
  id: string;
  customer: string;
  phone: string;
  product: string;
  amount: number;
  status: 'new' | 'confirmed' | 'shipped' | 'delivered' | 'returned' | 'cancelled';
  city: string;
  date: string;
  shipping: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: string;
  status: 'active' | 'idle' | 'offline';
  lastActive: string;
  tasks: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'ended';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number;
  roas: number;
}

export interface ShippingRecord {
  id: string;
  orderId: string;
  carrier: string;
  status: string;
  pickupDate: string;
  deliveryDate?: string;
  codAmount: number;
  fees: number;
}
