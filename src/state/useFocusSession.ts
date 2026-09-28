import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioMode,
  type FocusSession,
  createFocusSession,
  currentFocusSession,
  pauseFocusSession,
  resetFocusSession,
  resumeFocusSession,
  skipFocusSession,
  tickFocusSession,
} from "../focus/api";
import { setAudioVolume, startAudioForMode, stopAudio } from "../focus/audio";
import { formatDuration } from "../focus/time";

export type AudioPreset = Extract<AudioMode, { type: string }>;

/**
 * How often we look at the clock. The countdown is NOT driven by this
 * interval — the interval only decides how often we ask how much real time has
 * passed, and the session is advanced by that measured amount. This keeps the
 * timer correct when the window is backgrounded and the browser throttles
 * timers to once per minute or worse.
 */
const TICK_POLL_MS = 250;

export interface FocusSessionController {
  session: FocusSession | undefined;
  running: boolean;
  lastSummary: string | null;
  error: string | null;
  start: (durationMinutes: number, audio: AudioPreset) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useFocusSession(options: {
  ready: boolean;
  volume: number;
  /** Called whenever a session finishes or is skipped, so stats can refresh. */
  onEnded: () => void | Promise<void>;
}): FocusSessionController {
  const { ready, volume, onEnded } = options;

  const [session, setSession] = useState<FocusSession | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read inside effects without making them re-run on every state update.
  const sessionRef = useRef<FocusSession | undefined>(undefined);
  sessionRef.current = session;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Monotonic wall-clock anchor and a guard so a slow IPC round trip cannot
  // stack two ticks on top of each other.
  const anchorRef = useRef(0);
  const busyRef = useRef(false);

  // Restore an in-flight session on startup. It always comes back paused —
  // assuming a session was still running after a restart would silently award
  // focus time the user did not spend.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    currentFocusSession()
      .then((current) => {
        if (cancelled) return;
        if (current?.completed) {
          setSession(undefined);
          return;
        }
        setSession(current ?? undefined);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [ready]);

  // Wall-clock reconciled tick loop. `running` is the only trigger: every path
  // that starts or resumes a session sets it, and every path that ends one
  // clears it, so the loop lifetime matches the session lifetime exactly.
  useEffect(() => {
    if (!ready || !running || !sessionRef.current) return;

    anchorRef.current = performance.now();

    const id = window.setInterval(() => {
      if (busyRef.current) return;

      const elapsedMs = performance.now() - anchorRef.current;
      const wholeSeconds = Math.floor(elapsedMs / 1000);
      if (wholeSeconds < 1) return;

      // Advance the anchor by only the whole seconds we are about to apply, so
      // the sub-second remainder carries over instead of being discarded.
      anchorRef.current += wholeSeconds * 1000;
      busyRef.current = true;

      tickFocusSession(wholeSeconds)
        .then(async (next) => {
          setError(null);

          if (next.completed) {
            setSession(undefined);
            setRunning(false);
            setLastSummary(
              `Completed ${formatDuration(next.totalDurationSeconds)} flown`,
            );
            await stopAudio();
            await onEndedRef.current();
            return;
          }

          setSession(next);
        })
        .catch((e) => {
          setError(String(e));
          setRunning(false);
        })
        .finally(() => {
          busyRef.current = false;
        });
    }, TICK_POLL_MS);

    return () => window.clearInterval(id);
  }, [ready, running]);

  // Ambient audio follows the session, not the tick loop. The audio mode is
  // fixed when a session is created, so `running` alone governs its lifetime.
  useEffect(() => {
    if (!running) {
      void stopAudio();
      return;
    }

    const mode = sessionRef.current?.audio;
    if (!mode) return;

    void startAudioForMode(mode, volumeRef.current);
    return () => {
      void stopAudio();
    };
  }, [running]);

  // Volume changes adjust the live gain node rather than restarting audio.
  useEffect(() => {
    setAudioVolume(volume).catch(() => {});
  }, [volume]);

  const start = useCallback(
    async (durationMinutes: number, audio: AudioPreset) => {
      setError(null);
      setLastSummary(null);
      try {
        const next = await createFocusSession({
          durationSeconds: durationMinutes * 60,
          audioMode: audio,
        });
        anchorRef.current = performance.now();
        setSession(next);
        setRunning(true);
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const pause = useCallback(async () => {
    setError(null);
    try {
      setSession(await pauseFocusSession());
      setRunning(false);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const resume = useCallback(async () => {
    setError(null);
    try {
      const next = await resumeFocusSession();
      anchorRef.current = performance.now();
      setSession(next);
      setRunning(true);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const skip = useCallback(async () => {
    setError(null);
    try {
      const summary = await skipFocusSession();
      if (summary) {
        setLastSummary(
          `Skipped at ${summary.phase} after ${formatDuration(summary.durationSeconds)} flown`,
        );
      }
      setSession(undefined);
      setRunning(false);
      await stopAudio();
      await onEndedRef.current();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const reset = useCallback(async () => {
    setError(null);
    try {
      await resetFocusSession();
      await stopAudio();
      setSession(undefined);
      setRunning(false);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return {
    session,
    running,
    lastSummary,
    error,
    start,
    pause,
    resume,
    skip,
    reset,
  };
}
