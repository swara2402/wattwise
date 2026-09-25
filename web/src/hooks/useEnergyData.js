import { api } from '../lib/api'
import { useResource } from './useResource'

export function useHistorical(limit = 60) {
  return useResource(`historical:${limit}`, () => api.historical(limit), { ttl: 30_000 })
}

export function useAnomalies() {
  return useResource('anomalies', () => api.anomalies(), { ttl: 45_000 })
}

export function useModelAnalytics() {
  return useResource('model-analytics', () => api.modelAnalytics(), { ttl: 120_000 })
}

export function useModelInfo() {
  return useResource('model-info', () => api.modelInfo(), { ttl: 120_000 })
}
