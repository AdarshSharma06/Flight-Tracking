import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/types/auth";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  roles?: Role[];
  redirectTo?: string;
};

export function ProtectedRoute({ children, roles, redirectTo = "/" }: Props) {
  const { isAuthenticated, hasRole } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  if (roles && roles.length > 0 && !hasRole(roles)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
