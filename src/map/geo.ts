// Geo helpers for projecting lat/lng onto a unit sphere and building
// great-circle flight arcs. Used by FlightGlobe.tsx.

import * as THREE from "three";
import { COASTLINE_POLYGONS, type LngLat } from "../data/coastlines";

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

/**
 * Split ring edges longer than maxStepDeg into shorter steps so straight
 * lat/lng chords hug the sphere instead of cutting through landmasses.
 * Longitudes interpolate the short way around, wrapping across ±180°.
 */
export function subdivideRing(ring: LngLat[], maxStepDeg: number): LngLat[] {
  if (ring.length < 2) return ring.slice();
  const out: LngLat[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    out.push(a);
    const b = ring[(i + 1) % ring.length];
    let dLng = b[0] - a[0];
    if (dLng > 180) dLng -= 360;
    else if (dLng < -180) dLng += 360;
    const dist = Math.hypot(dLng, b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(dist / maxStepDeg));
    for (let s = 1; s < steps; s++) {
      const lng = (((a[0] + (dLng * s) / steps + 540) % 360) - 180);
      const lat = a[1] + ((b[1] - a[1]) * s) / steps;
      out.push([lng, lat]);
    }
  }
  return out;
}

/**
 * Project every coastline polygon onto the sphere and flatten it into a
 * Float32Array of LineSegments vertex pairs (x,y,z, x,y,z, …). One batched
 * draw call renders all continents and major islands.
 */
export function buildCoastlinePositions(radius = GLOBE_RADIUS): Float32Array {
  const coords: number[] = [];
  for (const ring of COASTLINE_POLYGONS) {
    const dense = subdivideRing(ring, 6);
    for (let i = 0; i < dense.length; i++) {
      const a = dense[i];
      const b = dense[(i + 1) % dense.length];
      const va = latLngToVector3(a[1], a[0], radius);
      const vb = latLngToVector3(b[1], b[0], radius);
      coords.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
    }
  }
  return new Float32Array(coords);
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

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Great-circle distance between two lat/lng points, in kilometres, using the
 * haversine formula. This is the distance the flight arc actually represents.
 */
export function greatCircleKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Convert kilometres to statute miles, for display. */
export function kmToMiles(km: number): number {
  return km * 0.621371;
}
