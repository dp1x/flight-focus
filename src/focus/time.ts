export const DEFAULT_DURATION_MINUTES = 25;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 180;

/** Format a whole number of seconds as m:ss, or h:mm:ss past an hour. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Clamp a user-entered duration into the supported session range.
 *
 * NaN has no sensible ordering, so it falls back to the default. Infinities do
 * order correctly and therefore clamp to the min/max like any other value.
 */
export function clampDurationMinutes(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_DURATION_MINUTES;
  return Math.max(
    MIN_DURATION_MINUTES,
    Math.min(MAX_DURATION_MINUTES, Math.round(value)),
  );
}
