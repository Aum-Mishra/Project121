from backend.database import engine, Base, SessionLocal
from backend.models import Employee, Asset, Inspection

# Create tables
Base.metadata.create_all(bind=engine)

def seed_db():
    db = SessionLocal()
    
    # Check if empty
    if db.query(Employee).count() == 0:
        db.add_all([
            Employee(employee_id="APEL0005", name="John Doe", department="Maintenance", role="Technician", leave_balance=14.5),
            Employee(employee_id="APEL0006", name="Jane Smith", department="HR", role="Manager", leave_balance=21.0),
        ])
        
    if db.query(Asset).count() == 0:
        db.add_all([
            Asset(asset_id="P-102", name="Centrifugal Pump 102", category="Rotating", operating_pressure=42.0, max_pressure=35.0),
        ])
        
    if db.query(Inspection).count() == 0:
        db.add_all([
            Inspection(asset_id="P-102", year=2024, pressure=34.0, corrosion=1.2, vibration=4.1, verdict="OK"),
            Inspection(asset_id="P-102", year=2025, pressure=37.0, corrosion=2.4, vibration=5.3, verdict="Watch"),
            Inspection(asset_id="P-102", year=2026, pressure=42.0, corrosion=3.8, vibration=7.2, verdict="Critical"),
        ])
        
    db.commit()
    db.close()
    print("Database initialized and seeded.")

if __name__ == "__main__":
    seed_db()
