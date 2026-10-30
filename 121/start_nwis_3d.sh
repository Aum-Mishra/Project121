#!/bin/bash
echo "Starting NWIS 3D Subsurface Intelligence Simulator..."

# Start Backend
cd backend
source ../.venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Start Frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "Backend running on PID $BACKEND_PID"
echo "Frontend running on PID $FRONTEND_PID"

wait
