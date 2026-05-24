import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { PublicLayout } from '@/components/public/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { SITE } from '@/config/site';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: { message: string } }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, subject, message }),
      });
      setSent(true);
      toast.success(res.data.message);
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout
      title="Contact — Nexus AI"
      description={`Contact ${SITE.companyName} for sales, support, and business inquiries.`}
    >
      <div className="px-4 sm:px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl grid gap-12 lg:grid-cols-2">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Contact us</h1>
            <p className="mt-4 text-zinc-400 leading-relaxed">
              Reach {SITE.legalName} for product questions, partnerships, Meta or TikTok integration
              support, and billing inquiries.
            </p>
            <dl className="mt-10 space-y-6 text-sm">
              <div>
                <dt className="text-zinc-500">Company</dt>
                <dd className="text-white font-medium mt-1">{SITE.legalName}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">General & support</dt>
                <dd className="mt-1">
                  <a href={`mailto:${SITE.supportEmail}`} className="text-brand hover:underline">
                    {SITE.supportEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Sales</dt>
                <dd className="mt-1">
                  <a href={`mailto:${SITE.salesEmail}`} className="text-brand hover:underline">
                    {SITE.salesEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Legal & privacy</dt>
                <dd className="mt-1">
                  <a href={`mailto:${SITE.legalEmail}`} className="text-zinc-300 hover:underline">
                    {SITE.legalEmail}
                  </a>
                  {' · '}
                  <a href={`mailto:${SITE.privacyEmail}`} className="text-zinc-300 hover:underline">
                    {SITE.privacyEmail}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Location</dt>
                <dd className="text-zinc-300 mt-1">
                  {SITE.address.line1}, {SITE.address.country}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Website</dt>
                <dd className="mt-1">
                  <a href={SITE.website} className="text-zinc-300 hover:text-white">
                    {SITE.website}
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-panel p-6 sm:p-8">
            {sent ? (
              <p className="text-emerald-400 text-sm leading-relaxed">
                Message received. We will reply to your email shortly.
              </p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Subject</label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    minLength={10}
                    rows={5}
                    className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending…' : 'Send message'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
