import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/public/PublicLayout';
import { LegalSection } from '@/components/public/LegalSection';
import { PUBLIC_ROUTES, SITE } from '@/config/site';

export default function TermsPage() {
  const updated = 'May 21, 2026';

  return (
    <PublicLayout
      title="Terms & Conditions — Nexus AI"
      description="Nexus AI Terms and Conditions for platform usage, billing, and service limitations."
    >
      <div className="px-4 sm:px-6 py-16 sm:py-24">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Terms & Conditions</h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: {updated}</p>
          <p className="mt-6 text-zinc-400 leading-relaxed">
            These Terms govern your access to {SITE.productName} operated by {SITE.legalName}. By creating an
            account or using the service, you agree to these Terms.
          </p>

          <div className="mt-12">
            <LegalSection title="1. Platform usage">
              <p>
                You may use the platform for lawful eCommerce and business operations. You are responsible for
                compliance with Meta WhatsApp policies, TikTok developer policies, and local consumer
                protection laws when messaging customers.
              </p>
            </LegalSection>

            <LegalSection title="2. Account responsibilities">
              <p>
                You must provide accurate registration information and keep credentials secure. You are
                responsible for all activity under your account, including API tokens and webhook secrets.
                Notify us immediately of unauthorized access.
              </p>
            </LegalSection>

            <LegalSection title="3. WhatsApp & messaging">
              <p>
                WhatsApp messaging is provided through your own Meta business account. You must obtain
                customer consent where required. We are not responsible for Meta outages, template rejections,
                or per-message fees charged by Meta.
              </p>
            </LegalSection>

            <LegalSection title="4. Billing & subscriptions">
              <p>
                Paid plans are billed in advance per the pricing page or order form. Fees are exclusive of
                taxes unless stated otherwise. Failure to pay may result in suspension. Meta and other
                third-party fees are your responsibility.
              </p>
            </LegalSection>

            <LegalSection title="5. Refund policy">
              <p>
                Subscription fees are generally non-refundable except where required by law or explicitly
                agreed in writing. Contact{' '}
                <a href={`mailto:${SITE.supportEmail}`} className="text-brand hover:underline">
                  {SITE.supportEmail}
                </a>{' '}
                within 14 days of billing for billing disputes.
              </p>
            </LegalSection>

            <LegalSection title="6. Service limitations">
              <p>
                The platform is provided &quot;as is&quot;. We do not guarantee uninterrupted service, specific
                delivery rates, or business outcomes. Beta features may change without notice.
              </p>
            </LegalSection>

            <LegalSection title="7. Acceptable use">
              <p>You may not use the service to send spam, unlawful content, or messages that violate Meta
                policies. We may suspend accounts that abuse the platform or harm other users.
              </p>
            </LegalSection>

            <LegalSection title="8. Intellectual property">
              <p>
                We retain rights to the platform software and branding. You retain rights to your business data
                and content you upload.
              </p>
            </LegalSection>

            <LegalSection title="9. Termination">
              <p>
                You may stop using the service at any time. We may terminate or suspend access for breach of
                these Terms, non-payment, or legal requirements. Upon termination, your right to access ends;
                we may delete data per our retention policy.
              </p>
            </LegalSection>

            <LegalSection title="10. Limitation of liability">
              <p>
                To the maximum extent permitted by law, {SITE.legalName} is not liable for indirect, incidental,
                or consequential damages. Our aggregate liability is limited to fees paid in the twelve months
                before the claim.
              </p>
            </LegalSection>

            <LegalSection title="11. Governing law">
              <p>
                These Terms are governed by the laws of Egypt unless otherwise required by mandatory local law.
                Disputes shall be resolved in competent courts in Egypt.
              </p>
            </LegalSection>

            <LegalSection title="12. Contact">
              <p>
                Questions:{' '}
                <a href={`mailto:${SITE.legalEmail}`} className="text-brand hover:underline">
                  {SITE.legalEmail}
                </a>
                . See also our{' '}
                <Link to={PUBLIC_ROUTES.privacy} className="text-brand hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </LegalSection>
          </div>
        </article>
      </div>
    </PublicLayout>
  );
}
