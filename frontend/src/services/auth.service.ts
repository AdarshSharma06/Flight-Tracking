import { Api } from "@/services/api";
import type { AuthResponse, LoginRequest, RegisterRequest, RegisterResponse } from "@/types/auth";

export const authService = {
  login(payload: LoginRequest) {
    return Api.post<AuthResponse>("/api/auth/login", payload, { auth: false });
  },
  register(payload: RegisterRequest) {
    return Api.post<RegisterResponse>("/api/auth/register", payload, { auth: false });
  },
  health() {
    return Api.get<{ status: string; message: string }>("/api/health", { auth: false });
  },
};
