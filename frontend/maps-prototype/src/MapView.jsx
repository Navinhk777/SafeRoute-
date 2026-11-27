import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { LngLatBounds, Map, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { densify, distanceAhead, locateOnRoute, segmentLengths } from "./geo";

setWorkerUrl(workerUrl);

const ORS_KEY = import.meta.env.VITE_ORS_KEY;
// OpenRouteService moved from api.openrouteservice.org to api.heigit.org.
const ORS = "https://api.heigit.org";
const BANGALORE = [77.5946, 12.9716];
const ROUTE_COLORS = ["#168b83", "#3977b7", "#7d6bb3"];
const OSM_STYLE = { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] };

// Turn a place name into [longitude, latitude].
async function geocode(text) {
  const response = await fetch(`${ORS}/pelias/v1/search?api_key=${ORS_KEY}&text=${encodeURIComponent(`${text}, Bengaluru`)}&boundary.country=IN&focus.point.lon=${BANGALORE[0]}&focus.point.lat=${BANGALORE[1]}&size=1`);
  if (!response.ok) throw new Error("Place search is unavailable right now. Please try again.");
  const data = await response.json();
  if (!data.features?.length) throw new Error(`We could not find “${text}”. Try a nearby landmark.`);
  return { coords: data.features[0].geometry.coordinates, label: data.features[0].properties.label };
}

// Ask for walking routes (up to 3). Each route comes with turn-by-turn steps.
async function getRoutes(start, end) {
  const url = `${ORS}/openrouteservice/v2/directions/foot-walking/geojson`;
  const headers = { Authorization: ORS_KEY, "Content-Type": "application/json" };
  const body = { coordinates: [start, end], alternative_routes: { target_count: 3, share_factor: 0.6, weight_factor: 1.6 } };
  let response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ coordinates: [start, end] }) });
  if (!response.ok) throw new Error("We could not calculate a route. Please try again.");
  return (await response.json()).features;
}

function liveDot() {
  const el = document.createElement("div");
  el.className = "live-dot";
  return el;
}

