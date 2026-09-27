// Geo helpers for projecting lat/lng onto a unit sphere and building
// great-circle flight arcs. Used by FlightGlobe.tsx.

import * as THREE from "three";

export const GLOBE_RADIUS = 1.0;
export const PIN_OFFSET = 0.012; // how far pins hover above the surface

/** Convert latitude/longitude (degrees) to a 3D point on a sphere. */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius = GLOBE_RADIUS,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180); // polar angle from +Y
  const theta = (lng + 180) * (Math.PI / 180); // azimuth
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

/**
 * Build a great-circle flight arc as an array of 3D points lifted to an apex.
 * Samples the shortest rotation between the two surface points and lifts each
 * sample off the sphere surface so the arc visibly bows outward.
 */
export function buildFlightArc(
  start: THREE.Vector3,
  end: THREE.Vector3,
  segments = 64,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const startNorm = start.clone().normalize();
  const endNorm = end.clone().normalize();
  const angleBetween = startNorm.angleTo(endNorm);
  const quat = new THREE.Quaternion().setFromUnitVectors(startNorm, endNorm);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Slerp along the great circle by rotating a partial quaternion.
    const partial = new THREE.Quaternion().slerpQuaternions(
      new THREE.Quaternion(),
      quat,
      t,
    );
    const point = startNorm.clone().applyQuaternion(partial);

    // Lift arc apex: 0 at endpoints, max at midpoint, scaled by arc length.
    const lift = Math.sin(t * Math.PI) * (0.06 + angleBetween * 0.12);
    point.multiplyScalar(GLOBE_RADIUS + lift);
    points.push(point);
  }
  return points;
}

/**
 * Phase-gated progress (mirrors the 2D map behavior): takeoff clamps to the
 * first 18%, cruise spans 18–82%, touchdown clamps to the last 18%.
 */
export function phaseProgress(
  flightProgress: number,
  phase?: string,
): number {
  if (!phase || phase === "idle" || phase === "rest") {
    return flightProgress;
  }
  if (phase === "takeoff") return Math.min(flightProgress, 0.18);
  if (phase === "touchdown") return Math.max(flightProgress, 0.82);
  return Math.min(Math.max(flightProgress, 0.18), 0.82);
}

/** Slerp-based quaternion that rotates the globe so a given lat/lng faces the
 *  camera (centered on the +Z axis). Used for "spin to selected airport". */
export function rotationToFace(
  lat: number,
  lng: number,
): THREE.Quaternion {
  const target = latLngToVector3(lat, lng, GLOBE_RADIUS).normalize();
  const front = new THREE.Vector3(0, 0, 1);
  return new THREE.Quaternion().setFromUnitVectors(target, front);
}
