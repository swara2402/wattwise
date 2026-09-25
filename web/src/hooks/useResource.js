import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tiny data-fetching primitive with a module-level cache so navigating
 * between pages does not re-hit the backend for data we already have.
 */
const cache = new Map()

export function useResource(key, loader, { enabled = true, ttl = 20_000 } = {}) {
  // Seed from the cache only — freshness is decided in the effect below so no
  // impure call (Date.now) happens during render.
  const entry = cache.get(key)

  const [data, setData] = useState(entry?.data ?? null)
  const [error, setError] = useState(entry?.error ?? null)
  const [status, setStatus] = useState(entry ? 'success' : enabled ? 'loading' : 'idle')
  const [updatedAt, setUpdatedAt] = useState(entry?.at ?? null)
  const loaderRef = useRef(loader)

  useEffect(() => {
    loaderRef.current = loader
  }, [loader])

  const run = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled) return
      const cached = cache.get(key)
      if (!force && cached && Date.now() - cached.at < ttl) {
        setData(cached.data)
        setError(cached.error)
        setStatus('success')
        setUpdatedAt(cached.at)
        return
      }
      setStatus((prev) => (prev === 'success' ? 'refreshing' : 'loading'))
      try {
        const result = await loaderRef.current()
        cache.set(key, { data: result, error: null, at: Date.now() })
        setData(result)
        setError(null)
        setStatus('success')
        setUpdatedAt(Date.now())
      } catch (err) {
        if (err?.name === 'AbortError') return
        cache.set(key, { data: cached?.data ?? null, error: err, at: Date.now() })
        setError(err)
        setStatus('error')
      }
    },
    [key, enabled, ttl],
  )

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }
    let active = true
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < ttl) {
      setData(cached.data)
      setError(cached.error)
      setStatus('success')
      setUpdatedAt(cached.at)
      return
    }
    setData(cached?.data ?? null)
    setStatus('loading')
    loaderRef
      .current()
      .then((result) => {
        if (!active) return
        cache.set(key, { data: result, error: null, at: Date.now() })
        setData(result)
        setError(null)
        setStatus('success')
        setUpdatedAt(Date.now())
      })
      .catch((err) => {
        if (!active || err?.name === 'AbortError') return
        cache.set(key, { data: cache.get(key)?.data ?? null, error: err, at: Date.now() })
        setError(err)
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [key, enabled, ttl])

  const refetch = useCallback(() => run({ force: true }), [run])

  return { data, error, status, refetch, updatedAt, isLoading: status === 'loading' }
}

export function invalidateResource(keyPrefix) {
  for (const key of cache.keys()) {
    if (!keyPrefix || key.startsWith(keyPrefix)) cache.delete(key)
  }
}
