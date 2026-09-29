import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookmarkPlus,
  Check,
  Coins,
  GitCompareArrows,
  Info,
  Leaf,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Zap,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { NumberInput, RangeSlider, SelectInput, TextArea, TextInput } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/States'
import { ChartFrame } from '../components/charts/ChartFrame'
import { SavingsComparisonChart } from '../components/charts/BarCharts'
import { Sparkline } from '../components/charts/Sparkline'
import { useApp } from '../context/AppContext'
import { useCountUp } from '../hooks/useUi'
import { APPLIANCE_TYPES, SIM_PRESETS, applianceTypeMeta } from '../lib/constants'
import { kwh as fmtKwh, money, num, percent, formatDate } from '../lib/format'

const emptyDraft = {
  name: '',
  type: 'ac',
  powerWatts: '',
  quantity: 1,
  currentDailyHours: '',
  daysPerMonth: 30,
}

export function SimulatorPage() {
  const {
    appliances,
    addAppliance,
    updateAppliance,
    removeAppliance,
    setProposedHours,
    applyPreset,
    simulation,
    scenarios,
    addScenario,
    removeScenario,
    tariff,
    settings,
    toast,
  } = useApp()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(null) // { mode, id, draft }
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [planName, setPlanName] = useState('')
  const [planNotes, setPlanNotes] = useState('')
  const [showAll, setShowAll] = useState(false)

  const animatedSavings = useCountUp(simulation.savedCost)
  const animatedAnnual = useCountUp(simulation.annualSavedCost)

  const visibleRows = showAll ? simulation.rows : simulation.rows.slice(0, 6)
  const hiddenCount = simulation.rows.length - visibleRows.length

  const draft = editing?.draft ?? emptyDraft
  const draftErrors = useMemo(() => validateDraft(draft), [draft])

  const openAdd = () =>
    setEditing({
      mode: 'add',
      id: null,
      draft: { ...emptyDraft, type: 'ac', powerWatts: String(APPLIANCE_TYPES[0].defaultWatts) },
    })

  const openEdit = (appliance) =>
    setEditing({
      mode: 'edit',
      id: appliance.id,
      draft: {
        name: appliance.name,
        type: appliance.type,
        powerWatts: String(appliance.powerWatts),
        quantity: appliance.quantity,
        currentDailyHours: appliance.currentDailyHours,
        daysPerMonth: appliance.daysPerMonth,
      },
    })

  const commitDraft = () => {
    if (Object.keys(draftErrors).length) return
    const payload = {
      name: draft.name.trim(),
      type: draft.type,
      powerWatts: Number(draft.powerWatts),
      quantity: Math.max(1, Number(draft.quantity) || 1),
      currentDailyHours: Number(draft.currentDailyHours),
      daysPerMonth: Math.min(31, Math.max(1, Number(draft.daysPerMonth) || 30)),
    }
    if (editing.mode === 'edit') {
      updateAppliance(editing.id, { ...payload, proposedDailyHours: Math.min(payload.currentDailyHours, appliances.find((a) => a.id === editing.id)?.proposedDailyHours ?? payload.currentDailyHours) })
      toast({ title: 'Appliance updated', description: `${payload.name} now reflects your latest details.` })
    } else {
      addAppliance({ ...payload, proposedDailyHours: payload.currentDailyHours })
      toast({ title: 'Appliance added', description: `${payload.name} was added to your household profile.` })
    }
    setEditing(null)
  }

  const savePlan = () => {
    const name = planName.trim()
    if (!name) return
    addScenario({
      name,
      description: planNotes.trim(),
      currentKwh: simulation.currentKwh,
      proposedKwh: simulation.proposedKwh,
      currentCost: simulation.currentCost,
      proposedCost: simulation.proposedCost,
      monthlySavings: simulation.savedCost,
      annualSavings: simulation.annualSavedCost,
      reductionPct: simulation.reductionPct,
      snapshot: simulation.rows.map((row) => ({
        id: row.id,
        name: row.name,
        proposedDailyHours: row.proposedDailyHours,
      })),
    })
    setScenarioOpen(false)
    setPlanName('')
    setPlanNotes('')
    toast({ title: 'Plan saved', description: `“${name}” is now available in Compare.` })
  }

  const loadScenario = (scenario) => {
    scenario.snapshot?.forEach((entry) => {
      const match = appliances.find((a) => a.id === entry.id)
      if (match) updateAppliance(match.id, { proposedDailyHours: entry.proposedDailyHours })
    })
    setCompareOpen(false)
    toast({ title: 'Plan loaded', description: `Applied “${scenario.name}” to your current appliances.` })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="What-If simulator"
        title="Price every change in rupees"
        subtitle="Move a slider and the monthly, annual and CO₂ impact recalculate instantly. Nothing is saved until you save the plan."
        action={
          <>
            <Button variant="outline" icon={GitCompareArrows} onClick={() => setCompareOpen(true)}>
              Compare plans {scenarios.length > 0 && `(${scenarios.length})`}
            </Button>
            <Button variant="primary" icon={BookmarkPlus} onClick={() => setScenarioOpen(true)}>
              Save plan
            </Button>
          </>
        }
      />

      {/* ── Savings hero ─────────────────────────────── */}
      <Card className="card-pad relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              Estimated monthly savings
            </p>
            <p className="stat-value mt-2 text-[2.6rem] leading-none text-brand sm:text-[3.1rem]">
              {money(animatedSavings)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="brand" icon={Coins}>
                {money(animatedAnnual)} a year
              </Badge>
              <Badge tone="accent">{percent(simulation.reductionPct, 1)} less energy</Badge>
              <Badge tone="info" icon={Leaf}>
                {num(simulation.co2SavedKg, 0)} kg CO₂ avoided
              </Badge>
            </div>

            <div className="mt-6 space-y-2.5">
              <ComparisonBar
                label="Current plan"
                value={simulation.currentKwh}
                max={simulation.currentKwh || 1}
                tone="muted"
              />
              <ComparisonBar
                label="Simulated plan"
                value={simulation.proposedKwh}
                max={simulation.currentKwh || 1}
                tone="brand"
              />
            </div>
            <p className="mt-2 text-[0.72rem] text-fg-subtle">
              {fmtKwh(simulation.currentKwh, 1)} → {fmtKwh(simulation.proposedKwh, 1)} per month at{' '}
              {money(tariff, true)}/kWh
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 self-center">
            <MetricTile
              label="Current monthly bill"
              value={money(simulation.currentCost + Number(settings.fixedCharges || 0))}
              hint="incl. fixed charges"
            />
            <MetricTile
              label="Simulated monthly bill"
              value={money(simulation.proposedCost + Number(settings.fixedCharges || 0))}
              hint="incl. fixed charges"
              tone="brand"
            />
            <MetricTile label="Monthly energy" value={fmtKwh(simulation.currentKwh, 0)} hint="today's habits" />
            <MetricTile
              label="Energy avoided"
              value={fmtKwh(simulation.savedKwh, 0)}
              hint="per month"
              tone="accent"
            />
          </div>
        </div>
      </Card>

      {/* ── Presets ──────────────────────────────────── */}
      <Card className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[0.98rem] font-semibold">Preset strategies</h2>
            <p className="mt-1 text-[0.8rem] text-fg-muted">
              Start from a proven plan, then fine-tune individual appliances below.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={() => {
              applyPreset('reset')
              toast({ title: 'Baseline restored', description: 'Every appliance is back to today’s hours.' })
            }}
          >
            Reset all
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SIM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                const applied = applyPreset(preset.id)
                toast({ title: `Applied “${applied.name}”`, description: applied.description })
              }}
              className="group rounded-xl border border-line bg-surface-2 p-3.5 text-left transition-all hover:border-brand/40 hover:bg-brand-soft"
            >
              <p className="text-[0.85rem] font-semibold">{preset.name}</p>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-fg-muted">{preset.description}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* ── Appliances ───────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card className="card-pad">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.98rem] font-semibold">
                Household appliances <span className="text-fg-subtle">({appliances.length})</span>
              </h2>
              <p className="mt-1 text-[0.8rem] text-fg-muted">
                Set the hours you would actually run each device. Drag to model the change.
              </p>
            </div>
            <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>
              Add appliance
            </Button>
          </div>

          {appliances.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No appliances yet"
              description="Add your AC, geyser, fridge and lights to turn sliders into real rupee savings."
              action={
                <Button variant="primary" icon={Plus} onClick={openAdd}>
                  Add your first appliance
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {visibleRows.map((row) => {
                const Icon = applianceTypeMeta(row.type).icon
                const changed = row.proposedDailyHours !== row.currentDailyHours
                const saving = row.savedCost > 0.5
                return (
                  <li
                    key={row.id}
                    className="rounded-xl border border-line bg-surface-2 p-3.5 transition-colors hover:border-line-strong"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                            saving ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-fg-muted'
                          }`}
                        >
                          <Icon className="size-4.5" strokeWidth={2} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[0.88rem] font-semibold">{row.name}</p>
                          <p className="mt-0.5 text-[0.72rem] text-fg-subtle">
                            {row.powerWatts} W × {row.quantity} · {row.daysPerMonth} days/mo ·{' '}
                            {fmtKwh(row.currentKwh, 1)} now
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {saving && <Badge tone="brand">saves {money(row.savedCost)}/mo</Badge>}
                        <span className="stat-value text-[0.9rem]">{money(row.proposedCost)}</span>
                        <div className="flex">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
                            aria-label={`Edit ${row.name}`}
                          >
                            <Pencil className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              removeAppliance(row.id)
                              toast({ title: 'Appliance removed', description: `${row.name} is no longer modelled.`, tone: 'warn' })
                            }}
                            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                            aria-label={`Remove ${row.name}`}
                          >
                            <Trash2 className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.76rem]">
                      <span className="text-fg-muted">
                        Today <span className="stat-value text-fg-muted">{row.currentDailyHours.toFixed(1)} h/day</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        Proposed{' '}
                        <span className={`stat-value ${changed ? 'text-brand' : 'text-fg-muted'}`}>
                          {row.proposedDailyHours.toFixed(1)} h/day
                        </span>
                        {changed && (
                          <button
                            type="button"
                            className="text-[0.7rem] font-semibold text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
                            onClick={() => setProposedHours(row.id, row.currentDailyHours)}
                          >
                            reset
                          </button>
                        )}
                      </span>
                      {row.savedKwh > 0.05 && (
                        <span className="text-fg-subtle">−{fmtKwh(row.savedKwh, 1)}/mo</span>
                      )}
                    </div>

                    <div className="mt-1.5">
                      <RangeSlider
                        label={`${row.name} proposed daily hours`}
                        value={row.proposedDailyHours}
                        max={row.type === 'fridge' ? 24 : Math.max(row.currentDailyHours, 8)}
                        step={0.1}
                        onChange={(value) => setProposedHours(row.id, value)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-4 w-full rounded-xl border border-dashed border-line py-2.5 text-[0.82rem] font-semibold text-fg-muted transition-colors hover:border-brand/40 hover:text-fg"
            >
              Show {hiddenCount} more appliance{hiddenCount === 1 ? '' : 's'}
            </button>
          )}
        </Card>

        <div className="space-y-4">
          <ChartFrame
            title="Cost per appliance"
            subtitle="Current vs proposed monthly cost — the widest gaps are your cheapest wins."
            icon={Coins}
            height={Math.max(220, Math.min(simulation.rows.length, 8) * 46)}
            isEmpty={!simulation.rows.length}
            emptyTitle="Nothing to compare yet"
            emptyDescription="Add appliances to see where your money goes."
          >
            <SavingsComparisonChart
              rows={[...simulation.rows].sort((a, b) => b.currentCost - a.currentCost).slice(0, 8)}
              tariff={tariff}
            />
          </ChartFrame>

          {simulation.ranked.length > 0 && (
            <Card className="card-pad">
              <h2 className="text-[0.98rem] font-semibold">Top opportunities</h2>
              <p className="mt-1 text-[0.8rem] text-fg-muted">Ranked by monthly rupees saved.</p>
              <ol className="mt-4 space-y-3">
                {simulation.ranked.slice(0, 4).map((row, index) => (
                  <li key={row.id} className="flex items-center gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-[0.72rem] font-bold text-brand">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.85rem] font-semibold">{row.name}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{
                            width: `${Math.min(100, (row.savedCost / (simulation.ranked[0]?.savedCost || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="stat-value text-[0.85rem] text-brand">{money(row.savedCost)}</p>
                      <p className="text-[0.68rem] text-fg-subtle">{fmtKwh(row.savedKwh, 0)}/mo</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Button
                variant="outline"
                block
                className="mt-4"
                onClick={() => navigate('/advisor')}
              >
                Get more ideas from the AI advisor
              </Button>
            </Card>
          )}

          <Card className="card-pad flex items-start gap-3 bg-surface-2">
            <Info className="mt-0.5 size-4 shrink-0 text-info" strokeWidth={2.2} aria-hidden="true" />
            <p className="text-[0.78rem] leading-relaxed text-fg-muted">
              Estimates use nameplate power ratings and your duty cycles, priced at{' '}
              {money(tariff, true)}/kWh with {money(Number(settings.fixedCharges || 0), true)} fixed monthly
              charges. Real savings vary with weather, appliance age and power factor. Progress is saved in
              this browser only.
            </p>
          </Card>
        </div>
      </div>

      {/* ── Appliance editor ─────────────────────────── */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'edit' ? 'Edit appliance' : 'Add appliance'}
        description="Nameplate watts and real usage hours are all the model needs."
        icon={Zap}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={commitDraft}
              disabled={Object.keys(draftErrors).length > 0}
            >
              {editing?.mode === 'edit' ? 'Save changes' : 'Add appliance'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Appliance name"
            data-autofocus
            placeholder="e.g. Hall AC"
            value={draft.name}
            error={draft.name ? draftErrors.name : undefined}
            onChange={(e) => setEditing((s) => ({ ...s, draft: { ...s.draft, name: e.target.value } }))}
            className="sm:col-span-2"
            required
          />
          <SelectInput
            label="Category"
            value={draft.type}
            options={APPLIANCE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            onChange={(e) => {
              const type = APPLIANCE_TYPES.find((t) => t.value === e.target.value)
              setEditing((s) => ({
                ...s,
                draft: {
                  ...s.draft,
                  type: e.target.value,
                  powerWatts: s.mode === 'add' ? String(type.defaultWatts) : s.draft.powerWatts,
                  currentDailyHours: s.mode === 'add' ? String(type.defaultHours) : s.draft.currentDailyHours,
                },
              }))
            }}
          />
          <NumberInput
            label="Power rating"
            unit="W"
            min={1}
            max={10000}
            value={draft.powerWatts}
            error={draftErrors.powerWatts}
            onChange={(e) => setEditing((s) => ({ ...s, draft: { ...s.draft, powerWatts: e.target.value } }))}
            hint="Check the label on the back or the manual."
          />
          <NumberInput
            label="Quantity"
            min={1}
            max={50}
            value={draft.quantity}
            error={draftErrors.quantity}
            onChange={(e) => setEditing((s) => ({ ...s, draft: { ...s.draft, quantity: e.target.value } }))}
          />
          <NumberInput
            label="Hours used per day"
            min={0}
            max={24}
            step={0.5}
            value={draft.currentDailyHours}
            error={draftErrors.currentDailyHours}
            onChange={(e) =>
              setEditing((s) => ({ ...s, draft: { ...s.draft, currentDailyHours: e.target.value } }))
            }
          />
          <NumberInput
            label="Days used per month"
            min={1}
            max={31}
            value={draft.daysPerMonth}
            error={draftErrors.daysPerMonth}
            onChange={(e) => setEditing((s) => ({ ...s, draft: { ...s.draft, daysPerMonth: e.target.value } }))}
            className="sm:col-span-2"
          />
        </div>

        {editing?.mode === 'add' && draft.powerWatts && draft.currentDailyHours !== '' && (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3.5">
            <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-fg-subtle">Modelled impact</p>
            <p className="stat-value mt-1.5 text-[1.15rem] text-brand">
              {money(
                ((Number(draft.powerWatts) || 0) *
                  (Number(draft.quantity) || 0) *
                  (Number(draft.currentDailyHours) || 0) *
                  (Number(draft.daysPerMonth) || 0) *
                  tariff) /
                  1000,
              )}
              <span className="text-[0.78rem] font-medium text-fg-muted"> / month at current hours</span>
            </p>
            <div className="mt-2">
              <Sparkline
                values={Array.from({ length: 7 }, (_, i) =>
                  ((Number(draft.powerWatts) || 0) * (Number(draft.currentDailyHours) || 0) * (i % 5 === 0 ? 1.15 : 0.92)) / 1000,
                )}
                width={180}
                height={30}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Save plan ────────────────────────────────── */}
      <Modal
        open={scenarioOpen}
        onClose={() => setScenarioOpen(false)}
        title="Save this plan"
        description="Snapshot the current sliders so you can come back to it later."
        icon={BookmarkPlus}
        footer={
          <>
            <Button variant="ghost" onClick={() => setScenarioOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={savePlan} disabled={!planName.trim()}>
              Save plan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Plan name"
            data-autofocus
            placeholder="e.g. Summer conservation"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            required
          />
          <TextArea
            label="Notes"
            placeholder="What are you changing, and why?"
            value={planNotes}
            onChange={(e) => setPlanNotes(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-line bg-surface-2 p-3.5 text-center">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-fg-subtle">Monthly</p>
              <p className="stat-value mt-1 text-brand">{money(simulation.savedCost)}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-fg-subtle">Annual</p>
              <p className="stat-value mt-1">{money(simulation.annualSavedCost)}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-fg-subtle">Reduction</p>
              <p className="stat-value mt-1 text-accent">{percent(simulation.reductionPct, 1)}</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Compare ─────────────────────────────────── */}
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Saved plans"
        description="Compare the plans you have bookmarked, then load one back onto the sliders."
        icon={GitCompareArrows}
        size="lg"
      >
        {scenarios.length === 0 ? (
          <EmptyState
            icon={BookmarkPlus}
            title="No saved plans yet"
            description="Tune the sliders, then hit Save plan to snapshot this configuration."
            action={
              <Button variant="primary" onClick={() => setCompareOpen(false)}>
                Back to simulator
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[0.82rem]">
              <thead>
                <tr className="border-b border-line text-[0.68rem] uppercase tracking-wider text-fg-subtle">
                  <th className="py-2 pr-3 font-semibold">Plan</th>
                  <th className="py-2 pr-3 text-right font-semibold">Monthly</th>
                  <th className="py-2 pr-3 text-right font-semibold">Annual</th>
                  <th className="py-2 pr-3 text-right font-semibold">Cut</th>
                  <th className="py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => (
                  <tr key={scenario.id} className="border-b border-line/60 last:border-none">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{scenario.name}</p>
                      <p className="mt-0.5 text-[0.72rem] text-fg-subtle">
                        {formatDate(scenario.createdAt)}
                        {scenario.description ? ` · ${scenario.description}` : ''}
                      </p>
                    </td>
                    <td className="stat-value py-3 pr-3 text-right text-brand">{money(scenario.monthlySavings)}</td>
                    <td className="stat-value py-3 pr-3 text-right">{money(scenario.annualSavings)}</td>
                    <td className="stat-value py-3 pr-3 text-right text-accent">
                      {percent(scenario.reductionPct, 1)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" icon={Check} onClick={() => loadScenario(scenario)}>
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            removeScenario(scenario.id)
                            toast({ title: 'Plan removed', description: scenario.name, tone: 'warn' })
                          }}
                          aria-label={`Delete ${scenario.name}`}
                        >
                          <Trash2 className="size-4" strokeWidth={2.2} aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}

function MetricTile({ label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className={`stat-value mt-1.5 text-[1.15rem] ${tone === 'brand' ? 'text-brand' : tone === 'accent' ? 'text-accent' : ''}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[0.68rem] text-fg-subtle">{hint}</p>}
    </div>
  )
}

function ComparisonBar({ label, value, max, tone }) {
  const width = Math.max(2, Math.min(100, (value / max) * 100))
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-[0.78rem] font-medium text-fg-muted">{label}</span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <span
          className={`block h-full rounded-full ${tone === 'brand' ? 'bg-brand' : 'bg-fg-subtle'}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="stat-value w-20 shrink-0 text-right text-[0.8rem]">{fmtKwh(value, 1)}</span>
    </div>
  )
}

function validateDraft(draft) {
  const errors = {}
  if (!draft.name?.trim()) errors.name = 'Give the appliance a name.'
  const watts = Number(draft.powerWatts)
  if (!Number.isFinite(watts) || watts <= 0) errors.powerWatts = 'Enter the wattage from the nameplate.'
  const quantity = Number(draft.quantity)
  if (!Number.isFinite(quantity) || quantity < 1) errors.quantity = 'At least one unit.'
  const hours = Number(draft.currentDailyHours)
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) errors.currentDailyHours = 'Between 0 and 24 hours.'
  const days = Number(draft.daysPerMonth)
  if (!Number.isFinite(days) || days < 1 || days > 31) errors.daysPerMonth = 'Between 1 and 31 days.'
  return errors
}
