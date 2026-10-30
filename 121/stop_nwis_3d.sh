#!/bin/bash
echo "Stopping NWIS 3D Simulator..."
pkill -f "uvicorn main:app"
pkill -f "vite"
echo "Stopped."
