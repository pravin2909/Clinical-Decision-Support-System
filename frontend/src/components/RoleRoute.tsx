/** Guards a route to a single role; wrong role is bounced to the app home. */
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthProvider";

export default function RoleRoute({
  role,
  children,
}: {
  role: "patient" | "doctor";
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role && user.role !== "admin") {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}
