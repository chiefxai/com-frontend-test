import React, { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.tsx';
import AdminApp from './AdminApp.tsx';
import ProtectedRoute from './features/auth/ProtectedRoute.tsx';
import { AuthProvider, useAuth } from './features/auth/AuthProvider.tsx';
import { signInWithCognito } from './features/auth/cognito';
import { FeatureFlagProvider } from './features/feature-flags/FeatureFlagContext.tsx';
import { ThemeProvider } from './shared/theme/ThemeContext.tsx';
import { ToastProvider } from './shared/toast/ToastContext.tsx';
import { Globe2, LogOut } from 'lucide-react';
import './index.css';

function LoginPage() {
  const { user } = useAuth();
  const redirectStarted = useRef(false);
  const provider = String(import.meta.env.VITE_AUTH_PROVIDER || 'cognito').toLowerCase();

  useEffect(() => {
    if (user || redirectStarted.current) return;
    if (provider !== 'cognito') return;

    redirectStarted.current = true;
    void signInWithCognito().catch((error) => {
      console.error('Cognito sign-in redirect failed:', error);
      redirectStarted.current = false;
    });
  }, [user, provider]);

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-sm text-slate-400">Redirecting to sign in…</p>
      </div>
    </div>
  );
}

// Blocks platform admins from the org app — they should only use /admin.
// Org users who land on /admin are already blocked there via the whoami check.
function isPlatformAdminUser(user: ReturnType<typeof useAuth>['user']): boolean {
  if (!user) return false;
  if (user.role === 'Super Admin') return true;
  const claims = user.tokenParsed as Record<string, any> | undefined;
  if (claims?.platformAdmin === true || claims?.admin === true) return true;
  const roles = [
    ...(Array.isArray(claims?.realm_access?.roles) ? claims.realm_access.roles : []),
    ...(Array.isArray(claims?.roles) ? claims.roles : []),
  ];
  return roles.includes('platform-admin') || roles.includes('super-admin');
}

function OrgRoute({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  if (isPlatformAdminUser(user)) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-sans text-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
          <Globe2 className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-lg font-bold text-white">You don't have access to this page</h2>
        <p className="text-sm text-slate-400 max-w-sm">
          This is the organization workspace. As a platform admin, your panel is at{' '}
          <a href="/admin" className="text-amber-400 underline">/admin</a>.
        </p>
        <div className="flex gap-3 mt-2">
          <a
            href="/admin"
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition-colors"
          >
            Go to Admin Panel
          </a>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-white hover:border-slate-500 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/*"
            element={
              <AuthProvider>
                <FeatureFlagProvider>
                  <Routes>
                    <Route
                      path="/admin/*"
                      element={
                        <ProtectedRoute>
                          <AdminApp />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/login"
                      element={<LoginPage />}
                    />
                    <Route
                      path="/unauthorized"
                      element={
                        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
                          <p className="text-4xl font-bold">403</p>
                          <p className="text-slate-400 text-sm">You don't have permission to access this page.</p>
                          <a href="/" className="text-indigo-400 text-sm underline">Go to dashboard</a>
                        </div>
                      }
                    />
                    <Route
                      path="/*"
                      element={
                        <ProtectedRoute>
                          <OrgRoute>
                            <App />
                          </OrgRoute>
                        </ProtectedRoute>
                      }
                    />
                  </Routes>
                </FeatureFlagProvider>
              </AuthProvider>
            }
          />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
