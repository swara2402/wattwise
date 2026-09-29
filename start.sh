#!/usr/bin/env bash
# WattWise - One-click startup script for real users
# This script starts everything automatically with zero setup

echo "⚡ Starting WattWise..."
echo ""

# Check if we're in the right directory
if [ ! -f "./start-backend.sh" ] || [ ! -d "./web" ]; then
  echo "❌ Error: Please run this script from the WattWise project root"
  exit 1
fi

# Start backend in background
echo "🔧 Starting backend server..."
./start-backend.sh &
BACKEND_PID=$!

# Wait a few seconds for backend to start
sleep 3

# Start frontend
echo "🌐 Starting frontend server..."
cd web
if [ ! -f ".env.local" ]; then
  echo "📝 Creating environment file..."
  echo "VITE_API_URL=http://127.0.0.1:8000" > .env.local
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (first run only)..."
  npm install
fi

npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ WattWise is now running!"
echo ""
echo "📱 Frontend: http://localhost:5173"
echo "🔌 Backend:  http://127.0.0.1:8000"
echo ""
echo "Press Ctrl+C to stop everything"

# Cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Stopping servers..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  exit 0
}

trap cleanup INT TERM

# Wait for processes
wait