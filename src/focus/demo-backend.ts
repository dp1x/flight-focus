import type {
  AchievementId,
  AchievementStatus,
  AudioMode,
  CreateSessionPayload,
  FocusExportBundle,
  FocusSession,
  ImportResult,
  Phase,
  SessionSummary,
} from "./api";

/**
 * In-memory backend used when the UI runs outside the Tauri shell (plain
 * browser via `npm run dev`). It mirrors the Rust engine's semantics — phase
 * bands, pause/resume, skip summaries, achievement rules — so the UI behaves
 * identically in preview and in the packaged desktop app. State is ephemeral
 * by design: browser preview holds no real user data.
 */

interface EndedSession {
  completed: boolean;
  durationSeconds: number;
  /** Local calendar day (YYYY-MM-DD) the session ended, for streak math. */
  endedDay: string;
  endedAt: string;
  destinationCode: string | null;
}

const ACHIEVEMENT_DEFS: {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
}[] = [
  { id: "first_flight", title: "First Flight", description: "Complete your first focus session", icon: "🛫" },
  { id: "ten_flights", title: "Frequent Flyer", description: "Complete 10 focus sessions", icon: "✈️" },
  { id: "hour_flown", title: "Hour in Cruise", description: "Log 60 minutes of completed focus time", icon: "⏱️" },
  { id: "week_streak", title: "Week Streak", description: "Maintain a 7-day focus streak", icon: "🔥" },
  { id: "route_planner", title: "Route Planner", description: "Set a departure and destination airport", icon: "🗺️" },
  { id: "globe_trotter", title: "Globe Trotter", description: "Visit 5 unique destination airports", icon: "🌍" },
  { id: "long_haul", title: "Long Haul", description: "Complete a session of 45 minutes or more", icon: "🌙" },
];

function nowIso(): string {
  return new Date().toISOString();
}

function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return localDay(date);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Mirror the engine's phase bands: 0–18% takeoff, 18–82% cruise, rest touchdown. */
function phaseFor(session: FocusSession): Phase {
  const total = session.totalDurationSeconds;
  const elapsed = total - session.remainingSeconds;
  if (elapsed < total * 0.18) return "takeoff";
  if (session.remainingSeconds <= total * 0.18) return "touchdown";
  return "cruise";
}

class NoSessionError extends Error {
  constructor() {
    super("No active session");
  }
}

