import {
  AirVent,
  Refrigerator,
  Tv,
  WashingMachine,
  ShowerHead,
  Fan,
  Lightbulb,
  Plug,
  Zap,
  Flame,
  Laptop,
  UtensilsCrossed,
  BatteryCharging,
} from 'lucide-react'

export const STORAGE_KEYS = {
  settings: 'wattwise.settings.v2',
  appliances: 'wattwise.appliances.v2',
  scenarios: 'wattwise.scenarios.v2',
  theme: 'wattwise.theme',
  predictor: 'wattwise.predictor.v2',
  advisorApplied: 'wattwise.advisorApplied.v2',
}

/**
 * Grid emission factor, in kg CO2 per kWh.
 *
 * This is a *configurable assumption*, not a measurement of any particular
 * grid. The default is a commonly quoted all-India average; a user on a
 * different grid, or reading a different published figure, should change it
 * in Settings. Every surface that shows a CO2 figure labels it as an
 * assumption.
 */
export const DEFAULT_GRID_EMISSION_FACTOR = 0.79
export const EMISSION_FACTOR_NOTE =
  'Configurable assumption — kg CO2 per kWh for your grid. Not a measured value.'

/** Billing period length, in days. WattWise models a flat 30-day period. */
export const DEFAULT_BILLING_DAYS = 30

/**
 * WattWise only prices a flat per-unit tariff. This is stated wherever a
 * number is shown so a bill is never read as covering slabs, time-of-use
 * bands or taxes.
 */
export const TARIFF_TYPE = 'flat'
export const TARIFF_TYPE_NOTE =
  'Flat electricity tariff — one rate for all kWh. No time-of-use bands, slabs or taxes are modelled.'

export const DEFAULT_SETTINGS = {
  userName: 'Homeowner',
  userEmail: '',
  householdName: 'My Home',
  propertyType: '3 BHK Apartment',
  householdMembers: 4,
  electricityTariff: 8,
  fixedCharges: 120,
  currency: 'INR',
  notifications: { anomalies: true, weekly: true, bill: true },
  billAlert: 1500,
  dataPeriod: 30,
  /** kg CO2 per kWh — a configurable assumption, see EMISSION_FACTOR_NOTE. */
  carbonIntensity: DEFAULT_GRID_EMISSION_FACTOR,
  /** Length of the billing period the cost figures describe. */
  billingDays: DEFAULT_BILLING_DAYS,
}

export const PROPERTY_TYPES = [
  'Studio',
  '1 BHK Apartment',
  '2 BHK Apartment',
  '3 BHK Apartment',
  '4 BHK Apartment',
  'Independent House',
  'Villa',
]

export const APPLIANCE_TYPES = [
  { value: 'ac', label: 'Air Conditioner', icon: AirVent, defaultWatts: 1500, defaultHours: 8 },
  { value: 'fridge', label: 'Refrigerator', icon: Refrigerator, defaultWatts: 200, defaultHours: 24 },
  { value: 'tv', label: 'TV / Monitor', icon: Tv, defaultWatts: 120, defaultHours: 5 },
  { value: 'washing_machine', label: 'Washing Machine', icon: WashingMachine, defaultWatts: 500, defaultHours: 1.5 },
  { value: 'water_heater', label: 'Water Heater / Geyser', icon: ShowerHead, defaultWatts: 2000, defaultHours: 2 },
  { value: 'fan', label: 'Ceiling / Exhaust Fan', icon: Fan, defaultWatts: 75, defaultHours: 12 },
  { value: 'lights', label: 'LED Lighting', icon: Lightbulb, defaultWatts: 15, defaultHours: 6 },
  { value: 'kitchen', label: 'Kitchen Appliance', icon: UtensilsCrossed, defaultWatts: 800, defaultHours: 1 },
  { value: 'laptop', label: 'Laptop / Desktop', icon: Laptop, defaultWatts: 65, defaultHours: 8 },
  { value: 'ev', label: 'EV Charger', icon: BatteryCharging, defaultWatts: 3000, defaultHours: 2 },
  { value: 'heater', label: 'Room Heater', icon: Flame, defaultWatts: 1200, defaultHours: 3 },
  { value: 'generic', label: 'Other Device', icon: Plug, defaultWatts: 300, defaultHours: 4 },
]

export const applianceTypeMeta = (value) =>
  APPLIANCE_TYPES.find((t) => t.value === value) ?? APPLIANCE_TYPES.at(-1)

