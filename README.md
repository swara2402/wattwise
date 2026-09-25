# WattWise AI

Smarter Energy. Lower Bills. AI-powered electricity management, bill prediction, anomaly detection, and What-If savings simulator.

## Project Architecture

- **`web/`**: React 19 + Vite + Tailwind CSS v4 dashboard (`npm run dev`)
- **`WattWise-AI/`**: Machine Learning Pipeline & FastAPI backend (`src/api.py`)

The dashboard is a pure client — it holds no model logic. Every number it shows comes from the
FastAPI service over JSON.

## Running Locally

Both processes are needed: the UI is useless without the API behind it.

### 1. Start the Python AI Backend
```bash
./start-backend.sh            # works from any directory -> http://127.0.0.1:8000
PORT=9000 ./start-backend.sh  # custom port
```

Equivalent to running it by hand:
```bash
cd WattWise-AI
python -m uvicorn src.api:app --reload --port 8000
```

Note the `cd` — `src` lives under `WattWise-AI/`, so launching from the repo root fails with
`ModuleNotFoundError: No module named 'src'`. The script handles that for you, and refuses to
start if the port is already taken instead of throwing `Address already in use`.

### 2. Launch the React Dashboard
```bash
cd web
npm install
npm run dev      # http://localhost:5173
```

The API base URL defaults to `http://127.0.0.1:8000`. Point it somewhere else with a `.env` file:

```
VITE_API_URL=http://192.168.1.20:8000
```

If the backend is unreachable the UI stays usable: it shows an offline banner, keeps your
household plans in local storage, and falls back to a clearly-labelled local estimate.

### Production build
```bash
cd web
npm run build     # -> web/dist
npm run preview   # serve the build on http://localhost:4173
```

Because routing is client-side, a static host must rewrite unknown paths to `index.html`
(`vite preview` already does this).

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness + loaded model name and feature count |
| `GET /model-info` | Held-out MAE, RMSE, R² |
| `GET /model-analytics` | Feature importance, model comparison, clusters |
| `GET /historical-data?limit=N` | Daily kWh series |
| `GET /anomalies` | Isolation Forest outliers with rolling stats |
| `POST /predict` | 30 daily kWh values + target date → predicted kWh |
| `POST /predict-bill` | Predicted kWh + tariff → estimated bill |

`POST /predict` rebuilds lagged and rolling features from the historical series, so the target
date must fall inside the dataset window (2006-12-16 – 2010-11-26).
