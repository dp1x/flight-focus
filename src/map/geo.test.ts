import { describe, expect, it } from "vitest";
import {
  GLOBE_RADIUS,
  buildCoastlinePositions,
  buildFlightArc,
  greatCircleKm,
  kmToMiles,
  latLngToVector3,
  phaseProgress,
  rotationToFace,
  subdivideRing,
} from "./geo";

// Anchors taken from published airport coordinates.
const ATL = { lat: 33.6407, lng: -84.4277 };
const LHR = { lat: 51.47, lng: -0.4543 };
const JFK = { lat: 40.6413, lng: -73.7781 };
const SYD = { lat: -33.9399, lng: 151.1753 };

describe("latLngToVector3", () => {
  it("places every point on the sphere surface", () => {
    for (const airport of [ATL, LHR, JFK, SYD]) {
      const v = latLngToVector3(airport.lat, airport.lng);
      expect(v.length()).toBeCloseTo(GLOBE_RADIUS, 6);
    }
  });

  it("puts the north pole at +Y and the south pole at -Y", () => {
    expect(latLngToVector3(90, 0).y).toBeCloseTo(GLOBE_RADIUS, 6);
    expect(latLngToVector3(90, 0).x).toBeCloseTo(0, 6);
    expect(latLngToVector3(-90, 0).y).toBeCloseTo(-GLOBE_RADIUS, 6);
  });

  it("puts the equator on the y = 0 plane", () => {
    expect(latLngToVector3(0, 0).y).toBeCloseTo(0, 6);
    expect(latLngToVector3(0, 137).y).toBeCloseTo(0, 6);
  });

  it("honours an explicit radius", () => {
    expect(latLngToVector3(0, 0, 4).length()).toBeCloseTo(4, 6);
  });
});

describe("buildFlightArc", () => {
  it("returns segments + 1 samples", () => {
    const arc = buildFlightArc(
      latLngToVector3(LHR.lat, LHR.lng),
      latLngToVector3(JFK.lat, JFK.lng),
      32,
    );
    expect(arc).toHaveLength(33);
  });

  it("starts and ends on the sphere surface", () => {
    const start = latLngToVector3(LHR.lat, LHR.lng);
    const end = latLngToVector3(JFK.lat, JFK.lng);
    const arc = buildFlightArc(start, end);

    expect(arc[0].distanceTo(start)).toBeLessThan(1e-6);
    expect(arc[arc.length - 1].distanceTo(end)).toBeLessThan(1e-6);
  });

  it("bows outward from the surface at the midpoint", () => {
    const arc = buildFlightArc(
      latLngToVector3(LHR.lat, LHR.lng),
      latLngToVector3(JFK.lat, JFK.lng),
    );
    const midpoint = arc[Math.floor(arc.length / 2)];
    expect(midpoint.length()).toBeGreaterThan(GLOBE_RADIUS);

    // Endpoints sit on the surface, so the arc must rise then fall.
    expect(arc[0].length()).toBeLessThan(midpoint.length());
    expect(arc[arc.length - 1].length()).toBeLessThan(midpoint.length());
  });

  it("never dips inside the globe", () => {
    const arc = buildFlightArc(
      latLngToVector3(SYD.lat, SYD.lng),
      latLngToVector3(LHR.lat, LHR.lng),
    );
    for (const point of arc) {
      expect(point.length()).toBeGreaterThanOrEqual(GLOBE_RADIUS - 1e-9);
    }
  });
});

describe("phaseProgress", () => {
  it("passes progress straight through when there is no phase", () => {
    expect(phaseProgress(0.5)).toBe(0.5);
    expect(phaseProgress(0.5, "idle")).toBe(0.5);
    expect(phaseProgress(0.5, "rest")).toBe(0.5);
  });

  it("holds takeoff inside the first 18%", () => {
    expect(phaseProgress(0.05, "takeoff")).toBeCloseTo(0.05);
    expect(phaseProgress(0.9, "takeoff")).toBeCloseTo(0.18);
  });

  it("holds touchdown inside the last 18%", () => {
    expect(phaseProgress(0.1, "touchdown")).toBeCloseTo(0.82);
    expect(phaseProgress(0.95, "touchdown")).toBeCloseTo(0.95);
  });

  it("clamps cruise into the middle band", () => {
    expect(phaseProgress(0.05, "cruise")).toBeCloseTo(0.18);
    expect(phaseProgress(0.5, "cruise")).toBeCloseTo(0.5);
    expect(phaseProgress(0.99, "cruise")).toBeCloseTo(0.82);
  });

  it("never moves backwards across the phase sequence", () => {
    expect(phaseProgress(1, "takeoff")).toBeLessThanOrEqual(
      phaseProgress(0, "cruise"),
    );
    expect(phaseProgress(1, "cruise")).toBeLessThanOrEqual(
      phaseProgress(0, "touchdown"),
    );
  });
});