export const DEFAULT_APPLIANCES = [
  { id: 'a1', name: 'Air Conditioner (Inverter)', type: 'ac', powerWatts: 1500, quantity: 1, currentDailyHours: 8, proposedDailyHours: 6, daysPerMonth: 30 },
  { id: 'a2', name: 'Frost-Free Refrigerator', type: 'fridge', powerWatts: 200, quantity: 1, currentDailyHours: 24, proposedDailyHours: 24, daysPerMonth: 30 },
  { id: 'a3', name: 'Smart TV (55" 4K)', type: 'tv', powerWatts: 120, quantity: 1, currentDailyHours: 5, proposedDailyHours: 3.5, daysPerMonth: 30 },
  { id: 'a4', name: 'Front Load Washing Machine', type: 'washing_machine', powerWatts: 500, quantity: 1, currentDailyHours: 1.5, proposedDailyHours: 1, daysPerMonth: 20 },
  { id: 'a5', name: 'Water Heater / Geyser', type: 'water_heater', powerWatts: 2000, quantity: 1, currentDailyHours: 2, proposedDailyHours: 1.2, daysPerMonth: 30 },
  { id: 'a6', name: 'Ceiling Fans', type: 'fan', powerWatts: 75, quantity: 4, currentDailyHours: 12, proposedDailyHours: 9, daysPerMonth: 30 },
  { id: 'a7', name: 'LED Lights (15W each)', type: 'lights', powerWatts: 15, quantity: 10, currentDailyHours: 6, proposedDailyHours: 4.5, daysPerMonth: 30 },
]

export const SIM_PRESETS = [
  {
    id: 'ac',
    name: 'Trim AC runtime',
    description: 'Every AC runs 2 hours less per day — the single biggest cooling win.',
    apply: (a) => (a.type === 'ac' ? Math.max(1, a.currentDailyHours - 2) : a.proposedDailyHours),
  },
  {
    id: 'efficient',
    name: 'Efficient household',
    description: 'BEE-style duty cycles across cooling, heating and lighting.',
    apply: (a) =>
      ({ ac: 5, water_heater: 1, tv: 3, fan: 8, lights: 4, washing_machine: 0.8 })[a.type] ??
      Math.max(0.5, a.currentDailyHours * 0.75),
  },
  {
    id: 'standby',
    name: 'Kill standby draw',
    description: 'Cut phantom load from screens, lights and always-on devices.',
    apply: (a) =>
      a.type === 'tv'
        ? a.currentDailyHours * 0.7
        : a.type === 'lights'
          ? a.currentDailyHours * 0.8
          : a.proposedDailyHours,
  },
  {
    id: 'vacation',
    name: 'Away mode',
    description: 'Weekend-away baseline: only the loads that must stay on.',
    apply: (a) =>
      ({ fridge: 24, lights: 3, fan: 6, tv: 2, water_heater: 0.8, ac: 3, washing_machine: 0.5 })[a.type] ??
      a.proposedDailyHours,
  },
  {
    id: 'reset',
    name: 'Reset baseline',
    description: 'Put every appliance back to how you use it today.',
    apply: (a) => a.currentDailyHours,
  },
]

const _round3 = (v) => Math.round(v * 1000) / 1000

/**
 * Predictor input presets.
 *
 * These are deliberately *declarative* rather than hard-coded value lists.
 * A baked-in array of consumption numbers is a liability: it cannot be
 * checked against the dataset, so it silently goes stale the moment the
 * data, the split or the feature engineering changes. Instead each preset
 * names a window and the Predictor resolves it from the API:
 *
 *   source: 'testSplit' -> the real 30 days before the held-out split begins
 *   source: 'tail'      -> the 30 most recent recorded days
 *
 * `scale` multiplies the resolved window to model a different duty cycle.
 * `dateOffsetDays` moves the target date off the resolved window's end.
 */
export const PREDICTOR_PRESETS = [
  {
    id: 'benchmark',
    name: 'Held-out test window',
    hint: 'The real 30 days before the held-out test split begins — the window the reported metrics were measured against',
    source: 'testSplit',
  },
  {
    id: 'history',
    name: 'Latest recorded history',
    hint: 'The 30 most recent recorded days',
    source: 'tail',
  },
  {
    id: 'summer',
    name: 'Summer peak',
    hint: 'Test window scaled 1.55x for a hot-weather duty cycle',
    source: 'testSplit',
    scale: 1.55,
    dateOffsetDays: 30,
  },
  {
    id: 'eco',
    name: 'Efficient home',
    hint: 'Test window scaled 0.6x for an efficient household',
    source: 'testSplit',
    scale: 0.6,
    dateOffsetDays: -90,
  },
]

