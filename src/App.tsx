import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { Skeleton } from '@/components/ui/skeleton'

const Landing = lazy(() => import('./pages/Landing'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Orders = lazy(() => import('./pages/Orders'))
const Agents = lazy(() => import('./pages/Agents'))
const Analytics = lazy(() => import('./pages/Analytics'))
const SignIn = lazy(() => import('./pages/SignIn'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#060B18] flex items-center justify-center">
      <div className="space-y-3 w-48">
        <Skeleton className="h-6 w-32 bg-white/5 mx-auto" />
        <Skeleton className="h-3 w-full bg-white/5" />
        <Skeleton className="h-20 w-full bg-white/5" />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
