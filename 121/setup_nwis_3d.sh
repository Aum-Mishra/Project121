#!/bin/bash
echo "Setting up NWIS 3D Subsurface Intelligence Simulator..."
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn pydantic numpy pandas websockets
python3 generate_backend.py
python3 generate_frontend_setup.py
python3 generate_frontend_src.py
cd frontend
npm install
cd ..
chmod +x start_nwis_3d.sh
chmod +x stop_nwis_3d.sh
echo "Setup complete. Run ./start_nwis_3d.sh to launch."
