import { useCallback, useEffect, useRef, useState } from "react";
import { getJourney, setJourney } from "../focus/api";
import type { Airport } from "../map/AirportSearch";

export interface JourneyController {
  departure: Airport | null;
  destination: Airport | null;
  setDeparture: (airport: Airport | null) => void;
  setDestination: (airport: Airport | null) => void;
  clearDeparture: () => void;
  clearDestination: () => void;
  swap: () => void;
  /** Re-read the persisted journey (used after a data import). */
  reload: () => Promise<void>;
}

/**
 * Owns the selected airports and keeps them persisted. State stays here rather
 * than inside the globe so the timer and the globe always agree.
 */
export function useJourney(
  ready: boolean,
  airports: Airport[],
  onPersisted?: () => void,
): JourneyController {
  const [departure, setDeparture] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);

  const onPersistedRef = useRef(onPersisted);
  onPersistedRef.current = onPersisted;

  const applyPersisted = useCallback(
    (journey: { departureCode: string; destinationCode: string } | null) => {
      if (!journey) return;
      const dep = airports.find((a) => a.code === journey.departureCode);
      const dest = airports.find((a) => a.code === journey.destinationCode);
      if (dep) setDeparture(dep);
      if (dest) setDestination(dep ? dest : null);
    },
    [airports],
  );

  const reload = useCallback(async () => {
    const journey = await getJourney();
    applyPersisted(journey);
  }, [applyPersisted]);

  useEffect(() => {
    if (!ready) return;
    getJourney()
      .then(applyPersisted)
      .catch((e) => console.error("failed to load journey", e));
  }, [ready, applyPersisted]);

  // Persist only once both ends are known; half a route is not worth storing.
  const departureCode = departure?.code;
  const destinationCode = destination?.code;

  useEffect(() => {
    if (!ready || !departureCode || !destinationCode) return;
    setJourney(departureCode, destinationCode)
      .then(() => onPersistedRef.current?.())
      .catch((e) => console.error("failed to persist journey", e));
  }, [ready, departureCode, destinationCode]);

  const clearDeparture = useCallback(() => setDeparture(null), []);
  const clearDestination = useCallback(() => setDestination(null), []);

  const swap = useCallback(() => {
    setDeparture((currentDeparture) => {
      setDestination(currentDeparture);
      return destination;
    });
  }, [destination]);

  return {
    departure,
    destination,
    setDeparture,
    setDestination,
    clearDeparture,
    clearDestination,
    swap,
    reload,
  };
}
