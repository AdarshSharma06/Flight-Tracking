import { Api } from "@/services/api";
import type { AnomalyResponse, AtcExplanationResponse, PageResponse, TelemetryResponse } from "@/types/api";

export interface AtcTelemetryParams {
  flightNumber?: string;
  page?: number;
  size?: number;
}

export interface AtcAnomalyParams {
  flightNumber?: string;
  page?: number;
  size?: number;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) sp.set(k, String(v));
  });
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export const atcService = {
  // Telemetry
  listTelemetry(params: AtcTelemetryParams = {}) {
    const q = buildQuery({ flightNumber: params.flightNumber, page: params.page, size: params.size });
    // backend returns either List or PageResponse depending on pagination params
    return Api.get<TelemetryResponse[] | PageResponse<TelemetryResponse>>(`/api/atc/telemetry${q}`);
  },
  listTelemetryPaginated(flightNumber: string | undefined, page: number, size: number) {
    return Api.get<PageResponse<TelemetryResponse>>(`/api/atc/telemetry${buildQuery({ flightNumber, page, size })}`);
  },
  getTelemetryById(id: number) {
    return Api.get<TelemetryResponse>(`/api/atc/telemetry/${id}`);
  },
  createTelemetry(payload: Record<string, unknown>) {
    return Api.post<TelemetryResponse>("/api/atc/telemetry", payload);
  },

  // Anomalies
  listAnomalies(params: AtcAnomalyParams = {}) {
    const q = buildQuery({ flightNumber: params.flightNumber, page: params.page, size: params.size });
    return Api.get<AnomalyResponse[] | PageResponse<AnomalyResponse>>(`/api/atc/anomalies${q}`);
  },
  listAnomaliesPaginated(flightNumber: string | undefined, page: number, size: number) {
    return Api.get<PageResponse<AnomalyResponse>>(`/api/atc/anomalies${buildQuery({ flightNumber, page, size })}`);
  },
  getAnomalyById(id: number) {
    return Api.get<AnomalyResponse>(`/api/atc/anomalies/${id}`);
  },
  updateAnomalyStatus(id: number, status: string) {
    // backend expects { status: "..." } Map<String,String>
    return Api.patch<AnomalyResponse>(`/api/atc/anomalies/${id}/status`, { status });
  },
  createAnomaly(payload: Record<string, unknown>) {
    return Api.post<AnomalyResponse>("/api/atc/anomalies", payload);
  },

  // AI Explanation (AI-7)
  explainAnomaly(anomalyId: number) {
    return Api.post<AtcExplanationResponse>(`/api/atc/anomalies/${anomalyId}/explain`);
  },

  testAccess() {
    return Api.get<{ message: string }>("/api/atc/test");
  },
};
