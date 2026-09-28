import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  GLOBE_RADIUS,
  PIN_OFFSET,
  latLngToVector3,
  buildFlightArc,
  buildCoastlinePositions,
  phaseProgress,
  rotationToFace,
} from "./geo";
import type { Phase } from "../focus/api";
import type { Airport } from "./AirportSearch";

interface FlightGlobeProps {
  departure: Airport | null;
  destination: Airport | null;
  flightProgress?: number;
  phase?: Phase;
  airports: Airport[];
  onSelectAirport: (airport: Airport) => void;
  onForceDeparture: (airport: Airport) => void;
  onClearSelection: () => void;
  hoveredAirport: Airport | null;
  setHoveredAirport: (a: Airport | null) => void;
  /** External request to spin the globe to a location (e.g. from search). */
  spinRequest?: { lat: number; lng: number; nonce: number } | null;
}

// Scratch objects reused every frame so the render loop never allocates.
const _dir = new THREE.Vector3();
const _toCamera = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const IDENTITY_QUAT = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Globe sphere, coastlines, atmosphere rim
// ---------------------------------------------------------------------------

function GlobeSphere() {
  // Atmosphere fresnel: a slightly larger back-face sphere with a rim shader.
  // Physically motivated (planets have atmospheres), kept subtle.
  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          glowColor: { value: new THREE.Color("#2dd4bf") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.75 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            gl_FragColor = vec4(glowColor, 1.0) * intensity;
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => atmosphereMaterial.dispose(), [atmosphereMaterial]);

  return (
    <group>
      {/* Solid dark core; the directional light draws a soft day/night limb. */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 48]} />
        <meshStandardMaterial color="#101516" roughness={0.9} metalness={0.05} />
      </mesh>
      {/* Atmosphere rim */}
      <mesh material={atmosphereMaterial} scale={1.12}>
        <sphereGeometry args={[GLOBE_RADIUS, 48, 32]} />
      </mesh>
    </group>
  );
}

/** All coastlines as one batched LineSegments draw call. */
function Coastlines() {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(buildCoastlinePositions(GLOBE_RADIUS + 0.003), 3),
    );
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#2dd4bf" transparent opacity={0.42} />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
// Airport pins: one InstancedMesh, one culling pass per frame
// ---------------------------------------------------------------------------

const PIN_GEOMETRY_ARGS: [number, number, number] = [0.008, 10, 10];

