import { useRef, useState } from "react";
import MapView from "./MapView";
import SOS from "./SOS";
import "./App.css";

const SAMPLE_ROUTES = [
  { name: "Recommended", detail: "More active streets", safety: "Lower-risk option", color: "teal" },
  { name: "Quieter route", detail: "Shorter distance", safety: "Review before choosing", color: "blue" },
];

export default function App() {
  const mapRef = useRef(null);
  const currentLocationRef = useRef(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState({ type: "idle", text: "" });
  const [routes, setRoutes] = useState([]);
  const [journey, setJourney] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  async function searchRoutes(event) {
    event?.preventDefault();
    if (!from.trim() || !to.trim()) {
      setStatus({ type: "error", text: "Add a starting point and destination to continue." });
      return;
    }
    setStatus({ type: "loading", text: "Finding route options…" });
    try {
      const result = await mapRef.current?.showRoutes(from, to, currentLocationRef.current);
      if (!result?.length) throw new Error("We could not find a route. Try a nearby landmark.");
      setRoutes(result);
      setStatus({ type: "success", text: "Route options are ready. Choose what feels right for you." });
    } catch (error) {
      setRoutes([]);
      setStatus({ type: "error", text: error.message || "Something went wrong. Please try again." });
    }
  }

  function useMyLocation() {
    setStatus({ type: "loading", text: "Finding your location…" });
    mapRef.current?.findMe((label, coordinates) => {
      if (coordinates) currentLocationRef.current = coordinates;
      setFrom(label || "Your current location");
      setStatus({ type: "success", text: "Starting point added." });
    });
  }

  function startJourney() {
    setJourney(true);
    setStatus({ type: "success", text: "Your journey has started. You are in control." });
  }

  return (
    <main className="app-shell">
      <MapView ref={mapRef} />
      <SOS />
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">⌁</div>
        <div>
          <p className="eyebrow">SafeRoute</p>
          <p className="brand-subtitle">Move with more confidence</p>
        </div>
        <button className="icon-button" aria-label="Open profile and settings">☰</button>
      </header>

      {!journey ? (
        <section className="bottom-sheet search-sheet" aria-label="Plan your journey">
          <div className="sheet-handle" />
          <div className="sheet-heading">
            <div>
              <p className="section-kicker">Plan a journey</p>
              <h1>Let’s get you there with confidence.</h1>
              <p className="muted">Tell us where you’re headed. We’ll help you choose an option that feels right.</p>
            </div>
            <span className="privacy-note">⌾ Just for you</span>
          </div>
          <form className="route-form" onSubmit={searchRoutes}>
            <div className="input-stack">
              <label className="route-input">
                <span className="input-dot from-dot" aria-hidden="true" />
                <span className="sr-only">Starting point</span>
                <input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Starting point" autoComplete="off" />
              </label>
              <div className="route-connector" aria-hidden="true" />
              <label className="route-input">
                <span className="input-dot to-dot" aria-hidden="true" />
                <span className="sr-only">Destination</span>
                <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="Where are you going?" autoComplete="off" />
              </label>
            </div>
            <button type="button" className="secondary-button location-button" onClick={useMyLocation}>⌖ Use my location</button>
            <button className="primary-button" type="submit" disabled={status.type === "loading"}>
              {status.type === "loading" ? "Looking for options…" : "Find route options"}
            </button>
          </form>

          {status.text && <div className={`status-message ${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.text}</div>}

          {routes.length > 0 && (
            <div className="route-results" aria-live="polite">
              <div className="results-heading"><h2>Choose what feels right</h2><span>{routes.length} options</span></div>
              {routes.map((route, index) => {
                const sample = SAMPLE_ROUTES[index] || SAMPLE_ROUTES[1];
                return (
                  <article className={`route-card ${index === 0 ? "recommended" : ""}`} key={`${route.km}-${index}`}>
                    <span className={`route-line ${sample.color}`} aria-hidden="true" />
                    <div className="route-card-main">
                      <div className="route-card-title"><h3>{sample.name}</h3>{index === 0 && <span className="recommended-pill">Recommended</span>}</div>
                      <p>{route.km} km · about {route.min} min walking</p>
                      <div className="route-context"><span>✓ {sample.detail}</span><span>{sample.safety}</span></div>
                    </div>
                    <button className="select-route" onClick={startJourney}>Start</button>
                  </article>
                );
              })}
              <p className="disclaimer">Safety information is based on available data and can change. Trust your instincts.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="bottom-sheet journey-sheet" aria-label="Active journey">
          <div className="sheet-handle" />
          <div className="journey-header"><div><p className="section-kicker">We’re with you</p><h1>You’re on your way</h1><p className="muted journey-reassurance">Take your time. You can check in or ask for help whenever you need.</p></div><span className="live-badge"><i /> Live</span></div>
          <div className="journey-destination"><span className="input-dot to-dot" aria-hidden="true" /><div><span className="muted small">Going to</span><strong>{to || "Your destination"}</strong></div><span className="eta">On route</span></div>
          <div className="journey-actions">
            <button className={`checkin-button ${checkedIn ? "complete" : ""}`} onClick={() => setCheckedIn(true)}>{checkedIn ? "✓ Checked in" : "I’m okay"}<small>{checkedIn ? "Thanks for letting your contact know" : "Send a quick safety update"}</small></button>
            <div className="journey-help-copy">Emergency help is available with the SOS button.</div>
          </div>
          <button className="end-journey" onClick={() => { setJourney(false); setCheckedIn(false); }}>End journey</button>
          <p className="disclaimer centered">Your location is only shared when you choose to share it.</p>
        </section>
      )}

    </main>
  );
}
