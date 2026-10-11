import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, XCircle, Copy, Check, LogIn } from 'lucide-react';

type State = 'loading' | 'ready' | 'error';

export default function MagicLogin() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';

  const [state, setState] = useState<State>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  useEffect(() => {
    if (!token) { setErrorMsg('No magic link token found.'); setState('error'); return; }
    const base = (import.meta as any).env.VITE_API_URL || '';
    fetch(`${base}/api/auth/magic?t=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErrorMsg(data.error); setState('error'); return; }
        setEmail(data.email);
        setPassword(data.password);
        setState('ready');
      })
      .catch(() => { setErrorMsg('Could not reach the server.'); setState('error'); });
  }, [token]);

  const copy = (text: string, which: 'email' | 'pass') => {
    navigator.clipboard.writeText(text);
    if (which === 'email') { setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000); }
    else { setCopiedPass(true); setTimeout(() => setCopiedPass(false), 2000); }
  };

  const goToLogin = () => {
    const kcBase = (import.meta as any).env.VITE_KEYCLOAK_URL || 'http://localhost:8081';
    const realm  = (import.meta as any).env.VITE_KEYCLOAK_REALM || 'chiefvoice';
    const client = (import.meta as any).env.VITE_KEYCLOAK_CLIENT_ID || 'chiefvoice-app';
    const redirect = encodeURIComponent(window.location.origin + '/');
    window.location.href =
      `${kcBase}/realms/${realm}/protocol/openid-connect/auth` +
      `?client_id=${client}&redirect_uri=${redirect}&response_type=code` +
      `&scope=openid+profile+email&login_hint=${encodeURIComponent(email)}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-amber-500 px-8 py-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl mb-3">
            <LogIn className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Chief Connect</h1>
          <p className="text-amber-100 text-sm mt-1">Your login credentials</p>
        </div>

        <div className="px-8 py-7">
          {state === 'loading' && (
            <div className="flex flex-col items-center py-6 gap-3 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">Verifying your link…</span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center py-6 gap-3 text-center">
              <XCircle className="h-10 w-10 text-rose-500" />
              <p className="text-white font-semibold">Link expired or invalid</p>
              <p className="text-slate-400 text-sm">{errorMsg}</p>
              <button
                onClick={goToLogin}
                className="mt-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-xl"
              >
                Go to Login Page
              </button>
            </div>
          )}

          {state === 'ready' && (
            <>
              <p className="text-slate-300 text-sm mb-5">
                Copy your credentials below, then sign in.
              </p>

              <div className="space-y-3 mb-6">
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Email</p>
                    <p className="text-white text-sm font-mono">{email}</p>
                  </div>
                  <button onClick={() => copy(email, 'email')} className="text-slate-400 hover:text-white shrink-0">
                    {copiedEmail ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Password</p>
                    <p className="text-white text-sm font-mono">{password}</p>
                  </div>
                  <button onClick={() => copy(password, 'pass')} className="text-slate-400 hover:text-white shrink-0">
                    {copiedPass ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                onClick={goToLogin}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm py-3.5 rounded-xl"
              >
                <LogIn className="h-4 w-4" /> Go to Login Page
              </button>

              <p className="text-center text-slate-500 text-xs mt-4">
                This link expires in 48 hours.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
