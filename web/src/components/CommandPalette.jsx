import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { CornerDownLeft, Moon, Search, Sun } from 'lucide-react'
import { ALL_NAV_ITEMS, COMMAND_ACTIONS } from '../navigation'
import { useApp } from '../context/AppContext'
import { useBodyScrollLock } from '../hooks/useUi'

const score = (item, query) => {
  if (!query) return 1
  const needle = query.toLowerCase()
  const haystack = `${item.label} ${item.description ?? ''} ${item.keywords ?? ''} ${item.section ?? ''}`.toLowerCase()
  if (item.label.toLowerCase().startsWith(needle)) return 100
  if (item.label.toLowerCase().includes(needle)) return 70
  if (haystack.includes(needle)) return 40
  return 0
}

export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { theme, setTheme } = useApp()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useBodyScrollLock(open)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const list = useMemo(() => {
    const pages = ALL_NAV_ITEMS.map((item) => ({ ...item, type: 'page' }))
      .map((item) => ({ item, rank: score(item, query) }))
      .filter((r) => r.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map((r) => ({ ...r.item, key: `page-${r.item.to}` }))

    const actions = COMMAND_ACTIONS.map((item) => ({ ...item, type: 'action' }))
      .map((item) => ({ item, rank: score(item, query) }))
      .filter((r) => r.rank > 0)
      .map((r) => ({ ...r.item, key: `action-${r.item.id}` }))

    const themeAction = {
      key: 'theme',
      id: 'toggle-theme',
      type: 'action',
      label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
      description: 'Toggles the light and dark palettes instantly.',
      keywords: 'theme dark light mode appearance toggle',
      icon: theme === 'dark' ? Sun : Moon,
    }

    // The theme toggle is a real, selectable row — it must take part in the
    // same cursor ordering as everything else or Enter picks the wrong item.
    return score(themeAction, query) > 0 ? [...pages, ...actions, themeAction] : [...pages, ...actions]
  }, [query, theme])

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, list.length - 1)))
  }, [list.length])

  if (!open) return null

  const go = (result) => {
    if (!result) return
    if (result.type === 'page') navigate(result.to)
    else if (result.id === 'toggle-theme') setTheme(theme === 'dark' ? 'light' : 'dark')
    else navigate(result.to)
    onClose()
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => (c + 1) % Math.max(1, list.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => (c - 1 + list.length) % Math.max(1, list.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(list[cursor])
    } else if (event.key === 'Escape') {
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-rise"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" strokeWidth={2.2} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, tools and actions…"
            className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-fg-subtle"
            aria-label="Search"
          />
          <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.65rem] text-fg-subtle">
            ESC
          </kbd>
        </div>

        <ul ref={listRef} className="scrollbar-slim max-h-80 overflow-y-auto p-2" role="listbox">
          {list.map((item, index) => {
            const active = index === cursor
            const Icon = item.icon
            return (
              <li key={item.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(item)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    active ? 'bg-brand-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <span
                    className={clsx(
                      'grid size-8 shrink-0 place-items-center rounded-lg',
                      active ? 'bg-brand text-slate-950' : 'bg-surface-2 text-fg-muted',
                    )}
                  >
                    {Icon && <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    {item.description && (
                      <span className="block truncate text-[0.75rem] text-fg-subtle">{item.description}</span>
                    )}
                  </span>
                  {active && <CornerDownLeft className="size-3.5 shrink-0 text-brand" strokeWidth={2.4} aria-hidden="true" />}
                </button>
              </li>
            )
          })}
          {!list.length && (
            <li className="px-3 py-8 text-center text-sm text-fg-muted">
              Nothing matches “{query}”. Try “simulator”, “anomaly” or “bill”.
            </li>
          )}
        </ul>

        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[0.68rem] text-fg-subtle">
          <span className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
          </span>
          <span>{list.length} result{list.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
