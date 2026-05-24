import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { NexusLogo } from '@/components/brand/NexusLogo';
import { Button } from '@/components/ui/button';
import { PUBLIC_ROUTES, SITE } from '@/config/site';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: PUBLIC_ROUTES.home, label: 'Home' },
  { to: PUBLIC_ROUTES.about, label: 'About' },
  { to: PUBLIC_ROUTES.pricing, label: 'Pricing' },
  { to: PUBLIC_ROUTES.support, label: 'Support' },
  { to: PUBLIC_ROUTES.contact, label: 'Contact' },
];

export function PublicNav() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.04] bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <NexusLogo href={PUBLIC_ROUTES.home} />
        <nav className="hidden items-center gap-6 text-sm text-zinc-500 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                'hover:text-zinc-200 transition-colors',
                location.pathname === l.to && 'text-foreground'
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={`mailto:${SITE.supportEmail}`}
            className="hidden lg:inline text-xs text-zinc-500 hover:text-zinc-300"
          >
            {SITE.supportEmail}
          </a>
          {isAuthenticated ? (
            <Link to="/dashboard">
              <Button size="sm">Workspace</Button>
            </Link>
          ) : (
            <>
              <Link to={PUBLIC_ROUTES.login} className="hidden sm:block">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link to={PUBLIC_ROUTES.signup}>
                <Button size="sm">Sign Up</Button>
              </Link>
            </>
          )}
          <button
            type="button"
            className="md:hidden p-2 text-zinc-400"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-white/[0.06] bg-surface px-4 py-4 flex flex-col gap-3 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          <Link to={PUBLIC_ROUTES.privacy} onClick={() => setOpen(false)} className="text-zinc-500">
            Privacy
          </Link>
          <Link to={PUBLIC_ROUTES.terms} onClick={() => setOpen(false)} className="text-zinc-500">
            Terms
          </Link>
          <a href={`mailto:${SITE.supportEmail}`} className="text-brand">
            {SITE.supportEmail}
          </a>
        </nav>
      )}
    </header>
  );
}