export const RECOMMENDATIONS = [
  {
    id: 'rec-ac-hours',
    category: 'Cooling',
    title: 'Run the AC one hour less, one degree higher',
    description:
      'Every extra hour of compressor run adds roughly 45 kWh a month. Pairing it with a 24°C setpoint is the cheapest comfort trade most households never make.',
    monthlySavingsKwh: 45,
    impact: 'High',
    difficulty: 'Very Easy',
    action: 'Thermostat at 24°C · 6.5 h/day',
    targetType: 'ac',
    targetHours: 6,
  },
  {
    id: 'rec-geyser',
    category: 'Heating',
    title: 'Timer-limit the geyser to 45 minutes',
    description:
      'Geysers left on after the bath reheat continuously. A hard cutoff at 45 minutes removes the recovery cycles that quietly cost the most.',
    monthlySavingsKwh: 48,
    impact: 'High',
    difficulty: 'Very Easy',
    action: 'Timer cutoff · 1.2 h/day',
    targetType: 'water_heater',
    targetHours: 1.2,
  },
  {
    id: 'rec-standby',
    category: 'Standby',
    title: 'Cut phantom standby load',
    description:
      'Screens, set-top boxes and chargers idle at 20–40 W each. A switched smart strip for the media wall removes the draw completely when you are not watching.',
    monthlySavingsKwh: 24,
    impact: 'Medium',
    difficulty: 'Very Easy',
    action: 'Smart strip · TV 3.5 h/day',
    targetType: 'tv',
    targetHours: 3.5,
  },
  {
    id: 'rec-laundry',
    category: 'Appliances',
    title: 'Batch laundry into full loads',
    description:
      'Partial cycles waste the motor and heater warm-up. Four full loads a week instead of seven partial ones removes most of that waste.',
    monthlySavingsKwh: 15,
    impact: 'Medium',
    difficulty: 'Easy',
    action: '4 full loads / week',
    targetType: 'washing_machine',
    targetHours: 1,
  },
  {
    id: 'rec-fans',
    category: 'Cooling',
    title: 'Run fans on step 3, not step 5',
    description:
      'Ceiling fans on lower speed settings draw noticeably less power. Running fans at a reduced setting and switching to BLDC models where possible can reduce fan energy meaningfully.',
    monthlySavingsKwh: 36,
    impact: 'Medium',
    difficulty: 'Easy',
    action: 'Step 3 · 9 h/day',
    targetType: 'fan',
    targetHours: 9,
  },
  {
    id: 'rec-fridge',
    category: 'Appliances',
    title: 'Service the fridge seals and coils',
    description:
      'A dusty condenser or a tired gasket can add 25% to compressor runtime. Ninety seconds of cleaning and a 3°C setpoint recovers most of it.',
    monthlySavingsKwh: 32,
    impact: 'Medium',
    difficulty: 'Medium',
    action: 'Clean coils · 3°C setpoint',
    targetType: 'fridge',
    targetHours: 24,
  },
  {
    id: 'rec-lighting',
    category: 'Lighting',
    title: 'Switch the house to LED only',
    description:
      'Residual incandescent and halogen fittings cost three to five times an LED for identical lumens. A whole-home sweep saves 18 kWh a month and drops cooling load.',
    monthlySavingsKwh: 18,
    impact: 'Low',
    difficulty: 'Medium',
    action: 'LED only · 4.5 h/day',
    targetType: 'lights',
    targetHours: 4.5,
  },
  {
    id: 'rec-scheduling',
    category: 'Timing',
    title: 'Shift heavy loads to off-peak daytime hours',
    description:
      'Running heavy loads like water heating and washing machines during off-peak hours is good practice. WattWise models a flat tariff, so the saving here is primarily about spreading demand and building a consistent habit.',
    monthlySavingsKwh: 28,
    impact: 'Medium',
    difficulty: 'Easy',
    action: 'Shift heavy loads to daytime',
    targetType: 'washing_machine',
    targetHours: 1.5,
  },
]

export const RECOMMENDATION_CATEGORIES = ['All', 'Cooling', 'Heating', 'Appliances', 'Standby', 'Lighting', 'Timing']

/**
 * Build-time snapshot of the published metrics.
 *
 * Only ever used to keep the Models page renderable when the API is
 * unreachable. `modelsPage` labels these numbers as an offline snapshot so a
 * stale figure is never presented as if it came from the running model.
 * Prefer `useModelInfo()`.
 */
