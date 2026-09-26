import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Gauge,
  Leaf,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Field'
import { useApp } from '../context/AppContext'
import { DIFFICULTY_SCORE, IMPACT_SCORE, priceRecommendations } from '../lib/energy'
import {
  CO2_KG_PER_KWH,
  RECOMMENDATIONS,
  RECOMMENDATION_CATEGORIES,
  STORAGE_KEYS,
  applianceTypeMeta,
} from '../lib/constants'
import { formatDate, kwh as fmtKwh, money, num, percent } from '../lib/format'
import { usePersistentState } from '../lib/storage'
import { useCountUp } from '../hooks/useUi'

const RANKING_OPTIONS = [
  { value: 'savings', label: 'Money saved' },
  { value: 'impact', label: 'Impact' },
  { value: 'ease', label: 'Ease first' },
]

export function AdvisorPage() {
  const { tariff, applyRecommendation, toast, simulation } = useApp()
  const [category, setCategory] = useState('All')
  const [ranking, setRanking] = useState('savings')
  const [applied, setApplied] = usePersistentState(STORAGE_KEYS.advisorApplied, [])
  const [expanded, setExpanded] = useState(null)

  const priced = useMemo(() => priceRecommendations(RECOMMENDATIONS, tariff), [tariff])

  const ranked = useMemo(() => {
    const rows = category === 'All' ? priced : priced.filter((r) => r.category === category)
    const sorted = [...rows]
    if (ranking === 'impact') {
      sorted.sort((a, b) => IMPACT_SCORE[b.impact] - IMPACT_SCORE[a.impact] || b.monthlySavings - a.monthlySavings)
    } else if (ranking === 'ease') {
      sorted.sort((a, b) => DIFFICULTY_SCORE[a.difficulty] - DIFFICULTY_SCORE[b.difficulty] || b.monthlySavings - a.monthlySavings)
    } else {
      sorted.sort((a, b) => b.monthlySavings - a.monthlySavings)
    }
    return sorted
  }, [priced, category, ranking])

  const totalMonthly = useMemo(() => priced.reduce((s, r) => s + r.monthlySavings, 0), [priced])
  const totalAnnual = totalMonthly * 12
  const totalKwh = useMemo(() => priced.reduce((s, r) => s + r.monthlySavingsKwh, 0), [priced])
  const totalCo2 = totalKwh * CO2_KG_PER_KWH * 12

  const appliedSet = useMemo(() => new Set(applied), [applied])
  const appliedSavings = useMemo(
    () => priced.filter((r) => appliedSet.has(r.id)).reduce((s, r) => s + r.monthlySavings, 0),
    [appliedSet, priced],
  )

  const monthlyCountUp = useCountUp(appliedSavings)
  const annualCountUp = useCountUp(appliedSavings * 12)

  const categoryOptions = useMemo(
    () =>
      RECOMMENDATION_CATEGORIES.map((value) => ({
        value,
        label: value,
        count: value === 'All' ? priced.length : priced.filter((r) => r.category === value).length,
      })),
    [priced],
  )

  const apply = (rec) => {
    const result = applyRecommendation(rec)
    if (!result.matched) {
      toast({
        title: 'No matching appliance yet',
        description: `Add a ${applianceTypeMeta(rec.targetType).label} in the simulator, then apply this action.`,
        tone: 'warn',
      })
      return
    }
    setApplied((prev) => (prev.includes(rec.id) ? prev : [...prev, rec.id]))
    toast({
      title: 'Applied to the simulator',
      description: `${rec.action} · saves about ${money(rec.monthlySavings)} a month.`,
    })
  }

  const toggleApplied = (rec) => {
    setApplied((prev) => (prev.includes(rec.id) ? prev.filter((id) => id !== rec.id) : [...prev, rec.id]))
    toast({
      title: appliedSet.has(rec.id) ? 'Marked as pending' : 'Counted in your plan',
      description: appliedSet.has(rec.id)
        ? 'It no longer counts towards the headline savings.'
        : 'Added to the headline savings figure.',
      tone: 'info',
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Energy Advisor"
        title="Savings, ranked by your tariff"
        subtitle="Rule-based recommendations generated from your appliance usage and energy-saving assumptions. Apply any of them and the simulator updates instantly."
        action={
          <Segmented
            options={RANKING_OPTIONS}
            value={ranking}
            onChange={setRanking}
            size="sm"
            ariaLabel="Sort recommendations"
          />
        }
      />

      {/* Headline */}
      <Card className="card-pad relative overflow-hidden" glow>
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-brand/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              Your selected plan
            </p>
            <p className="stat-value mt-2 text-[2.6rem] leading-none text-brand sm:text-[3.2rem]">
              {money(monthlyCountUp, true)}
              <span className="ml-1.5 text-[1rem] font-medium text-fg-muted">/month</span>
            </p>
            <p className="mt-3 text-[0.85rem] text-fg-muted">
              {money(annualCountUp, true)} a year from {applied.length} applied{' '}
              {applied.length === 1 ? 'action' : 'actions'}. Everything is still an estimate.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="brand" icon={CheckCircle2}>
                {applied.length}/{priced.length} applied
              </Badge>
              <Badge tone="muted" icon={Leaf}>
                {num(totalCo2, 0)} kg CO₂/yr if you take everything
              </Badge>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            {[
              { label: 'All actions, monthly', value: money(totalMonthly), icon: Coins, tone: 'text-brand' },
              { label: 'All actions, yearly', value: money(totalAnnual), icon: TrendingUp, tone: 'text-accent' },
              { label: 'Energy saved', value: `${num(totalKwh, 0)} kWh/mo`, icon: Zap, tone: 'text-warn' },
              { label: 'Already in simulator', value: money(simulation.savedCost), icon: Gauge, tone: 'text-info' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
                <dt className="flex items-center gap-1.5 text-[0.68rem] uppercase tracking-wider text-fg-subtle">
                  <item.icon className={`size-3.5 ${item.tone}`} strokeWidth={2.4} aria-hidden="true" />
                  {item.label}
                </dt>
                <dd className="stat-value mt-1 text-[1.05rem]">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={categoryOptions}
          value={category}
          onChange={setCategory}
          size="sm"
          ariaLabel="Filter by category"
        />
        <p className="text-[0.78rem] text-fg-subtle">
          Priced at {money(tariff, true)}/kWh · {money(totalMonthly, true)}/month available
        </p>
      </div>

      <div className="grid gap-3">
        {ranked.map((rec, index) => {
          const isApplied = appliedSet.has(rec.id)
          const meta = applianceTypeMeta(rec.targetType)
          const Icon = meta.icon
          const open = expanded === rec.id
          return (
            <Card
              key={rec.id}
              className={`card-pad transition-colors ${isApplied ? 'border-brand/40 bg-brand-soft/25' : ''}`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                {/* rank + icon */}
                <div className="flex items-start gap-3 lg:w-12 lg:shrink-0 lg:flex-col lg:items-center">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-[0.8rem] font-bold text-fg-muted">
                    {index + 1}
                  </span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand lg:mt-2">
                    <Icon className="size-4.5" strokeWidth={2.1} aria-hidden="true" />
                  </span>
                </div>

                {/* body */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={rec.impact === 'High' ? 'danger' : rec.impact === 'Medium' ? 'warn' : 'muted'}>
                      {rec.impact} impact
                    </Badge>
                    <Badge tone="info">{rec.difficulty}</Badge>
                    <Badge tone="muted">{rec.category}</Badge>
                    <button
                      type="button"
                      onClick={() => toggleApplied(rec)}
                      aria-pressed={isApplied}
                      className="chip"
                      title={isApplied ? 'Remove from your savings plan' : 'Count this in your savings plan'}
                    >
                      {isApplied ? (
                        <>
                          <Check className="size-3.5" strokeWidth={2.6} aria-hidden="true" /> In your plan
                        </>
                      ) : (
                        'Add to plan'
                      )}
                    </button>
                  </div>

                  <h3 className="mt-2.5 text-[1rem] font-semibold leading-snug">{rec.title}</h3>
                  <p className="mt-1.5 text-[0.85rem] leading-relaxed text-fg-muted">{rec.description}</p>

                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : rec.id)}
                    aria-expanded={open}
                    className="mt-3 inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-accent transition-colors hover:text-brand"
                  >
                    Why this works
                    {open ? (
                      <ChevronUp className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                    )}
                  </button>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem] text-fg-subtle">
                    <span className="inline-flex items-center gap-1.5">
                      <Target className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                      {rec.action}
                    </span>
                    <span>
                      {fmtKwh(rec.monthlySavingsKwh, 0)}/mo · {num(rec.monthlySavingsKwh * CO2_KG_PER_KWH, 1)} kg CO₂/mo
                    </span>
                  </div>

                  {open && (
                    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3.5 text-[0.8rem] leading-relaxed text-fg-muted">
                      <p className="font-semibold text-fg">Why this works</p>
                      <p className="mt-1">
                        {meta.label} appliances in Indian homes average{' '}
                        {meta.defaultWatts.toLocaleString('en-IN')} W. Running that load for{' '}
                        {meta.defaultHours} h/day costs{' '}
                        <span className="stat-value text-fg">
                          {fmtKwh(((meta.defaultWatts * 1) / 1000) * meta.defaultHours * 30, 0)}
                        </span>{' '}
                        a month on its own. Trimming the duty cycle is reversible, needs no hardware and shows up in
                        the very next bill.
                      </p>
                      <p className="mt-2 text-fg-subtle">
                        Impact score {IMPACT_SCORE[rec.impact]}/3 · effort {DIFFICULTY_SCORE[rec.difficulty]}/4 ·
                        payback is immediate.
                      </p>
                    </div>
                  )}
                </div>

                {/* money + actions */}
                <div className="flex shrink-0 flex-row items-center justify-between gap-4 lg:w-52 lg:flex-col lg:items-end lg:justify-start">
                  <div className="text-left lg:text-right">
                    <p className="stat-value text-[1.35rem] leading-none text-brand">
                      {money(rec.monthlySavings)}
                    </p>
                    <p className="mt-1 text-[0.7rem] text-fg-subtle">
                      {money(rec.annualSavings)}/yr · {percent((rec.monthlySavingsKwh * CO2_KG_PER_KWH * 12) / 1000, 2)}{' '}
                      t CO₂/yr
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={isApplied ? 'outline' : 'primary'}
                      size="sm"
                      icon={isApplied ? Check : Sparkles}
                      onClick={() => apply(rec)}
                    >
                      {isApplied ? 'Re-apply' : 'Apply'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="card-pad flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <SlidersHorizontal className="size-4" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[0.9rem] font-semibold">Want the appliance-level version?</p>
            <p className="mt-0.5 text-[0.8rem] text-fg-muted">
              The simulator lets you tune every duty cycle and save the result as a named scenario.
            </p>
          </div>
        </div>
        <Link to="/simulator" className="btn btn-primary shrink-0">
          Open the simulator
          <ArrowRight className="size-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </Card>

      <p className="text-center text-[0.72rem] text-fg-subtle">
        Recommendations last reviewed against the 1,433-day dataset on{' '}
        {formatDate('2010-11-26')}. Regional tariffs and appliance ratings vary — treat these as a starting point.
      </p>
    </div>
  )
}