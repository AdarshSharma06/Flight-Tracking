import { Api } from "./api";

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  answer: string;
  model: string;
  requestId: string;
  conversationId?: string;
}

export interface RecommendationRequest {
  query: string;
}

export interface RecommendationFlightInfo {
  flight_number?: string | null;
  origin?: string | null;
  destination?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  airline?: string | null;
  status?: string | null;
  aircraft?: string | null;
}

export interface RecommendationScoredFlight {
  flight: RecommendationFlightInfo;
  score: number;
  score_breakdown: Record<string, unknown>;
  weather_available: boolean;
  prediction_available: boolean;
}

export interface RecommendationResponse {
  recommended_flight: RecommendationScoredFlight | null;
  alternatives: RecommendationScoredFlight[];
  explanation: string;
  limitations: string[];
  total_flights_evaluated: number;
  requestId: string;
}

export const aiService = {
  chat: (message: string, conversationId?: string) =>
    Api.post<ChatResponse>("/api/ai/chat", {
      message,
      ...(conversationId ? { conversationId } : {}),
    }),
  recommend: (query: string) =>
    Api.post<RecommendationResponse>("/api/ai/recommend", { query }),
};