function AirportPins({
  airports,
  departure,
  destination,
  hoveredCode,
  onSelect,
  onForceDeparture,
  onHover,
}: {
  airports: Airport[];
  departure: Airport | null;
  destination: Airport | null;
  hoveredCode: string | null;
  onSelect: (airport: Airport) => void;
  onForceDeparture: (airport: Airport) => void;
  onHover: (airport: Airport | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scalesRef = useRef<number[]>([]);
  const hiddenRef = useRef<Set<number>>(new Set());

  const positions = useMemo(
    () =>
      airports.map((a) =>
        latLngToVector3(a.lat, a.lng, GLOBE_RADIUS + PIN_OFFSET),
      ),
    [airports],
  );

  const writeMatrix = useCallback(
    (index: number, scale: number) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      _matrix.compose(positions[index], IDENTITY_QUAT, _scale.set(scale, scale, scale));
      mesh.setMatrixAt(index, _matrix);
      mesh.instanceMatrix.needsUpdate = true;
    },
    [positions],
  );

  useLayoutEffect(() => {
    scalesRef.current = positions.map(() => 1);
    hiddenRef.current = new Set();
    positions.forEach((_, i) => writeMatrix(i, 1));
  }, [positions, writeMatrix]);

  // Pin colors by role; one instanceColor write per change, not per frame.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new THREE.Color();
    airports.forEach((airport, i) => {
      const selected =
        airport.code === departure?.code || airport.code === destination?.code;
      if (selected) color.set("#57f1db");
      else if (hoveredCode === airport.code) color.set("#ffffff");
      else color.set("#c7d4d1");
      mesh.setColorAt(i, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [airports, departure, destination, hoveredCode]);

  // Single per-frame pass: hide far-side pins (also blocks their raycasts via
  // hiddenRef) and ease the hovered pin's scale.
  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.getWorldQuaternion(_worldQuat);
    mesh.getWorldPosition(_worldPos);
    const k = Math.min(1, delta * 12);
    for (let i = 0; i < positions.length; i++) {
      _dir.copy(positions[i]).normalize().applyQuaternion(_worldQuat);
      const visible = _dir.dot(_toCamera.copy(camera.position).sub(_worldPos)) > 0;
      if (visible) hiddenRef.current.delete(i);
      else hiddenRef.current.add(i);

      const target = !visible
        ? 0
        : hoveredCode === airports[i].code
          ? 1.8
          : 1;
      const current = scalesRef.current[i] ?? 1;
      const next = current + (target - current) * k;
      if (Math.abs(next - current) > 0.001) {
        scalesRef.current[i] = next;
        writeMatrix(i, next);
      }
    }
  });

  // Instanced events carry the hit instance id; hidden instances never react.
  const resolve = (e: ThreeEvent<PointerEvent | MouseEvent>): Airport | null => {
    const id = e.instanceId;
    if (id == null || hiddenRef.current.has(id)) return null;
    return airports[id] ?? null;
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, airports.length]}
      frustumCulled={false}
      onPointerOver={(e) => {
        const airport = resolve(e);
        if (!airport) return;
        e.stopPropagation();
        onHover(airport);
      }}
      onPointerOut={(e) => {
        // Clear unconditionally: if the pin just rotated past the horizon the
        // instance is already hidden, but the hover state must still reset.
        e.stopPropagation();
        onHover(null);
      }}
      onClick={(e) => {
        const airport = resolve(e);
        if (!airport) return;
        e.stopPropagation();
        onSelect(airport);
      }}
      onDoubleClick={(e) => {
        const airport = resolve(e);
        if (!airport) return;
        e.stopPropagation();
        onForceDeparture(airport);
      }}
    >
      <sphereGeometry args={PIN_GEOMETRY_ARGS} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Flight arc + traveling plane
// ---------------------------------------------------------------------------

function FlightArc({
  start,
  end,
  flightProgress,
  phase,
  reducedMotion,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  flightProgress?: number;
  phase?: Phase;
  reducedMotion: boolean;
}) {
  const points = useMemo(() => buildFlightArc(start, end, 96), [start, end]);

  // Full arc and traveled arc share the same point data; the traveled line is
  // revealed with setDrawRange so session ticks never reallocate geometry.
  const { fullLine, traveledLine } = useMemo(() => {
    const fullGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const traveledGeometry = new THREE.BufferGeometry().setFromPoints(points);
    traveledGeometry.setDrawRange(0, 0);
    const full = new THREE.Line(
      fullGeometry,
      new THREE.LineBasicMaterial({
        color: "#2dd4bf",
        transparent: true,
        opacity: 0.32,
      }),
    );
    const traveled = new THREE.Line(
      traveledGeometry,
      new THREE.LineBasicMaterial({ color: "#57f1db" }),
    );
    traveled.visible = false;
    return { fullLine: full, traveledLine: traveled };
  }, [points]);

  useEffect(
    () => () => {
      fullLine.geometry.dispose();
      (fullLine.material as THREE.Material).dispose();
      traveledLine.geometry.dispose();
      (traveledLine.material as THREE.Material).dispose();
    },
    [fullLine, traveledLine],
  );

  const effectiveProgress =
    flightProgress == null ? null : phaseProgress(flightProgress, phase);
  const cutoff =
    effectiveProgress == null
      ? 0
      : Math.max(0, Math.round(effectiveProgress * (points.length - 1)) + 1);

  useEffect(() => {
    traveledLine.geometry.setDrawRange(0, cutoff);
    traveledLine.visible = cutoff > 1;
  }, [traveledLine, cutoff]);

  const planeRef = useRef<THREE.Mesh>(null);
  const idleT = useRef(0);

  useFrame((_, delta) => {
    const plane = planeRef.current;
    if (!plane) return;
    let t: number;
    if (effectiveProgress != null) {
      t = effectiveProgress;
    } else if (!reducedMotion) {
      idleT.current = (idleT.current + delta * 0.05) % 1;
      t = idleT.current;
    } else {
      t = 0;
    }
    const idx = Math.min(
      points.length - 2,
      Math.max(0, Math.floor(t * (points.length - 1))),
    );
    plane.position.copy(points[idx]);
    // Orient the cone along the path tangent.
    _tangent.copy(points[idx + 1]).sub(points[idx]).normalize();
    plane.quaternion.setFromUnitVectors(UP, _tangent);
  });

  return (
    <group>
      <primitive object={fullLine} />
      <primitive object={traveledLine} />
      <mesh ref={planeRef}>
        <coneGeometry args={[0.014, 0.04, 8]} />
        <meshBasicMaterial color="#57f1db" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Rotating globe group with auto-rotate + spin-to-selected
// ---------------------------------------------------------------------------

function GlobeGroup({
  children,
  spinTarget,
  reducedMotion,
}: {
  children: React.ReactNode;
  spinTarget: { lat: number; lng: number } | null;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetQuat = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const isAnimatingToTarget = useRef(false);
  const autoRotateActive = useRef(true);
  const { controls } = useThree() as unknown as {
    controls?: {
      addEventListener: (t: string, cb: () => void) => void;
      removeEventListener: (t: string, cb: () => void) => void;
    };
  };

  // When a spin target is requested, set up the target quaternion.
  useEffect(() => {
    if (!spinTarget) return;
    targetQuat.current.copy(rotationToFace(spinTarget.lat, spinTarget.lng));
    isAnimatingToTarget.current = true;
    autoRotateActive.current = false;
  }, [spinTarget]);

  // Pause auto-rotate while the user drags, resume after a short idle.
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      autoRotateActive.current = false;
    };
    const onEnd = () => {
      if (isAnimatingToTarget.current) return;
      window.setTimeout(() => {
        if (!isAnimatingToTarget.current) autoRotateActive.current = true;
      }, 2000);
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
    };
  }, [controls]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (isAnimatingToTarget.current) {
      // Slerp current rotation toward the target.
      const cur = group.quaternion.clone();
      const next = cur.slerp(targetQuat.current, Math.min(1, delta * 2.5));
      group.quaternion.copy(next);
      if (cur.angleTo(targetQuat.current) < 0.005) {
        isAnimatingToTarget.current = false;
        autoRotateActive.current = true;
      }
      return;
    }

    if (autoRotateActive.current && !reducedMotion) {
      group.rotateY(delta * 0.04);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export default function FlightGlobe({
  departure,
  destination,
  flightProgress,
  phase,
  airports,
  onSelectAirport,
  onForceDeparture,
  onClearSelection,
  hoveredAirport,
  setHoveredAirport,
  spinRequest,
}: FlightGlobeProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [spinTarget, setSpinTarget] = useState<{
    lat: number;
    lng: number;
    nonce: number;
  } | null>(null);
  const lastClickTime = useRef(0);
  const lastClickedCode = useRef<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // An external spin request (e.g. selecting a search result) drives the same
  // spin-to-target animation that pin clicks use.
  useEffect(() => {
    if (spinRequest) setSpinTarget(spinRequest);
  }, [spinRequest]);

  // Global Backspace/Delete handling: clear destination, then departure.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return; // don't hijack typing in the search box
      }
      if (!departure && !destination) return;
      e.preventDefault();
      onClearSelection();
      setHoveredAirport(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [departure, destination, onClearSelection, setHoveredAirport]);

  const handleClick = useCallback(
    (airport: Airport) => {
      const now = Date.now();
      const isDouble =
        lastClickedCode.current === airport.code &&
        now - lastClickTime.current < 350;
      lastClickTime.current = now;
      lastClickedCode.current = airport.code;

      if (isDouble) {
        onForceDeparture(airport);
      } else {
        onSelectAirport(airport);
      }
      setSpinTarget({ lat: airport.lat, lng: airport.lng, nonce: now });
    },
    [onSelectAirport, onForceDeparture],
  );

  const start = useMemo(
    () =>
      departure
        ? latLngToVector3(departure.lat, departure.lng, GLOBE_RADIUS)
        : null,
    [departure],
  );
  const end = useMemo(
    () =>
      destination
        ? latLngToVector3(destination.lat, destination.lng, GLOBE_RADIUS)
        : null,
    [destination],
  );

  return (
    <Canvas
      camera={{ position: [0, 0, 2.6], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      className="flightGlobeCanvas"
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 2.5, 5]} intensity={1.2} />
      <directionalLight position={[-4, -1.5, -3]} intensity={0.2} />
      <GlobeGroup spinTarget={spinTarget} reducedMotion={reducedMotion}>
        <GlobeSphere />
        <Coastlines />
        <AirportPins
          airports={airports}
          departure={departure}
          destination={destination}
          hoveredCode={hoveredAirport?.code ?? null}
          onSelect={handleClick}
          onForceDeparture={onForceDeparture}
          onHover={setHoveredAirport}
        />
        {start && end && (
          <FlightArc
            start={start}
            end={end}
            flightProgress={flightProgress}
            phase={phase}
            reducedMotion={reducedMotion}
          />
        )}
      </GlobeGroup>
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={1.4}
        maxDistance={4}
        rotateSpeed={0.5}
        makeDefault
      />
    </Canvas>
  );
}
