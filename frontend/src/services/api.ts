/**
 * Central API configuration for backend communication.
 * 
 * All backend calls must go through this module.
 * Do not hardcode URLs elsewhere.
 *
 * Verified backend endpoints (Spring Boot):
 *   POST   /api/auth/register
 *   POST   /api/auth/login
 *   GET    /api/health
 *   GET    /api/flights/search?flight_iata=&dep_iata=&arr_iata=&airline_iata=&flight_status=&limit=&sortBy=&order=
 *   GET    /api/flights/{flightNumber}
 *   GET    /api/flights/{flightNumber}/tracking
 *   GET    /api/airports/{iata}
 *   GET    /api/airports/{iata}/departures?limit=
 *   GET    /api/airports/{iata}/arrivals?limit=
 *   POST   /api/bookings
 *   GET    /api/bookings?page=&size=
 *   GET    /api/bookings/{id}
 *   GET    /api/weather?latitude=&longitude=
 *   GET    /api/weather/airport/{iata}
 *   GET    /api/atc/test
 *   POST   /api/atc/telemetry
 *   GET    /api/atc/telemetry?flightNumber=&page=&size=
 *   GET    /api/atc/telemetry/{id}
 *   POST   /api/atc/anomalies
 *   GET    /api/atc/anomalies?flightNumber=&page=&size=
 *   GET    /api/atc/anomalies/{id}
 *   PATCH  /api/atc/anomalies/{id}/status
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
const TOKEN_KEY = "flight_tracking_token";

export function getApiBaseUrl(): string {
  return API_BASE_URL.replace(/\/$/, "");
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors (SSR or private mode)
  }
}

type ApiOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  auth?: boolean; // whether to attach Authorization header (default true)
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers = {}, ...rest } = options;
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (auth) {
    const token = getToken();
    if (token) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
  });

  if (!res.ok) {
    // Try to parse error body for better message
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-json error
    }
    const message =
      (body as { message?: string })?.message ??
      (body as { error?: string })?.error ??
      `Request failed with ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export const Api = {
  get: <T>(path: string, opts?: ApiOptions) => apiFetch<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...opts, method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...opts, method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    apiFetch<T>(path, { ...opts, method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, opts?: ApiOptions) => apiFetch<T>(path, { ...opts, method: "DELETE" }),
};

export { TOKEN_KEY };