export function createDemoBackend() {
  let session: FocusSession | null = null;
  let journey: { departureCode: string; destinationCode: string } | null = null;
  const ended: EndedSession[] = [];
  const unlocked = new Map<AchievementId, string>();

  function requireSession(): FocusSession {
    if (!session) throw new NoSessionError();
    return session;
  }

  function completedSessions(): EndedSession[] {
    return ended.filter((item) => item.completed);
  }

  function computeStats() {
    const completed = completedSessions();
    const totalMinutes = Math.floor(
      completed.reduce((sum, item) => sum + item.durationSeconds, 0) / 60,
    );

    const days = [...new Set(completed.map((item) => item.endedDay))].sort();
    let currentStreak = 0;
    for (let offset = 0; ; offset++) {
      const expected = localDay(new Date(Date.now() - offset * 86400000));
      if (days.includes(expected)) currentStreak++;
      else break;
    }

    let longestStreak = 0;
    let run = 0;
    let previous: string | null = null;
    for (const day of days) {
      run = previous && nextDay(previous) === day ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
      previous = day;
    }

    return {
      totalSessions: completed.length,
      totalMinutes,
      currentStreak,
      longestStreak,
    };
  }

  /** Mirrors `evaluate_achievements` in the Rust engine. */
  function evaluateAchievements(): AchievementId[] {
    const stats = computeStats();
    const completed = completedSessions();
    const destinations = new Set(
      ended
        .filter((item) => item.completed && item.destinationCode)
        .map((item) => item.destinationCode as string),
    );

    const candidates: [AchievementId, boolean][] = [
      ["first_flight", stats.totalSessions >= 1],
      ["ten_flights", stats.totalSessions >= 10],
      ["hour_flown", stats.totalMinutes >= 60],
      ["week_streak", stats.currentStreak >= 7],
      ["route_planner", journey !== null],
      ["globe_trotter", destinations.size >= 5],
      ["long_haul", completed.some((item) => item.durationSeconds >= 2700)],
    ];

    const newlyUnlocked: AchievementId[] = [];
    for (const [id, earned] of candidates) {
      if (!earned || unlocked.has(id)) continue;
      unlocked.set(id, nowIso());
      newlyUnlocked.push(id);
    }
    return newlyUnlocked;
  }

  return {
    async initialize() {},

    async createSession(payload: CreateSessionPayload): Promise<FocusSession> {
      if (session) throw new Error("A session is already active");
      const durationSeconds = Math.floor(payload.durationSeconds);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error("Duration must be a positive number of seconds");
      }
      const audio: AudioMode = payload.audioMode ?? { type: "none" };
      session = {
        id: newId(),
        phase: "takeoff",
        startedAt: nowIso(),
        totalDurationSeconds: durationSeconds,
        remainingSeconds: durationSeconds,
        completed: false,
        audio,
        lastHeartbeat: nowIso(),
      };
      return session;
    },

    async tick(dtSeconds: number): Promise<FocusSession> {
      const current = requireSession();
      const dt = Math.floor(dtSeconds);
      if (dt <= 0) return { ...current };

      const remainingSeconds = current.remainingSeconds - dt;
      current.lastHeartbeat = nowIso();

      if (remainingSeconds <= 0) {
        current.remainingSeconds = 0;
        current.completed = true;
        ended.push({
          completed: true,
          durationSeconds: current.totalDurationSeconds,
          endedDay: localDay(new Date()),
          endedAt: nowIso(),
          destinationCode: journey?.destinationCode ?? null,
        });
        const summarySnapshot: FocusSession = {
          ...current,
          remainingSeconds: 0,
          phase: "rest",
        };
        session = null;
        evaluateAchievements();
        return summarySnapshot;
      }

      // Return a fresh snapshot: React re-renders on reference change, and the
      // Rust engine behaves the same way (a new struct per tick).
      const snapshot: FocusSession = {
        ...current,
        remainingSeconds,
        phase: phaseFor({ ...current, remainingSeconds }),
      };
      current.remainingSeconds = remainingSeconds;
      current.phase = snapshot.phase;
      return snapshot;
    },

    async pause(): Promise<FocusSession> {
      return requireSession();
    },

    async resume(): Promise<FocusSession> {
      return requireSession();
    },

    async skip(): Promise<SessionSummary | null> {
      const current = requireSession();
      const elapsed = current.totalDurationSeconds - current.remainingSeconds;
      const summary: SessionSummary = {
        sessionId: current.id,
        completed: false,
        durationSeconds: elapsed,
        phase: current.phase,
        endedAt: nowIso(),
      };
      ended.push({
        completed: false,
        durationSeconds: elapsed,
        endedDay: localDay(new Date()),
        endedAt: summary.endedAt,
        destinationCode: journey?.destinationCode ?? null,
      });
      session = null;
      evaluateAchievements();
      return summary;
    },

    async reset(): Promise<void> {
      session = null;
    },

    async complete(): Promise<SessionSummary> {
      const current = requireSession();
      const summary: SessionSummary = {
        sessionId: current.id,
        completed: true,
        durationSeconds: current.totalDurationSeconds - current.remainingSeconds,
        phase: "rest",
        endedAt: nowIso(),
      };
      ended.push({
        completed: true,
        durationSeconds: summary.durationSeconds,
        endedDay: localDay(new Date()),
        endedAt: summary.endedAt,
        destinationCode: journey?.destinationCode ?? null,
      });
      session = null;
      evaluateAchievements();
      return summary;
    },

    async current(): Promise<FocusSession | null> {
      return session;
    },

    async stats() {
      return computeStats();
    },

    async setJourney(departureCode: string, destinationCode: string) {
      journey = { departureCode, destinationCode };
      evaluateAchievements();
      return journey;
    },

    async getJourney() {
      return journey;
    },

    async achievements(): Promise<AchievementStatus[]> {
      return ACHIEVEMENT_DEFS.map((def) => ({
        ...def,
        unlocked: unlocked.has(def.id),
        unlockedAt: unlocked.get(def.id),
      }));
    },

    async exportData(): Promise<FocusExportBundle> {
      return {
        version: 1,
        exportedAt: nowIso(),
        sessions: ended,
        journey,
        achievements: [...unlocked.entries()].map(([id, unlockedAt]) => ({
          id,
          unlockedAt,
        })),
        destinationHistory: [
          ...new Set(
            ended
              .filter((item) => item.completed && item.destinationCode)
              .map((item) => item.destinationCode as string),
          ),
        ],
      };
    },

    async importData(bundleJson: string, merge: boolean): Promise<ImportResult> {
      let bundle: {
        sessions?: Partial<EndedSession>[];
        journey?: { departureCode: string; destinationCode: string } | null;
        achievements?: { id: AchievementId; unlockedAt?: string }[];
      };
      try {
        bundle = JSON.parse(bundleJson);
      } catch {
        throw new Error("Import file is not valid JSON");
      }

      if (!merge) {
        ended.length = 0;
        unlocked.clear();
        journey = null;
      }

      let sessionsAdded = 0;
      for (const record of bundle.sessions ?? []) {
        if (
          record &&
          typeof record.completed === "boolean" &&
          typeof record.durationSeconds === "number"
        ) {
          ended.push({
            completed: record.completed,
            durationSeconds: record.durationSeconds,
            endedDay: record.endedDay ?? localDay(new Date()),
            endedAt: record.endedAt ?? nowIso(),
            destinationCode: record.destinationCode ?? null,
          });
          sessionsAdded++;
        }
      }

      let achievementsAdded = 0;
      for (const item of bundle.achievements ?? []) {
        if (item && item.id && !unlocked.has(item.id)) {
          unlocked.set(item.id, item.unlockedAt ?? nowIso());
          achievementsAdded++;
        }
      }

      const journeyUpdated = Boolean(
        bundle.journey?.departureCode && bundle.journey?.destinationCode,
      );
      if (journeyUpdated) {
        journey = {
          departureCode: bundle.journey!.departureCode,
          destinationCode: bundle.journey!.destinationCode,
        };
      }

      evaluateAchievements();
      return { sessionsAdded, achievementsAdded, journeyUpdated };
    },
  };
}
