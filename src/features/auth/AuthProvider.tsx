import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type KeycloakType from 'keycloak-js';
import keycloak from './keycloak';
import { AlertCircle, Layers, RefreshCw } from 'lucide-react';
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithRedirect, signOut } from 'firebase/auth';
import { identityAuth, isIdentityPlatformConfigured } from './firebase';
import { configureCognito, getCognitoProfile, getCognitoToken, getCognitoUser, isCognitoConfigured, signInWithCognito, signOutCognito } from './cognito';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tokenParsed: Record<string, any> | KeycloakType['tokenParsed'];
}

interface AuthContextValue {
  ready: boolean;
  user: AuthUser | null;
  getToken: () => Promise<string>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

const ROLE_MAP: Record<string, string> = {
  'platform-admin': 'Super Admin',
  'super-admin': 'Super Admin',
  'org-admin': 'Organization Admin',
  'sales-manager': 'Sales Manager',
  'loan-agent': 'Loan Agent',
  'collection-agent': 'Collection Agent',
  'ai-agent-manager': 'AI Agent Manager',
};

function mapRole(value: unknown): string {
  if (typeof value !== 'string') return 'user';
  return ROLE_MAP[value] ?? value;
}

function extractKeycloakUser(kc: KeycloakType): AuthUser {
  const p = kc.tokenParsed ?? {};
  const realmRoles: string[] = (p as any)?.realm_access?.roles ?? [];
  const clientRoles: string[] = (p as any)?.resource_access?.[kc.clientId!]?.roles ?? [];
  const appRoles = [...realmRoles, ...clientRoles].filter(
    r => !['offline_access', 'uma_authorization', 'default-roles-chiefvoice'].includes(r)
  );
  return {
    id: (p as any).sub ?? '',
    email: (p as any).email ?? '',
    name: (p as any).name ?? (p as any).preferred_username ?? null,
    role: mapRole(appRoles[0]),
    tokenParsed: p,
  };
}

function extractIdentityUser(user: import('firebase/auth').User, claims: Record<string, any>): AuthUser {
  const rawRole = claims.role ?? (claims.roles?.[0]) ?? (claims.platformAdmin ? 'platform-admin' : 'user');
  return {
    id: user.uid,
    email: user.email ?? '',
    name: user.displayName ?? null,
    role: mapRole(rawRole),
    tokenParsed: claims,
  };
}

type InitState = 'loading' | 'ready' | 'error';
const provider = String(import.meta.env.VITE_AUTH_PROVIDER || 'cognito').toLowerCase();

function extractCognitoUser(user: any, claims: Record<string, any>): AuthUser {
  // Cognito deployments may expose the platform-admin privilege as a
  // custom role, a boolean claim, or an `admin` claim. Normalize all of
  // those forms so a platform admin can never fall through to the org app.
  const rawRole = claims['custom:role']
    ?? claims.role
    ?? (claims.platformAdmin === true || claims.admin === true ? 'platform-admin' : 'user');
  const profileName =
    claims.name ||
    [claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
    user.attributes?.name ||
    [user.attributes?.given_name, user.attributes?.family_name].filter(Boolean).join(' ') ||
    null;

  return {
    id: user.userId ?? claims.sub ?? '',
    email: claims.email ?? '',
    name: profileName,
    role: mapRole(rawRole),
    tokenParsed: claims,
  };
}

function LoadingSplash() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <div className="h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/40 animate-pulse">
        <Layers className="h-7 w-7 text-white" />
      </div>
      <p className="text-slate-400 text-sm font-medium animate-pulse">Connecting to identity provider…</p>
    </div>
  );
}

function ErrorSplash({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 p-6">
      <div className="h-14 w-14 rounded-2xl bg-rose-600/20 flex items-center justify-center">
        <AlertCircle className="h-7 w-7 text-rose-400" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-white font-bold text-lg mb-2">Authentication unavailable</h2>
        <p className="text-slate-400 text-sm leading-relaxed">{message}</p>
      </div>
      <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors">
        <RefreshCw className="h-4 w-4" /> Retry
      </button>
      <p className="text-xs text-slate-600 text-center max-w-md">{hint}</p>
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (provider === 'identity_platform') return <IdentityPlatformProvider>{children}</IdentityPlatformProvider>;
  if (provider === 'cognito') return <CognitoAuthProvider>{children}</CognitoAuthProvider>;
  return <KeycloakAuthProvider>{children}</KeycloakAuthProvider>;
}

function KeycloakAuthProvider({ children }: { children: React.ReactNode }) {
  const [initState, setInitState] = useState<InitState>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    keycloak.init({ pkceMethod: 'S256', onLoad: 'login-required', checkLoginIframe: false, responseMode: 'fragment' })
      .then(authenticated => {
        if (authenticated) {
          setUser(extractKeycloakUser(keycloak));
          setInitState('ready');
        } else keycloak.login();
      })
      .catch(err => {
        console.error('Keycloak init failed:', err);
        setErrorMsg(err?.message ?? 'Could not connect to Keycloak.');
        setInitState('error');
      });

    keycloak.onTokenExpired = () => { keycloak.updateToken(30).catch(() => keycloak.login()); };
    keycloak.onAuthRefreshSuccess = () => {
      setUser(prev => {
        const next = extractKeycloakUser(keycloak);
        return prev && prev.id === next.id && prev.email === next.email && prev.role === next.role && prev.name === next.name ? prev : next;
      });
    };
    keycloak.onAuthLogout = () => { setUser(null); setInitState('loading'); };
  }, []);

  const getToken = useCallback(async () => {
    await keycloak.updateToken(10).catch(() => keycloak.login());
    return keycloak.token ?? '';
  }, []);

  const logout = useCallback(() => { keycloak.logout({ redirectUri: window.location.origin }); }, []);

  if (initState === 'loading') return <LoadingSplash />;
  if (initState === 'error') return <ErrorSplash message={errorMsg} hint="Check VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM and VITE_KEYCLOAK_CLIENT_ID." />;
  return <AuthContext.Provider value={{ ready: true, user, getToken, logout }}>{children}</AuthContext.Provider>;
}

