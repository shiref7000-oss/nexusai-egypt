/**
 * Reference fix for AppLayout sidebar crash (me -> user).
 * Merge into the live SaaS Vite source before the next production build.
 */
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function AppLayout() {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17]">
        <div className="animate-spin h-8 w-8 border-2 border-[#d4f935] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  return (
    <div className="flex h-screen bg-[#0a0e17] text-white">
      <aside className="w-64 border-r border-white/5 flex flex-col">
        <div className="px-4 py-3">
          <span className="text-xs font-semibold text-[#d4f935] uppercase">
            {user?.plan || 'Free'}
          </span>
        </div>
        <nav className="flex-1">{/* route links */}</nav>
        <div className="border-t border-white/5 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#d4f935]/20 flex items-center justify-center text-[#d4f935] text-sm font-bold">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.name || user?.email || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full">
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
