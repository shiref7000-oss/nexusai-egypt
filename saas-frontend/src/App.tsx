import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AdminGuard } from '@/components/auth/AdminGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import LoginPage from '@/pages/Login';
import SignUpPage from '@/pages/SignUp';
import LandingPage from '@/pages/Landing';
import AboutPage from '@/pages/public/About';
import PricingPage from '@/pages/public/Pricing';
import ContactPage from '@/pages/public/Contact';
import SupportPage from '@/pages/public/Support';
import PrivacyPage from '@/pages/public/Privacy';
import TermsPage from '@/pages/public/Terms';
import OnboardingPage from '@/pages/Onboarding';
import DashboardPage from '@/pages/Dashboard';
import SettingsPage from '@/pages/Settings';
import OrdersPage from '@/pages/Orders';
import OrderDetailPage from '@/pages/OrderDetail';
import AgentsPage from '@/pages/Agents';
import MarketplacePage from '@/pages/Marketplace';
import PlaygroundPage from '@/pages/Playground';
import ProvidersPage from '@/pages/Providers';
import WorkflowsPage from '@/pages/Workflows';
import BillingPage from '@/pages/Billing';
import AdminUsersPage from '@/pages/admin/Users';
import AdminIntegrations from '@/pages/admin/Integrations';
import AdminDashboardPage from '@/pages/admin/AdminDashboard';
import AdminFeatureFlagsPage from '@/pages/admin/FeatureFlags';
import AdminAuditLogsPage from '@/pages/admin/AuditLogs';
import AdminPlansPage from '@/pages/admin/Plans';
import AdminAISettingsPage from '@/pages/admin/AISettings';
import EngineeringAgentMonitorPage from '@/pages/admin/EngineeringAgentMonitor';
import EngineeringAgentTaskDetailPage from '@/pages/admin/EngineeringAgentTaskDetail';
import EngineeringAgentDeploymentsPage from '@/pages/admin/EngineeringAgentDeployments';
import EngineeringIntelligenceDashboard from '@/pages/admin/EngineeringIntelligenceDashboard';
import EngineeringAnalyticsPage from '@/pages/admin/EngineeringAnalytics';
import EngineeringAgentPage from '@/pages/EngineeringAgent';
import MetaAdsPage from '@/pages/MetaAds';
import MetaCampaignDetailPage from '@/pages/MetaCampaignDetail';
import WhatsAppPage from '@/pages/WhatsApp';
import CostAnalyzerPage from '@/pages/CostAnalyzer';
import ContentAgentPage from '@/pages/ContentAgent';
import TikTokInboxPage from '@/pages/admin/TikTokInbox';

function CatchAll() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/welcome" element={<OnboardingPage />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/analytics/cost-analyzer" element={<CostAnalyzerPage />} />
        <Route
          path="/ai-developer"
          element={
            <AdminGuard>
              <EngineeringAgentPage />
            </AdminGuard>
          }
        />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/whatsapp" element={<WhatsAppPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/content-agent" element={<ContentAgentPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/meta-ads" element={<MetaAdsPage />} />
        <Route path="/meta-ads/campaign/:campaignId" element={<MetaCampaignDetailPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <Navigate to="/admin/dashboard" replace />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <AdminGuard>
              <AdminDashboardPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminGuard>
              <AdminUsersPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/integrations"
          element={
            <AdminGuard>
              <AdminIntegrations />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <AdminGuard>
              <AdminAuditLogsPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/features"
          element={
            <AdminGuard>
              <AdminFeatureFlagsPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/plans"
          element={
            <AdminGuard>
              <AdminPlansPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/ai-settings"
          element={
            <AdminGuard>
              <AdminAISettingsPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/engineering-agent"
          element={
            <AdminGuard>
              <EngineeringAgentMonitorPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/engineering-intelligence"
          element={
            <AdminGuard>
              <EngineeringIntelligenceDashboard />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/engineering-analytics"
          element={
            <AdminGuard>
              <EngineeringAnalyticsPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/engineering-agent/deployments"
          element={
            <AdminGuard>
              <EngineeringAgentDeploymentsPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/engineering-agent/task/:id"
          element={
            <AdminGuard>
              <EngineeringAgentTaskDetailPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/inbox/tiktok"
          element={
            <AdminGuard>
              <TikTokInboxPage />
            </AdminGuard>
          }
        />
      </Route>
      <Route path="*" element={<CatchAll />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
