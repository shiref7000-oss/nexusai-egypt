import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/public/PublicLayout';
import { Button } from '@/components/ui/button';
import { PUBLIC_ROUTES, SITE } from '@/config/site';

export default function AboutPage() {
  return (
    <PublicLayout
      title="About Us — Nexus AI"
      description="Nexus AI helps eCommerce brands and agencies automate WhatsApp COD confirmations, order management, and customer communication."
    >
      <div className="px-4 sm:px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-semibold tracking-tight">About {SITE.companyName}</h1>
          <p className="mt-6 text-lg text-zinc-400 leading-relaxed">
            {SITE.companyName} is a SaaS platform built for eCommerce businesses, brands, and agencies
            operating in fast-moving markets — especially merchants who rely on cash-on-delivery (COD)
            and WhatsApp for customer communication.
          </p>

          <section className="mt-14 space-y-6">
            <h2 className="text-2xl font-semibold text-white">Our mission</h2>
            <p className="text-zinc-400 leading-relaxed">
              We help online stores reduce operational chaos by connecting orders, WhatsApp Cloud API,
              automation workflows, and AI-assisted tools in one calm workspace. Merchants should spend
              less time chasing confirmations and more time growing revenue.
            </p>
          </section>

          <section className="mt-14 space-y-6">
            <h2 className="text-2xl font-semibold text-white">Who we serve</h2>
            <ul className="list-disc list-inside text-zinc-400 space-y-2">
              <li>eCommerce stores and D2C brands</li>
              <li>Agencies managing multiple merchant accounts</li>
              <li>Operations teams handling COD order volume</li>
              <li>Brands integrating Meta, WhatsApp, Instagram, and TikTok channels</li>
            </ul>
          </section>

          <section className="mt-14 space-y-6">
            <h2 className="text-2xl font-semibold text-white">The problem we solve</h2>
            <p className="text-zinc-400 leading-relaxed">
              COD-heavy stores lose margin when orders are unconfirmed, messages are manual, and templates
              fall out of sync with Meta. {SITE.productName} automates WhatsApp order confirmations,
              tracks delivery states, synchronizes approved message templates, and surfaces dashboards
              your team can trust — without blocking your checkout on slow API calls.
            </p>
          </section>

          <div className="mt-14 flex flex-wrap gap-3">
            <Link to={PUBLIC_ROUTES.signup}>
              <Button size="lg">Get started</Button>
            </Link>
            <Link to={PUBLIC_ROUTES.contact}>
              <Button variant="outline" size="lg">
                Contact us
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
