import { useCallback, useEffect, useRef, useState } from 'react'

export function readStore(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function writeStore(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota exceeded or private mode — the app still works in-memory */
  }
}

/** State that survives reloads, with a debounced write. */
export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => readStore(key, initialValue))
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = setTimeout(() => writeStore(key, value), 180)
    return () => clearTimeout(timer)
  }, [key, value])

  const reset = useCallback(() => setValue(initialValue), [initialValue])

  return [value, setValue, reset]
}

export function clearAllWattWise() {
  if (typeof window === 'undefined') return
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('wattwise.')) window.localStorage.removeItem(key)
  }
}
