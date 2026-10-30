from sqlalchemy import Column, Integer, String, Float, JSON
from .database import Base

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, unique=True, index=True)
    name = Column(String)
    department = Column(String)
    role = Column(String)
    leave_balance = Column(Float)
    metadata_json = Column(JSON, nullable=True)

class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String, unique=True, index=True)
    name = Column(String)
    category = Column(String)
    operating_pressure = Column(Float, nullable=True)
    max_pressure = Column(Float, nullable=True)
    metadata_json = Column(JSON, nullable=True)

class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String, index=True)
    year = Column(Integer)
    pressure = Column(Float)
    corrosion = Column(Float)
    vibration = Column(Float)
    verdict = Column(String)
