import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, setToken, clearToken } from '../lib/api'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('nexusai_token') || ''
    if (token) {
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
        clearToken()
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const data = await authApi.login(email, password)
      if (data.success && data.data?.token) {
        setToken(data.data.token)
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
    clearToken()
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
