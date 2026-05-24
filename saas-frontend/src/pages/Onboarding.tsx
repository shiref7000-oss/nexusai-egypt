import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { NexusLogo } from '@/components/brand/NexusLogo';
import { HeroOrb } from '@/components/brand/illustrations/HeroOrb';
import { Button } from '@/components/ui/button';
import { completeOnboarding, isOnboardingComplete } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

const FOCUS_OPTIONS = [
  {
    id: 'orders',
    title: 'Orders & COD',
    desc: 'Confirmations, incoming webhooks, and order ops.',
  },
  {
    id: 'support',
    title: 'Customer support',
    desc: 'Arabic-first chat and complaint handling.',
  },
  {
    id: 'growth',
    title: 'Growth & ads',
    desc: 'Creative agents, analytics, and scaling.',
  },
] as const;

export default function OnboardingPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login?returnTo=/welcome', { replace: true });
      return;
    }
    if (!isLoading && isAuthenticated && isOnboardingComplete()) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-zinc-300 animate-spin" />
      </div>
    );
  }

  const totalSteps = 3;

  function finish() {
    completeOnboarding(focus ?? undefined);
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="pointer-events-none fixed inset-0 landing-grid opacity-25" aria-hidden />
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-6">
        <NexusLogo href="/" />
        <Link to="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Skip for now
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-lg">
          {/* Progress */}
          <div className="flex gap-2 mb-10">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-all duration-500',
                  i <= step ? 'bg-zinc-300' : 'bg-white/[0.08]'
                )}
              />
            ))}
          </div>

          {step === 0 && (
            <div className="animate-fade-in text-center">
              <HeroOrb className="w-48 h-40 mx-auto mb-8 opacity-80" />
              <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
                Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
              </h1>
              <p className="mt-4 text-zinc-500 text-lg leading-relaxed">
                NexusAI is your operating layer — agents, orders, and workflows in one place.
                Let&apos;s set the tone for your workspace.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-in">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-center">
                What matters most right now?
              </h2>
              <p className="mt-3 text-center text-zinc-500 text-sm">
                We&apos;ll highlight the right areas — you can change this anytime.
              </p>
              <ul className="mt-8 space-y-3">
                {FOCUS_OPTIONS.map((opt) => {
                  const selected = focus === opt.id;
                  return (
                    <li key={opt.id}>
                      <button
                        type="button"
                        onClick={() => setFocus(opt.id)}
                        className={cn(
                          'w-full text-left rounded-xl border px-5 py-4 transition-all duration-200',
                          selected
                            ? 'border-white/20 bg-elevated shadow-soft'
                            : 'border-white/[0.06] bg-panel hover:border-white/10'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{opt.title}</p>
                            <p className="mt-1 text-sm text-zinc-500">{opt.desc}</p>
                          </div>
                          {selected && (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-surface">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in text-center">
              <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-elevated">
                <Check className="h-7 w-7 text-zinc-300" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
                You&apos;re set.
              </h2>
              <p className="mt-4 text-zinc-500 leading-relaxed">
                Open your workspace — connect integrations, chat with agents, and run your first
                workflow when you&apos;re ready.
              </p>
            </div>
          )}

          <div className="mt-12 flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {step < totalSteps - 1 ? (
              <Button
                size="lg"
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 1 && !focus}
                className="gap-2"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="lg" onClick={finish} className="gap-2">
                Enter workspace
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