describe("rotationToFace", () => {
  it("rotates a location onto the +Z axis", () => {
    for (const airport of [ATL, LHR, JFK, SYD]) {
      const target = latLngToVector3(airport.lat, airport.lng).normalize();
      const rotated = target.clone().applyQuaternion(
        rotationToFace(airport.lat, airport.lng),
      );
      expect(rotated.x).toBeCloseTo(0, 5);
      expect(rotated.y).toBeCloseTo(0, 5);
      expect(rotated.z).toBeCloseTo(1, 5);
    }
  });
});

describe("greatCircleKm", () => {
  it("is zero for the same point", () => {
    expect(greatCircleKm(LHR.lat, LHR.lng, LHR.lat, LHR.lng)).toBeCloseTo(0, 6);
  });

  it("matches the published LHR to JFK distance", () => {
    // Published great-circle distance is about 5,540 km.
    const km = greatCircleKm(LHR.lat, LHR.lng, JFK.lat, JFK.lng);
    expect(km).toBeGreaterThan(5300);
    expect(km).toBeLessThan(5800);
  });

  it("matches the published LHR to SYD distance", () => {
    // Published great-circle distance is about 17,000 km.
    const km = greatCircleKm(LHR.lat, LHR.lng, SYD.lat, SYD.lng);
    expect(km).toBeGreaterThan(16800);
    expect(km).toBeLessThan(17200);
  });

  it("is symmetric", () => {
    const there = greatCircleKm(LHR.lat, LHR.lng, JFK.lat, JFK.lng);
    const back = greatCircleKm(JFK.lat, JFK.lng, LHR.lat, LHR.lng);
    expect(there).toBeCloseTo(back, 9);
  });
});

describe("subdivideRing", () => {
  it("leaves short edges alone", () => {
    const ring: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    expect(subdivideRing(ring, 6)).toHaveLength(4);
  });

  it("splits edges longer than the step size", () => {
    const ring: [number, number][] = [
      [0, 0],
      [30, 0],
    ];
    const dense = subdivideRing(ring, 6);
    // 30° edge → 5 segments: [0], 4 interpolants, [30]; the implicit closing
    // edge back to [0] contributes 4 more interpolants.
    expect(dense).toHaveLength(10);
    expect(dense[0]).toEqual([0, 0]);
    expect(dense[1]).toEqual([6, 0]);
  });

  it("wraps longitudes the short way across ±180°", () => {
    const ring: [number, number][] = [
      [170, 0],
      [-170, 0],
    ];
    const dense = subdivideRing(ring, 6);
    // Every interpolated longitude stays within ±180 (never sweeps the long way).
    for (const [lng] of dense) {
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    }
    // The 20° crossing is sampled through the antimeridian itself.
    expect(dense.some(([lng]) => Math.abs(Math.abs(lng) - 180) < 1e-9)).toBe(
      true,
    );
  });

  it("returns the original vertices in order when no subdivision is needed", () => {
    const ring: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(subdivideRing(ring, 30)).toEqual(ring);
  });
});

describe("buildCoastlinePositions", () => {
  it("emits complete line segment pairs (multiple of six floats)", () => {
    const positions = buildCoastlinePositions();
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.length % 6).toBe(0);
  });

  it("places every vertex on the requested sphere radius", () => {
    const radius = GLOBE_RADIUS + 0.003;
    const positions = buildCoastlinePositions(radius);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      expect(Math.hypot(x, y, z)).toBeCloseTo(radius, 6);
    }
  });
});

describe("kmToMiles", () => {
  it("converts kilometres to statute miles", () => {
    expect(kmToMiles(1)).toBeCloseTo(0.621371, 6);
    expect(kmToMiles(100)).toBeCloseTo(62.1371, 4);
  });
});
