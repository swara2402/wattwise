const currencyFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const currencyPreciseFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

export const num = (value, decimals = 0) =>
  Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: decimals }) : '—'

export const money = (value, precise = false) =>
  Number.isFinite(value) ? (precise ? currencyPreciseFmt : currencyFmt).format(value) : '—'

export const compact = (value) => (Number.isFinite(value) ? compactFmt.format(value) : '—')

export const kwh = (value, decimals = 1) => (Number.isFinite(value) ? `${num(value, decimals)} kWh` : '—')

export const percent = (value, decimals = 1) =>
  Number.isFinite(value) ? `${value.toFixed(decimals)}%` : '—'

export const signedPercent = (value, decimals = 1) => {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

const toDate = (value) => {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  // Parse YYYY-MM-DD as a local date, never UTC-shifted.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export const formatDate = (value, options = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', options)
}

export const formatDayShort = (value) => formatDate(value, { day: 'numeric', month: 'short' })

export const formatWeekday = (value) => formatDate(value, { weekday: 'short' })

export const addDays = (value, days) => {
  const date = new Date(toDate(value))
  date.setDate(date.getDate() + days)
  return date
}

export const toISODate = (value) => {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const relativeDays = (value, from = new Date()) => {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Math.round((startOfDay(date) - startOfDay(from)) / 86400000)
  if (diff === 0) return 'today'
  if (diff === -1) return 'yesterday'
  if (diff === 1) return 'tomorrow'
  if (diff < 0) return `${Math.abs(diff)} days ago`
  return `in ${diff} days`
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'W'
