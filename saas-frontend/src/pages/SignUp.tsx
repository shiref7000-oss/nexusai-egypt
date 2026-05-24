import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { PublicLayout } from '@/components/public/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PUBLIC_ROUTES } from '@/config/site';
import { isOnboardingComplete } from '@/lib/onboarding';

export default function SignUpPage() {
  const { signUp, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(isOnboardingComplete() ? '/dashboard' : '/welcome', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password);
      toast.success('Account created');
      navigate(isOnboardingComplete() ? '/dashboard' : '/welcome', { replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout
      title="Sign Up — Nexus AI"
      description="Create your Nexus AI account for WhatsApp COD automation, order management, and eCommerce workflows."
    >
      <div className="px-4 sm:px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Start automating WhatsApp order confirmations and managing orders in one workspace.
          </p>
          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-2xl border border-white/[0.06] bg-panel p-6 sm:p-8 shadow-card"
          >
            <div className="space-y-2">
              <label htmlFor="name" className="text-xs font-medium text-zinc-400">
                Full name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-medium text-zinc-400">
                Business email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@store.com"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-medium text-zinc-400">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm" className="text-xs font-medium text-zinc-400">
                Confirm password
              </label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-zinc-600">
              By signing up you agree to our{' '}
              <Link to={PUBLIC_ROUTES.terms} className="text-zinc-400 hover:text-foreground underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to={PUBLIC_ROUTES.privacy} className="text-zinc-400 hover:text-foreground underline">
                Privacy Policy
              </Link>
              .
            </p>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Creating account…' : 'Sign Up'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-zinc-600">
            Already have an account?{' '}
            <Link to={PUBLIC_ROUTES.login} className="text-zinc-300 hover:text-foreground font-medium">
              Login
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
