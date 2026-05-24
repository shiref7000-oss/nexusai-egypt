import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { NexusLogo } from '@/components/brand/NexusLogo';
import { ProductPreview } from '@/components/landing/ProductPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isOnboardingComplete } from '@/lib/onboarding';

export default function LoginPage() {
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const returnTo = searchParams.get('returnTo');
  const safeReturn =
    returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/login') ? returnTo : '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      const dest = isOnboardingComplete() ? safeReturn : '/welcome';
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, navigate, safeReturn]);

  if (isAuthenticated) {
    return null;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      const dest = isOnboardingComplete() ? safeReturn : '/welcome';
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col lg:flex-row">
      <div className="pointer-events-none fixed inset-0 landing-grid opacity-20 lg:hidden" aria-hidden />

      {/* Brand panel */}
      <div className="relative hidden lg:flex lg:w-[52%] flex-col justify-between border-r border-white/[0.06] p-12 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 landing-grid opacity-30" aria-hidden />
        <NexusLogo href="/" />
        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-4xl font-semibold tracking-tight leading-tight">
            Your store deserves an operating system, not another dashboard.
          </h1>
          <p className="mt-4 text-zinc-500 leading-relaxed">
            Sign in to run agents, orders, and workflows from one calm workspace.
          </p>
        </div>
        <div className="relative z-10 scale-90 origin-bottom-left opacity-90">
          <ProductPreview />
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-8">
        <div className="lg:hidden mb-8">
          <NexusLogo href="/" />
        </div>
        <div className="w-full max-w-[400px] mx-auto animate-fade-in">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-2 text-sm text-zinc-500">Sign in to continue to your workspace</p>

          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-2xl border border-white/[0.06] bg-panel p-6 sm:p-8 shadow-card"
          >
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-medium text-zinc-400">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-medium text-zinc-400">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
              {loading ? 'Signing in…' : 'Continue'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-600">
            New here?{' '}
            <Link to="/signup" className="text-zinc-300 hover:text-foreground font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