function CognitoAuthProvider({ children }: { children: React.ReactNode }) {
  const [initState, setInitState] = useState<InitState>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!isCognitoConfigured()) { setErrorMsg('AWS Cognito frontend configuration is incomplete.'); setInitState('error'); return; }
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) {
      sessionStorage.removeItem('cognito_signin_attempted');
      setErrorMsg(`Cognito rejected the sign-in request: ${oauthError}${params.get('error_description') ? ` (${params.get('error_description')})` : ''}.`);
      setInitState('error');
      return;
    }
    (async () => {
      try {
        configureCognito();
        const current = await getCognitoUser();
        if (!current) {
          // A deliberate logout must not immediately trigger the automatic
          // Cognito login redirect again. Leave the app in a logged-out state
          // and let the /login page start a new sign-in explicitly.
          const logoutRequested = sessionStorage.getItem('cognito_logout_requested') === '1';
          if (logoutRequested) {
            sessionStorage.removeItem('cognito_logout_requested');
            sessionStorage.removeItem('cognito_signin_attempted');
            setUser(null);
            setInitState('ready');
            return;
          }

          const alreadyAttempted = sessionStorage.getItem('cognito_signin_attempted') === '1';
          if (alreadyAttempted) {
            sessionStorage.removeItem('cognito_signin_attempted');
            setErrorMsg('Sign-in did not complete. This usually means the redirect URI is not registered as an allowed callback URL on the Cognito app client, or the app client has no login method enabled.');
            setInitState('error');
            return;
          }
          sessionStorage.setItem('cognito_signin_attempted', '1');
          await signInWithCognito();
          return;
        }
        sessionStorage.removeItem('cognito_signin_attempted');
        const session = await (await import('aws-amplify/auth')).fetchAuthSession();
        const claims = session.tokens?.idToken?.payload ?? {};
        // fetchUserAttributes() reads the profile attributes stored in the
        // Cognito user pool. This complements ID-token claims and ensures
        // the header can display the user's configured name.
        const profile = await getCognitoProfile();
        setUser(extractCognitoUser(current, { ...claims, ...profile, ...(current.attributes ?? {}) }));
        setInitState('ready');
      } catch (err: any) { setErrorMsg(err?.message ?? 'Could not connect to AWS Cognito.'); setInitState('error'); }
    })();
  }, []);

  const getToken = useCallback(() => getCognitoToken(), []);
  const logout = useCallback(() => { void signOutCognito(); }, []);
  if (initState === 'loading') return <LoadingSplash />;
  if (initState === 'error') return <ErrorSplash message={errorMsg} hint="Check VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_CLIENT_ID, VITE_COGNITO_REGION and VITE_COGNITO_DOMAIN." />;
  return <AuthContext.Provider value={{ ready: true, user, getToken, logout }}>{children}</AuthContext.Provider>;
}

function IdentityPlatformProvider({ children }: { children: React.ReactNode }) {
  const [initState, setInitState] = useState<InitState>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const redirectStarted = useRef(false);

  useEffect(() => {
    if (!isIdentityPlatformConfigured()) {
      setErrorMsg('Identity Platform frontend configuration is incomplete.');
      setInitState('error');
      return;
    }

    let unsubscribe = () => {};
    let mounted = true;

    (async () => {
      try {
        const auth = identityAuth!;
        await getRedirectResult(auth);
        unsubscribe = onAuthStateChanged(auth, async currentUser => {
          if (!mounted) return;
          if (!currentUser) {
            if (!redirectStarted.current) {
              redirectStarted.current = true;
              await signInWithRedirect(auth, new GoogleAuthProvider());
            }
            return;
          }
          const tokenResult = await currentUser.getIdTokenResult();
          if (!mounted) return;
          setUser(extractIdentityUser(currentUser, tokenResult.claims));
          setInitState('ready');
        });
      } catch (err: any) {
        if (!mounted) return;
        console.error('Identity Platform init failed:', err);
        setErrorMsg(err?.message ?? 'Could not connect to Google Identity Platform.');
        setInitState('error');
      }
    })();

    return () => { mounted = false; unsubscribe(); };
  }, []);

  const getToken = useCallback(async () => {
    const currentUser = identityAuth?.currentUser;
    if (!currentUser) throw new Error('Identity Platform user is not authenticated');
    return currentUser.getIdToken();
  }, []);

  const logout = useCallback(() => {
    if (!identityAuth) return;
    void signOut(identityAuth).then(() => { window.location.assign('/login'); });
  }, []);

  if (initState === 'loading') return <LoadingSplash />;
  if (initState === 'error') return <ErrorSplash message={errorMsg} hint="Check VITE_IDENTITY_PLATFORM_API_KEY, VITE_IDENTITY_PLATFORM_AUTH_DOMAIN, VITE_IDENTITY_PLATFORM_PROJECT_ID and VITE_IDENTITY_PLATFORM_APP_ID." />;
  return <AuthContext.Provider value={{ ready: true, user, getToken, logout }}>{children}</AuthContext.Provider>;
}
