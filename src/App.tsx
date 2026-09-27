import { useCallback, useEffect, useState } from "react";
import { useTheme } from "./focus/theme";
import {
  type AudioMode,
  type Phase,
  initializeFocus,
  loadFocusStats,
  runningInTauri,
} from "./focus/api";
import { useFocusSession, type AudioPreset } from "./state/useFocusSession";
import { useJourney } from "./state/useJourney";
import { useAchievements } from "./state/useAchievements";
import FlightGlobeView from "./map/FlightGlobeView";
import { type Airport } from "./map/AirportSearch";
import AchievementsPanel from "./components/AchievementsPanel";
import DataControls from "./components/DataControls";
import airportsData from "./data/airports.json";
import {
  DEFAULT_DURATION_MINUTES,
  clampDurationMinutes,
  formatDuration,
} from "./focus/time";
import "./App.css";
import "./layout.css";

const AIRPORTS = airportsData as Airport[];

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

/** Long-form phase copy for the timer hero. */
const PHASE_TEXT: Record<Phase, string> = {
  idle: "Ready for departure",
  takeoff: "Climbing",
  cruise: "In cruise",
  touchdown: "Landing",
  rest: "On the ground",
};

/** Short phase copy for the status pill in the top bar. */
const PHASE_PILL: Record<Phase, string> = {
  idle: "Standby",
  takeoff: "Takeoff",
  cruise: "In flight",
  touchdown: "Landing",
  rest: "Standby",
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(
    DEFAULT_DURATION_MINUTES,
  );
  const [audio, setAudio] = useState<AudioPreset>({ type: "none" });
  const [volume, setVolume] = useState(0.7);
  const [showControls, setShowControls] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [stats, setStats] = useState({ totalSessions: 0, totalMinutes: 0 });

  const refreshStats = useCallback(async () => {
    const next = await loadFocusStats();
    setStats({
      totalSessions: next.totalSessions,
      totalMinutes: next.totalMinutes,
    });
  }, []);

  const {
    achievements,
    unlockToast,
    refreshWithToast,
    refresh: refreshAchievements,
  } = useAchievements(ready);

  const {
    departure,
    destination,
    setDeparture,
    setDestination,
    clearDeparture,
    clearDestination,
    reload: reloadJourney,
  } = useJourney(ready, AIRPORTS, refreshWithToast);

  const { session, running, lastSummary, error, start, pause, resume, skip, reset } =
    useFocusSession({
      ready,
      volume,
      onEnded: async () => {
        await refreshStats();
        await refreshWithToast();
      },
    });

  useEffect(() => {
    initializeFocus()
      .then(() => setReady(true))
      .catch((e) => {
        setStartupError(String(e));
        // Still enter the app: a failed init should not strand the user on an
        // endless loading screen.
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    refreshStats().catch((e) => console.error("failed to load stats", e));
  }, [ready, refreshStats]);

  // Keyboard-first mission control: space starts/resumes, K pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.tagName === "SELECT");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!session) void start(selectedDurationMinutes, audio);
        else if (!running) void resume();
      } else if (e.key.toLowerCase() === "k" && session && running) {
        e.preventDefault();
        void pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, running, start, resume, pause, selectedDurationMinutes, audio]);

  const phaseLabel: Phase = session?.phase ?? "idle";
  const visibleSeconds = session
    ? Math.max(session.remainingSeconds, 0)
    : selectedDurationMinutes * 60;
  const flightProgress =
    session && session.totalDurationSeconds > 0
      ? (session.totalDurationSeconds - session.remainingSeconds) /
        session.totalDurationSeconds
      : undefined;
  const currentAudioType: AudioMode["type"] = audio.type;

  if (!ready) {
    return (
      <div className="loadingShell" role="status" aria-live="polite">
        <span>Initializing Flight Focus</span>
      </div>
    );
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">
            ✈
          </span>
          Flight Focus
        </div>

        <div className="topBarRight">
          <div className="telemetry">
            <span className="label">
              {session ? "Time to landing" : "Estimated mission time"}
            </span>
            <span className="value">
              {formatDuration(visibleSeconds).padStart(7, "0")}
            </span>
          </div>
          <span className="pill" data-phase={phaseLabel}>
            {PHASE_PILL[phaseLabel]}
          </span>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      {/* THE GLOBE IS THE APP. It fills the stage below the top bar. */}
      <div className="globeStage">
        <FlightGlobeView
          departure={departure}
          destination={destination}
          flightProgress={flightProgress}
          phase={session?.phase}
          airports={AIRPORTS}
          onSelectDeparture={setDeparture}
          onSelectDestination={setDestination}
          onClearDeparture={clearDeparture}
          onClearDestination={clearDestination}
        />

        {/* Bottom-docked mission deck: launch or fly, one surface. */}
        <section className="missionDeck" aria-label="Mission controls">
          <div className="missionSummary">
            <div className="routeReadout" aria-hidden="true">
              <span className={`routeEnd${departure ? "" : " empty"}`}>
                {departure ? departure.code : "---"}
              </span>
              <span className={`routeLine${departure && destination ? " active" : ""}`} />
              <span className={`routeEnd${destination ? "" : " empty"}`}>
                {destination ? destination.code : "---"}
              </span>
            </div>
            <div className="missionMeta">
              {session ? (
                <span className={`missionPhase phase-${phaseLabel}`}>
                  {PHASE_TEXT[phaseLabel]}
                </span>
              ) : (
                <span className="missionHint">
                  Pick two airports to plan a flight
                </span>
              )}
              <span className="missionStats">
                {stats.totalSessions} missions · {stats.totalMinutes} min flown
              </span>
            </div>
          </div>

          <div className="missionActions">
            {!session && (
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  setShowControls(false);
                  void start(selectedDurationMinutes, audio);
                }}
              >
                {departure && destination ? "Begin flight" : "Practice flight"}
              </button>
            )}
            {session && running && (
              <button className="btn" type="button" onClick={() => void pause()}>
                Pause
              </button>
            )}
            {session && !running && (
              <button
                className="btn primary"
                type="button"
                onClick={() => void resume()}
              >
                Resume
              </button>
            )}
            {session && (
              <button className="btn ghost" type="button" onClick={() => void skip()}>
                Skip
              </button>
            )}
            {session && (
              <button className="btn ghost" type="button" onClick={() => void reset()}>
                Reset
              </button>
            )}
            <button
              className="btn ghost"
              type="button"
              onClick={() => setShowControls((v) => !v)}
              aria-expanded={showControls}
            >
              {showControls ? "Hide setup" : "Setup"}
            </button>
          </div>
        </section>

        {/* Slide-up setup sheet: duration, audio, volume, progress, data. */}
        {showControls && (
          <div className="setupSheet" role="dialog" aria-label="Flight setup">
            <div className="setupGrid">
              {!session && (
                <label className="field">
                  <span className="label">Duration (minutes)</span>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    className="input"
                    value={selectedDurationMinutes}
                    onChange={(e) =>
                      setSelectedDurationMinutes(
                        clampDurationMinutes(Number(e.target.value)),
                      )
                    }
                  />
                </label>
              )}

              <label className="field">
                <span className="label">Ambient audio</span>
                <select
                  className="select"
                  value={currentAudioType}
                  onChange={(e) => {
                    const option = AUDIO_OPTIONS.find(
                      (opt) => opt.value.type === e.target.value,
                    );
                    if (option) setAudio(option.value);
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

              <div className="setupActions">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setShowExtras((v) => !v)}
                >
                  {showExtras ? "Hide progress" : "Progress & data"}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setShowControls(false)}
                >
                  Done
                </button>
              </div>
            </div>

            {!runningInTauri && (
              <p className="setupNote">
                Browser preview mode — sessions are held in memory only. Run the
                packaged app for persistent history.
              </p>
            )}

            {showExtras && (
              <div className="extrasPanel">
                <AchievementsPanel achievements={achievements} />
                <DataControls
                  onImported={async () => {
                    await refreshStats();
                    await refreshAchievements();
                    await reloadJourney();
                  }}
                />
              </div>
            )}
          </div>
        )}

        {unlockToast && <p className="unlockToast">{unlockToast}</p>}
        {lastSummary && <p className="summary">{lastSummary}</p>}
        {startupError && <p className="error">{startupError}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
