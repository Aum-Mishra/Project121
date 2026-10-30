from models.nwis3d_models import Well, Formation, Event, Evidence

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
