import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loader">Loading your experience...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export function RoleRoute({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loader">Loading your experience...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}
