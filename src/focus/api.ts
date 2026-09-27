export type Phase = "idle" | "takeoff" | "cruise" | "touchdown" | "rest";

export type AudioMode =
  | { type: "none" }
  | { type: "white_noise" }
  | { type: "brown_noise" }
  | { type: "cabin_hum" }
  | { type: "binaural_beats"; frequencyHz: number; brainwave: string };

export interface CreateSessionPayload {
  durationSeconds: number;
  audioMode?: AudioMode;
}

export interface SessionSummary {
  sessionId: string;
  completed: boolean;
  durationSeconds: number;
  phase: Phase;
  endedAt: string;
}

export interface FocusSession {
  id: string;
  phase: Phase;
  startedAt: string;
  totalDurationSeconds: number;
  remainingSeconds: number;
  completed: boolean;
  audio: AudioMode;
  lastHeartbeat: string;
}

export interface FocusStats {
  totalSessions: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
}

export type AchievementId =
  | "first_flight"
  | "ten_flights"
  | "hour_flown"
  | "week_streak"
  | "route_planner"
  | "globe_trotter"
  | "long_haul";

export interface AchievementStatus {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface FocusExportBundle {
  version: number;
  exportedAt: string;
  sessions: unknown[];
  journey?: { departureCode: string; destinationCode: string } | null;
  achievements: { id: AchievementId; unlockedAt: string }[];
  destinationHistory: string[];
}

export interface ImportResult {
  sessionsAdded: number;
  achievementsAdded: number;
  journeyUpdated: boolean;
}

// ---------------------------------------------------------------------------
// Backend contract
// ---------------------------------------------------------------------------

/**
 * The full set of backend operations the UI needs. Inside the Tauri shell this
 * is backed by the Rust engine over IPC; outside it (plain browser preview) the
 * same contract is served by the in-memory demo backend, so the app is fully
 * explorable instead of crashing on the first `invoke`.
 */
export interface FocusBackend {
  initialize(): Promise<void>;
  createSession(payload: CreateSessionPayload): Promise<FocusSession>;
  tick(dtSeconds: number): Promise<FocusSession>;
  pause(): Promise<FocusSession>;
  resume(): Promise<FocusSession>;
  skip(): Promise<SessionSummary | null>;
  reset(): Promise<void>;
  complete(): Promise<SessionSummary>;
  current(): Promise<FocusSession | null>;
  stats(): Promise<FocusStats>;
  setJourney(
    departureCode: string,
    destinationCode: string,
  ): Promise<{ departureCode: string; destinationCode: string }>;
  getJourney(): Promise<{
    departureCode: string;
    destinationCode: string;
  } | null>;
  achievements(): Promise<AchievementStatus[]>;
  exportData(): Promise<FocusExportBundle>;
  importData(bundleJson: string, merge: boolean): Promise<ImportResult>;
}

// ---------------------------------------------------------------------------
// Tauri backend — real Rust engine over IPC
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { createDemoBackend } from "./demo-backend";

const tauriBackend: FocusBackend = {
  async initialize() {
    await invoke("initialize_focus");
  },
  async createSession(payload) {
    const audioModeJson = payload.audioMode
      ? JSON.stringify(payload.audioMode)
      : undefined;
    return invoke<FocusSession>("create_focus_session", {
      durationSeconds: payload.durationSeconds,
      audioModeJson,
    });
  },
  async tick(dtSeconds) {
    return invoke<FocusSession>("tick_focus_session", { dtSeconds });
  },
  async pause() {
    return invoke<FocusSession>("pause_focus_session");
  },
  async resume() {
    return invoke<FocusSession>("resume_focus_session");
  },
  async skip() {
    return invoke<SessionSummary | null>("skip_focus_session");
  },
  async reset() {
    await invoke("reset_focus_session");
  },
  async complete() {
    return invoke<SessionSummary>("complete_focus_session");
  },
  async current() {
    return invoke<FocusSession | null>("current_focus_session");
  },
  async stats() {
    return invoke<FocusStats>("focus_stats");
  },
  async setJourney(departureCode, destinationCode) {
    return invoke("set_journey", { departureCode, destinationCode });
  },
  async getJourney() {
    return invoke<{
      departureCode: string;
      destinationCode: string;
    } | null>("get_journey");
  },
  async achievements() {
    return invoke<AchievementStatus[]>("focus_achievements");
  },
  async exportData() {
    return invoke<FocusExportBundle>("export_focus_data");
  },
  async importData(bundleJson, merge) {
    return invoke<ImportResult>("import_focus_data", { bundleJson, merge });
  },
};

/**
 * Runtime backend selection. `__TAURI_INTERNALS__` is injected by the Tauri
 * webview; its absence means we are a plain browser tab, so use the demo
 * backend rather than throwing on every call.
 */
export const runningInTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const backend: FocusBackend = runningInTauri
  ? tauriBackend
  : createDemoBackend();

// ---------------------------------------------------------------------------
// Public API — same names as before, so call sites are unaffected
// ---------------------------------------------------------------------------

export async function initializeFocus(): Promise<void> {
  await backend.initialize();
}

export async function createFocusSession(
  payload: CreateSessionPayload,
): Promise<FocusSession> {
  return backend.createSession(payload);
}

export async function tickFocusSession(dtSeconds: number): Promise<FocusSession> {
  return backend.tick(dtSeconds);
}

export async function pauseFocusSession(): Promise<FocusSession> {
  return backend.pause();
}

export async function resumeFocusSession(): Promise<FocusSession> {
  return backend.resume();
}

export async function skipFocusSession(): Promise<SessionSummary | null> {
  return backend.skip();
}

export async function resetFocusSession(): Promise<void> {
  await backend.reset();
}

export async function completeFocusSession(): Promise<SessionSummary> {
  return backend.complete();
}

export async function currentFocusSession(): Promise<FocusSession | null> {
  return backend.current();
}

export async function loadFocusStats(): Promise<FocusStats> {
  return backend.stats();
}

export async function setJourney(
  departureCode: string,
  destinationCode: string,
): Promise<{ departureCode: string; destinationCode: string }> {
  return backend.setJourney(departureCode, destinationCode);
}

export async function getJourney(): Promise<{
  departureCode: string;
  destinationCode: string;
} | null> {
  return backend.getJourney();
}

export async function loadAchievements(): Promise<AchievementStatus[]> {
  return backend.achievements();
}

export async function exportFocusData(): Promise<FocusExportBundle> {
  return backend.exportData();
}

export async function importFocusData(
  bundleJson: string,
  merge = true,
): Promise<ImportResult> {
  return backend.importData(bundleJson, merge);
}
