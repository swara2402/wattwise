# WattWise AI — Dashboard

React 19 + Vite + Tailwind CSS v4 front end for the WattWise FastAPI service.
The backend lives in `../WattWise-AI` and must be running for live data.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production bundle -> dist/
npm run preview   # serve the build on http://localhost:4173
npm run lint      # oxlint
```

Set `VITE_API_URL` (see `.env.example`) to point at a backend on another host.
Defaults to `http://127.0.0.1:8000`.

## Layout

```
src/
  App.jsx              provider + router (routes are lazy-loaded)
  navigation.js        sidebar sections and command-palette entries
  context/AppContext   theme, settings, appliances, scenarios, toasts, health poll
  hooks/
    useResource        fetch + module-level cache, TTL, retry
    useEnergyData      typed wrappers for each backend endpoint
    useUi              media query, debounce, scroll lock, count-up
  lib/
    api.js             fetch client — timeouts, abort, normalised FastAPI errors
    energy.js          all energy maths (savings, anomalies, windows, metrics)
    constants.js       appliance types, presets, recommendations, model metadata
    format.js          number, currency and date formatting
    files.js           CSV parse/serialise, download, file picker
    storage.js         localStorage helpers and debounced persistence
  components/
    layout/            AppShell, Sidebar (+ mobile drawer), Topbar, offline banner
    ui/                Button, Card, Badge, Field, Modal, States
    charts/            Recharts wrappers sharing one tooltip and axis style
  pages/               Home, Dashboard, Analytics, Waste, Simulator, Predictor,
                       Advisor, Models, Settings, NotFound
```

## Conventions

- **No model logic in the client.** Every figure is derived in `lib/energy.js` or returned by
  the API, so it can be audited in one place.
- **Tailwind v4 via `@tailwindcss/vite`** — no `tailwind.config.js`. Design tokens live in
  `src/index.css` as CSS variables, mapped into Tailwind through `@theme inline`.
- **Charts share chrome.** `ChartFrame` handles title, height, empty and loading states;
  `ChartTooltip` and `axisProps` keep every plot visually identical.
- **Accessibility.** Landmarks, labelled controls, `aria-pressed` on toggles, an `inert`
  off-canvas drawer, and a visible skip link.
- **Degrade honestly.** With the backend down the UI shows an offline banner, keeps local
  state, and labels fallback numbers as estimates rather than passing them off as model output.
