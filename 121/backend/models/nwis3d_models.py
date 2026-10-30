from pydantic import BaseModel
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
