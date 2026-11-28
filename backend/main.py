from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File, HTTPException
from darkspot_ai import assess_dark_spot
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional

from safety_scoring import calculate_route_safety

app = FastAPI(
    title="SafeRoute AI Safety API",
    description="Route safety scoring service",
    version="1.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Report(BaseModel):
    latitude: float
    longitude: float
    severity: str = "medium"
    type: str = "general"
    timestamp: Optional[str] = None


class RouteRequest(BaseModel):
    route_points: List[List[float]]
    reports: List[Report] = []
    current_hour: Optional[int] = None


@app.get("/")
def home():
    return {
        "message": "SafeRoute Safety API is running!"
    }


@app.post("/score-route")
def score_route(request: RouteRequest):

    reports = [
        report.model_dump()
        for report in request.reports
    ]

    result = calculate_route_safety(
        route_points=request.route_points,
        reports=reports,
        current_hour=request.current_hour
    )

    return result


@app.post("/assess-dark-spot")
async def assess_dark_spot_endpoint(file: UploadFile = File(...)):
    allowed_types = ["image/jpeg", "image/png", "image/webp"]

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Upload JPG, PNG or WEBP only."
        )

    image_bytes = await file.read()

    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image must be smaller than 8 MB."
        )

    try:
        result = assess_dark_spot(image_bytes)
        return result

    except Exception as error:
        print("DARKSPOT AI ERROR:", repr(error))

        raise HTTPException(
            status_code=502,
            detail="Photo assessment failed. Check backend terminal."
        )
