import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { NexusLogo } from '@/components/brand/NexusLogo';
import { Button } from '@/components/ui/button';

export function LandingNav() {
  const { isAuthenticated } = useAuth();

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.04] bg-surface/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <NexusLogo />
        <nav className="hidden items-center gap-8 text-sm text-zinc-500 md:flex">
          <a href="#product" className="hover:text-zinc-200 transition-colors">
            Product
          </a>
          <a href="#agents" className="hover:text-zinc-200 transition-colors">
            Agents
          </a>
          <a href="#how" className="hover:text-zinc-200 transition-colors">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link to="/dashboard">
              <Button size="sm">Open workspace</Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Sign in
                </Button>
              </Link>
              <Link to="/login">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
