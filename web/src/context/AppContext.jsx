import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import {
  DEFAULT_APPLIANCES,
  DEFAULT_SETTINGS,
  SIM_PRESETS,
  STORAGE_KEYS,
} from '../lib/constants'
import { simulateHousehold } from '../lib/energy'
import { readStore, usePersistentState, writeStore } from '../lib/storage'
import { useResource } from '../hooks/useResource'

const AppContext = createContext(null)

const DEFAULT_SCENARIOS = []

let toastSeq = 0

export function AppProvider({ children }) {
  /* ---------------- theme ---------------- */
  const [theme, setTheme] = useState(() => readStore(STORAGE_KEYS.theme, 'dark'))

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    writeStore(STORAGE_KEYS.theme, theme)
  }, [theme])

  /* ---------------- household settings ---------------- */
  const [settings, setSettings] = usePersistentState(STORAGE_KEYS.settings, DEFAULT_SETTINGS)

  const updateSettings = useCallback(
    (patch) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings],
  )

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), [setSettings])

  /* ---------------- appliances ---------------- */
  const [appliances, setAppliances] = usePersistentState(STORAGE_KEYS.appliances, DEFAULT_APPLIANCES)

  const addAppliance = useCallback(
    (appliance) =>
      setAppliances((prev) => [
        ...prev,
        {
          daysPerMonth: 30,
          quantity: 1,
          ...appliance,
          id: appliance.id ?? `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        },
      ]),
    [setAppliances],
  )

  const updateAppliance = useCallback(
    (id, patch) =>
      setAppliances((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a))),
    [setAppliances],
  )

  const removeAppliance = useCallback(
    (id) => setAppliances((prev) => prev.filter((a) => a.id !== id)),
    [setAppliances],
  )

  const setProposedHours = useCallback(
    // 0.1 h granularity: a slider step of 0.5 would silently snap advisor
    // recommendations like 1.2 h down to 1 h.
    (id, hours) => updateAppliance(id, { proposedDailyHours: Math.round(hours * 10) / 10 }),
    [updateAppliance],
  )

  const applyPreset = useCallback(
    (presetId) => {
      const preset = SIM_PRESETS.find((p) => p.id === presetId)
      if (!preset) return null
      setAppliances((prev) =>
        prev.map((a) => ({
          ...a,
          proposedDailyHours: Math.round(Math.max(0, Math.min(24, preset.apply(a))) * 10) / 10,
        })),
      )
      return preset
    },
    [setAppliances],
  )

  const resetAppliances = useCallback(() => setAppliances(DEFAULT_APPLIANCES), [setAppliances])

  /**
   * Apply an advisor recommendation to the matching appliance.
   * Resolved against the current list (not inside the state updater) so the
   * caller gets a truthful `matched` flag back immediately.
   */
  const applyRecommendation = useCallback(
    (rec) => {
      if (!rec?.targetType) return { matched: false }
      const match = appliances.find((a) => a.type === rec.targetType)
      if (!match) return { matched: false }
      updateAppliance(match.id, { proposedDailyHours: Math.round(rec.targetHours * 10) / 10 })
      return { matched: true, applianceId: match.id }
    },
    [appliances, updateAppliance],
  )

  /* ---------------- scenarios ---------------- */
  const [scenarios, setScenarios] = usePersistentState(STORAGE_KEYS.scenarios, DEFAULT_SCENARIOS)

  const addScenario = useCallback(
    (scenario) =>
      setScenarios((prev) => [
        { id: `s-${Date.now()}`, createdAt: new Date().toISOString(), ...scenario },
        ...prev,
      ]),
    [setScenarios],
  )

  const removeScenario = useCallback(
    (id) => setScenarios((prev) => prev.filter((s) => s.id !== id)),
    [setScenarios],
  )

  const resetScenarios = useCallback(() => setScenarios(DEFAULT_SCENARIOS), [setScenarios])

  /* ---------------- toasts ---------------- */
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    ({ title, description, tone = 'brand', duration = 4200 }) => {
      const id = `t-${++toastSeq}`
      setToasts((prev) => [...prev.slice(-3), { id, title, description, tone }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismissToast(id), duration),
        )
      }
      return id
    },
    [dismissToast],
  )

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  /* ---------------- backend health ---------------- */
  const health = useResource('health', () => api.health(), { ttl: 12_000 })

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') health.refetch()
    }, 25_000)
    return () => clearInterval(timer)
  }, [health])

  const online = health.status === 'success' && health.data?.status === 'healthy'

  /* ---------------- derived simulation ---------------- */
  const tariff = Number(settings.electricityTariff) || 0
  const simulation = useMemo(() => simulateHousehold(appliances, tariff), [appliances, tariff])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      settings,
      updateSettings,
      resetSettings,
      appliances,
      addAppliance,
      updateAppliance,
      removeAppliance,
      setProposedHours,
      applyPreset,
      resetAppliances,
      applyRecommendation,
      scenarios,
      addScenario,
      removeScenario,
      resetScenarios,
      toasts,
      toast,
      dismissToast,
      health: { ...health, online },
      simulation,
      tariff,
    }),
    [
      theme,
      setTheme,
      settings,
      updateSettings,
      resetSettings,
      appliances,
      addAppliance,
      updateAppliance,
      removeAppliance,
      setProposedHours,
      applyPreset,
      resetAppliances,
      applyRecommendation,
      scenarios,
      addScenario,
      removeScenario,
      resetScenarios,
      toasts,
      toast,
      dismissToast,
      health,
      online,
      simulation,
      tariff,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
