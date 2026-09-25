import {
  Bot,
  ChartNoAxesCombined,
  Gauge,
  Home,
  LineChart,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Wallet,
  Workflow,
} from 'lucide-react'

export const NAV_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        to: '/',
        label: 'Home',
        icon: Home,
        description: 'Live telemetry, platform benchmarks and product tour',
        keywords: 'landing overview start intro',
      },
      {
        to: '/dashboard',
        label: 'Dashboard',
        icon: Gauge,
        description: 'Household KPIs, trend charts and alerts',
        keywords: 'kpi usage cost bill trend summary',
      },
    ],
  },
  {
    id: 'analyse',
    label: 'Analyse',
    items: [
      {
        to: '/analytics',
        label: 'Analytics',
        icon: LineChart,
        description: 'Consumption patterns, weekday load and distribution',
        keywords: 'charts usage weekday month heatmap export',
      },
      {
        to: '/waste',
        label: 'Waste Detection',
        icon: TriangleAlert,
        description: 'Isolation Forest outliers with root-cause explanations',
        keywords: 'anomaly outlier isolation forest waste spike',
      },
    ],
  },
  {
    id: 'act',
    label: 'Act',
    items: [
      {
        to: '/simulator',
        label: 'What-If Simulator',
        icon: SlidersHorizontal,
        description: 'Drag appliance duty cycles and watch savings land',
        keywords: 'savings plan preset scenario compare appliances',
        badge: 'USP',
      },
      {
        to: '/predictor',
        label: 'Bill Predictor',
        icon: Wallet,
        description: 'Random Forest daily kWh and bill forecast',
        keywords: 'predict forecast ml random forest 30 days',
      },
      {
        to: '/advisor',
        label: 'AI Advisor',
        icon: Sparkles,
        description: 'Prioritised savings actions you can apply in one click',
        keywords: 'recommendations tips save advice',
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        to: '/models',
        label: 'ML Lab',
        icon: Workflow,
        description: 'Model benchmarks, feature importance and clusters',
        keywords: 'models rf xgboost isolation kmeans features lab',
        badge: 'AI Lab',
      },
      {
        to: '/settings',
        label: 'Settings',
        icon: SettingsIcon,
        description: 'Household profile, tariff, data and appearance',
        keywords: 'profile tariff currency household reset export',
      },
    ],
  },
]

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.label })),
)

export const COMMAND_ACTIONS = [
  {
    id: 'run-prediction',
    label: 'Run a bill prediction',
    to: '/predictor',
    icon: Wallet,
    keywords: 'forecast predict bill ml',
  },
  {
    id: 'open-simulator',
    label: 'Tune appliances in the simulator',
    to: '/simulator',
    icon: SlidersHorizontal,
    keywords: 'savings what if sliders',
  },
  {
    id: 'review-anomalies',
    label: 'Review detected anomalies',
    to: '/waste',
    icon: TriangleAlert,
    keywords: 'waste spikes outliers',
  },
  {
    id: 'advisor-actions',
    label: 'See AI advisor actions',
    to: '/advisor',
    icon: Sparkles,
    keywords: 'recommendations tips',
  },
  {
    id: 'export-report',
    label: 'Export a CSV energy report',
    to: '/analytics',
    icon: ChartNoAxesCombined,
    keywords: 'download csv export data report',
  },
  {
    id: 'ask-advisor-bot',
    label: 'How the models work',
    to: '/models',
    icon: Bot,
    keywords: 'ml explanation metrics mae rmse r2',
  },
]
