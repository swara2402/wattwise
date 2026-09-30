import {
  Gauge,
  LineChart,
  TriangleAlert,
  SlidersHorizontal,
  Wallet,
  Sparkles,
  Settings as SettingsIcon,
  FlaskConical,
  TrendingUp,
  ChartNoAxesCombined,
} from 'lucide-react'

export const NAV_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        to: '/dashboard',
        label: 'My Home',
        icon: Gauge,
        description: 'Your energy at a glance — usage, bill estimate, and status',
        keywords: 'home overview usage cost bill summary dashboard',
      },
    ],
  },
  {
    id: 'track',
    label: 'Track & Understand',
    items: [
      {
        to: '/analytics',
        label: 'My Usage',
        icon: LineChart,
        description: 'See how your electricity use changes day to day and month to month',
        keywords: 'usage charts history trends weekday month heatmap',
      },
      {
        to: '/anomalies-excess',
        label: 'Unusual Days',
        icon: TriangleAlert,
        description: 'Find days when your electricity use was much higher than usual',
        keywords: 'unusual usage anomalies spikes excess high',
      },
    ],
  },
  {
    id: 'act',
    label: 'Save Money',
    items: [
      {
        to: '/predictor',
        label: 'Forecast Usage',
        icon: TrendingUp,
        description: 'Estimate how much electricity you will use and what your bill might be',
        keywords: 'predict forecast usage bill cost estimate future',
      },
      {
        to: '/simulator',
        label: 'Savings Calculator',
        icon: SlidersHorizontal,
        description: 'See how much you could save by changing how you use appliances',
        keywords: 'save savings calculator what-if appliances reduce',
      },
      {
        to: '/advisor',
        label: 'Energy Tips',
        icon: Sparkles,
        description: 'Simple tips and suggestions to lower your electricity bill',
        keywords: 'tips advice save energy recommendations reduce',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      {
        to: '/settings',
        label: 'My Settings',
        icon: SettingsIcon,
        description: 'Update your tariff, household details, and billing preferences',
        keywords: 'settings tariff household profile reset preferences',
      },
    ],
  },
  {
    id: 'technical',
    label: 'Technical Details',
    items: [
      {
        to: '/models',
        label: 'How WattWise Works',
        icon: FlaskConical,
        description: 'The AI models, data pipeline, and prediction accuracy behind WattWise',
        keywords: 'models ai machine learning pipeline technical details accuracy',
        badge: 'Tech',
      },
      {
        to: '/methodology',
        label: 'Research & Methods',
        icon: ChartNoAxesCombined,
        description: 'Academic methodology, Spark pipeline, and SMLBDA project documentation',
        keywords: 'methodology spark pipeline academic research smlbda',
        badge: 'SMLBDA',
      },
    ],
  },
]

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.label })),
)

export const COMMAND_ACTIONS = [
  { id: 'forecast-usage', label: 'Forecast my electricity usage', to: '/predictor', icon: TrendingUp, keywords: 'predict forecast usage' },
  { id: 'savings-calculator', label: 'See how much I can save', to: '/simulator', icon: SlidersHorizontal, keywords: 'save savings what-if' },
  { id: 'unusual-days', label: 'Find unusual electricity days', to: '/anomalies-excess', icon: TriangleAlert, keywords: 'unusual anomaly spike' },
  { id: 'energy-tips', label: 'Get tips to save energy', to: '/advisor', icon: Sparkles, keywords: 'tips advice recommendations' },
  { id: 'my-usage', label: 'See my usage history', to: '/analytics', icon: ChartNoAxesCombined, keywords: 'usage history charts' },
]
