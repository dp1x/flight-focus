import { useEffect, useRef, useState } from "react";
import { useTheme } from "./focus/theme";
import { setAudioVolume, startAudioForMode, stopAudio } from "./focus/audio";
import {
  type AchievementStatus,
  type AudioMode,
  type FocusSession,
  type Phase,
  initializeFocus,
  createFocusSession,
  tickFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  skipFocusSession,
  resetFocusSession,
  currentFocusSession,
  loadFocusStats,
  loadAchievements,
  setJourney,
  getJourney,
} from "./focus/api";
import FlightGlobeView from "./map/FlightGlobeView";
import AirportSearch, { type Airport } from "./map/AirportSearch";
import AchievementsPanel from "./components/AchievementsPanel";
import DataControls from "./components/DataControls";
import airportsData from "./data/airports.json";
import "./App.css";

const DEFAULT_DURATION_MINUTES = 25;
const TICK_INTERVAL_MS = 1000;
const AIRPORTS = airportsData as Airport[];

type AudioPreset = Extract<AudioMode, { type: string }>;

const AUDIO_OPTIONS: { value: AudioPreset; label: string }[] = [
  { value: { type: "none" }, label: "Off" },
  { value: { type: "white_noise" }, label: "White noise" },
  { value: { type: "brown_noise" }, label: "Brown noise" },
  { value: { type: "cabin_hum" }, label: "Cabin hum" },
  {
    value: { type: "binaural_beats", frequencyHz: 200, brainwave: "focus" },
    label: "Binaural beats",
  },
];

function useAppStartup() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initializeFocus()
      .then(() => setReady(true))
      .catch(console.error);
  }, []);

  return ready;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

function clampDurationMinutes(value: number) {
  return Math.max(5, Math.min(180, value || DEFAULT_DURATION_MINUTES));
}

