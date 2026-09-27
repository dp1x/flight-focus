import { useCallback, useEffect, useMemo, useState } from "react";
import FlightGlobe from "./FlightGlobe";
import AirportSearch, { type Airport } from "./AirportSearch";
import { greatCircleKm, kmToMiles } from "./geo";
import type { Phase } from "../focus/api";

interface FlightGlobeViewProps {
  departure: Airport | null;
  destination: Airport | null;
  flightProgress?: number;
  phase?: Phase;
  airports: Airport[];
  onSelectDeparture: (airport: Airport) => void;
  onSelectDestination: (airport: Airport) => void;
  onClearDeparture: () => void;
  onClearDestination: () => void;
}

/** Spin request handed down to the globe so search selections animate. */
interface SpinRequest {
  lat: number;
  lng: number;
  nonce: number;
}

function formatCoords(lat: number, lng: number): string {
  const latHemisphere = lat >= 0 ? "N" : "S";
  const lngHemisphere = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latHemisphere} ${Math.abs(lng).toFixed(2)}°${lngHemisphere}`;
}

/**
 * Probe for a usable WebGL context. Some sandboxed environments (and machines
 * with broken GPU drivers) cannot create one; the app degrades to a functional
 * search + preview UI instead of throwing from the render loop.
 */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ?? canvas.getContext("webgl"),
    );
  } catch {
    return false;
  }
}

export default function FlightGlobeView({
  departure,
  destination,
  flightProgress,
  phase,
  airports,
  onSelectDeparture,
  onSelectDestination,
  onClearDeparture,
  onClearDestination,
}: FlightGlobeViewProps) {
  const [hoveredAirport, setHoveredAirport] = useState<Airport | null>(null);
  const [spinRequest, setSpinRequest] = useState<SpinRequest | null>(null);
  const [webglAvailable, setWebglAvailable] = useState(true);

  useEffect(() => {
    setWebglAvailable(hasWebGL());
  }, []);

  const spinTo = useCallback((airport: Airport) => {
    setSpinRequest({ lat: airport.lat, lng: airport.lng, nonce: Date.now() });
  }, []);

  /**
   * Clicking a pin assigns it to the next empty slot. With both slots filled,
   * the click restarts the flow from the new departure.
   */
  const selectAirport = useCallback(
    (airport: Airport) => {
      if (!departure) {
        onSelectDeparture(airport);
      } else if (!destination) {
        onSelectDestination(airport);
      } else {
        onSelectDeparture(airport);
        onClearDestination();
      }
      spinTo(airport);
    },
    [
      departure,
      destination,
      onSelectDeparture,
      onSelectDestination,
      onClearDestination,
      spinTo,
    ],
  );

  const forceDeparture = useCallback(
    (airport: Airport) => {
      onSelectDeparture(airport);
      onClearDestination();
      spinTo(airport);
    },
    [onSelectDeparture, onClearDestination, spinTo],
  );

  /** Backspace/Delete clears destination first, then departure. */
  const clearSelection = useCallback(() => {
    if (destination) {
      onClearDestination();
    } else if (departure) {
      onClearDeparture();
    }
  }, [departure, destination, onClearDeparture, onClearDestination]);

  const preview = hoveredAirport ?? destination ?? departure ?? null;

  const previewRole: "departure" | "destination" | null = preview
    ? preview.code === departure?.code
      ? "departure"
      : preview.code === destination?.code
        ? "destination"
        : null
    : null;

  const distanceMiles = useMemo(() => {
    if (!departure || !destination) return null;
    return kmToMiles(
      greatCircleKm(
        departure.lat,
        departure.lng,
        destination.lat,
        destination.lng,
      ),
    );
  }, [departure, destination]);

  if (!webglAvailable) {
    // Graceful degradation: no globe canvas, but search + preview still work
    // and the mission deck remains fully functional.
    return (
      <div className="globeFallback">
        <div className="globeFallbackTitle">Flight Focus</div>
        <p className="globeFallbackCopy">
          3D view needs WebGL, which this window can't provide. Airport search,
          sessions, and progress all still work — run the desktop app for the
          full globe.
        </p>
        <div className="globeSearchOverlay">
          <AirportSearch
            selected={departure}
            onSelect={selectAirport}
            placeholder="Departure"
            id="fallback-departure"
          />
          <AirportSearch
            selected={destination}
            onSelect={selectAirport}
            placeholder="Destination"
            id="fallback-destination"
          />
        </div>
        {preview && (
          <div className="globePreviewPanel globeFallbackPanel">
            <div className="previewHeader">
              <span className="previewFlag" aria-hidden="true">
                {preview.flag}
              </span>
              <span className="previewCode">{preview.code}</span>
            </div>
            <div className="previewSection">
              <span className="previewLabel">Airport</span>
              <span className="previewValue">{preview.name}</span>
            </div>
            <div className="previewSection">
              <span className="previewLabel">Location</span>
              <span className="previewValue">
                {preview.city}, {preview.country}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flightGlobe">
        <FlightGlobe
          departure={departure}
          destination={destination}
          flightProgress={flightProgress}
          phase={phase}
          airports={airports}
          onSelectAirport={selectAirport}
          onForceDeparture={forceDeparture}
          onClearSelection={clearSelection}
          hoveredAirport={hoveredAirport}
          setHoveredAirport={setHoveredAirport}
          spinRequest={spinRequest}
        />
      </div>

      <div className="globeSearchOverlay">
        <AirportSearch
          selected={departure}
          onSelect={selectAirport}
          placeholder="Departure"
          id="globe-departure"
        />
        <AirportSearch
          selected={destination}
          onSelect={selectAirport}
          placeholder="Destination"
          id="globe-destination"
        />
      </div>

      <div className={`globePreviewPanel${preview ? "" : " empty"}`}>
        <div className="previewHeader">
          <span className="previewFlag" aria-hidden="true">
            {preview ? preview.flag : "—"}
          </span>
          <span className="previewCode">{preview ? preview.code : "----"}</span>
        </div>

        {preview ? (
          <>
            <div className="previewSection">
              <span className="previewLabel">Airport</span>
              <span className="previewValue">{preview.name}</span>
            </div>
            <div className="previewSection">
              <span className="previewLabel">Location</span>
              <span className="previewValue">
                {preview.city}, {preview.country}
              </span>
            </div>
            <p className="previewCoords">
              {formatCoords(preview.lat, preview.lng)}
            </p>
            {previewRole && (
              <span className={`previewRole ${previewRole}`}>
                {previewRole === "departure" ? "Departure" : "Destination"}
              </span>
            )}
            {distanceMiles != null && departure && (
              <p className="previewDistance">
                {Math.round(distanceMiles).toLocaleString()} mi from{" "}
                {departure.code}
              </p>
            )}
          </>
        ) : (
          <div className="previewSection">
            <span className="previewLabel">No selection</span>
            <span className="previewValue">
              Hover an airport pin to preview it.
            </span>
          </div>
        )}
      </div>

      <div className="globeHint">
        Click a pin to set <kbd>departure</kbd> then <kbd>destination</kbd> ·
        double-click for departure · <kbd>⌫</kbd> clears
      </div>
    </>
  );
}
