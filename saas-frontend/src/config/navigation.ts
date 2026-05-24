import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Package,
  Bot,
  Store,
  FlaskConical,
  Cpu,
  GitBranch,
  CreditCard,
  Settings,
  Plug,
  Users,
  Flag,
  FileText,
  BarChart3,
  Megaphone,
  MessageCircle,
  Calculator,
  Code2,
  Activity,
  Rocket,
  Brain,
  PenLine,
  Link,
  Inbox,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
};

export const mainNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/analytics/cost-analyzer', label: 'AI Cost Analyzer', icon: Calculator },
  { to: '/orders', label: 'Orders', icon: Package },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/agents', label: 'AI Agents', icon: Bot },
  { to: '/content-agent', label: 'Content Agent', icon: PenLine },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/playground', label: 'AI Playground', icon: FlaskConical },
  { to: '/providers', label: 'AI Providers', icon: Cpu },
  { to: '/meta-ads', label: 'Meta Ads', icon: Megaphone },
  { to: '/workflows', label: 'Workflows', icon: GitBranch },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** All routes use Vite SPA navigation — no legacy full-page reloads. */
export const legacyGatewayPaths = new Set<string>();

export const adminNav: NavItem[] = [
  { to: '/admin/dashboard', label: 'Admin Dashboard', icon: BarChart3, admin: true },
  { to: '/admin/users', label: 'Users', icon: Users, admin: true },
  { to: '/admin/integrations', label: 'Integrations', icon: Plug, admin: true },
  { to: '/admin/plans', label: 'Plans & Pricing', icon: CreditCard, admin: true },
  { to: '/admin/features', label: 'Feature Flags', icon: Flag, admin: true },
  { to: '/admin/ai-settings', label: 'AI Settings', icon: Cpu, admin: true },
  { to: '/admin/audit', label: 'Audit Logs', icon: FileText, admin: true },
  { to: '/admin/channels/tiktok', label: 'TikTok Connect', icon: Link, admin: true },
  { to: '/admin/inbox/tiktok', label: 'TikTok Inbox', icon: Inbox, admin: true },
  { to: '/ai-developer', label: 'AI Developer', icon: Code2, admin: true },
  { to: '/admin/engineering-agent', label: 'Engineering Monitor', icon: Activity, admin: true },
  { to: '/admin/engineering-intelligence', label: 'Engineering Intelligence', icon: Brain, admin: true },
  { to: '/admin/engineering-analytics', label: 'Engineering Analytics', icon: BarChart3, admin: true },
  { to: '/admin/engineering-agent/deployments', label: 'Engineering Deployments', icon: Rocket, admin: true },
];
