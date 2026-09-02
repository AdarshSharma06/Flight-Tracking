import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getToken, setToken } from "@/services/api";
import type { Role, JwtPayload, User } from "@/types/auth";

function parseJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function toUserFromToken(token: string): User | null {
  const payload = parseJwt(token);
  if (!payload || !payload.sub) return null;
  // exp is in seconds
  if (payload.exp && Date.now() >= payload.exp * 1000) return null;
  return {
    id: 0, // id not encoded in JWT; fetched separately if needed
    username: payload.sub,
    role: (payload.role as Role) ?? "USER",
  };
}

type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  role: Role | null;
  login: (token: string) => void;
  logout: () => void;
  hasRole: (roles: Role | Role[]) => boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(() => (token ? toUserFromToken(token) : null));

  useEffect(() => {
    if (token) {
      const u = toUserFromToken(token);
      setUser(u);
      if (!u) {
        // expired or invalid token -> clear
        setToken(null);
        setTokenState(null);
      }
    } else {
      setUser(null);
    }
  }, [token]);

  const value = useMemo<AuthState>(() => {
    return {
      user,
      token,
      isAuthenticated: !!user && !!token,
      role: user?.role ?? null,
      login: (newToken: string) => {
        setToken(newToken);
        setTokenState(newToken);
      },
      logout: () => {
        setToken(null);
        setTokenState(null);
        setUser(null);
      },
      hasRole: (roles) => {
        if (!user) return false;
        const arr = Array.isArray(roles) ? roles : [roles];
        return arr.includes(user.role);
      },
    };
  }, [user, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
