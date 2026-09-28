import { useCallback, useEffect, useRef, useState } from "react";
import { type AchievementStatus, loadAchievements } from "../focus/api";

const TOAST_MS = 5000;

export interface AchievementsController {
  achievements: AchievementStatus[];
  unlockToast: string | null;
  /** Refresh and report newly unlocked achievements against the last snapshot. */
  refreshWithToast: () => Promise<void>;
  /** Refresh without toasting (initial load, after import). */
  refresh: () => Promise<void>;
}

export function useAchievements(ready: boolean): AchievementsController {
  const [achievements, setAchievements] = useState<AchievementStatus[]>([]);
  const [unlockToast, setUnlockToast] = useState<string | null>(null);

  const previousRef = useRef<AchievementStatus[]>([]);
  previousRef.current = achievements;

  const refresh = useCallback(async (compare?: AchievementStatus[]) => {
    const next = await loadAchievements();
    setAchievements(next);

    if (compare) {
      const newlyUnlocked = next.filter(
        (item) =>
          item.unlocked &&
          !compare.some((prev) => prev.id === item.id && prev.unlocked),
      );
      if (newlyUnlocked.length > 0) {
        setUnlockToast(
          newlyUnlocked
            .map((item) => `${item.icon} ${item.title} unlocked`)
            .join(", "),
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    refresh().catch((e) => console.error("failed to load achievements", e));
  }, [ready, refresh]);

  useEffect(() => {
    if (!unlockToast) return;
    const id = window.setTimeout(() => setUnlockToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [unlockToast]);

  const refreshWithToast = useCallback(
    () => refresh(previousRef.current),
    [refresh],
  );

  const refreshQuiet = useCallback(() => refresh(), [refresh]);

  return {
    achievements,
    unlockToast,
    refreshWithToast,
    refresh: refreshQuiet,
  };
}
