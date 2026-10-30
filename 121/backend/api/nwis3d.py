from fastapi import APIRouter
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
