import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { NexusLogo } from '@/components/brand/NexusLogo';
import { mainNav, adminNav } from '@/config/navigation';
import { isOnboardingComplete } from '@/lib/onboarding';
import { cn } from '@/lib/utils';
import { WorkspacePicker } from '@/components/admin/WorkspacePicker';

export function AppLayout() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
      navigate(`/login?returnTo=${returnTo}`, { replace: true });
      return;
    }
    const skipOnboarding =
      user?.role === 'admin' || user?.role === 'superadmin';
    if (
      !isLoading &&
      isAuthenticated &&
      !skipOnboarding &&
      !isOnboardingComplete() &&
      location.pathname !== '/welcome'
    ) {
      navigate('/welcome', { replace: true });
    }
  }, [isLoading, isAuthenticated, user?.role, location.pathname, location.search, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-zinc-300 animate-spin" />
          <p className="text-xs text-zinc-500">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const navClass = (isActive: boolean) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
      isActive
        ? 'bg-white/[0.08] text-foreground'
        : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
    );

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-foreground">
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-[min(100vw-3rem,17rem)] shrink-0 flex-col border-r border-white/[0.06] bg-panel transition-transform duration-300 ease-out lg:static lg:h-screen lg:w-60 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-4">
          <NexusLogo href="/dashboard" showWordmark className="scale-[0.92] origin-left" />
          <button
            type="button"
            className="rounded-md p-1 text-zinc-500 hover:text-zinc-300 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-elevated/50 px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Plan</span>
            <span className="text-xs font-medium text-zinc-300 capitalize">{user?.role === 'admin' || user?.role === 'superadmin' ? 'platform' : user?.plan || 'free'}</span>
          </div>
        </div>

        <WorkspacePicker />

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4 scrollbar-thin">
          {mainNav.filter((item) => !item.admin).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              {label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <p className="mb-1 mt-5 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Admin
              </p>
              {adminNav.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
                  <Icon className="h-4 w-4 shrink-0 opacity-70" />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className="mb-3 flex items-center gap-3 rounded-lg px-2 py-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-elevated text-xs font-medium text-zinc-400">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-200">{user?.name || user?.email}</p>
              <p className="truncate text-[11px] text-zinc-500">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-zinc-500 hover:text-zinc-200"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-surface/90 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          <NexusLogo href="/dashboard" showWordmark className="scale-90 origin-left" />
        </header>
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
