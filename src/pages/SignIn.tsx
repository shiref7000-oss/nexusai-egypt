import { Zap, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function SignIn() {
  const [email, setEmail] = useState('admin@nexusai.eg')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const { login, isLoading } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (isSignUp) {
        setError('Registration coming soon. Use guest login or admin credentials.')
        return
      }
      await login(email, password)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="min-h-screen bg-[#060B18] text-white flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-md px-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold">NexusAI</span>
          </div>
          <h2 className="text-3xl font-bold mb-4">
            Run Your E-Commerce<br />
            <span className="text-gradient">Business on AI</span>
          </h2>
          <p className="text-gray-400 mb-8">AI-powered operating system for Egyptian e-commerce. COD orders, Meta ads, WhatsApp automation.</p>
          <div className="space-y-4">
            {[
              { icon: Zap, text: '9 specialized AI agents', color: 'text-cyan-400' },
              { icon: Zap, text: 'Real-time Meta Ads analytics', color: 'text-blue-400' },
              { icon: Zap, text: 'Egyptian COD order management', color: 'text-green-400' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <span className="text-sm text-gray-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">NexusAI</span>
          </div>

          <Card className="bg-[#0d1321] border-white/5">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold mb-1">{isSignUp ? 'Create Account' : 'Welcome Back'}</h1>
                <p className="text-sm text-gray-500">{isSignUp ? 'Start your free trial' : 'Sign in to your dashboard'}</p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">Name</label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                      className="bg-[#060B18] border-white/10 text-white placeholder:text-gray-600 h-10" />
                  </div>
                )}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-10 bg-[#060B18] border-white/10 text-white placeholder:text-gray-600 h-10" required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input type={showPassword ? 'text' : 'password'} placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)}
                      className="pl-10 pr-10 bg-[#060B18] border-white/10 text-white placeholder:text-gray-600 h-10" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={isLoading}
                  className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:opacity-90 disabled:opacity-50 h-10">
                  {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in...</> : isSignUp ? 'Create Account' : 'Sign In'}
                </Button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-6">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError('') }}
                  className="text-cyan-400 hover:text-cyan-300 font-medium">{isSignUp ? 'Sign In' : 'Sign Up'}</button>
              </p>

              <div className="mt-6 pt-4 border-t border-white/5">
                <p className="text-center text-xs text-gray-600 mb-2">Demo credentials</p>
                <button onClick={() => { setEmail('admin@nexusai.eg'); setPassword('admin123'); setError('') }}
                  className="w-full py-2 rounded-lg bg-white/5 text-xs text-gray-400 hover:bg-white/[0.08] transition-colors">
                  Fill demo credentials
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
