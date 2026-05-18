import { useNavigate } from 'react-router-dom'
import {
  Brain, TrendingUp, BarChart3, MessageCircle, ShieldCheck,
  Search, DollarSign, Truck, Users, Zap, Activity,
  Globe, Lock, Smartphone, ChevronRight, Check, Menu, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'

const agents = [
  { icon: Brain, name: 'CEO Agent', desc: 'Strategic decision-making with Egyptian market intelligence', color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  { icon: Zap, name: 'AI Ads Engine', desc: 'Franco-Arabic copy & winning campaign generation', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { icon: TrendingUp, name: 'Meta Ads Live', desc: 'Real-time CPA/ROAS/CTR from live Meta accounts', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { icon: MessageCircle, name: 'Moderator AI', desc: 'Egyptian dialect customer service automation', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { icon: ShieldCheck, name: 'AI Support', desc: 'Policy enforcement & dispute resolution', color: 'text-green-400', bg: 'bg-green-400/10' },
  { icon: Search, name: 'Product Hunter', desc: 'Winning product discovery & market analysis', color: 'text-red-400', bg: 'bg-red-400/10' },
  { icon: DollarSign, name: 'Finance Agent', desc: 'P&L tracking, taxes & Egyptian VAT compliance', color: 'text-orange-400', bg: 'bg-orange-400/10' },
  { icon: Truck, name: 'Shipping Agent', desc: 'Bosta, Aramex, VHub tracking & COD reconciliation', color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  { icon: Users, name: 'HR & Team Agent', desc: 'Payroll, attendance & performance management', color: 'text-pink-400', bg: 'bg-pink-400/10' },
]

const features = [
  { icon: Activity, title: 'Real-Time Dashboard', desc: 'Live KPIs from Meta Ads, orders, shipping, and finance in one view' },
  { icon: Brain, title: 'Multi-Agent AI', desc: '9 specialized AI agents working together to automate your operations' },
  { icon: Globe, title: 'Built for Egypt', desc: 'Egyptian dialect AI, local payment methods, COD tracking, VAT rules' },
  { icon: Lock, title: 'Enterprise Security', desc: 'Role-based access, audit trails, encrypted data storage' },
  { icon: BarChart3, title: 'Meta API Integration', desc: 'Live campaign data, automated insights, AI-generated recommendations' },
  { icon: Smartphone, title: 'WhatsApp & SMS', desc: 'Customer communication through Egyptian channels' },
]

const testimonials = [
  { quote: 'NexusAI cut our customer service response time from 4 hours to 30 seconds. The Egyptian dialect AI is incredibly accurate.', name: 'Ahmed El-Sayed', role: 'CEO, CairoStyle Store' },
  { quote: 'The Meta Ads integration shows real-time CPA and ROAS. Our ad spend efficiency improved 40% in the first month.', name: 'Mariam Khaled', role: 'Marketing Director, NileBeauty' },
  { quote: 'Finally an OS that understands Egyptian e-commerce - COD reconciliation, Bosta tracking, and VAT reports all automated.', name: 'Omar Hassan', role: 'Founder, TechZone Egypt' },
]

const pricingPlans = [
  { name: 'Starter', desc: 'For new e-commerce businesses', price: '2,900', period: '/month', highlighted: false, features: ['3 AI Agents', 'Meta Ads Dashboard', 'Basic Moderator', '50 Orders/Month', 'Email Support'] },
  { name: 'Professional', desc: 'For growing Egyptian brands', price: '7,900', period: '/month', highlighted: true, features: ['7 AI Agents', 'Advanced Meta Analytics', 'AI Content Generator', '500 Orders/Month', 'WhatsApp Integration', 'Priority Support'] },
  { name: 'Enterprise', desc: 'For large-scale operations', price: 'Custom', period: '', highlighted: false, features: ['All 9 AI Agents', 'Custom Integrations', 'Dedicated AI Training', 'Unlimited Orders', 'Full API Access', 'Dedicated Account Manager'] },
]

export default function Landing() {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#060B18] text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#060B18]/90 backdrop-blur-lg border-b border-white/5' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold">NexusAI</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('agents')} className="text-sm text-gray-300 hover:text-white transition-colors">Agents</button>
              <button onClick={() => scrollToSection('features')} className="text-sm text-gray-300 hover:text-white transition-colors">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="text-sm text-gray-300 hover:text-white transition-colors">Pricing</button>
              <button onClick={() => navigate('/signin')} className="text-sm text-gray-300 hover:text-white transition-colors">Sign In</button>
              <Button onClick={() => navigate('/dashboard')} size="sm" className="bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:opacity-90">
                Get Started
              </Button>
            </div>
            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#060B18]/95 backdrop-blur-lg border-b border-white/5 px-4 pb-4 space-y-3">
            <button onClick={() => scrollToSection('agents')} className="block w-full text-left text-sm text-gray-300 py-2">Agents</button>
            <button onClick={() => scrollToSection('features')} className="block w-full text-left text-sm text-gray-300 py-2">Features</button>
            <button onClick={() => scrollToSection('pricing')} className="block w-full text-left text-sm text-gray-300 py-2">Pricing</button>
            <button onClick={() => navigate('/signin')} className="block w-full text-left text-sm text-gray-300 py-2">Sign In</button>
            <Button onClick={() => navigate('/dashboard')} className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold">Get Started</Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px]" />
        </div>
        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-1.5 mb-6">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-cyan-400">AI-Powered E-Commerce OS for Egypt</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Run Your E-Commerce<br />
                <span className="text-gradient">Business on AI</span><br />
                Autopilot
              </h1>
              <p className="text-gray-400 text-lg mb-8 max-w-lg">
                9 specialized AI agents working together. From Meta Ads optimization to Egyptian customer service, shipping reconciliation, and financial reporting.
              </p>
              <div className="flex flex-wrap gap-4 mb-10">
                <Button onClick={() => navigate('/dashboard')} size="lg" className="bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:opacity-90">
                  Launch Dashboard <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
                <Button onClick={() => scrollToSection('agents')} variant="outline" size="lg" className="border-white/20 hover:bg-white/5">
                  Explore Agents
                </Button>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">9</div>
                  <div className="text-xs text-gray-500">AI Agents</div>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">50+</div>
                  <div className="text-xs text-gray-500">Meta Campaigns</div>
                </div>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">200+</div>
                  <div className="text-xs text-gray-500">Orders Managed</div>
                </div>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="relative bg-[#0d1321] border border-white/10 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-gray-500">#05AA14</span>
                  <div className="flex items-center gap-2 bg-cyan-500/10 rounded-full px-3 py-1">
                    <Activity className="w-3 h-3 text-cyan-400" />
                    <span className="text-xs text-cyan-400">AI Processing</span>
                  </div>
                </div>
                <img src="/hero-brain.jpg" alt="AI Brain" className="w-full h-64 object-contain rounded-lg opacity-80" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-green-500/10 rounded-full px-3 py-1.5 w-fit">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-xs text-green-400">Live Meta Connection</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agent Army Section */}
      <section id="agents" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Your AI Agent Army</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">9 specialized agents that understand Egyptian e-commerce, working 24/7 to grow your business</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div key={agent.name} className="group bg-[#0d1321] border border-white/5 rounded-xl p-5 hover:border-cyan-500/30 transition-all hover:bg-[#111827]">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 ${agent.bg} rounded-lg flex items-center justify-center shrink-0`}>
                    <agent.icon className={`w-5 h-5 ${agent.color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">{agent.name}</h3>
                    <p className="text-sm text-gray-400">{agent.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Platform Features</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">Everything you need to run a professional e-commerce operation in Egypt</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="bg-[#0d1321] border border-white/5 rounded-xl p-6 hover:border-cyan-500/20 transition-all">
                <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Trusted by Egyptian E-Commerce Leaders</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-[#0d1321] border border-white/5 rounded-xl p-6">
                <p className="text-gray-300 mb-6 italic">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <div className="font-semibold text-white">{t.name}</div>
                  <div className="text-sm text-gray-500">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-400">Choose the plan that fits your business</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {pricingPlans.map((plan) => (
              <div key={plan.name} className={`relative rounded-xl p-6 ${plan.highlighted ? 'bg-gradient-to-b from-cyan-500/10 to-blue-500/5 border-2 border-cyan-500/30' : 'bg-[#0d1321] border border-white/5'}`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-400 to-blue-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-400">{plan.desc}</p>
                </div>
                <div className="mb-6">
                  <span className="text-sm text-gray-500">EGP</span>
                  <span className="text-4xl font-bold text-white ml-1">{plan.price}</span>
                  {plan.period && <span className="text-gray-500 text-sm">{plan.period}</span>}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-cyan-400 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => navigate('/dashboard')}
                  className={`w-full ${plan.highlighted ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:opacity-90' : 'bg-white/5 hover:bg-white/10 text-white'}`}
                >
                  {plan.name === 'Enterprise' ? 'Contact Sales' : plan.name === 'Starter' ? 'Get Started' : 'Start Free Trial'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to Transform Your Business?</h2>
          <p className="text-gray-400 mb-8">Join Egyptian e-commerce businesses already using NexusAI to automate operations and boost profits.</p>
          <Button onClick={() => navigate('/dashboard')} size="lg" className="bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold hover:opacity-90">
            Access Dashboard
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold">NexusAI</span>
          </div>
          <p className="text-sm text-gray-500 mb-4">Egyptian E-Commerce AI Operating System. Built for local businesses.</p>
          <p className="text-sm text-gray-600">&copy; 2025 NexusAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
