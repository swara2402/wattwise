/** Tiny inline SVG trend line — no chart library, no layout cost. */
export function Sparkline({
  values = [],
  width = 120,
  height = 34,
  stroke = 'var(--brand)',
  fill = true,
  className,
}) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((value, index) => {
    const x = index * step
    const y = height - ((value - min) / span) * (height - 4) - 2
    return [x, y]
  })

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `${path} L${width},${height} L0,${height} Z`
  const gradientId = `spark-${stroke.replace(/[^a-z0-9]/gi, '')}-${values.length}-${Math.round(max)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points.at(-1)[0]} cy={points.at(-1)[1]} r={2.2} fill={stroke} />
    </svg>
  )
}
