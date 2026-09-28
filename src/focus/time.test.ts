import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  clampDurationMinutes,
  formatDuration,
} from "./time";

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(1500)).toBe("25:00");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(7200)).toBe("2:00:00");
  });

  it("clamps negatives to zero instead of emitting a negative clock", () => {
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(-500)).toBe("0:00");
  });

  it("truncates fractional seconds", () => {
    expect(formatDuration(59.9)).toBe("0:59");
  });
});

describe("clampDurationMinutes", () => {
  it("clamps below the minimum", () => {
    expect(clampDurationMinutes(0)).toBe(MIN_DURATION_MINUTES);
    expect(clampDurationMinutes(-10)).toBe(MIN_DURATION_MINUTES);
  });

  it("clamps above the maximum", () => {
    expect(clampDurationMinutes(9999)).toBe(MAX_DURATION_MINUTES);
  });

  it("passes through values inside the range", () => {
    expect(clampDurationMinutes(25)).toBe(25);
    expect(clampDurationMinutes(180)).toBe(180);
    expect(clampDurationMinutes(5)).toBe(5);
  });

  it("rounds fractional input to whole minutes", () => {
    expect(clampDurationMinutes(25.6)).toBe(26);
    expect(clampDurationMinutes(25.4)).toBe(25);
  });

  it("falls back to the default for NaN", () => {
    expect(clampDurationMinutes(Number.NaN)).toBe(DEFAULT_DURATION_MINUTES);
  });

  it("clamps infinities to the range bounds", () => {
    expect(clampDurationMinutes(Number.POSITIVE_INFINITY)).toBe(
      MAX_DURATION_MINUTES,
    );
    expect(clampDurationMinutes(Number.NEGATIVE_INFINITY)).toBe(
      MIN_DURATION_MINUTES,
    );
  });
});
