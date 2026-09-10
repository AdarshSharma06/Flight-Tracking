/**
 * Seat map data for Aircraft Phase 1B.
 * First prototype: IndiGo A320neo 186 seats (31 rows × 6 abreast).
 * Data-driven — JSX renders from this file, not hardcoded rows.
 * No invented legroom/exit/missing-window metadata (unverified → omitted).
 * Future models: add e.g. "a320-180", "b737-max-8-189" entries.
 */

export type SeatSide = "left" | "right";
export type SeatPosition = "window" | "middle" | "aisle";

export interface SeatMap {
  key: string;
  name: string;
  aircraft: string;
  icaoType: string;
  totalSeats: number;
  rows: number;
  letters: string[]; // e.g. ["A","B","C","D","E","F"]
  /** letters after which an aisle gap is rendered (empty string for no aisle) */
  aisleAfter: string[]; // e.g. ["C"] → gap between C | D
}

export interface SeatInfo {
  id: string; // e.g. "12A"
  row: number;
  letter: string;
  side: SeatSide;
  position: SeatPosition;
}

export const SEAT_MAPS: Record<string, SeatMap> = {
  "indigo-a320neo-186": {
    key: "indigo-a320neo-186",
    name: "IndiGo A320neo — 186 seats",
    aircraft: "Airbus A320neo",
    icaoType: "A20N",
    totalSeats: 186,
    rows: 31,
    letters: ["A", "B", "C", "D", "E", "F"],
    aisleAfter: ["C"],
  },
};

export function getSeatMap(key: string): SeatMap | null {
  return SEAT_MAPS[key] ?? null;
}

export function seatId(row: number, letter: string): string {
  return `${row}${letter.toUpperCase()}`;
}

export function parseSeatId(input: string): { row: number; letter: string } | null {
  const normalized = input.trim().toUpperCase().replace(/\s+/g, "");
  const m = normalized.match(/^(\d{1,2})([A-F])$/);
  if (!m) return null;
  const row = parseInt(m[1], 10);
  const letter = m[2];
  if (row < 1 || row > 31) return null;
  return { row, letter };
}

export function getSeatInfo(map: SeatMap, row: number, letter: string): SeatInfo | null {
  const upperLetter = letter.toUpperCase();
  if (!map.letters.includes(upperLetter)) return null;
  if (row < 1 || row > map.rows) return null;
  const idx = map.letters.indexOf(upperLetter);
  // A320 3-3: A,B,C left | D,E,F right; A/F window, C/D aisle, B/E middle
  const side: SeatSide = idx <= 2 ? "left" : "right";
  let position: SeatPosition = "middle";
  if (upperLetter === "A" || upperLetter === "F") position = "window";
  else if (upperLetter === "C" || upperLetter === "D") position = "aisle";
  return {
    id: `${row}${upperLetter}`,
    row,
    letter: upperLetter,
    side,
    position,
  };
}

export function seatExists(map: SeatMap, seatInput: string): boolean {
  const parsed = parseSeatId(seatInput);
  if (!parsed) return false;
  return getSeatInfo(map, parsed.row, parsed.letter) !== null;
}
