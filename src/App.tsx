import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Agents from './pages/Agents'
import Analytics from './pages/Analytics'
import SignIn from './pages/SignIn'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
