import { Api } from "@/services/api";
import type { WeatherDto } from "@/types/api";

export const weatherService = {
  getByCoordinates(latitude: number, longitude: number) {
    return Api.get<WeatherDto>(`/api/weather?latitude=${latitude}&longitude=${longitude}`);
  },
  getByAirport(iata: string) {
    return Api.get<WeatherDto>(`/api/weather/airport/${encodeURIComponent(iata.toUpperCase())}`);
  },
};
