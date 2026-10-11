import React, { useEffect, useState } from 'react';
import { Globe2, ShieldAlert, Loader2 } from 'lucide-react';
import { apiFetch } from './lib/api';
import { useAuth } from './features/auth/AuthProvider';
import AdminShell from './admin/AdminShell';

type Status = 'checking' | 'denied' | 'authorized';

// Platform admin shell — uses the same Keycloak session as the main app.
// Authentication is handled by the environment-selected AuthProvider in main.tsx.
// This component just checks whether the logged-in user is on the
// Platform-admin access is verified by the backend via GET /api/platform/whoami.
export default function AdminApp() {
  const { ready, user, logout } = useAuth();
  const [status, setStatus] = useState<Status>('checking');
  const [deniedEmail, setDeniedEmail] = useState('');

  useEffect(() => {
    document.title = 'Chief Connect | Platform Admin';
  }, []);

  useEffect(() => {
    if (!ready) return;
    setStatus('checking');
    apiFetch('/api/platform/whoami')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setDeniedEmail(data.email || user?.email || '');
          setStatus('authorized');
        } else {
          let message = '';
          try {
            const body = await res.json();
            message = body?.error || '';
          } catch {}
          setDeniedEmail(message || user?.email || '');
          setStatus('denied');
        }
      })
      .catch((error) => {
        console.error('Platform admin check failed:', error);
        setDeniedEmail(user?.email || '');
        setStatus('denied');
      });
  }, [ready, user?.email]);

  if (!ready || status === 'checking') {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col items-center justify-center p-6 font-sans text-center">
        <div className="h-14 w-14 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30 mb-4">
          <Globe2 className="h-7 w-7 text-white" />
        </div>
        <ShieldAlert className="h-10 w-10 text-rose-500 mb-4" />
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Access Denied</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          {deniedEmail || 'This account'} is not on the platform-admin allowlist.
          This is the operator panel, not the customer dashboard.
        </p>
        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-indigo-400 hover:text-indigo-300 underline">
            Go to workspace dashboard
          </a>
          <button
            onClick={logout}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
          >
            Sign out and try a different account
          </button>
        </div>
      </div>
    );
  }

  return <AdminShell email={deniedEmail} onLogout={logout} />;
}
