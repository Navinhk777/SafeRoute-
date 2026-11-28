// Talks to the SafeRoute scoring backend (the /score-route endpoint).
import { samplePoints } from "./geo";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// Until real community reports exist, the app can use clearly-labelled DEMO reports
// so the scoring can be shown working. Set VITE_USE_DEMO_REPORTS=false to turn this off.
export const USING_DEMO_REPORTS = import.meta.env.VITE_USE_DEMO_REPORTS !== "false";

// DEMO DATA ONLY. These are NOT real incidents or real reports.
// [latitude, longitude, severity, type, age in days]
const DEMO = [
  [12.9774, 77.5726, "high", "dark spot", 3],
  [12.9768, 77.5702, "medium", "isolated", 8],
  [12.9255, 77.5468, "medium", "dark spot", 5],
  [12.9262, 77.5441, "high", "isolated", 2],
  [12.9177, 77.4833, "high", "dark spot", 4],
  [12.9190, 77.4870, "medium", "dark spot", 11],
  [12.9025, 77.5175, "low", "dark spot", 6],
  [12.9040, 77.5120, "medium", "isolated", 9],
  [12.9308, 77.5838, "low", "dark spot", 14],
  [12.9352, 77.6245, "medium", "isolated", 7],
  [12.9756, 77.6068, "low", "dark spot", 10],
  [12.9916, 77.5521, "medium", "dark spot", 1],
  [13.0035, 77.5710, "high", "isolated", 12],
  [13.0285, 77.5409, "medium", "dark spot", 20],
];

export function demoReports() {
  const now = Date.now();
  return DEMO.map(([latitude, longitude, severity, type, days]) => ({
    latitude,
    longitude,
    severity,
    type,
    timestamp: new Date(now - days * 86400000).toISOString(),
  }));
}

// Ask the backend to score one route. `coords` are [lng, lat]; the backend wants [lat, lng].
export async function scoreRoute(coords, reports) {
  const response = await fetch(`${BACKEND}/score-route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route_points: samplePoints(coords, 150).map(([lng, lat]) => [lat, lng]),
      reports,
      current_hour: new Date().getHours(),
    }),
  });
  if (!response.ok) throw new Error(`Scoring failed (${response.status})`);
  return response.json();
}

// Score every route. Returns an array with a result object or null for each route.
export async function scoreAll(routes) {
  const reports = USING_DEMO_REPORTS ? demoReports() : [];
  const results = await Promise.allSettled(routes.map((r) => scoreRoute(r.coords, reports)));
  if (results.every((r) => r.status === "rejected")) throw new Error("Scoring service unavailable");
  return results.map((r) => (r.status === "fulfilled" ? r.value : null));
}
