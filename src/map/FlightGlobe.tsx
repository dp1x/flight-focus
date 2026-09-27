import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  GLOBE_RADIUS,
  PIN_OFFSET,
  latLngToVector3,
  buildFlightArc,
  phaseProgress,
  rotationToFace,
} from "./geo";
import type { Phase } from "../focus/api";
import type { Airport } from "./AirportSearch";
import "./FlightGlobe.css";

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
}

// ---------------------------------------------------------------------------
// Globe sphere + atmosphere rim
// ---------------------------------------------------------------------------

function GlobeSphere() {
  const rimRef = useRef<THREE.Mesh>(null);

  // Atmosphere fresnel: a slightly larger back-face sphere with a glow shader.
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
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
          float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
          gl_FragColor = vec4(glowColor, 1.0) * intensity;
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
  }, []);

  return (
    <group>
      {/* Solid dark core */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
        <meshStandardMaterial
          color="#0e0e0e"
          roughness={0.92}
          metalness={0.05}
        />
      </mesh>
      {/* Fine graticule wireframe for a stylized "instrument" feel */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS + 0.002, 36, 24]} />
        <meshBasicMaterial
          color="#2dd4bf"
          wireframe
          transparent
          opacity={0.08}
        />
      </mesh>
      {/* Atmosphere rim */}
      <mesh ref={rimRef} material={atmosphereMaterial} scale={1.16}>
        <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Airport pin
// ---------------------------------------------------------------------------

function AirportPin({
  airport,
  role,
  isHovered,
  onPointerOver,
  onPointerOut,
  onClick,
  onDoubleClick,
}: {
  airport: Airport;
  role: "departure" | "destination" | "none";
  isHovered: boolean;
  onPointerOver: () => void;
  onPointerOut: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const position = useMemo(
    () => latLngToVector3(airport.lat, airport.lng, GLOBE_RADIUS + PIN_OFFSET),
    [airport.lat, airport.lng],
  );

  // Pin color by role.
  // Pin color by role — Stitch palette: teal for active states,
  // white/secondary for standby, dim white for neutral.
  const color =
    role === "departure"
      ? "#57f1db"
      : role === "destination"
        ? "#2dd4bf"
        : isHovered
          ? "#57f1db"
          : "#ffffff";

  const isActive = role !== "none" || isHovered;
  const scale = isHovered ? 1.6 : 1.0;

  return (
    <group position={position}>
      {/* Core dot */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          onPointerOver();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onPointerOut();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick();
        }}
        scale={scale}
      >
        <sphereGeometry args={[0.008, 10, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Soft halo glow for active/selected pins */}
      {isActive && (
        <mesh scale={scale * 2.6}>
          <sphereGeometry args={[0.008, 10, 10]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={role !== "none" ? 0.25 : 0.16}
          />
        </mesh>
      )}
    </group>
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
  const points = useMemo(() => buildFlightArc(start, end), [start, end]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [points]);

  const planeRef = useRef<THREE.Mesh>(null);

  // Effective progress along the arc for the plane position.
  const effectiveProgress =
    flightProgress == null ? null : phaseProgress(flightProgress, phase);

  // For idle preview (no session), animate the plane slowly along the arc
  // unless reduced motion is on.
  const idleT = useRef(0);
  useFrame((_, delta) => {
    if (effectiveProgress != null) {
      const idx = Math.min(
        points.length - 1,
        Math.max(0, Math.floor(effectiveProgress * (points.length - 1))),
      );
      if (planeRef.current) {
        planeRef.current.position.copy(points[idx]);
      }
    } else if (!reducedMotion) {
      idleT.current = (idleT.current + delta * 0.08) % 1;
      const idx = Math.floor(idleT.current * (points.length - 1));
      if (planeRef.current) {
        planeRef.current.position.copy(points[idx]);
      }
    } else if (planeRef.current) {
      planeRef.current.position.copy(points[0]);
    }
  });

  // Traveled portion of the arc (bright) vs full arc (dim).
  const traveledPoints = useMemo(() => {
    if (effectiveProgress == null) return [];
    const cutoff = Math.max(
      1,
      Math.floor(effectiveProgress * (points.length - 1)) + 1,
    );
    return points.slice(0, cutoff + 1);
  }, [points, effectiveProgress]);

  // Construct THREE.Line objects directly to avoid the JSX <line> tag, which
  // TypeScript resolves to the SVG <line> element type.
  const fullArcLine = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: "#2dd4bf",
      transparent: true,
      opacity: 0.35,
    });
    return new THREE.Line(geometry, mat);
  }, [geometry]);

  const traveledLine = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: "#57f1db" });
    const geo = new THREE.BufferGeometry().setFromPoints(traveledPoints);
    return new THREE.Line(geo, mat);
  }, [traveledPoints]);

  return (
    <group>
      {/* Full arc (dim) */}
      <primitive object={fullArcLine} />
      {/* Traveled portion (bright) */}
      {traveledPoints.length > 1 && <primitive object={traveledLine} />}
      {/* Plane */}
      <mesh ref={planeRef}>
        <coneGeometry args={[0.016, 0.042, 8]} />
        <meshBasicMaterial color="#57f1db" />
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

  // Pause auto-rotate while the user drags.
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      autoRotateActive.current = false;
    };
    const onEnd = () => {
      // Resume auto-rotate after a short delay if no spin is pending.
      if (!isAnimatingToTarget.current) {
        const id = window.setTimeout(() => {
          if (!isAnimatingToTarget.current) autoRotateActive.current = true;
        }, 2000);
        // No cleanup needed; this is a soft resume.
        void id;
      }
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
      // Slerp current rotation toward target.
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
      group.rotateY(delta * 0.05);
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
      gl={{ antialias: true, alpha: true }}
      className="flightGlobeCanvas"
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} />
      <GlobeGroup spinTarget={spinTarget} reducedMotion={reducedMotion}>
        <GlobeSphere />
        {airports.map((airport) => {
          const role =
            airport.code === departure?.code
              ? "departure"
              : airport.code === destination?.code
                ? "destination"
                : "none";
          return (
            <AirportPin
              key={airport.code}
              airport={airport}
              role={role}
              isHovered={hoveredAirport?.code === airport.code}
              onPointerOver={() => setHoveredAirport(airport)}
              onPointerOut={() => {
                if (hoveredAirport?.code === airport.code) {
                  setHoveredAirport(null);
                }
              }}
              onClick={() => handleClick(airport)}
              onDoubleClick={() => {
                onForceDeparture(airport);
                setSpinTarget({
                  lat: airport.lat,
                  lng: airport.lng,
                  nonce: Date.now(),
                });
              }}
            />
          );
        })}
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
