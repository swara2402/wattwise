import {
  BookOpen,
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
    label: 'Home',
    items: [
      {
        to: '/',
        label: 'Welcome',
        icon: Home,
        description: 'Get started with your energy dashboard',
        keywords: 'landing overview start intro',
      },
      {
        to: '/dashboard',
        label: 'My Dashboard',
        icon: Gauge,
        description: 'See your energy use, costs and important alerts',
        keywords: 'usage cost bill trend summary',
      },
    ],
  },
  {
    id: 'analyse',
    label: 'Track Usage',
    items: [
      {
        to: '/analytics',
        label: 'Usage Charts',
        icon: LineChart,
        description: 'View your daily, weekly and monthly energy patterns',
        keywords: 'charts usage weekday month heatmap export',
      },
      {
        to: '/anomalies-excess',
        label: 'Unusual Usage',
        icon: TriangleAlert,
        description: 'See when you used more energy than normal',
        keywords: 'waste spikes outliers unusual usage',
      },
    ],
  },
  {
    id: 'act',
    label: 'Save Money',
    items: [
      {
        to: '/simulator',
        label: 'Savings Calculator',
        icon: SlidersHorizontal,
        description: 'See how much you can save by changing appliance use',
        keywords: 'savings plan preset scenario compare appliances',
      },
      {
        to: '/predictor',
        label: 'Bill Calculator',
        icon: Wallet,
        description: 'Estimate your future energy bills',
        keywords: 'predict forecast bill cost estimate',
      },
      {
        to: '/advisor',
        label: 'Energy Tips',
        icon: Sparkles,
        description: 'Get simple tips to lower your energy use',
        keywords: 'recommendations tips save advice energy',
      },
    ],
  },
  {
    id: 'system',
    label: 'Settings',
    items: [
      {
        to: '/settings',
        label: 'My Settings',
        icon: SettingsIcon,
        description: 'Update your profile, billing and account preferences',
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
    label: 'Calculate future bills',
    to: '/predictor',
    icon: Wallet,
    keywords: 'bill calculate estimate',
  },
  {
    id: 'open-simulator',
    label: 'See how to save money',
    to: '/simulator',
    icon: SlidersHorizontal,
    keywords: 'savings calculator save',
  },
  {
    id: 'review-anomalies',
    label: 'Check unusual usage',
    to: '/anomalies-excess',
    icon: TriangleAlert,
    keywords: 'spikes unusual waste',
  },
  {
    id: 'advisor-actions',
    label: 'Get energy saving tips',
    to: '/advisor',
    icon: Sparkles,
    keywords: 'tips recommendations save',
  },
  {
    id: 'export-report',
    label: 'Download your energy data',
    to: '/analytics',
    icon: ChartNoAxesCombined,
    keywords: 'download export data report',
  },
]