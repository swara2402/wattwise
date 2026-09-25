import { useMemo, useState } from 'react'
import {
  Building2,
  Check,
  Database,
  Download,
  HardDrive,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  Plug,
  RotateCcw,
  Sun,
  Trash2,
  User,
  Wallet,
  Zap,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { NumberInput, Segmented, SelectInput, TextInput, Toggle } from '../components/ui/Field'
import { useApp } from '../context/AppContext'
import { API_BASE } from '../lib/api'
import { DEFAULT_SETTINGS, PROPERTY_TYPES } from '../lib/constants'
import { clearAllWattWise } from '../lib/storage'
import { downloadText } from '../lib/files'
import { kwh as fmtKwh, money, num } from '../lib/format'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const USAGE = [
  { key: 'appliances', label: 'Appliances', icon: Plug },
  { key: 'scenarios', label: 'Saved scenarios', icon: Database },
  { key: 'predictor', label: 'Predictor inputs', icon: Wallet },
  { key: 'advisorApplied', label: 'Advisor selections', icon: Check },
  { key: 'settings', label: 'Household profile', icon: User },
]

export function SettingsPage() {
  const {
    settings,
    updateSettings,
    resetSettings,
    theme,
    setTheme,
    appliances,
    resetAppliances,
    scenarios,
    resetScenarios,
    health,
    toast,
    simulation,
  } = useApp()

  const [confirmReset, setConfirmReset] = useState(false)

  const monthlyBill = useMemo(
    () => simulation.currentCost + Number(settings.fixedCharges || 0),
    [simulation.currentCost, settings.fixedCharges],
  )

  const storageCounts = useMemo(
    () => ({
      appliances: appliances.length,
      scenarios: scenarios.length,
      predictor: 1,
      advisorApplied: 1,
      settings: 1,
    }),
    [appliances.length, scenarios.length],
  )

  const exportProfile = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 2,
      settings,
      appliances,
      scenarios,
      simulation: {
        currentKwh: simulation.currentKwh,
        proposedKwh: simulation.proposedKwh,
        savedCost: simulation.savedCost,
        reductionPct: simulation.reductionPct,
      },
    }
    downloadText('wattwise_profile.json', JSON.stringify(payload, null, 2), 'application/json')
    toast({
      title: 'Profile exported',
      description: `${appliances.length} appliances and ${scenarios.length} scenarios written to JSON.`,
    })
  }

  const wipeEverything = () => {
    clearAllWattWise()
    resetSettings()
    resetAppliances()
    resetScenarios()
    setConfirmReset(false)
    toast({
      title: 'Local data cleared',
      description: 'Settings, appliances, scenarios and advisor picks are back to defaults.',
      tone: 'warn',
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Preferences & data"
        subtitle="Everything here is stored in this browser. Nothing is uploaded except the numbers you send to the model."
        action={
          <Badge tone={health.online ? 'brand' : 'warn'}>
            {health.online ? 'Backend connected' : 'Backend offline'}
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Household profile */}
        <Card className="card-pad">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-brand-soft text-brand">
              <User className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h2 className="text-[0.98rem] font-semibold">Household profile</h2>
          </div>
          <p className="mt-1.5 text-[0.8rem] text-fg-muted">
            Used to label reports and to sanity-check the recommendations.
          </p>

          <div className="mt-4 space-y-4">
            <TextInput
              label="Your name"
              value={settings.userName ?? ''}
              onChange={(event) => updateSettings({ userName: event.target.value })}
              placeholder="Homeowner"
              autoComplete="name"
            />
            <TextInput
              label="Household name"
              value={settings.householdName ?? ''}
              onChange={(event) => updateSettings({ householdName: event.target.value })}
              placeholder="My Home"
            />
            <TextInput
              label="Email (optional)"
              type="email"
              value={settings.userEmail ?? ''}
              onChange={(event) => updateSettings({ userEmail: event.target.value })}
              placeholder="you@example.com"
              hint="Only used locally — no mail is ever sent."
              autoComplete="email"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput
                label="Property type"
                options={PROPERTY_TYPES}
                value={settings.propertyType}
                onChange={(event) => updateSettings({ propertyType: event.target.value })}
              />
              <NumberInput
                label="People in the household"
                min={1}
                max={20}
                step={1}
                value={settings.householdMembers ?? 1}
                onChange={(event) => updateSettings({ householdMembers: Number(event.target.value) })}
              />
            </div>
          </div>
        </Card>

        {/* Tariff */}
        <Card className="card-pad">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent">
              <Wallet className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h2 className="text-[0.98rem] font-semibold">Tariff & billing</h2>
          </div>
          <p className="mt-1.5 text-[0.8rem] text-fg-muted">
            Change the rate and every rupee figure in the app re-prices instantly.
          </p>

          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput
                label="Electricity rate"
                unit="₹/kWh"
                min={0.5}
                max={50}
                step={0.25}
                value={settings.electricityTariff ?? 0}
                onChange={(event) => updateSettings({ electricityTariff: Number(event.target.value) })}
                hint="Slab rate before taxes and surcharges."
              />
              <NumberInput
                label="Fixed monthly charge"
                unit="₹"
                min={0}
                max={5000}
                step={10}
                value={settings.fixedCharges ?? 0}
                onChange={(event) => updateSettings({ fixedCharges: Number(event.target.value) })}
                hint="Rent on the connection."
              />
            </div>
            <NumberInput
              label="Bill alert threshold"
              unit="₹"
              min={100}
              max={50_000}
              step={100}
              value={settings.billAlert ?? 0}
              onChange={(event) => updateSettings({ billAlert: Number(event.target.value) })}
              hint="Flag the bill when the estimate goes past this."
            />
          </div>

          <dl className="mt-5 grid gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-3">
            {[
              { label: 'Modelled units / month', value: fmtKwh(simulation.currentKwh, 0) },
              { label: 'Modelled energy cost', value: money(simulation.currentCost) },
              { label: 'Modelled total bill', value: money(monthlyBill) },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-[0.68rem] uppercase tracking-wider text-fg-subtle">{row.label}</dt>
                <dd className="stat-value mt-0.5 text-[1rem]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Appearance */}
        <Card className="card-pad">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-violet-soft text-violet">
              <Palette className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h2 className="text-[0.98rem] font-semibold">Appearance</h2>
          </div>
          <p className="mt-1.5 text-[0.8rem] text-fg-muted">
            Dark by default — it reads better on a wall-mounted dashboard.
          </p>

          <div className="mt-4">
            <Segmented
              options={THEME_OPTIONS}
              value={theme}
              onChange={setTheme}
              ariaLabel="Choose colour theme"
            />
          </div>

          <div className="mt-5 divide-y divide-line border-t border-line">
            <Toggle
              label="Reduce motion"
              description="Turn off entrance animations and count-ups."
              checked={Boolean(settings.reduceMotion)}
              onChange={(checked) => updateSettings({ reduceMotion: checked })}
            />
            <Toggle
              label="Compact tables"
              description="Tighter row spacing in the anomaly and scenario lists."
              checked={Boolean(settings.compactTables)}
              onChange={(checked) => updateSettings({ compactTables: checked })}
            />
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
            <Keyboard className="size-4 shrink-0 text-fg-subtle" strokeWidth={2.2} aria-hidden="true" />
            <p className="text-[0.78rem] text-fg-muted">
              Press <kbd className="kbd">⌘</kbd> <kbd className="kbd">K</kbd> anywhere to open the command palette.
            </p>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="card-pad">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-info-soft text-info">
              <Monitor className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h2 className="text-[0.98rem] font-semibold">Notifications</h2>
          </div>
          <p className="mt-1.5 text-[0.8rem] text-fg-muted">
            Browser notifications are not wired up yet — these drive the in-app banners instead.
          </p>

          <div className="mt-3 divide-y divide-line border-t border-line">
            {[
              { key: 'anomalies', label: 'Anomaly alerts', description: 'A new critical incident appears in the timeline.' },
              { key: 'weekly', label: 'Weekly digest', description: 'A Monday summary of last week versus the one before.' },
              { key: 'bill', label: 'Bill threshold', description: 'Warn when the estimated bill passes your limit.' },
            ].map((item) => (
              <Toggle
                key={item.key}
                label={item.label}
                description={item.description}
                checked={Boolean(settings.notifications?.[item.key])}
                onChange={(checked) =>
                  updateSettings({ notifications: { ...settings.notifications, [item.key]: checked } })
                }
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Data */}
      <Card className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn">
              <HardDrive className="size-4" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[0.98rem] font-semibold">Local data</h2>
              <p className="mt-1 max-w-xl text-[0.8rem] text-fg-muted">
                Preferences, appliances and saved scenarios live in this browser&apos;s localStorage under the{' '}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.72rem]">wattwise.*</code> keys.
                Clearing site data removes them permanently.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={Download} onClick={exportProfile}>
              Export profile
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Building2}
              onClick={() => {
                resetSettings()
                toast({ title: 'Settings restored to defaults' })
              }}
            >
              Reset settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Zap}
              onClick={() => {
                resetAppliances()
                toast({ title: 'Appliance baseline restored', description: 'Duty cycles are back to how you use them today.' })
              }}
            >
              Reset appliances
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                resetScenarios()
                toast({ title: 'Saved scenarios cleared' })
              }}
            >
              Clear scenarios
            </Button>
          </div>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {USAGE.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <item.icon className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={2.2} aria-hidden="true" />
                <span className="truncate text-[0.78rem] text-fg-muted">{item.label}</span>
              </span>
              <span className="stat-value shrink-0 text-[0.8rem]">{num(storageCounts[item.key], 0)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger/25 bg-danger-soft/40 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[0.85rem] font-semibold text-danger">Reset everything</p>
            <p className="mt-0.5 text-[0.78rem] text-fg-muted">
              Clears all WattWise keys from this browser: profile, tariff, appliances, scenarios, predictor inputs and
              advisor selections. Your original data files are untouched.
            </p>
          </div>
          {confirmReset ? (
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={wipeEverything}>
                Yes, erase it all
              </Button>
            </div>
          ) : (
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirmReset(true)}>
              Erase local data
            </Button>
          )}
        </div>
      </Card>

      <Card className="card-pad flex flex-wrap items-center justify-between gap-3 bg-surface-2">
        <div>
          <p className="text-[0.85rem] font-semibold">Backend endpoint</p>
          <p className="mt-0.5 font-mono text-[0.75rem] text-fg-muted">{API_BASE}</p>
          <p className="mt-1 text-[0.75rem] text-fg-subtle">
            Override with <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.7rem]">VITE_API_URL</code>{' '}
            in a <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.7rem]">.env</code> file, then restart
            the dev server.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.75rem] text-fg-subtle">Default household</p>
          <p className="text-[0.85rem] font-semibold">
            {DEFAULT_SETTINGS.householdName} · {DEFAULT_SETTINGS.propertyType}
          </p>
        </div>
      </Card>
    </div>
  )
}
