// Aligned with backend com.flighttracking.dto.PageResponse
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

// Backend: com.flighttracking.dto.flight.FlightDto
export interface FlightDto {
  flightNumber: string | null;
  flightIata: string | null;
  flightIcao: string | null;
  airlineName: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  departureAirport: string | null;
  departureIata: string | null;
  departureIcao: string | null;
  departureTerminal: string | null;
  departureGate: string | null;
  departureScheduled: string | null;
  departureEstimated: string | null;
  departureActual: string | null;
  departureDelay: string | null;
  arrivalAirport: string | null;
  arrivalIata: string | null;
  arrivalIcao: string | null;
  arrivalTerminal: string | null;
  arrivalGate: string | null;
  arrivalScheduled: string | null;
  arrivalEstimated: string | null;
  arrivalActual: string | null;
  arrivalDelay: string | null;
  status: string | null;
  aircraftRegistration: string | null;
  aircraftIata: string | null;
  aircraftIcao: string | null;
}

export interface FlightSearchResponse {
  flights: FlightDto[];
  count: number;
}

export interface FlightTrackingDto {
  flightNumber: string | null;
  flightIata: string | null;
  flightIcao: string | null;
  flightDate: string | null;
  status: string | null;
  airlineName: string | null;
  airlineIata: string | null;
  airlineIcao: string | null;
  aircraftRegistration: string | null;
  aircraftIata: string | null;
  aircraftIcao: string | null;
  departureAirport: string | null;
  departureIata: string | null;
  departureIcao: string | null;
  departureTerminal: string | null;
  departureGate: string | null;
  departureScheduled: string | null;
  departureEstimated: string | null;
  departureActual: string | null;
  arrivalAirport: string | null;
  arrivalIata: string | null;
  arrivalIcao: string | null;
  arrivalTerminal: string | null;
  arrivalGate: string | null;
  arrivalScheduled: string | null;
  arrivalEstimated: string | null;
  arrivalActual: string | null;
  route: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  speedVertical: number | null;
  direction: number | null;
  isGround: boolean | null;
  liveUpdated: string | null;
  departureDelay: string | null;
  arrivalDelay: string | null;
}

// Backend: com.flighttracking.dto.airport.AirportDto
export interface AirportDto {
  iata: string;
  icao: string | null;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  countryIso2: string | null;
}

// Backend: com.flighttracking.dto.weather.WeatherDto
export interface WeatherDto {
  latitude: number;
  longitude: number;
  timezone: string | null;
  temperature: number;
  apparentTemperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  weatherCondition: string | null;
  observationTime: string | null;
}

// Backend: com.flighttracking.dto.booking.BookingResponse
export interface BookingResponse {
  id: number;
  userId: number;
  username: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureScheduled: string | null;
  arrivalScheduled: string | null;
  airlineName: string | null;
  aircraftRegistration: string | null;
  status: string;
  createdAt: string;
}

export interface BookingRequest {
  flightNumber: string;
  origin: string;
  destination: string;
  departureScheduled?: string | null;
  arrivalScheduled?: string | null;
  airlineName?: string | null;
  aircraftRegistration?: string | null;
}

export interface HealthResponse {
  status: string;
  application: string;
  timestamp: string;
}

export interface MessageResponse {
  message: string;
}

// Backend: com.flighttracking.dto.telemetry.TelemetryResponse
export interface TelemetryResponse {
  id: number;
  flightNumber: string;
  flightIata: string | null;
  flightIcao: string | null;
  airlineIata: string | null;
  originIata: string | null;
  destinationIata: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  direction: number | null;
  heading: number | null;
  flightStatus: string | null;
  routeInfo: string | null;
  aircraftRegistration: string | null;
  recordedAt: string | null;
  createdAt: string;
}

export interface TelemetryRequest {
  flightNumber: string;
  flightIata?: string | null;
  flightIcao?: string | null;
  airlineIata?: string | null;
  originIata?: string | null;
  destinationIata?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  speed?: number | null;
  direction?: number | null;
  heading?: number | null;
  flightStatus?: string | null;
  routeInfo?: string | null;
  aircraftRegistration?: string | null;
}

// Backend: com.flighttracking.dto.anomaly.AnomalyResponse
export interface AnomalyResponse {
  id: number;
  flightNumber: string;
  flightIata: string | null;
  anomalyType: string;
  severity: string; // LOW | MEDIUM | HIGH | CRITICAL
  description: string | null;
  status: string; // OPEN | INVESTIGATING | RESOLVED | FALSE_POSITIVE
  telemetryId: number | null;
  detectedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnomalyRequest {
  flightNumber: string;
  flightIata?: string | null;
  anomalyType: string; // ^[A-Za-z0-9_\-]+$
  severity: string; // LOW|MEDIUM|HIGH|CRITICAL
  description?: string | null;
  status?: string | null; // OPEN|INVESTIGATING|RESOLVED|FALSE_POSITIVE
  telemetryId?: number | null;
}
