
import math
from datetime import datetime, timezone


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two GPS coordinates in metres."""

    earth_radius = 6371000

    lat1, lon1, lat2, lon2 = map(
        math.radians, [lat1, lon1, lat2, lon2]
    )

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )

    return earth_radius * 2 * math.atan2(
        math.sqrt(a), math.sqrt(1 - a)
    )


def calculate_route_safety(route_points, reports, current_hour=None):
    """
    Estimate route safety using nearby reports.

    route_points: list of [latitude, longitude]
    reports: list of dictionaries containing:
        latitude, longitude, severity, type, timestamp
    """

    if current_hour is None:
        current_hour = datetime.now().hour

    risk = 0
    nearby_count = 0

    severity_weights = {
        "low": 5,
        "medium": 12,
        "high": 20
    }

    for report in reports:
        nearest_distance = min(
            haversine_distance(
                point[0], point[1],
                report["latitude"], report["longitude"]
            )
            for point in route_points
        )

        # Consider reports within 500 metres
        if nearest_distance <= 500:
            nearby_count += 1

            severity = report.get("severity", "medium").lower()
            weight = severity_weights.get(severity, 12)

            # Nearby reports have a stronger effect
            distance_factor = 1 - (nearest_distance / 500)

            # Older reports have a reduced effect
            age_factor = 1.0
            timestamp = report.get("timestamp")

            if timestamp:
                try:
                    report_time = datetime.fromisoformat(
                        timestamp.replace("Z", "+00:00")
                    )

                    if report_time.tzinfo is None:
                        report_time = report_time.replace(
                            tzinfo=timezone.utc
                        )

                    age_days = max(
                        0,
                        (datetime.now(timezone.utc) - report_time)
                        .total_seconds() / 86400
                    )

                    age_factor = max(0.25, 1 - age_days / 30)

                except (ValueError, TypeError):
                    pass

            risk += weight * distance_factor * age_factor

    # Night-time adjustment
    night_penalty = 15 if current_hour >= 19 or current_hour < 6 else 0

    total_risk = min(100, risk + night_penalty)
    safety_score = round(100 - total_risk)

    return {
        "safety_score": safety_score,
        "nearby_reports": nearby_count,
        "time_period": "night" if night_penalty else "day",
        "confidence": (
            "low" if nearby_count < 3
            else "moderate" if nearby_count < 10
            else "higher"
        ),
        "message": (
            "Estimated score based on available reports. "
            "This is not a guarantee of personal safety."
        )
    }
