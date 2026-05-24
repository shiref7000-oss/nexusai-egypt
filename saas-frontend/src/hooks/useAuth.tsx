import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, redirectToLogin } from '@/lib/api';

export interface AuthUser {
  id: string | number;
  email: string;
  name?: string;
  role: string;
  plan?: string;
  status?: string;
  pgUserId?: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  setSession: (token: string, user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('nexusai_token');
    const u = localStorage.getItem('nexusai_user');
    if (t && u) {
      try {
        setToken(t);
        setUser(JSON.parse(u));
      } catch {
        localStorage.removeItem('nexusai_token');
        localStorage.removeItem('nexusai_user');
      }
    }
    if (t) {
      apiFetch<{ success: boolean; data: { user: AuthUser } }>('/api/auth/me')
        .then((res) => {
          if (res.data?.user) {
            setUser(res.data.user);
            localStorage.setItem('nexusai_user', JSON.stringify(res.data.user));
          }
        })
        .catch(() => {
          /* keep cached user */
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const setSession = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem('nexusai_token', t);
    localStorage.setItem('nexusai_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{
      success: boolean;
      data: { token: string; user: AuthUser };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSession(res.data.token, res.data.user);
  }, [setSession]);

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await apiFetch<{
        success: boolean;
        data: { token: string; user: AuthUser };
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setSession(res.data.token, res.data.user);
    },
    [setSession]
  );

  const signOut = useCallback(() => {
    localStorage.removeItem('nexusai_token');
    localStorage.removeItem('nexusai_user');
    localStorage.removeItem('nexusai_impersonator');
    setToken(null);
    setUser(null);
    redirectToLogin();
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!token && !!user,
      signIn,
      signUp,
      signOut,
      setSession,
    }),
    [user, token, isLoading, signIn, signUp, signOut, setSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
