import { useEffect, useRef, useState } from "react";
import { Map, NavigationControl, Marker, LngLatBounds ,setWorkerUrl} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

const ORS_KEY = import.meta.env.VITE_ORS_KEY;
const ORS = "https://api.openrouteservice.org";

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const BANGALORE = [77.5946, 12.9716]; // [longitude, latitude]
const ROUTE_COLORS = ["#1F6FEB", "#E8710A", "#7B3FA0"];

// Turn a place name into [longitude, latitude] using OpenRouteService.
async function geocode(text) {
  const url =
    `${ORS}/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(text + ", Bengaluru")}` +
    `&boundary.country=IN&focus.point.lon=${BANGALORE[0]}&focus.point.lat=${BANGALORE[1]}&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Place search failed (" + res.status + ")");
  const data = await res.json();
  if (!data.features || data.features.length === 0) throw new Error(`Could not find "${text}"`);
  return {
    coords: data.features[0].geometry.coordinates,
    label: data.features[0].properties.label,
  };
}

// Ask for walking routes between two points (tries to get up to 3 alternatives).
async function getRoutes(start, end) {
  async function ask(extra) {
    return fetch(`${ORS}/v2/directions/foot-walking/geojson`, {
      method: "POST",
      headers: { Authorization: ORS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [start, end], ...extra }),
    });
  }
  let res = await ask({ alternative_routes: { target_count: 3, share_factor: 0.6, weight_factor: 1.6 } });
  if (!res.ok) res = await ask({}); // fall back to a single route
  if (!res.ok) throw new Error("Route request failed (" + res.status + ")");
  const data = await res.json();
  return data.features;
}

export default function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeIdsRef = useRef([]);
  const youRef = useRef(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    const map = new Map({ container: containerRef.current, style: OSM_STYLE, center: BANGALORE, zoom: 11 });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;
    return () => map.remove();
  }, []);

  function clearRoutes() {
    const map = mapRef.current;
    routeIdsRef.current.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
    routeIdsRef.current = [];
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }

  async function showRoutes() {
    if (!ORS_KEY) return setMessage("Key missing: check .env.local and restart npm run dev.");
    if (!from.trim() || !to.trim()) return setMessage("Type both a start and a destination.");
    setMessage("Searching...");
    setRoutes([]);
    try {
      const a = await geocode(from);
      const b = await geocode(to);
      const features = await getRoutes(a.coords, b.coords);
      const map = mapRef.current;
      clearRoutes();

      const bounds = new LngLatBounds();
      features.forEach((f, i) => {
        const id = "route-" + i;
        map.addSource(id, { type: "geojson", data: f });
        map.addLayer({
          id,
          type: "line",
          source: id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ROUTE_COLORS[i % 3], "line-width": 6, "line-opacity": 0.85 },
        });
        routeIdsRef.current.push(id);
        f.geometry.coordinates.forEach((c) => bounds.extend(c));
      });

      markersRef.current.push(new Marker({ color: "#2E7D32" }).setLngLat(a.coords).addTo(map));
      markersRef.current.push(new Marker({ color: "#C62828" }).setLngLat(b.coords).addTo(map));
      map.fitBounds(bounds, { padding: 80 });

      setRoutes(
        features.map((f, i) => ({
          color: ROUTE_COLORS[i % 3],
          km: (f.properties.summary.distance / 1000).toFixed(1),
          min: Math.round(f.properties.summary.duration / 60),
        }))
      );
      setMessage(`${a.label}  →  ${b.label}`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  function findMe() {
    if (!navigator.geolocation) return setMessage("This browser cannot share location.");
    setMessage("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const spot = [pos.coords.longitude, pos.coords.latitude];
        if (youRef.current) youRef.current.remove();
        youRef.current = new Marker({ color: "#8C1D2C" }).setLngLat(spot).addTo(mapRef.current);
        mapRef.current.flyTo({ center: spot, zoom: 15 });
        setMessage("You are here.");
      },
      () => setMessage("Could not get your location. Please allow location access."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const box = { position: "absolute", top: 12, left: 12, width: 290, background: "white", padding: 12, borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.3)", fontFamily: "sans-serif", fontSize: 14 };
  const input = { width: "100%", boxSizing: "border-box", padding: 6, marginBottom: 6 };

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />
      <div style={box}>
        <input style={input} placeholder="Start (e.g. RNS Institute of Technology)" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input style={input} placeholder="Destination (e.g. Majestic)" value={to} onChange={(e) => setTo(e.target.value)} />
        <button onClick={showRoutes}>Show routes</button>{" "}
        <button onClick={findMe}>Find my location</button>
        <div style={{ marginTop: 8, fontSize: 13 }}>{message}</div>
        {routes.map((r, i) => (
          <div key={i} style={{ marginTop: 4 }}>
            <span style={{ display: "inline-block", width: 14, height: 14, background: r.color, marginRight: 6, verticalAlign: "middle" }} />
            Route {i + 1}: {r.km} km, about {r.min} min walking
          </div>
        ))}
      </div>
    </div>
  );
}