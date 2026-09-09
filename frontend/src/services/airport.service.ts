import { Api } from "@/services/api";
import type { AirportDto, AirportExplorerData, FlightDto } from "@/types/api";

export interface AirportFlightsResponse {
  airport: string;
  type: "departures" | "arrivals";
  count: number;
  flights: FlightDto[];
}

export const airportService = {
  getByIata(iata: string) {
    return Api.get<AirportDto>(`/api/airports/${encodeURIComponent(iata.toUpperCase())}`);
  },
  search(query: string) {
    return Api.get<AirportDto[]>(`/api/airports/search?q=${encodeURIComponent(query)}`);
  },
  getDepartures(iata: string, limit?: number) {
    const q = limit ? `?limit=${limit}` : "";
    return Api.get<AirportFlightsResponse>(`/api/airports/${encodeURIComponent(iata.toUpperCase())}/departures${q}`);
  },
  getArrivals(iata: string, limit?: number) {
    const q = limit ? `?limit=${limit}` : "";
    return Api.get<AirportFlightsResponse>(`/api/airports/${encodeURIComponent(iata.toUpperCase())}/arrivals${q}`);
  },
  getExplorer(iata: string) {
    return Api.get<AirportExplorerData>(`/api/airports/${encodeURIComponent(iata.toUpperCase())}/explorer`);
  },
};
