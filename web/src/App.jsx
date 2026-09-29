import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './components/layout/AppShell'
import { LoadingBlock } from './components/ui/States'
import { api } from './lib/api'
import { AuthPage } from './pages/AuthPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { LandingPage } from './pages/LandingPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const WastePage = lazy(() => import('./pages/WastePage').then((m) => ({ default: m.WastePage })))
const SimulatorPage = lazy(() => import('./pages/SimulatorPage').then((m) => ({ default: m.SimulatorPage })))
const PredictorPage = lazy(() => import('./pages/PredictorPage').then((m) => ({ default: m.PredictorPage })))
const AdvisorPage = lazy(() => import('./pages/AdvisorPage').then((m) => ({ default: m.AdvisorPage })))
const ModelsPage = lazy(() => import('./pages/ModelsPage').then((m) => ({ default: m.ModelsPage })))
const MethodologyPage = lazy(() => import('./pages/MethodologyPage').then((m) => ({ default: m.MethodologyPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

function ProtectedRoute() {
  const location = useLocation()
  const [state, setState] = useState({ loading: true, authenticated: false, initialized: true })

  useEffect(() => {
    let active = true
    api.auth.me()
      .then(() => {
        // Check if user has completed onboarding
        return api.auth.getState().then((stateData) => {
          if (active) {
            setState({ 
              loading: false, 
              authenticated: true, 
              initialized: stateData.initialized 
            })
          }
        })
      })
      .catch(() => active && setState({ loading: false, authenticated: false, initialized: false }))
    return () => { active = false }
  }, [])

  if (state.loading) {
    return <div className="grid min-h-dvh place-items-center bg-bg"><LoadingBlock label="Opening your home…" /></div>
  }

  if (!state.authenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }

  // If user hasn't completed onboarding, redirect to /onboarding
  if (!state.initialized && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  // If user has completed onboarding and is trying to access /onboarding, redirect to dashboard
  if (state.initialized && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />
  }

  // Only show AppShell for routes that need it (not onboarding)
  if (location.pathname === '/onboarding') {
    return <OnboardingPage />
  }

  return <AppShell />
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
            <Route path="/analytics" element={<LazyPage><AnalyticsPage /></LazyPage>} />
            <Route path="/anomalies-excess" element={<LazyPage><WastePage /></LazyPage>} />
            <Route path="/simulator" element={<LazyPage><SimulatorPage /></LazyPage>} />
            <Route path="/predictor" element={<LazyPage><PredictorPage /></LazyPage>} />
            <Route path="/advisor" element={<LazyPage><AdvisorPage /></LazyPage>} />
            <Route path="/models" element={<LazyPage><ModelsPage /></LazyPage>} />
            <Route path="/methodology" element={<LazyPage><MethodologyPage /></LazyPage>} />
            <Route path="/settings" element={<LazyPage><SettingsPage /></LazyPage>} />
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<LazyPage><NotFoundPage /></LazyPage>} />
          </Route>
        </Routes>
      </AppProvider>
    </ErrorBoundary>
  )
}

function LazyPage({ children }) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center">
          <LoadingBlock label="Getting your energy view ready…" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}