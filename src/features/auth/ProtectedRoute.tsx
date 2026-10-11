import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import LoadingState from '../../components/ui/LoadingIndicator';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { ready, user } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingState variant="page" label="Checking your session…" description="Preparing secure access." />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (allowedRoles?.length && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
