import { useEffect, useRef, useState } from 'react'

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (event) => setMatches(event.matches)
    // Set initial value only when query changes
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}

/** Counts up to `value` — used on the headline savings counters. */
export function useCountUp(target, { duration = 700, enabled = true } = {}) {
  const [value, setValue] = useState(enabled ? 0 : target)
  const fromRef = useRef(0)
  const frame = useRef()

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      setValue(target)
      return
    }
    const from = fromRef.current
    const delta = target - from
    if (Math.abs(delta) < 0.01) {
      setValue(target)
      fromRef.current = target
      return
    }
    const start = performance.now()
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      const next = from + delta * eased
      setValue(next)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration, enabled])

  return value
}