// Small map-maths helpers. All coordinates are [longitude, latitude] (the order MapLibre uses).

const R = 6371000; // Earth radius in metres
const rad = (d) => (d * Math.PI) / 180;

// Distance in metres between two [lng, lat] points.
export function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Length of each segment (point i to point i+1) of a path, in metres.
export function segmentLengths(coords) {
  const lengths = [];
  for (let i = 0; i < coords.length - 1; i++) lengths.push(haversine(coords[i], coords[i + 1]));
  return lengths;
}

// Find where a point sits relative to a route.
// Returns the segment it is closest to, how far away it is (metres),
// and how far along that segment it is (0 to 1).
export function locateOnRoute(coords, point, lengths, hint = 0) {
  const cosLat = Math.cos(rad(point[1]));
  const toXY = (p) => [rad(p[0] - point[0]) * cosLat * R, rad(p[1] - point[1]) * R]; // point is the origin

  function search(from, to) {
    let best = { index: from, distance: Infinity, t: 0 };
    for (let i = from; i < to; i++) {
      const [ax, ay] = toXY(coords[i]);
      const [bx, by] = toXY(coords[i + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : (-ax * dx - ay * dy) / len2; // projection of the origin onto the segment
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const distance = Math.hypot(px, py);
      if (distance < best.distance) best = { index: i, distance, t };
    }
    return best;
  }

  const last = coords.length - 1;
  // Look near where we were last time first (avoids jumping to a far part of a looping route).
  const windowed = search(Math.max(0, hint - 15), Math.min(last, hint + 250));
  if (windowed.distance <= 100) return windowed;
  return search(0, last);
}

// Metres from the point to the end of the route, and to the end of a given vertex.
export function distanceAhead(lengths, index, t, toVertex) {
  let total = (1 - t) * (lengths[index] || 0);
  for (let i = index + 1; i < toVertex; i++) total += lengths[i] || 0;
  return total;
}

// Keep at most maxPoints points, always keeping the first and last.
export function samplePoints(coords, maxPoints = 150) {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

// Turn a path into points roughly every `spacing` metres (used for the demo walk).
export function densify(coords, spacing = 10) {
  const out = [coords[0]];
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversine(coords[i], coords[i + 1]);
    const n = Math.max(1, Math.round(d / spacing));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      out.push([
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f,
      ]);
    }
  }
  return out;
}

export function formatDistance(metres) {
  if (metres == null || Number.isNaN(metres)) return "";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}
