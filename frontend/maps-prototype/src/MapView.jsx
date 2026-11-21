import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { LngLatBounds, Map, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

const ORS_KEY = import.meta.env.VITE_ORS_KEY;
const ORS = "https://api.openrouteservice.org";
const BANGALORE = [77.5946, 12.9716];
const ROUTE_COLORS = ["#168b83", "#3977b7", "#7d6bb3"];
const OSM_STYLE = { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] };

async function geocode(text) {
  const response = await fetch(`${ORS}/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(`${text}, Bengaluru`)}&boundary.country=IN&focus.point.lon=${BANGALORE[0]}&focus.point.lat=${BANGALORE[1]}&size=1`);
  if (!response.ok) throw new Error("Place search is unavailable right now. Please try again.");
  const data = await response.json();
  if (!data.features?.length) throw new Error(`We could not find “${text}”. Try a nearby landmark.`);
  return { coords: data.features[0].geometry.coordinates, label: data.features[0].properties.label };
}

async function getRoutes(start, end) {
  const body = { coordinates: [start, end], alternative_routes: { target_count: 3, share_factor: 0.6, weight_factor: 1.6 } };
  let response = await fetch(`${ORS}/v2/directions/foot-walking/geojson`, { method: "POST", headers: { Authorization: ORS_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) response = await fetch(`${ORS}/v2/directions/foot-walking/geojson`, { method: "POST", headers: { Authorization: ORS_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ coordinates: [start, end] }) });
  if (!response.ok) throw new Error("We could not calculate a route. Please try again.");
  return (await response.json()).features;
}

const MapView = forwardRef(function MapView(_, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const youRef = useRef(null);
  const routeIdsRef = useRef([]);

  useEffect(() => {
    const map = new Map({ container: containerRef.current, style: OSM_STYLE, center: BANGALORE, zoom: 11 });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;
    return () => map.remove();
  }, []);

  function clearRoutes() {
    const map = mapRef.current;
    routeIdsRef.current.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); });
    routeIdsRef.current = [];
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  }

  async function showRoutes(from, to) {
    if (!ORS_KEY) throw new Error("Map search is not configured yet. Add the route service key to continue.");
    const [start, end] = await Promise.all([geocode(from), geocode(to)]);
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
    return features.map((feature, index) => ({ color: ROUTE_COLORS[index % ROUTE_COLORS.length], km: (feature.properties.summary.distance / 1000).toFixed(1), min: Math.round(feature.properties.summary.duration / 60) }));
  }

  function findMe(callback) {
    if (!navigator.geolocation) return callback();
    navigator.geolocation.getCurrentPosition((position) => { const spot = [position.coords.longitude, position.coords.latitude]; if (youRef.current) youRef.current.remove(); youRef.current = new Marker({ color: "#168b83" }).setLngLat(spot).addTo(mapRef.current); mapRef.current.flyTo({ center: spot, zoom: 15 }); callback("Your current location"); }, () => callback());
  }

  useImperativeHandle(ref, () => ({ showRoutes, findMe }));
  return <div ref={containerRef} className="map-canvas" aria-label="Map showing your route" />;
});

export default MapView;
