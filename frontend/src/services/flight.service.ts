import { Api } from "@/services/api";
import type { FlightDto, FlightSearchResponse, FlightTrackingDto } from "@/types/api";

export interface FlightSearchParams {
  flight_iata?: string;
  dep_iata?: string;
  arr_iata?: string;
  airline_iata?: string;
  flight_status?: string;
  limit?: number;
  sortBy?: string;
  order?: string;
}

function buildSearchQuery(params: FlightSearchParams): string {
  const sp = new URLSearchParams();
  if (params.flight_iata) sp.set("flight_iata", params.flight_iata);
  if (params.dep_iata) sp.set("dep_iata", params.dep_iata);
  if (params.arr_iata) sp.set("arr_iata", params.arr_iata);
  if (params.airline_iata) sp.set("airline_iata", params.airline_iata);
  if (params.flight_status) sp.set("flight_status", params.flight_status);
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.order) sp.set("order", params.order);
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const flightService = {
  search(params: FlightSearchParams) {
    return Api.get<FlightSearchResponse>(`/api/flights/search${buildSearchQuery(params)}`);
  },
  getByFlightNumber(flightNumber: string) {
    return Api.get<FlightDto>(`/api/flights/${encodeURIComponent(flightNumber)}`);
  },
  getTracking(flightNumber: string) {
    return Api.get<FlightTrackingDto>(`/api/flights/${encodeURIComponent(flightNumber)}/tracking`);
  },
};
