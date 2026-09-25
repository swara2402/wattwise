import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppShell } from './components/layout/AppShell'
import { LoadingBlock } from './components/ui/States'
import { HomePage } from './pages/HomePage'

/**
 * The dashboard is the only always-loaded view; everything else is split out
 * so the first paint does not pay for charts and the advisor on mobile.
 */
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const WastePage = lazy(() => import('./pages/WastePage').then((m) => ({ default: m.WastePage })))
const SimulatorPage = lazy(() => import('./pages/SimulatorPage').then((m) => ({ default: m.SimulatorPage })))
const PredictorPage = lazy(() => import('./pages/PredictorPage').then((m) => ({ default: m.PredictorPage })))
const AdvisorPage = lazy(() => import('./pages/AdvisorPage').then((m) => ({ default: m.AdvisorPage })))
const ModelsPage = lazy(() => import('./pages/ModelsPage').then((m) => ({ default: m.ModelsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="grid min-h-[60vh] place-items-center">
                <LoadingBlock label="Loading view…" />
              </div>
            }
          >
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/waste" element={<WastePage />} />
                <Route path="/simulator" element={<SimulatorPage />} />
                <Route path="/predictor" element={<PredictorPage />} />
                <Route path="/advisor" element={<AdvisorPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}
