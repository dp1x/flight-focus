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

export type SessionCommand = "pause" | "resume" | "skip" | "reset";

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
// IPC helpers via Tauri
// ---------------------------------------------------------------------------
import { invoke } from "@tauri-apps/api/core";

function unwrap<T>(value: unknown): T {
  return value as T;
}

export async function initializeFocus(): Promise<void> {
  await invoke<void>("initialize_focus");
}

export async function createFocusSession(
  payload: CreateSessionPayload,
): Promise<FocusSession> {
  const audioJson = payload.audioMode
    ? JSON.stringify(payload.audioMode)
    : undefined;
  return unwrap<FocusSession>(
    await invoke("create_focus_session", {
      durationSeconds: payload.durationSeconds,
      audioModeJson: audioJson,
    }),
  );
}

export async function tickFocusSession(dtSeconds: number): Promise<FocusSession> {
  return unwrap<FocusSession>(await invoke("tick_focus_session", { dtSeconds }));
}

export async function pauseFocusSession(): Promise<FocusSession> {
  return unwrap<FocusSession>(await invoke("pause_focus_session"));
}

export async function resumeFocusSession(): Promise<FocusSession> {
  return unwrap<FocusSession>(await invoke("resume_focus_session"));
}

export async function skipFocusSession(): Promise<SessionSummary | null> {
  return unwrap<SessionSummary | null>(await invoke("skip_focus_session"));
}

export async function resetFocusSession(): Promise<void> {
  await invoke("reset_focus_session");
}

export async function completeFocusSession(): Promise<SessionSummary> {
  return unwrap<SessionSummary>(await invoke("complete_focus_session"));
}

export async function currentFocusSession(): Promise<FocusSession | null> {
  return unwrap<FocusSession | null>(await invoke("current_focus_session"));
}

export async function loadFocusStats(): Promise<FocusStats> {
  return unwrap<FocusStats>(await invoke("focus_stats"));
}

export async function setJourney(
  departureCode: string,
  destinationCode: string,
): Promise<{ departureCode: string; destinationCode: string }> {
  return unwrap<{ departureCode: string; destinationCode: string }>(
    await invoke("set_journey", {
      departureCode,
      destinationCode,
    }),
  );
}

export async function getJourney(): Promise<{
  departureCode: string;
  destinationCode: string;
} | null> {
  return unwrap<{
    departureCode: string;
    destinationCode: string;
  } | null>(await invoke("get_journey"));
}

export async function loadAchievements(): Promise<AchievementStatus[]> {
  return unwrap<AchievementStatus[]>(await invoke("focus_achievements"));
}

export async function exportFocusData(): Promise<FocusExportBundle> {
  return unwrap<FocusExportBundle>(await invoke("export_focus_data"));
}

export async function importFocusData(
  bundleJson: string,
  merge = true,
): Promise<ImportResult> {
  return unwrap<ImportResult>(
    await invoke("import_focus_data", { bundleJson, merge }),
  );
}
