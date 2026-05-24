import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { Button } from '@/components/ui/button';
import { PUBLIC_ROUTES } from '@/config/site';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'Free',
    period: 'during early access',
    description: 'For single stores testing WhatsApp COD automation.',
    features: [
      'WhatsApp Cloud API connection',
      'COD confirmation templates',
      'Order inbox & status tracking',
      'Template sync from Meta',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$49',
    period: '/ month',
    description: 'For growing brands with higher order volume.',
    featured: true,
    features: [
      'Everything in Starter',
      'Workflow automation (n8n)',
      'Meta Ads insights',
      'Priority support',
      'Multiple team seats (coming soon)',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 'Custom',
    period: '',
    description: 'For agencies managing multiple merchants.',
    features: [
      'Multi-tenant workspaces',
      'Dedicated onboarding',
      'SLA & custom integrations',
      'TikTok / Meta developer support pack',
      'Account manager',
    ],
  },
];

export default function PricingPage() {
  return (
    <PublicLayout
      title="Pricing — Nexus AI"
      description="Nexus AI pricing for eCommerce WhatsApp automation, order management, and agency plans."
    >
      <div className="px-4 sm:px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl text-center">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Simple, transparent pricing</h1>
          <p className="mt-4 text-zinc-500 max-w-2xl mx-auto">
            Plans scale with your order volume and integrations. WhatsApp message fees from Meta are
            billed separately by Meta.
          </p>
        </div>
        <div className="mx-auto max-w-6xl mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.featured
                  ? 'border-brand/40 bg-brand/5 shadow-lg shadow-brand/10'
                  : 'border-white/[0.06] bg-panel'
              }`}
            >
              {plan.featured && (
                <span className="text-xs font-medium text-brand uppercase tracking-wider mb-2">
                  Popular
                </span>
              )}
              <h2 className="text-xl font-semibold text-white">{plan.name}</h2>
              <p className="mt-2 text-sm text-zinc-500">{plan.description}</p>
              <p className="mt-6">
                <span className="text-3xl font-semibold text-white">{plan.price}</span>
                {plan.period && <span className="text-sm text-zinc-500 ml-1">{plan.period}</span>}
              </p>
              <ul className="mt-8 space-y-3 flex-1 text-sm text-zinc-400">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to={plan.id === 'agency' ? PUBLIC_ROUTES.contact : PUBLIC_ROUTES.signup} className="mt-8 block">
                <Button className="w-full" variant={plan.featured ? 'default' : 'outline'}>
                  {plan.id === 'agency' ? 'Contact sales' : 'Start free'}
                </Button>
              </Link>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-2xl mt-12 text-center text-xs text-zinc-600">
          Pricing shown is indicative for platform access. Final billing terms are defined in our{' '}
          <Link to={PUBLIC_ROUTES.terms} className="underline hover:text-zinc-400">
            Terms & Conditions
          </Link>
          .
        </p>
      </div>
    </PublicLayout>
  );
}
