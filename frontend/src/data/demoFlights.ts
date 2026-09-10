/**
 * Local demo flight data for Aircraft Phase 1B.
 * AeroDataBox quota exhausted — this file provides a single deterministic
 * flight → aircraft mapping. Will be replaced by AeroDataBox resolver later
 * without changing the UI contract (NormalizedAircraftInfo).
 */

export interface DemoFlight {
  flightNumber: string; // e.g. 6E1234 (no spaces, uppercase)
  airline: string;
  aircraft: string; // display name
  icaoType: string; // e.g. A20N
  modelKey: string; // resolves to /models/<modelKey>.glb via AircraftViewer
  seatMapKey: string; // key into seatMaps.ts
  date: string; // YYYY-MM-DD prototype date
  registration: string | null; // null = demo unavailable
}

export const DEMO_FLIGHTS: DemoFlight[] = [
  {
    flightNumber: "6E1234",
    airline: "IndiGo",
    aircraft: "Airbus A320neo",
    icaoType: "A20N",
    modelKey: "a320neo",
    seatMapKey: "indigo-a320neo-186",
    date: "2026-09-10",
    registration: null,
  },
];

export function resolveDemoFlight(flightNumber: string, date: string): DemoFlight | null {
  const normalizedFlight = flightNumber.trim().toUpperCase().replace(/\s+/g, "");
  const normalizedDate = date.trim();
  if (!normalizedFlight || !normalizedDate) return null;
  return DEMO_FLIGHTS.find((f) => f.flightNumber === normalizedFlight && f.date === normalizedDate) ?? null;
}

export function listDemoFlights(): DemoFlight[] {
  return [...DEMO_FLIGHTS];
}
