import { useRef, useState } from "react";
import MapView from "./MapView";
import SOS from "./SOS";
import { readContacts, normalizePhone } from "./contacts";
import { formatDistance } from "./geo";
import { scoreAll, USING_DEMO_REPORTS } from "./safetyApi";
import "./App.css";
import "./journey.css";

// Describe a score honestly: it is an estimate, never a guarantee.
function describeScore(result) {
  if (!result) return null;
  if (!result.nearby_reports) return { text: "No reports near this route yet, so no safety estimate", level: "none" };
  const score = result.safety_score;
  const level = score >= 75 ? "higher" : score >= 50 ? "moderate" : "lower";
  const label = level === "higher" ? "Higher estimate" : level === "moderate" ? "Moderate estimate" : "Lower estimate, take extra care";
  return { score, level, text: `${label} · ${score}/100 · ${result.confidence} confidence · ${result.nearby_reports} nearby reports` };
}

export default function App() {
  const mapRef = useRef(null);
  const currentLocationRef = useRef(null);
  const livePositionRef = useRef(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState({ type: "idle", text: "" });
  const [routes, setRoutes] = useState([]);
  const [scoreState, setScoreState] = useState("idle"); // idle | loading | ready | unavailable
  const [previewIndex, setPreviewIndex] = useState(null);
  const [journeyIndex, setJourneyIndex] = useState(null); // which route the user chose; null = not travelling
  const [live, setLive] = useState(null); // latest tracking update
  const [demoWalk, setDemoWalk] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkIn, setCheckIn] = useState(null); // { message, contacts } when the check-in panel is open

  const journey = journeyIndex !== null;
  const chosen = journey ? routes[journeyIndex] : null;

  async function searchRoutes(event) {
    event?.preventDefault();
    if (!from.trim() || !to.trim()) {
      setStatus({ type: "error", text: "Add a starting point and destination to continue." });
      return;
    }
    setStatus({ type: "loading", text: "Finding route options…" });
    setPreviewIndex(null);
    try {
      const result = await mapRef.current?.showRoutes(from, to, currentLocationRef.current);
      if (!result?.length) throw new Error("We could not find a route. Try a nearby landmark.");
      setRoutes(result);
      setStatus({ type: "success", text: "Route options are ready. Tap an option to preview it, then press Start." });
      // Ask the scoring service for a safety estimate for each route.
      setScoreState("loading");
      try {
        const scores = await scoreAll(result);
        setRoutes((current) => current.map((route, index) => ({ ...route, score: scores[index] })));
        setScoreState("ready");
      } catch {
        setScoreState("unavailable");
      }
    } catch (error) {
      setRoutes([]);
      setScoreState("idle");
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

  function previewRoute(index) {
    setPreviewIndex(index);
    mapRef.current?.highlightRoute(index);
  }

  function handleLive(update) {
    if (update.position) livePositionRef.current = update.position;
    setLive(update);
    if (update.arrived) {
      setStatus({ type: "success", text: "You have arrived." });
    }
  }

  function startJourney(index, simulate = false) {
    setJourneyIndex(index);
    setCheckedIn(false);
    setLive(null);
    setDemoWalk(simulate);
    mapRef.current?.startTracking(index, handleLive, { simulate });
  }

  function toggleDemoWalk() {
    const next = !demoWalk;
    setDemoWalk(next);
    setLive(null);
    mapRef.current?.startTracking(journeyIndex, handleLive, { simulate: next });
  }

  function endJourney() {
    mapRef.current?.endJourney();
    setJourneyIndex(null);
    setLive(null);
    setDemoWalk(false);
    setCheckedIn(false);
    setCheckIn(null);
    setPreviewIndex(null);
    livePositionRef.current = null;
    setStatus({ type: "idle", text: "" });
  }

  // Prepare a "I'm okay" message for the trusted contacts. Nothing is sent automatically.
  function openCheckIn() {
    const contacts = readContacts();
    const build = (lat, lon) => {
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const where = lat != null ? ` My location: https://maps.google.com/?q=${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}` : "";
      return `I’m okay and on my way to ${to || "my destination"}.${where}  Time: ${time}`;
    };
    const finish = (lat, lon) => {
      setCheckIn({ contacts, message: build(lat, lon), noLocation: lat == null });
      if (contacts.length) setCheckedIn(true);
    };
    const known = livePositionRef.current;
    if (known) return finish(known[1], known[0]);
    if (!navigator.geolocation) return finish(null, null);
    navigator.geolocation.getCurrentPosition(
      (p) => finish(p.coords.latitude, p.coords.longitude),
      () => finish(null, null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }

  // Facts we can state truthfully about each route.
  const fastestMin = routes.length ? Math.min(...routes.map((r) => r.min)) : 0;
  const shortestKm = routes.length ? Math.min(...routes.map((r) => Number(r.km))) : 0;
  const scored = routes.filter((r) => r.score && r.score.nearby_reports > 0);
  const bestScore = scored.length ? Math.max(...scored.map((r) => r.score.safety_score)) : null;

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
              {scoreState === "loading" && <p className="score-note">Checking safety estimates…</p>}
              {scoreState === "unavailable" && <p className="score-note warn">Safety estimates are unavailable right now (the scoring service is not reachable). Only distance and time are shown.</p>}
              {scoreState === "ready" && USING_DEMO_REPORTS && <p className="score-note">Safety estimates use <strong>demo reports</strong>, not real community data yet.</p>}
              {routes.map((route, index) => {
                const info = describeScore(route.score);
                const isBest = info?.score != null && info.score === bestScore && scored.length > 1;
                const tags = [];
                if (route.min === fastestMin) tags.push("Fastest");
                if (Number(route.km) === shortestKm) tags.push("Shortest");
                return (
                  <article
                    className={`route-card ${previewIndex === index ? "previewed" : ""} ${isBest ? "recommended" : ""}`}
                    key={`${route.km}-${index}`}
                    onClick={() => previewRoute(index)}
                  >
                    <span className="route-line" style={{ background: route.color }} aria-hidden="true" />
                    <div className="route-card-main">
                      <div className="route-card-title">
                        <h3>Route {index + 1}</h3>
                        {isBest && <span className="recommended-pill">Highest safety estimate</span>}
                        {tags.map((t) => <span className="fact-pill" key={t}>{t}</span>)}
                      </div>
                      <p>{route.km} km · about {route.min} min walking</p>
                      {info && <div className={`route-context score-${info.level}`}><span>{info.text}</span></div>}
                    </div>
                    <button className="select-route" onClick={(event) => { event.stopPropagation(); startJourney(index); }}>Start</button>
                  </article>
                );
              })}
              <p className="disclaimer">Safety estimates are based on available reports and can change. They are not a guarantee. Trust your instincts.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="bottom-sheet journey-sheet" aria-label="Active journey">
          <div className="sheet-handle" />
          <div className="journey-header">
            <div>
              <p className="section-kicker">We’re with you</p>
              <h1>You’re on your way</h1>
              <p className="muted journey-reassurance">Route {journeyIndex + 1} · {chosen.km} km · about {chosen.min} min walking</p>
            </div>
            <span className={`live-badge ${live?.position ? "" : "waiting"}`}><i /> {demoWalk ? "Demo walk" : live?.position ? "Live" : "Waiting"}</span>
          </div>

          <div className="journey-destination"><span className="input-dot to-dot" aria-hidden="true" /><div><span className="muted small">Going to</span><strong>{to || "Your destination"}</strong></div><span className="eta">{live?.remaining ? `${formatDistance(live.remaining.m)} left` : "On route"}</span></div>

          {describeScore(chosen.score) && <p className={`journey-score score-${describeScore(chosen.score).level}`}>{describeScore(chosen.score).text}</p>}

          {live?.error && <div className="status-message error" role="alert">{live.error}</div>}
          {!live && <p className="live-wait">Getting your location… If nothing happens, allow location in your browser, or try the demo walk.</p>}
          {live?.arrived && <div className="status-message success">You have arrived. You can end the journey.</div>}
          {live?.offRoute && !live.arrived && <div className="status-message error" role="alert">You seem to be about {formatDistance(live.offBy)} away from the route. Head back to the line on the map.</div>}
          {live?.step && !live.arrived && (
            <div className="live-card" aria-live="polite">
              <p className="live-instruction">{live.step.instruction}</p>
              <p className="live-meta">Next change in {formatDistance(live.step.distanceToNext)} · step {live.step.index + 1} of {live.step.total} · about {live.remaining.min} min left</p>
            </div>
          )}

          <div className="journey-actions">
            <button className={`checkin-button ${checkedIn ? "complete" : ""}`} onClick={openCheckIn}>
              {checkedIn ? "✓ Message prepared" : "I’m okay"}
              <small>{checkedIn ? "Send it in WhatsApp or SMS to let your contact know" : "Prepare a message for your trusted contacts"}</small>
            </button>
            <div className="journey-help-copy">Emergency help is available with the SOS button.</div>
          </div>
          <div className="journey-footer">
            <button className="end-journey" onClick={endJourney}>End journey</button>
            <button className="demo-walk" onClick={toggleDemoWalk}>{demoWalk ? "Stop demo walk" : "Try demo walk"}</button>
          </div>
          <p className="disclaimer centered">Your position is shown on this device only. It is shared only when you send a message.</p>
        </section>
      )}

      {checkIn && (
        <div className="sos-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckIn(null); }}>
          <section className="sos-modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
            <div className="sos-modal-header">
              <h2 id="checkin-title">Let your contacts know</h2>
              <button type="button" className="sos-modal-close" aria-label="Close" onClick={() => setCheckIn(null)}>×</button>
            </div>
            {checkIn.contacts.length === 0 ? (
              <p className="sos-status">You have no trusted contacts yet. Close this and add one with the Trusted contacts button.</p>
            ) : (
              <>
                <p className={`sos-status ${checkIn.noLocation ? "" : "ready"}`}>{checkIn.noLocation ? "Message ready (your location could not be added)." : "Message ready with your location."}</p>
                <pre className="sos-location-message">{checkIn.message}</pre>
                <div className="sos-contact-actions">
                  {checkIn.contacts.map((contact, index) => {
                    const number = normalizePhone(contact.phone).replace(/\+/g, "");
                    return (
                      <div className="sos-contact-row" key={`${contact.phone}-${index}`}>
                        <strong>{contact.name}</strong>
                        <a className="sos-whatsapp" href={`https://wa.me/${number}?text=${encodeURIComponent(checkIn.message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                        <a className="sos-sms" href={`sms:${normalizePhone(contact.phone)}?body=${encodeURIComponent(checkIn.message)}`}>SMS</a>
                      </div>
                    );
                  })}
                </div>
                <p className="sos-share-note">Your phone will open the message. Tap send to share it.</p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
