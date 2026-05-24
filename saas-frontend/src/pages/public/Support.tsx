import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/public/PublicLayout';
import { PUBLIC_ROUTES, SITE } from '@/config/site';

const FAQ = [
  {
    q: 'How do I connect WhatsApp Cloud API?',
    a: 'Sign up, open the WhatsApp module in your workspace, and follow the connection wizard with your Meta App ID, WABA ID, Phone Number ID, and access token. Verify the webhook URL shown in the dashboard in Meta Developer settings.',
  },
  {
    q: 'Why is my template still pending?',
    a: 'Templates must be approved in Meta Business Manager. After approval, click Refresh in the WhatsApp module to sync statuses from Meta (APPROVED, IN_REVIEW, REJECTED).',
  },
  {
    q: 'Does Nexus AI send WhatsApp messages directly?',
    a: 'Outbound messages are queued and sent via the official WhatsApp Cloud API using your business credentials. Message delivery and pricing are subject to Meta policies.',
  },
  {
    q: 'Can agencies manage multiple stores?',
    a: 'Agency multi-store support is on the roadmap. Contact sales for early access and onboarding.',
  },
  {
    q: 'What integrations are supported?',
    a: 'WhatsApp Cloud API, Meta Ads, TikTok Ads (beta), incoming order webhooks, and workflow automation via n8n. More eCommerce platforms are planned.',
  },
  {
    q: 'How do I get help with a failed order or message?',
    a: `Email ${SITE.supportEmail} with your account email, order ID, and screenshots from the WhatsApp Activity tab.`,
  },
];

export default function SupportPage() {
  return (
    <PublicLayout
      title="Support — Nexus AI"
      description="Nexus AI help center — FAQs, troubleshooting, and contact support for WhatsApp and eCommerce automation."
    >
      <div className="px-4 sm:px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Support</h1>
          <p className="mt-4 text-zinc-400">
            Find answers below or contact our team. We typically respond within 2 business days.
          </p>

          <div className="mt-10 rounded-xl border border-white/[0.06] bg-panel p-6">
            <h2 className="text-sm font-medium text-white">Contact support</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Email{' '}
              <a href={`mailto:${SITE.supportEmail}`} className="text-brand hover:underline">
                {SITE.supportEmail}
              </a>{' '}
              or use our{' '}
              <Link to={PUBLIC_ROUTES.contact} className="text-brand hover:underline">
                contact form
              </Link>
              .
            </p>
          </div>

          <h2 className="mt-14 text-2xl font-semibold text-white">FAQ</h2>
          <ul className="mt-6 space-y-6">
            {FAQ.map((item) => (
              <li key={item.q} className="border-b border-white/[0.06] pb-6">
                <h3 className="font-medium text-zinc-200">{item.q}</h3>
                <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{item.a}</p>
              </li>
            ))}
          </ul>

          <section className="mt-14">
            <h2 className="text-xl font-semibold text-white">Common troubleshooting</h2>
            <ul className="mt-4 list-disc list-inside text-sm text-zinc-500 space-y-2">
              <li>Connection test fails: confirm Phone Number ID (not WABA ID) and token permissions.</li>
              <li>Webhook not verified: use the exact callback URL from your dashboard in Meta.</li>
              <li>Messages not sending: ensure the worker process is online and templates are APPROVED.</li>
              <li>Login issues: reset password via support if you lost access to your account email.</li>
            </ul>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
