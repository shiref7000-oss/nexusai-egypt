import { Link } from 'react-router-dom';
import {
  ArrowRight,
  MessageCircle,
  Package,
  Workflow,
  BarChart3,
  Shield,
  Zap,
} from 'lucide-react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { ProductPreview } from '@/components/landing/ProductPreview';
import { HeroOrb } from '@/components/brand/illustrations/HeroOrb';
import { Reveal } from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import { PUBLIC_ROUTES } from '@/config/site';

const features = [
  {
    icon: MessageCircle,
    title: 'WhatsApp COD automation',
    desc: 'Send approved template messages when orders arrive. Customers confirm or cancel in chat — no manual follow-up.',
  },
  {
    icon: Package,
    title: 'Order management',
    desc: 'Central inbox for COD orders, status history, webhooks from your store, and resend confirmations in one click.',
  },
  {
    icon: Workflow,
    title: 'Queue-backed messaging',
    desc: 'Outbound WhatsApp runs through workers and BullMQ — your checkout never waits on Meta API latency.',
  },
  {
    icon: BarChart3,
    title: 'Ops dashboards',
    desc: 'Delivery, read, and confirmation metrics plus template sync from Meta (APPROVED, IN_REVIEW, REJECTED).',
  },
];

export default function LandingPage() {
  return (
    <PublicLayout
      title="Nexus AI — WhatsApp COD automation for eCommerce"
      description="Nexus AI helps eCommerce stores and agencies automate WhatsApp order confirmations, manage COD orders, sync Meta templates, and run customer communication workflows."
    >
      {/* Hero */}
      <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 mb-5">
                SaaS for eCommerce · WhatsApp Cloud API
              </p>
              <h1 className="font-display text-[2.5rem] sm:text-5xl lg:text-[3.15rem] font-semibold leading-[1.08] tracking-tight">
                Automate COD confirmations on WhatsApp.
              </h1>
              <p className="mt-6 text-lg text-zinc-400 leading-relaxed max-w-xl">
                Nexus AI connects your store, Meta WhatsApp
                Business API, and operations team — so every COD order gets a fast, trackable customer reply.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <Link to={PUBLIC_ROUTES.signup}>
                  <Button size="lg" className="w-full sm:w-auto gap-2">
                    Sign Up free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to={PUBLIC_ROUTES.login}>
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Login
                  </Button>
                </Link>
              </div>
              <p className="mt-8 text-xs text-zinc-600 flex flex-wrap gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Meta Cloud API
                </span>
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Multi-tenant SaaS
                </span>
                <span>Built for brands & agencies</span>
              </p>
            </Reveal>
            <Reveal delay={120} className="relative lg:pl-8">
              <HeroOrb className="w-full max-w-lg mx-auto opacity-90 animate-float-subtle" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <ProductPreview />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="product" className="py-20 sm:py-28 px-4 sm:px-6 border-t border-white/[0.04]">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight max-w-2xl">
              Everything COD-heavy stores need on WhatsApp.
            </h2>
            <p className="mt-4 text-zinc-500 max-w-xl text-lg">
              Order management, customer communication, and Meta template sync — designed for Egyptian
              eCommerce and agencies scaling multiple brands.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <div className="rounded-2xl border border-white/[0.06] bg-panel p-6 h-full hover:border-white/[0.1] transition-colors">
                  <f.icon className="h-8 w-8 text-brand mb-4" strokeWidth={1.5} />
                  <h3 className="text-lg font-medium text-white">{f.title}</h3>
                  <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-20 px-4 sm:px-6 bg-panel/30 border-y border-white/[0.04]">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold">Integrations</h2>
          <p className="mt-4 text-zinc-500 max-w-2xl mx-auto">
            WhatsApp Cloud API today — Meta Ads, Instagram, TikTok for Business, and deeper eCommerce
            connectors on the roadmap.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/[0.08] bg-elevated/50 px-8 py-14 sm:px-14 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              Ready for verifiable, professional operations?
            </h2>
            <p className="mt-4 text-zinc-500">
              Create an account, connect WhatsApp, and pass Meta Business verification with a real website,
              privacy policy, and support contact.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to={PUBLIC_ROUTES.signup}>
                <Button size="lg">Sign Up</Button>
              </Link>
              <Link to={PUBLIC_ROUTES.pricing}>
                <Button variant="outline" size="lg">
                  View pricing
                </Button>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </PublicLayout>
  );
}
