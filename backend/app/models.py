from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.database import Base


class SafetyReport(Base):
    __tablename__ = "safety_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String(100), nullable=False)
    description = Column(String(500))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    severity = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())