export const MODEL_FALLBACK = {
  model: 'Random Forest V2',
  model_type: 'RandomForestRegressor',
  test_mae_kwh: 4.0028,
  test_rmse_kwh: 5.5234,
  test_r2: 0.4584,
  features: 26,
  isOfflineSnapshot: true,
}

/**
 * The model lineup. Prose only.
 *
 * Metric *numbers* are intentionally absent: they live in the API's
 * `/model-info` payload and would go stale if duplicated here. Each entry
 * names the model to look up, and `ModelsPage` renders a dash plus
 * "unavailable offline" when the API has no row for it.
 */
export const MODEL_STACK = [
  {
    id: 'rf',
    lookup: 'Random Forest V2',
    name: 'Random Forest V2',
    role: 'Production regressor',
    tone: 'brand',
    blurb: 'Supervised regression model with 400 decision trees over 26 engineered temporal features. Lowest MAE, calibrated for daily kWh forecasting. Uses a chronological train/test split to avoid data leakage.',
    regressor: true,
  },
  {
    id: 'xgb',
    lookup: 'XGBoost V2',
    name: 'XGBoost V2',
    role: 'Gradient-boosting benchmark',
    tone: 'accent',
    blurb: 'Supervised gradient-boosted regression model with 700 trees and the same feature set. Slightly worse MAE but sharper on recency — useful as a sanity check. Trained on the same chronological split.',
    regressor: true,
  },
  {
    id: 'if',
    lookup: 'Isolation Forest',
    name: 'Isolation Forest V2',
    role: 'Unsupervised anomaly detector',
    tone: 'warn',
    blurb: 'Unsupervised anomaly detection model using random-split isolation over the multivariate feature space, fit at 2% contamination. Flags unusual consumption days that require fewer splits to isolate from the rest of the data.',
    regressor: false,
  },
  {
    id: 'kmeans',
    lookup: 'K-Means V2',
    name: 'K-Means V2',
    role: 'Usage pattern segmentation',
    tone: 'info',
    blurb: 'Unsupervised clustering model that segments standardised daily consumption into two statistically distinct patterns in the historical dataset. These are not household classifications — they describe recurring consumption modes observed across the dataset.',
    regressor: false,
  },
]

export const FEATURE_GROUPS = [
  { key: 'calendar', label: 'Calendar', features: ['year', 'month', 'day', 'day_of_week', 'day_of_year', 'week_of_year', 'quarter', 'is_weekend', 'season'] },
  { key: 'lags', label: 'Lags', features: ['lag_1', 'lag_2', 'lag_3', 'lag_7', 'lag_14', 'lag_21', 'lag_30'] },
  { key: 'rolling', label: 'Rolling windows', features: ['rolling_mean_3', 'rolling_mean_7', 'rolling_mean_14', 'rolling_mean_30'] },
  { key: 'volatility', label: 'Volatility', features: ['rolling_std_3', 'rolling_std_7', 'rolling_std_14', 'rolling_std_30'] },
  { key: 'ewm', label: 'Exponentially weighted', features: ['ewm_7', 'ewm_30'] },
]

export const FEATURE_DESCRIPTIONS = {
  year: 'Calendar year of the target day',
  month: 'Calendar month (1–12)',
  day: 'Day of month',
  day_of_week: 'Weekday index (Mon = 0)',
  day_of_year: 'Ordinal day of year — captures seasonality',
  week_of_year: 'ISO week number',
  quarter: 'Calendar quarter',
  is_weekend: '1 for Saturday and Sunday',
  season: '0 winter · 1 spring · 2 summer · 3 autumn',
  lag_1: 'Consumption 1 day before target',
  lag_2: 'Consumption 2 days before target',
  lag_3: 'Consumption 3 days before target',
  lag_7: 'Consumption 7 days before target (week-over-week)',
  lag_14: 'Consumption 14 days before target',
  lag_21: 'Consumption 21 days before target',
  lag_30: 'Consumption 30 days before target',
  rolling_mean_3: 'Mean of the last 3 days',
  rolling_mean_7: 'Mean of the last 7 days — the baseline band',
  rolling_mean_14: 'Mean of the last 14 days',
  rolling_mean_30: 'Mean of the last 30 days',
  rolling_std_3: 'Volatility of the last 3 days',
  rolling_std_7: 'Volatility of the last 7 days',
  rolling_std_14: 'Volatility of the last 14 days',
  rolling_std_30: 'Volatility of the last 30 days',
  ewm_7: 'Exponentially weighted mean, 7-day span',
  ewm_30: 'Exponentially weighted mean, 30-day span',
}

export const CO2_KG_PER_KWH = 0.79
export { Zap }