const MapView = forwardRef(function MapView(_, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const youRef = useRef(null);
  const routeIdsRef = useRef([]);
  const routesRef = useRef([]); // the routes currently on the map
  const watchRef = useRef(null);
  const simRef = useRef(null);
  const hintRef = useRef(0);

  useEffect(() => {
    const map = new Map({ container: containerRef.current, style: OSM_STYLE, center: BANGALORE, zoom: 11 });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;
    return () => { stopTracking(); map.remove(); };
  }, []);

  function clearRoutes() {
    const map = mapRef.current;
    routeIdsRef.current.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); });
    routeIdsRef.current = [];
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    routesRef.current = [];
  }

  // Change how each route line looks. selected = index to emphasise (or null), onlySelected hides the rest.
  function styleRoutes(selected, onlySelected = false) {
    const map = mapRef.current;
    routeIdsRef.current.forEach((id, index) => {
      if (!map.getLayer(id)) return;
      const isSelected = selected === index;
      const hide = onlySelected && selected !== null && !isSelected;
      map.setLayoutProperty(id, "visibility", hide ? "none" : "visible");
      map.setPaintProperty(id, "line-width", isSelected ? 8 : selected === null ? (index === 0 ? 7 : 5) : 4);
      map.setPaintProperty(id, "line-opacity", isSelected ? 1 : selected === null ? (index === 0 ? 0.95 : 0.65) : 0.3);
    });
    // draw the selected route on top
    if (selected !== null && map.getLayer(routeIdsRef.current[selected])) map.moveLayer(routeIdsRef.current[selected]);
  }

  function fitRoute(index) {
    const route = routesRef.current[index];
    if (!route) return;
    const bounds = new LngLatBounds();
    route.coords.forEach((c) => bounds.extend(c));
    mapRef.current.fitBounds(bounds, { padding: { top: 100, bottom: 420, left: 36, right: 36 } });
  }

  async function showRoutes(from, to, currentLocation) {
    if (!ORS_KEY) throw new Error("Map search is not configured yet. Add the route service key to continue.");
    stopTracking();
    const useCurrentLocation = from.trim() === "Your current location" && currentLocation;
    const [start, end] = await Promise.all([
      useCurrentLocation ? Promise.resolve({ coords: currentLocation, label: from }) : geocode(from),
      geocode(to),
    ]);
    const features = await getRoutes(start.coords, end.coords);
    const map = mapRef.current;
    clearRoutes();
    const bounds = new LngLatBounds();
    features.forEach((feature, index) => {
      const id = `route-${index}`;
      map.addSource(id, { type: "geojson", data: feature });
      map.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ROUTE_COLORS[index % ROUTE_COLORS.length], "line-width": index === 0 ? 7 : 5, "line-opacity": index === 0 ? 0.95 : 0.65 } });
      routeIdsRef.current.push(id);
      feature.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate));
    });
    markersRef.current.push(new Marker({ color: "#168b83" }).setLngLat(start.coords).addTo(map));
    markersRef.current.push(new Marker({ color: "#3977b7" }).setLngLat(end.coords).addTo(map));
    map.fitBounds(bounds, { padding: { top: 100, bottom: 420, left: 36, right: 36 } });

    routesRef.current = features.map((feature, index) => {
      const coords = feature.geometry.coordinates;
      const summary = feature.properties.summary;
      return {
        index,
        color: ROUTE_COLORS[index % ROUTE_COLORS.length],
        coords,
        lengths: segmentLengths(coords),
        steps: feature.properties.segments?.flatMap((segment) => segment.steps || []) || [],
        distance: summary.distance,
        duration: summary.duration,
        km: (summary.distance / 1000).toFixed(1),
        min: Math.round(summary.duration / 60),
      };
    });
    return routesRef.current.map(({ index, color, coords, km, min, distance, duration }) => ({ index, color, coords, km, min, distance, duration }));
  }

  // Preview: emphasise one route while the others fade.
  function highlightRoute(index) { styleRoutes(index, false); }
  // Show all route options again.
  function showAllRoutes() { styleRoutes(null, false); }

  function findMe(callback) {
    if (!navigator.geolocation) return callback();
    navigator.geolocation.getCurrentPosition((position) => {
      const spot = [position.coords.longitude, position.coords.latitude];
      if (youRef.current) youRef.current.remove();
      youRef.current = new Marker({ color: "#168b83" }).setLngLat(spot).addTo(mapRef.current);
      mapRef.current.flyTo({ center: spot, zoom: 15 });
      callback("Your current location", spot);
    }, () => callback());
  }

  function stopTracking() {
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (simRef.current) { clearInterval(simRef.current); simRef.current = null; }
    if (youRef.current) { youRef.current.remove(); youRef.current = null; }
    hintRef.current = 0;
  }

  // Work out where the walker is on the route and what to do next.
  function progress(route, position, accuracy) {
    const located = locateOnRoute(route.coords, position, route.lengths, hintRef.current);
    hintRef.current = located.index;
    const lastVertex = route.coords.length - 1;
    const remainingM = distanceAhead(route.lengths, located.index, located.t, lastVertex);
    const pace = route.duration > 0 ? route.distance / route.duration : 1.3; // metres per second
    const steps = route.steps;
    let stepIndex = steps.findIndex((s) => located.index >= s.way_points[0] && located.index < s.way_points[1]);
    if (stepIndex === -1) stepIndex = Math.max(0, steps.length - 1);
    const step = steps[stepIndex];
    const toNext = step ? distanceAhead(route.lengths, located.index, located.t, step.way_points[1]) : remainingM;
    return {
      position,
      accuracy,
      offRoute: located.distance > Math.max(50, (accuracy || 0) * 1.5),
      offBy: located.distance,
      step: step ? { instruction: step.instruction, distanceToNext: toNext, index: stepIndex, total: steps.length } : null,
      remaining: { m: remainingM, min: Math.max(1, Math.round(remainingM / pace / 60)) },
      arrived: remainingM < 25,
    };
  }

  // Start following the user along a route. simulate=true walks a pretend user along the route (demo).
  function startTracking(index, callback, { simulate = false } = {}) {
    const route = routesRef.current[index];
    const map = mapRef.current;
    if (!route) return;
    stopTracking();
    styleRoutes(index, true);
    fitRoute(index);

    const update = (position, accuracy) => {
      if (youRef.current) youRef.current.setLngLat(position);
      else youRef.current = new Marker({ element: liveDot() }).setLngLat(position).addTo(map);
      map.easeTo({ center: position, zoom: Math.max(map.getZoom(), 16), duration: 600 });
      callback(progress(route, position, accuracy));
    };

    if (simulate) {
      const path = densify(route.coords, 10);
      let i = 0;
      simRef.current = setInterval(() => {
        update(path[Math.min(i, path.length - 1)], 10);
        i += 5; // 50 m per tick: fast-forward
        if (i > path.length + 5) { clearInterval(simRef.current); simRef.current = null; }
      }, 500);
      return;
    }
    if (!navigator.geolocation) { callback({ error: "Location is unavailable in this browser." }); return; }
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => update([p.coords.longitude, p.coords.latitude], p.coords.accuracy),
      (error) => callback({ error: error.code === 1 ? "Location permission denied. Allow location to follow your route." : "Your location is unavailable right now." }),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  }

  // Leave the journey: stop following and show all options again.
  function endJourney() {
    stopTracking();
    styleRoutes(null, false);
    if (routesRef.current.length) {
      const bounds = new LngLatBounds();
      routesRef.current.forEach((r) => r.coords.forEach((c) => bounds.extend(c)));
      mapRef.current.fitBounds(bounds, { padding: { top: 100, bottom: 420, left: 36, right: 36 } });
    }
  }

  useImperativeHandle(ref, () => ({ showRoutes, findMe, highlightRoute, showAllRoutes, startTracking, stopTracking, endJourney }));
  return <div ref={containerRef} className="map-canvas" aria-label="Map showing your route" />;
});

export default MapView;

