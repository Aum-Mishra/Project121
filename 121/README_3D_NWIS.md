# NWIS 3D SUBSURFACE INTELLIGENCE & HISTORICAL WELL REPLAY SIMULATOR

## What this simulator is
This is a local-first 3D simulation prototype for the Oil India Limited (OIL) Nearby Wells Intelligence System (NWIS). It visualizes a current well together with historical wells, subsurface formation intervals, drilling events, depth correlation, historical evidence, comparable wells, data-quality information, and a time/depth-based simulation.

**NOTE:** This uses SYNTHETIC DEMONSTRATION DATA. It does NOT use real OIL operational data.

## Architecture
- **Frontend**: React, Three.js (React Three Fiber, Drei), Vite
- **Backend**: FastAPI, Uvicorn, Python
- **API**: REST APIs for initial data fetch (Websockets support can be added)

## Prerequisites
- Node.js (v18+)
- Python (3.10+)

## Installation / Setup
Run the automatic setup script:
`./setup_nwis_3d.sh`

## Running the Simulator
Start the simulator using:
`./start_nwis_3d.sh`

The backend runs on `http://localhost:8000`
The frontend runs on `http://localhost:5173` (or depending on Vite allocation).

To stop the simulator:
`./stop_nwis_3d.sh`

## API Documentation
- `GET /api/nwis3d/wells` - Get all wells
- `GET /api/nwis3d/formations` - Get all formations
- `GET /api/nwis3d/events` - Get historical events
- `GET /api/nwis3d/evidence/{event_id}` - Get evidence for a specific event

## How to connect real data later
The current architecture uses hardcoded synthetic data in `backend/services/simulation_engine.py`. To connect to real data, you will implement an `OILDataProvider` class that interacts with real databases (e.g., PostgreSQL/PostGIS) and replaces the synthetic data functions in `simulation_engine.py`. This step requires OIL-approved integration and data access.

## Safety/data-integrity limitations
This is a decision-support visualization. It must NOT control drilling equipment, send commands to rigs, or automatically change drilling parameters. All abnormal patterns flagged are suggestions for engineer review, not confirmed drilling failures.
