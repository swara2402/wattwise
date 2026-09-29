import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Read a persisted value, repairing it on the way in.
 *
 * `revive(stored, fallback)` is expected to return a value matching the
 * current shape, or `null`/undefined to signal "unusable, use the fallback".
 * Without it the raw parsed JSON is returned, which is fine for plain values
 * but unsafe for anything with a schema.
 */
export function readStore(key, fallback, revive) {
  if (typeof window === 'undefined') return fallback
  let raw
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return fallback
  }
  if (raw === null || raw === undefined || raw === '') return fallback
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Corrupt entry. Drop it so the next write starts clean.
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    return fallback
  }
  if (revive) {
    try {
      const revived = revive(parsed, fallback)
      return revived === undefined || revived === null ? fallback : revived
    } catch {
      return fallback
    }
  }
  return parsed ?? fallback
}

export function writeStore(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota exceeded or private mode — the app still works in-memory */
  }
}

/** State that survives reloads, with a debounced write and a revive hook. */
export function usePersistentState(key, initialValue, revive) {
  const [value, setValue] = useState(() => readStore(key, initialValue, revive))
  const first = useRef(true)
  const reviveRef = useRef(revive)

  useEffect(() => {
    reviveRef.current = revive
  }, [revive])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = setTimeout(() => writeStore(key, value), 180)
    return () => clearTimeout(timer)
  }, [key, value])

  // A changed schema definition should not strand already-loaded state.
  useEffect(() => {
    if (!reviveRef.current) return
    setValue((prev) => {
      try {
        const next = reviveRef.current(prev, initialValue)
        if (next === undefined || next === null) return prev
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next
      } catch {
        return prev
      }
    })
  }, [initialValue])

  const reset = useCallback(() => setValue(initialValue), [initialValue])

  return [value, setValue, reset]
}

export function clearAllWattWise() {
  if (typeof window === 'undefined') return
  try {
    const keys = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith('wattwise.')) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}