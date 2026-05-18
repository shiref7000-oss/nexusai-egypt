import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface User {
  id: string
  email: string
  name: string
  role: string
  plan: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_BASE = import.meta.env.VITE_API_URL || 'https://linda-giant-hero-expansion.trycloudflare.com'

function getToken(): string {
  return localStorage.getItem('nexusai_token') || ''
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const token = getToken()
    if (token) {
      // Decode token to extract user info (JWT payload)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUser({
          id: payload.userId || 'demo',
          email: payload.email || 'admin@nexusai.eg',
          name: 'Admin User',
          role: 'admin',
          plan: 'professional',
        })
      } catch {
        localStorage.removeItem('nexusai_token')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (data.success && data.data?.token) {
        localStorage.setItem('nexusai_token', data.data.token)
        setUser(data.data.user)
        navigate('/dashboard', { replace: true })
      } else {
        throw new Error(data.error || 'Login failed')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = useCallback(() => {
    localStorage.removeItem('nexusai_token')
    setUser(null)
    navigate('/signin', { replace: true })
  }, [navigate])

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
