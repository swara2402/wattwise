#!/usr/bin/env bash
# Start the WattWise FastAPI backend.
#
#   ./start-backend.sh            # -> http://127.0.0.1:8000
#   PORT=9000 ./start-backend.sh  # custom port
#
# Works from any directory, including the repo root: `src` lives under
# WattWise-AI/, so this script cd's there before handing off to uvicorn.

set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$script_dir/WattWise-AI"

if [ ! -d "$backend_dir" ]; then
  echo "error: $backend_dir not found." >&2
  echo "Run this script from the Electric/ repo root." >&2
  exit 1
fi

# If the port is taken, work out whether the thing holding it is already a healthy
# WattWise backend. If it is, this is a no-op success — not an error.
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  health="$(curl -s -m 3 "http://$HOST:$PORT/health" 2>/dev/null || true)"

  if printf '%s' "$health" | grep -q '"status":"healthy"'; then
    model="$(printf '%s' "$health" | sed -n 's/.*"model":"\([^"]*\)".*/\1/p')"
    pid="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)"
    echo "WattWise backend is already running on http://$HOST:$PORT (PID ${pid:-unknown})."
    echo "  health: $health"
    [ -n "$model" ] && echo "  model:  $model"
    echo
    echo "Nothing to do. To restart it, stop PID ${pid:-unknown} first:"
    echo "  kill ${pid:-<pid>}"
    exit 0
  fi

  echo "error: port $PORT is in use by something that is not a healthy WattWise backend." >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
  echo >&2
  echo "Stop that process, or use a different port:" >&2
  echo "  PORT=8001 $0" >&2
  exit 1
fi

# Pick an interpreter that actually has uvicorn installed. `python` is often missing
# from non-interactive shells (and several pythons can be on PATH), so test candidates
# rather than assuming. Override with PYTHON=/path/to/python if you need a specific one.
if [ -n "${PYTHON:-}" ]; then
  candidates=("$PYTHON")
else
  candidates=(python3 python)
  for extra in /Library/Frameworks/Python.framework/Versions/*/bin/python3 /usr/local/bin/python3 /opt/homebrew/bin/python3; do
    [ -x "$extra" ] && candidates+=("$extra")
  done
fi

py=""
for candidate in "${candidates[@]}"; do
  if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then
    if "$candidate" -c "import uvicorn, sklearn, pandas" >/dev/null 2>&1; then
      py="$candidate"
      break
    fi
  fi
done

if [ -z "$py" ]; then
  echo "error: no Python with uvicorn, scikit-learn and pandas found." >&2
  echo "Install the backend requirements first:" >&2
  echo "  cd $backend_dir && pip install -r requirements.txt" >&2
  echo "Then re-run, optionally forcing an interpreter: PYTHON=/path/to/python $0" >&2
  exit 1
fi

echo "Starting WattWise API on http://$HOST:$PORT  (using $py)"
cd "$backend_dir"
exec "$py" -m uvicorn src.api:app --host "$HOST" --port "$PORT"