export default function App() {
  const ready = useAppStartup();
  const { theme } = useTheme();
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState<FocusSession | undefined>(undefined);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(
    DEFAULT_DURATION_MINUTES,
  );
  const [audio, setAudio] = useState<AudioPreset>({ type: "none" });
  const [volume, setVolume] = useState(0.7);
  const [stats, setStats] = useState<{ totalSessions: number; totalMinutes: number }>({
    totalSessions: 0,
    totalMinutes: 0,
  });
  const [achievements, setAchievements] = useState<AchievementStatus[]>([]);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [unlockToast, setUnlockToast] = useState<string | null>(null);
  const [cpError, setCpError] = useState<string | null>(null);
  const [departure, setDeparture] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [mapView, setMapView] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const achievementsRef = useRef<AchievementStatus[]>([]);

  achievementsRef.current = achievements;

  const refreshStats = async () => {
    const nextStats = await loadFocusStats();
    setStats({
      totalSessions: nextStats.totalSessions,
      totalMinutes: nextStats.totalMinutes,
    });
  };

  const refreshAchievements = async (previous?: AchievementStatus[]) => {
    const next = await loadAchievements();
    setAchievements(next);

    if (previous) {
      const newlyUnlocked = next.filter(
        (item) =>
          item.unlocked &&
          !previous.some((prev) => prev.id === item.id && prev.unlocked),
      );
      if (newlyUnlocked.length > 0) {
        setUnlockToast(
          newlyUnlocked.map((item) => `${item.icon} ${item.title} unlocked`).join(" · "),
        );
      }
    }
  };

  useEffect(() => {
    if (!ready) return;

    getJourney()
      .then((journey) => {
        if (!journey) return;
        const dep = AIRPORTS.find((airport) => airport.code === journey.departureCode);
        const dest = AIRPORTS.find((airport) => airport.code === journey.destinationCode);
        if (dep) setDeparture(dep);
        if (dest) setDestination(dest);
      })
      .catch(console.error);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;

    currentFocusSession()
      .then((current) => {
        if (current?.completed) {
          setSession(undefined);
          setRunning(false);
          return;
        }
        setSession(current ?? undefined);
        setRunning(false);
      })
      .catch(console.error);

    refreshStats().catch(console.error);
    refreshAchievements().catch(console.error);
  }, [ready]);

  useEffect(() => {
    if (!unlockToast) return;
    const id = window.setTimeout(() => setUnlockToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [unlockToast]);

  useEffect(() => {
    if (!ready || !running || !session) return;

    const id = window.setInterval(() => {
      tickFocusSession(1)
        .then(async (nextSession) => {
          setCpError(null);

          if (nextSession.completed) {
            setSession(undefined);
            setRunning(false);
            setLastSummary(`Completed ${formatDuration(nextSession.totalDurationSeconds)} flown`);
            await stopAudio();
            await refreshStats();
            await refreshAchievements(achievementsRef.current);
            return;
          }

          setSession(nextSession);
        })
        .catch((e) => {
          setCpError(String(e));
          setRunning(false);
        });
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [ready, running, session?.id]);

  useEffect(() => {
    if (!session || !running || session.completed) {
      void stopAudio();
      return;
    }

    void startAudioForMode(session.audio, volume);
    return () => {
      void stopAudio();
    };
  }, [session?.id, session?.audio, running, volume]);

  useEffect(() => {
    setAudioVolume(volume).catch(console.error);
  }, [volume]);

  useEffect(() => {
    if (!ready || !departure || !destination) return;
    setJourney(departure.code, destination.code)
      .then(() => refreshAchievements(achievementsRef.current))
      .catch(console.error);
  }, [departure?.code, destination?.code, ready]);

  const startSession = async () => {
    setCpError(null);
    setLastSummary(null);

    try {
      const nextSession = await createFocusSession({
        durationSeconds: selectedDurationMinutes * 60,
        audioMode: audio,
      });
      setSession(nextSession);
      setRunning(true);
    } catch (e) {
      setCpError(String(e));
    }
  };

  const pauseSession = async () => {
    setCpError(null);

    try {
      const nextSession = await pauseFocusSession();
      setSession(nextSession);
      setRunning(false);
    } catch (e) {
      setCpError(String(e));
    }
  };

  const resumeSession = async () => {
    setCpError(null);

    try {
      const nextSession = await resumeFocusSession();
      setSession(nextSession);
      setRunning(true);
    } catch (e) {
      setCpError(String(e));
    }
  };

  const skipSession = async () => {
    setCpError(null);

    try {
      const summary = await skipFocusSession();
      if (summary) {
        setLastSummary(`Skipped at ${summary.phase} after ${formatDuration(summary.durationSeconds)} flown`);
      }
      setSession(undefined);
      setRunning(false);
      await stopAudio();
      await refreshStats();
      await refreshAchievements(achievementsRef.current);
    } catch (e) {
      setCpError(String(e));
    }
  };

  const reset = async () => {
    setCpError(null);

    try {
      await resetFocusSession();
      await stopAudio();
      setSession(undefined);
      setRunning(false);
    } catch (e) {
      setCpError(String(e));
    }
  };

  const swapAirports = () => {
    setDeparture(destination);
    setDestination(departure);
  };

  const phaseLabel: Phase = session?.phase ?? "idle";
  const visibleSeconds = session
    ? Math.max(session.remainingSeconds, 0)
    : selectedDurationMinutes * 60;
  const flightProgress =
    session && session.totalDurationSeconds > 0
      ? (session.totalDurationSeconds - session.remainingSeconds) /
        session.totalDurationSeconds
      : undefined;

  if (!ready) {
    return (
      <div className="loadingShell" role="status" aria-live="polite">
        <span>Initializing Flight Focus</span>
      </div>
    );
  }

  // Circular progress ring: fraction of the session elapsed (0–1).
  const ringFraction =
    session && session.totalDurationSeconds > 0
      ? Math.min(
          1,
          Math.max(
            0,
            (session.totalDurationSeconds - session.remainingSeconds) /
              session.totalDurationSeconds,
          ),
        )
      : 0;
  const RING_RADIUS = 0.46; // relative to the svg viewBox (0–1)
  const RING_CIRCUM = 2 * Math.PI * RING_RADIUS;

  return (
    <main className="appShell" data-theme={theme}>
      {/* Fixed top navigation */}
      <header className="topBar">
        <div className="topBarLeft">
          <span className="brandWordmark">Zeitreise</span>
          <nav className="topNav" aria-label="Primary">
            <span className="topNavLink active">Missions</span>
            <span className="topNavLink">Logs</span>
          </nav>
        </div>
        <div className="topBarRight">
          <div className="telemetry">
            <span className="telemetryLabel">Estimated Mission Time</span>
            <span className="telemetryValue">
              {formatDuration(visibleSeconds).padStart(8, "0")}
            </span>
          </div>
          <button
            className="iconBtn"
            type="button"
            aria-label="Settings"
            onClick={() => setShowExtras((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004 15a1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 003.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008 4a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09A1.65 1.65 0 0014 3.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 8a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Collapsing left sidebar (Cockpit / Telemetry / Navigation / Logs) */}
      <aside className="sideRail" aria-label="Sections">
        <div className="railBrand">
          <span className="railIcon" aria-hidden="true">◎</span>
          <span className="railLabel">Cockpit</span>
        </div>
        <div className="railItems">
          <button
            className={`railItem${!mapView ? " active" : ""}`}
            type="button"
            onClick={() => setMapView(false)}
          >
            <span className="railIcon" aria-hidden="true">◎</span>
            <span className="railLabel">Cockpit</span>
          </button>
          <button
            className="railItem"
            type="button"
            onClick={() => { setShowExtras(true); }}
          >
            <span className="railIcon" aria-hidden="true">≣</span>
            <span className="railLabel">Telemetry</span>
          </button>
          <button
            className={`railItem${mapView ? " active" : ""}`}
            type="button"
            onClick={() => setMapView(true)}
            disabled={!departure && !destination}
          >
            <span className="railIcon" aria-hidden="true">◈</span>
            <span className="railLabel">Navigation</span>
          </button>
          <button
            className="railItem"
            type="button"
            onClick={() => setShowExtras((v) => !v)}
          >
            <span className="railIcon" aria-hidden="true">◷</span>
            <span className="railLabel">Logs</span>
          </button>
        </div>
      </aside>

      <div className="appContent">
        <section className="journeyBar" aria-label="Flight selection">
          <div className="airportField">
            <span className="label">Departure</span>
            <AirportSearch
              selected={departure}
              onSelect={setDeparture}
              placeholder="Departure"
              id="departure"
            />
          </div>
          <button
            className="swapBtn"
            onClick={swapAirports}
            title="Swap airports"
            type="button"
            aria-label="Swap departure and destination"
          >
            ⇄
          </button>
          <div className="airportField">
            <span className="label">Destination</span>
            <AirportSearch
              selected={destination}
              onSelect={setDestination}
              placeholder="Destination"
              id="destination"
            />
          </div>
        </section>

        <div className="viewToggleRow">
          {(departure || destination) && (
            <button
              className="mapToggleBtn"
              onClick={() => setMapView((value) => !value)}
              type="button"
            >
              {mapView ? "Show timer" : "Show map"}
            </button>
          )}
          <button
            className="mapToggleBtn"
            onClick={() => setShowExtras((value) => !value)}
            type="button"
          >
            {showExtras ? "Hide progress" : "Progress & data"}
          </button>
        </div>

        {unlockToast && <p className="unlockToast">{unlockToast}</p>}

        {mapView ? (
          <div className="mapStage">
            <FlightGlobeView
              departure={departure}
              destination={destination}
              flightProgress={flightProgress}
              phase={session?.phase}
              airports={AIRPORTS}
              onSelectDeparture={setDeparture}
              onSelectDestination={setDestination}
              onClearDeparture={() => setDeparture(null)}
              onClearDestination={() => setDestination(null)}
            />
          </div>
        ) : (
          <>
            <section className="timerHero" data-phase={phaseLabel}>
              <div className="timerRing">
                <svg
                  className="ringProgress"
                  viewBox="0 0 1 1"
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden="true"
                >
                  <circle className="ringTrack" cx="0.5" cy="0.5" r={RING_RADIUS} />
                  <circle
                    className="ringFill"
                    cx="0.5"
                    cy="0.5"
                    r={RING_RADIUS}
                    strokeDasharray={RING_CIRCUM}
                    strokeDashoffset={RING_CIRCUM * (1 - ringFraction)}
                  />
                </svg>
                <div className="timerCore">
                  <time className="durationText" aria-live="polite">
                    {formatDuration(visibleSeconds)}
                  </time>
                  <p className="phaseHint">
                    {phaseLabel === "takeoff"
                      ? "Climbing"
                      : phaseLabel === "cruise"
                        ? "In cruise"
                        : phaseLabel === "touchdown"
                          ? "Landing"
                          : phaseLabel === "rest"
                            ? "On the ground"
                            : "Ready for departure"}
                  </p>
                </div>
              </div>
            </section>

            <section className="controls">
              {!session && (
                <label className="field">
                  <span className="label">Duration (minutes)</span>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={selectedDurationMinutes}
                    onChange={(e) =>
                      setSelectedDurationMinutes(clampDurationMinutes(Number(e.target.value)))
                    }
                    className="input"
                  />
                </label>
              )}

              <label className="field">
                <span className="label">Audio</span>
                <select
                  className="select"
                  value={audio.type}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "none") setAudio({ type: "none" });
                    else if (raw === "white_noise") setAudio({ type: "white_noise" });
                    else if (raw === "brown_noise") setAudio({ type: "brown_noise" });
                    else if (raw === "cabin_hum") setAudio({ type: "cabin_hum" });
                    else if (raw === "binaural_beats") {
                      setAudio({ type: "binaural_beats", frequencyHz: 200, brainwave: "focus" });
                    }
                  }}
                >
                  {AUDIO_OPTIONS.map((opt) => (
                    <option key={opt.value.type} value={opt.value.type}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </label>

              <div className="btnRow">
                {!session && (
                  <button onClick={startSession} className="btn primary" type="button">
                    Initiate Flight
                  </button>
                )}
                {session && running && (
                  <button onClick={pauseSession} className="btn" type="button">
                    Pause
                  </button>
                )}
                {session && !running && (
                  <button onClick={resumeSession} className="btn primary" type="button">
                    Resume
                  </button>
                )}
                {session && (
                  <button onClick={skipSession} className="btn" type="button">
                    Skip
                  </button>
                )}
                {session && (
                  <button onClick={reset} className="btn ghost" type="button">
                    Reset
                  </button>
                )}
              </div>
            </section>

            {lastSummary && <p className="summary">{lastSummary}</p>}

            {cpError && <p className="error">{cpError}</p>}

            <footer className="statsBar">
              <div>
                <span className="value">{stats.totalSessions}</span>
                <span className="label">Missions</span>
              </div>
              <div>
                <span className="value">{stats.totalMinutes}</span>
                <span className="label">Minutes flown</span>
              </div>
            </footer>
          </>
        )}

        {showExtras && (
          <div className="extrasPanel">
            <AchievementsPanel achievements={achievements} />
            <DataControls
              onImported={async () => {
                await refreshStats();
                await refreshAchievements();
                const journey = await getJourney();
                if (journey) {
                  const dep = AIRPORTS.find((airport) => airport.code === journey.departureCode);
                  const dest = AIRPORTS.find((airport) => airport.code === journey.destinationCode);
                  if (dep) setDeparture(dep);
                  if (dest) setDestination(dest);
                }
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}
