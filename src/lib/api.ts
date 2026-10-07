import { getAuthorization, permissionForRequest } from './authorization';
// API fetch layer — token management is delegated to the configured auth provider.
// The selected auth provider owns token lifecycle (Keycloak in dev,
// Identity Platform in UAT/production). apiFetch obtains a fresh bearer
// token before each request.

import { getSessionToken, getSessionTokenSync } from '../features/auth/session';

// ── Token access ─────────────────────────────────────────────────────────────

/**
 * Returns a valid access token from the configured authentication provider.
 * Triggers a re-login if the session has expired server-side.
 */
async function getSessionAuthToken(): Promise<string | null> {
  return getSessionToken();
}

// Kept for places that need a synchronous URL (EventSource, <audio src>).
// Use the token already in memory — caller is responsible for ensuring it
// is fresh before constructing the URL (e.g. call the provider token helper first).
export function getAuthToken(): string | null {
  return getSessionTokenSync();
}

// No-ops preserved for any code that still imports them — actual cleanup is handled by the selected AuthProvider.
export function setAuthToken(_token: string): void { /* noop — the selected auth provider owns token lifecycle */ }
export function clearAuthToken(): void             { /* noop — use the selected auth provider logout */ }

// ── Base URL ─────────────────────────────────────────────────────────────────

export function getApiBase(): string {
  // VITE_API_URL must point to the backend origin. Normalize host-only values
  // such as "dev.app.elvoryx.in" so they cannot become a same-origin
  // frontend path like /dev.app.elvoryx.in/api/... .
  const raw = String((import.meta as any).env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

// ── Recording URL helper ─────────────────────────────────────────────────────

export function getPlayableRecordingUrl(_callLogId: string, recordingUrl: string): string {
  // The backend now resolves recordings to private, short-lived signed URLs.
  // Never place an authentication JWT in a recording URL/query string.
  return recordingUrl;
}

// ── Browser voice WebSocket ticket ────────────────────────────────────────────

export async function createVoiceSessionWebSocketUrl(): Promise<string> {
  const response = await apiFetch('/api/voice-session/ticket', { method: 'POST' });
  if (!response.ok) throw new Error(`Voice session ticket failed (${response.status})`);
  const data = await response.json();
  if (!data?.ticket) throw new Error('Voice session ticket missing');
  const base = getApiBase();
  const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsBase}/session?ticket=${encodeURIComponent(data.ticket)}`;
}

// ── apiFetch ─────────────────────────────────────────────────────────────────

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Snapshot the scope before token refresh: a delayed request must never be
  // redirected into the workspace selected while it was waiting.
  let selectedOrgId: string | null = null;
  let selectedWorkspaceId: string | null = null;
  const currentScope = () => {
    // Keep each browser tab in its own workspace. localStorage is only the
    // remembered default for a new tab, never a live cross-tab scope switch.
    const workspaceId = sessionStorage.getItem('chiefx_active_workspace_id') || localStorage.getItem('chiefx_active_workspace_id');
    return { workspaceId, orgId: sessionStorage.getItem('chiefx_active_org_id') || localStorage.getItem('chiefx_active_org_id') || workspaceId };
  };
  try {
    const scope = currentScope();
    selectedOrgId = scope.orgId; selectedWorkspaceId = scope.workspaceId;
  } catch { /* unavailable */ }
  const token = await getSessionAuthToken();
  try {
    if (selectedOrgId !== currentScope().orgId || selectedWorkspaceId !== currentScope().workspaceId) {
      throw new DOMException('Workspace changed during request', 'AbortError');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
  }

  // Never send authenticated API requests without a token. This is especially
  // important for /api/platform/* because the backend intentionally rejects
  // unauthenticated requests before checking the platform-admin allowlist.
  if (!token) {
    throw new Error('Authentication access token is missing');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  // Keep the selected workspace in a request header so the same authenticated
  // user can switch organizations without changing identity-provider state.
  // The backend validates this ID against the user's memberships.
  try {
    const orgId = selectedOrgId;
    if (orgId && !headers.has('X-Organization-Id')) {
      headers.set('X-Organization-Id', orgId);
    }
    if (selectedWorkspaceId && !headers.has('X-Workspace-Id')) headers.set('X-Workspace-Id', selectedWorkspaceId);
  } catch { /* localStorage may be unavailable in private/restricted contexts */ }
  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Build the API URL here instead of relying on the global window.fetch
  // wrapper in main.tsx. This guarantees every apiFetch() call, including
  // /api/platform/whoami, goes to the configured backend with the Bearer
  // header attached.
  const requestUrl = /^https?:\/\//i.test(url)
    ? url
    : `${getApiBase()}${url.startsWith('/') ? url : `/${url}`}`;

  const access = getAuthorization();
  const permission = permissionForRequest(new URL(requestUrl,'http://local').pathname,(options.method || 'GET').toUpperCase());
  if (access && permission && !['GET','HEAD','OPTIONS'].includes((options.method || 'GET').toUpperCase()) && !access.permissions.includes(permission)) {
    throw new Error(`You do not have permission for this action (${permission}).`);
  }
  let res = await fetch(requestUrl, { ...options, headers });
  const path = new URL(requestUrl, 'http://local').pathname;
  // Vercel can deploy before the VM. Only the original default workspace
  // may use the old settings route while the backend is being upgraded.
  if (res.status === 404 && selectedOrgId && selectedWorkspaceId === selectedOrgId &&
      (path === '/api/settings/workspace' || path === '/api/settings/workspace/profile-config')) {
    const scope = currentScope();
    if (scope.orgId !== selectedOrgId || scope.workspaceId !== selectedWorkspaceId) {
      throw new DOMException('Workspace changed during request', 'AbortError');
    }
    const legacyUrl = new URL(requestUrl, 'http://local');
    legacyUrl.pathname = path.replace('/api/settings/workspace', '/api/settings/org');
    res = await fetch(legacyUrl.toString(), { ...options, headers });
  }

  // Do not automatically call keycloak.login() here. A 401 can be a normal
  // API response (for example, an expired/invalid token or a protected
  // endpoint denial). Redirecting to Keycloak from the fetch layer can cause
  // a reload -> login -> reload loop, especially on /admin.
  try {
    if (selectedOrgId !== currentScope().orgId || selectedWorkspaceId !== currentScope().workspaceId) {
      throw new DOMException('Workspace changed during request', 'AbortError');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
  }
  // Check the server's acknowledged scope before exposing response data.
  // Identity/platform discovery intentionally has no operational scope.
  const discovery = path === '/api/auth/workspaces' || path.startsWith('/api/platform/');
  if (res.ok && !discovery && selectedOrgId && selectedWorkspaceId) {
    const acknowledgedOrg = res.headers.get('X-Organization-Id');
    const acknowledgedWorkspace = res.headers.get('X-Workspace-Id');
    if ((acknowledgedOrg && acknowledgedOrg !== selectedOrgId) ||
        (acknowledgedWorkspace && acknowledgedWorkspace !== selectedWorkspaceId) ||
        (selectedWorkspaceId !== selectedOrgId && (!acknowledgedOrg || !acknowledgedWorkspace))) {
      throw new Error('The server did not confirm the selected workspace');
    }
  }
  return res;
}
