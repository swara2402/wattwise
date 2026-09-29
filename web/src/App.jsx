import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './components/layout/AppShell'
import { LoadingBlock } from './components/ui/States'
import { AuthPage } from './pages/AuthPage'
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
  const authenticated = localStorage.getItem('wattwise.isAuthenticated') === 'true'

  if (!authenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
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
