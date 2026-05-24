import { PublicLayout } from '@/components/public/PublicLayout';
import { LegalSection } from '@/components/public/LegalSection';
import { SITE } from '@/config/site';

export default function PrivacyPage() {
  const updated = 'May 21, 2026';

  return (
    <PublicLayout
      title="Privacy Policy — Nexus AI"
      description="Nexus AI Privacy Policy — how we collect, use, and protect your data."
    >
      <div className="px-4 sm:px-6 py-16 sm:py-24">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: {updated}</p>
          <p className="mt-6 text-zinc-400 leading-relaxed">
            {SITE.legalName} (&quot;we&quot;, &quot;us&quot;) operates {SITE.website} and the {SITE.productName}{' '}
            platform. This policy explains how we collect, use, disclose, and safeguard information when you
            use our services.
          </p>

          <div className="mt-12">
            <LegalSection title="1. Information we collect">
              <p>
                <strong>Account data:</strong> name, email, password (hashed), role, and plan information
                when you register.
              </p>
              <p>
                <strong>Business & integration data:</strong> order details, customer phone numbers (for
                WhatsApp messaging), WhatsApp Business Account IDs, encrypted API tokens, webhook
                configuration, template mappings, and message delivery logs.
              </p>
              <p>
                <strong>Usage data:</strong> IP address, browser type, pages visited, API usage metrics, and
                diagnostic logs for security and performance.
              </p>
              <p>
                <strong>Cookies:</strong> session and preference cookies required to keep you signed in and to
                remember UI settings. We do not sell personal data to advertisers.
              </p>
            </LegalSection>

            <LegalSection title="2. How we use data">
              <p>We process data to:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Provide and maintain the platform</li>
                <li>Send WhatsApp messages you configure (via Meta Cloud API)</li>
                <li>Sync templates and connection status from Meta</li>
                <li>Process orders and automation workflows</li>
                <li>Improve reliability, prevent fraud, and comply with law</li>
                <li>Respond to support requests</li>
              </ul>
            </LegalSection>

            <LegalSection title="3. Legal basis & processing">
              <p>
                Processing is based on contract performance (providing the service), legitimate interests
                (security, analytics), and consent where required (e.g. marketing communications if opted in).
              </p>
            </LegalSection>

            <LegalSection title="4. Third-party integrations">
              <p>We connect to services you authorize, including:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Meta / WhatsApp Cloud API (messaging and templates)</li>
                <li>Facebook & Instagram (ads and business tools, when enabled)</li>
                <li>TikTok for Business (when enabled)</li>
                <li>Hosting, database, Redis, and workflow providers (e.g. n8n)</li>
              </ul>
              <p>
                Data shared with third parties is limited to what is necessary for the integration. Their
                processing is governed by their own policies.
              </p>
            </LegalSection>

            <LegalSection title="5. Data retention & security">
              <p>
                We retain account and transaction data while your account is active and as required for legal
                obligations. Access tokens are encrypted at rest. We use industry-standard safeguards;
                no method of transmission over the Internet is 100% secure.
              </p>
            </LegalSection>

            <LegalSection title="6. Your rights">
              <p>
                Depending on your jurisdiction you may request access, correction, deletion, restriction, or
                portability of your personal data. Contact{' '}
                <a href={`mailto:${SITE.privacyEmail}`} className="text-brand hover:underline">
                  {SITE.privacyEmail}
                </a>{' '}
                to exercise these rights. We will respond within applicable legal timeframes.
              </p>
            </LegalSection>

            <LegalSection title="7. International transfers">
              <p>
                Data may be processed on servers located outside your country. We take steps to ensure
                appropriate safeguards where required.
              </p>
            </LegalSection>

            <LegalSection title="8. Children">
              <p>Our services are not directed to individuals under 16. We do not knowingly collect their data.</p>
            </LegalSection>

            <LegalSection title="9. Changes">
              <p>
                We may update this policy. Material changes will be posted on this page with an updated date.
              </p>
            </LegalSection>

            <LegalSection title="10. Contact">
              <p>
                {SITE.legalName}
                <br />
                Email:{' '}
                <a href={`mailto:${SITE.privacyEmail}`} className="text-brand hover:underline">
                  {SITE.privacyEmail}
                </a>
                <br />
                {SITE.address.line1}, {SITE.address.country}
              </p>
            </LegalSection>
          </div>
        </article>
      </div>
    </PublicLayout>
  );
}
