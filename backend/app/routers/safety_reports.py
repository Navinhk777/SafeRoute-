
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.database import SessionLocal
from app.models import SafetyReport
from app.schemas import SafetyReportCreate, SafetyReportResponse

router = APIRouter(
    prefix="/safety-reports",
    tags=["Safety Reports"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=SafetyReportResponse)
def create_safety_report(
    report: SafetyReportCreate,
    db: Session = Depends(get_db)
):
    new_report = SafetyReport(**report.model_dump())

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    return new_report


@router.get("/", response_model=List[SafetyReportResponse])
def get_safety_reports(db: Session = Depends(get_db)):
    return db.query(SafetyReport).order_by(
        SafetyReport.created_at.desc()
    ).all()
