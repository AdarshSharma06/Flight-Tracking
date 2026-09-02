export type Role = "USER" | "ATC_EMPLOYEE" | "ADMIN";

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
}

export interface RegisterResponse {
  id: number;
  username: string;
  role: string;
  message: string;
}

export interface ApiErrorResponse {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  details?: string[] | null;
}

// JWT payload shape from JwtService: subject=username, claim role
export interface JwtPayload {
  sub: string;
  role: Role;
  exp: number;
  iat: number;
}
