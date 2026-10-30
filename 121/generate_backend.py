import os
import json

backend_dir = "backend"
os.makedirs(os.path.join(backend_dir, "api"), exist_ok=True)
os.makedirs(os.path.join(backend_dir, "services"), exist_ok=True)
os.makedirs(os.path.join(backend_dir, "models"), exist_ok=True)

# Generate main.py
with open(os.path.join(backend_dir, "main.py"), "w") as f:
    f.write('''from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import nwis3d

app = FastAPI(title="NWIS 3D API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nwis3d.router, prefix="/api/nwis3d")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "NWIS 3D Simulator API"}
''')

# Generate api/nwis3d.py
with open(os.path.join(backend_dir, "api", "nwis3d.py"), "w") as f:
    f.write('''from fastapi import APIRouter
from typing import List, Dict, Any
from models.nwis3d_models import Well, Formation, Event, Evidence
from services.simulation_engine import get_wells, get_formations, get_events, get_evidence

router = APIRouter()

@router.get("/wells", response_model=List[Well])
def get_all_wells():
    return get_wells()

@router.get("/formations", response_model=List[Formation])
def get_all_formations():
    return get_formations()

@router.get("/events", response_model=List[Event])
def get_all_events():
    return get_events()

@router.get("/evidence/{event_id}", response_model=List[Evidence])
def get_event_evidence(event_id: str):
    return get_evidence(event_id)
''')

# Generate models
with open(os.path.join(backend_dir, "models", "nwis3d_models.py"), "w") as f:
    f.write('''from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class Point(BaseModel):
    md: float
    x: float
    y: float
    z: float

class Well(BaseModel):
    well_id: str
    is_current: bool
    trajectory: List[Point]

class Formation(BaseModel):
    name: str
    top: float
    bottom: float
    color: str

class Event(BaseModel):
    event_id: str
    well_id: str
    event_type: str
    depth: float
    formation: str
    severity: str
    description: str

class Evidence(BaseModel):
    evidence_id: str
    event_id: str
    source: str
    page: int
    passage: str
''')

# Generate services
with open(os.path.join(backend_dir, "services", "simulation_engine.py"), "w") as f:
    f.write('''from models.nwis3d_models import Well, Formation, Event, Evidence

# Synthetic Data
wells = [
    Well(well_id="DEMO-W001", is_current=True, trajectory=[{"md": 0, "x": 0, "y": 0, "z": 0}, {"md": 3000, "x": 0, "y": 0, "z": -3000}]),
    Well(well_id="DEMO-W002", is_current=False, trajectory=[{"md": 0, "x": 50, "y": 50, "z": 0}, {"md": 3000, "x": 50, "y": 50, "z": -3000}]),
    Well(well_id="DEMO-W003", is_current=False, trajectory=[{"md": 0, "x": -50, "y": -50, "z": 0}, {"md": 3000, "x": -50, "y": -50, "z": -3000}]),
]

formations = [
    Formation(name="Formation A", top=0, bottom=1000, color="#ff9999"),
    Formation(name="Formation B", top=1000, bottom=2000, color="#99ff99"),
    Formation(name="Formation C", top=2000, bottom=3000, color="#9999ff"),
]

events = [
    Event(event_id="EVT-001", well_id="DEMO-W002", event_type="Mud Loss", depth=1500, formation="Formation B", severity="high", description="Synthetic mud loss demonstration"),
    Event(event_id="EVT-002", well_id="DEMO-W003", event_type="Stuck Pipe", depth=2500, formation="Formation C", severity="medium", description="Synthetic stuck pipe demonstration"),
]

evidence = [
    Evidence(evidence_id="EVD-001", event_id="EVT-001", source="Synthetic_Report_W002.pdf", page=5, passage="Recorded mud loss at 1500m..."),
    Evidence(evidence_id="EVD-002", event_id="EVT-002", source="Synthetic_Report_W003.pdf", page=12, passage="Drill pipe stuck at 2500m..."),
]

def get_wells(): return wells
def get_formations(): return formations
def get_events(): return events
def get_evidence(event_id: str): return [e for e in evidence if e.event_id == event_id]
''')

print("Backend files generated.")
