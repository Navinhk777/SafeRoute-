from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class SafetyReportCreate(BaseModel):
    report_type: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    severity: int = Field(ge=1, le=5)


class SafetyReportResponse(BaseModel):
    id: int
    report_type: str
    description: Optional[str]
    latitude: float
    longitude: float
    severity: int
    created_at: datetime

    class Config:
        from_attributes = True