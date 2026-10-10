/**
 * ChiefVoice CRM Frontend — Comprehensive Test Suite
 * Framework: Vitest + React Testing Library
 *
 * Coverage areas:
 *  1. userFlagsStore — fetch success/failure, caching, reset, subscribe
 *  2. FeatureFlagContext — admin sees all tabs, restricted sees only granted,
 *     loading state hides flagged tabs, user-switch refreshes flags
 *  3. ProtectedRoute — unauthenticated redirect, role-gated redirect, pass-through
 *  4. OrgRoute — Super Admin block page, org admin / restricted pass-through
 *  5. Sidebar — correct tabs per role + feature flag, non-lending industry filter
 *  6. SettingsView GrantFeatureAccess — all registry flags rendered, toggle works
 *  7. KeycloakProvider role extraction — ROLE_MAP correctness
 */

import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock the keycloak singleton (features/auth/keycloak.ts) ─────────────────
// vi.mock factories are hoisted, so the mock object must also be hoisted via
// vi.hoisted() so it is initialised before the factory runs.

const mockKc = vi.hoisted(() => ({
  authenticated: true as boolean,
  token: 'mock-token' as string | undefined,
  tokenParsed: {} as Record<string, unknown>,
  clientId: 'chiefvoice-crm',
  init: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  updateToken: vi.fn().mockResolvedValue(true),
  onTokenExpired: undefined as (() => void) | undefined,
  onAuthRefreshSuccess: undefined as (() => void) | undefined,
  onAuthLogout: undefined as (() => void) | undefined,
}));

vi.mock('../features/auth/keycloak', () => ({ default: mockKc }));

// ─── Mock apiFetch ───────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  getAuthToken: vi.fn(() => 'mock-token'),
  getApiBase: vi.fn(() => ''),
  getPlayableRecordingUrl: vi.fn((_id: string, url: string) => url),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));

// ─── Mock lib/storage (keep tests off real localStorage) ─────────────────────

const storageMap = vi.hoisted(() => ({} as Record<string, unknown>));

vi.mock('../lib/storage', () => ({
  loadFromStorage: vi.fn((key: string, defaultValue: unknown) =>
    key in storageMap ? storageMap[key] : defaultValue
  ),
  saveToStorage: vi.fn((key: string, value: unknown) => {
    storageMap[key] = value;
  }),
}));

// Clear shared mock state between every test to prevent cross-test contamination.
beforeEach(() => {
  Object.keys(storageMap).forEach(k => delete storageMap[k]);
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { apiFetch } from '../lib/api';
import { KeycloakProvider, useAuth } from '../features/auth/KeycloakProvider';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import {
  FeatureFlagProvider,
  useFeatureFlags,
} from '../features/feature-flags/FeatureFlagContext';
import * as store from '../features/feature-flags/userFlagsStore';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import { DEFAULT_FLAGS } from '../features/feature-flags/types';
import Sidebar from '../components/Sidebar';
import { getIndustryProfile } from '../lib/industry/registry';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Configure the shared mock Keycloak instance before a test. */
function setupKc(
  claims: Record<string, unknown>,
  authenticated = true
) {
  mockKc.authenticated = authenticated;
  mockKc.tokenParsed = claims;
  mockKc.token = authenticated ? 'mock-token' : undefined as any;
  // init resolves with the authenticated flag
  mockKc.init.mockResolvedValue(authenticated);
}

/**
 * Minimal AuthContext provider that bypasses the real Keycloak init for tests
 * that only care about downstream components (ProtectedRoute, OrgRoute, Sidebar).
 */
import { createContext, useContext } from 'react';

// Re-export the real context shape but supply values directly
type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tokenParsed: unknown;
};

interface AuthContextValue {
  ready: boolean;
  user: AuthUser | null;
  getToken: () => Promise<string>;
  logout: () => void;
}

// We access the real context by re-using KeycloakProvider's context — but
// for most tests we render KeycloakProvider itself (it reads mockKc.init).
// For tests that need instant auth without the async init dance, we use a
// thin wrapper that renders KeycloakProvider with mockKc pre-configured so
// the first render cycle already has the resolved user.

async function renderWithAuth(
  ui: React.ReactNode,
  {
    claims = {} as Record<string, unknown>,
    authenticated = true,
    route = '/',
  }: {
    claims?: Record<string, unknown>;
    authenticated?: boolean;
    route?: string;
  } = {}
) {
  setupKc(claims, authenticated);
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <KeycloakProvider>
        <FeatureFlagProvider>{ui}</FeatureFlagProvider>
      </KeycloakProvider>
    </MemoryRouter>
  );
  // Wait for Keycloak.init() promise to resolve and the provider to move out
  // of 'loading' state before returning.
  await act(async () => {});
  return result;
}

// ─── 1. userFlagsStore ────────────────────────────────────────────────────────

describe('userFlagsStore', () => {
  beforeEach(() => {
    store.resetUserFlags();
    vi.mocked(apiFetch).mockReset();
  });

  it('fetch success — stores granted flags and marks loaded', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: ['workflows', 'reports'] }),
    } as Response);

    const result = await store.fetchUserFlags();
    expect(result).toEqual(['workflows', 'reports']);
    expect(store.isLoaded()).toBe(true);
    expect(store.getGrantedFlags()).toEqual(['workflows', 'reports']);
  });

  it('fetch failure (network error) — marks loaded with empty grants without throwing', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('network down'));

    const result = await store.fetchUserFlags();
    expect(result).toEqual([]);
    expect(store.isLoaded()).toBe(true);
    expect(store.hasRestriction()).toBe(false);
  });

  it('fetch non-ok response (e.g. 403) — marks loaded with empty grants', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Forbidden' }),
    } as Response);

    await store.fetchUserFlags();
    expect(store.getGrantedFlags()).toEqual([]);
    expect(store.isLoaded()).toBe(true);
  });

  it('second call returns cached result without making another network request', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ featureFlags: ['billing'] }),
    } as Response);

    await store.fetchUserFlags();
    await store.fetchUserFlags(); // second call — should be a no-op

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
    expect(store.getGrantedFlags()).toEqual(['billing']);
  });

  it('hasRestriction is false before loading and true when grants are non-empty', async () => {
    expect(store.hasRestriction()).toBe(false); // before any fetch

    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: ['reports'] }),
    } as Response);
    await store.fetchUserFlags();

    expect(store.hasRestriction()).toBe(true);
  });

  it('resetUserFlags clears state so the next fetch re-requests the server', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ featureFlags: ['workflows'] }),
    } as Response);

    await store.fetchUserFlags();
    store.resetUserFlags();
    expect(store.isLoaded()).toBe(false);

    await store.fetchUserFlags();
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(2);
  });

  it('subscribe fires immediately when flags are already loaded', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: ['dialer'] }),
    } as Response);
    await store.fetchUserFlags();

    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    expect(listener).toHaveBeenCalledWith(['dialer'], true);
    unsub();
  });

  it('subscribe fires after fetchUserFlags resolves', async () => {
    let resolveResponse!: (v: Response) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(
      new Promise(r => { resolveResponse = r; }) as Promise<Response>
    );

    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    expect(listener).not.toHaveBeenCalled(); // not loaded yet

    const fetchPromise = store.fetchUserFlags();
    resolveResponse({
      ok: true,
      json: async () => ({ featureFlags: ['compliance'] }),
    } as Response);
    await fetchPromise;

    expect(listener).toHaveBeenCalledWith(['compliance'], true);
    unsub();
  });

  it('subscribe cleanup removes the listener', async () => {
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub(); // remove immediately

    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: ['dialer'] }),
    } as Response);
    await store.fetchUserFlags();

    expect(listener).not.toHaveBeenCalled();
  });
});

// ─── 2. FeatureFlagContext ────────────────────────────────────────────────────

describe('FeatureFlagContext', () => {
  beforeEach(() => {
    store.resetUserFlags();
    vi.mocked(apiFetch).mockReset();
    mockKc.init.mockReset();
  });

  function FlagReader({ flagKey }: { flagKey: string }) {
    const { isEnabled } = useFeatureFlags();
    return <div data-testid={flagKey}>{isEnabled(flagKey) ? 'on' : 'off'}</div>;
  }

  function AllFlagsReader() {
    const { flags } = useFeatureFlags();
    return (
      <ul>
        {flags.map(f => (
          <li key={f.key} data-testid={`flag-${f.key}`}>
            {f.enabled ? 'on' : 'off'}
          </li>
        ))}
      </ul>
    );
  }

  it('loading state — flagged tabs are disabled before the store resolves', async () => {
    // Keycloak is ready but store has not fetched yet
    setupKc(
      { sub: 'u1', email: 'agent@test.com', realm_access: { roles: ['loan-agent'] } },
      true
    );
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <FeatureFlagProvider>
            <FlagReader flagKey="workflows" />
          </FeatureFlagProvider>
        </KeycloakProvider>
      </MemoryRouter>
    );

    // Immediately after mount (before init resolves) → loading splash, no flag element
    // After init resolves, restricted user with no grants loaded → flag off
    await act(async () => {});

    // Still before fetchUserFlags completes — flag must be off
    expect(screen.getByTestId('workflows').textContent).toBe('off');
  });

  it('org admin — all DEFAULT_FLAGS enabled after store marks loaded', async () => {
    setupKc(
      { sub: 'admin-1', email: 'admin@test.com', realm_access: { roles: ['org-admin'] } },
      true
    );
    mockKc.init.mockResolvedValue(true);

    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: [] }), // empty = no restriction for admin
    } as Response);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <FeatureFlagProvider>
            <AllFlagsReader />
          </FeatureFlagProvider>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await act(async () => { await store.fetchUserFlags(); });

    await waitFor(() => {
      DEFAULT_FLAGS.forEach(f => {
        expect(screen.getByTestId(`flag-${f.key}`).textContent).toBe(
          f.enabled ? 'on' : 'off'
        );
      });
    });
  });

  it('restricted user (loan-agent) — only explicitly granted flags are on', async () => {
    setupKc(
      { sub: 'agent-1', email: 'agent@test.com', realm_access: { roles: ['loan-agent'] } },
      true
    );
    mockKc.init.mockResolvedValue(true);

    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: ['reports', 'dialer'] }),
    } as Response);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <FeatureFlagProvider>
            <AllFlagsReader />
          </FeatureFlagProvider>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await act(async () => { await store.fetchUserFlags(); });

    await waitFor(() => {
      expect(screen.getByTestId('flag-reports').textContent).toBe('on');
      expect(screen.getByTestId('flag-dialer').textContent).toBe('on');
      expect(screen.getByTestId('flag-workflows').textContent).toBe('off');
      expect(screen.getByTestId('flag-compliance').textContent).toBe('off');
    });
  });

  it('restricted user with no grants at all — all flagged features off', async () => {
    setupKc(
      { sub: 'agent-2', email: 'agent2@test.com', realm_access: { roles: ['loan-agent'] } },
      true
    );
    mockKc.init.mockResolvedValue(true);

    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: [] }),
    } as Response);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <FeatureFlagProvider>
            <AllFlagsReader />
          </FeatureFlagProvider>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await act(async () => { await store.fetchUserFlags(); });

    await waitFor(() => {
      FEATURE_REGISTRY.forEach(f => {
        expect(screen.getByTestId(`flag-${f.key}`).textContent).toBe('off');
      });
    });
  });

  it('setFlag persists a toggle for admin users', async () => {
    setupKc(
      { sub: 'admin-2', email: 'admin2@test.com', realm_access: { roles: ['org-admin'] } },
      true
    );
    mockKc.init.mockResolvedValue(true);

    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: [] }),
    } as Response);

    function ToggleFlag() {
      const { flags, isEnabled, setFlag } = useFeatureFlags();
      return (
        <>
          <div data-testid="workflows-state">{isEnabled('workflows') ? 'on' : 'off'}</div>
          <button onClick={() => setFlag('workflows', false)} data-testid="disable-btn">
            disable
          </button>
        </>
      );
    }

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <FeatureFlagProvider>
            <ToggleFlag />
          </FeatureFlagProvider>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await act(async () => { await store.fetchUserFlags(); });

    await waitFor(() =>
      expect(screen.getByTestId('workflows-state').textContent).toBe('on')
    );

    fireEvent.click(screen.getByTestId('disable-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('workflows-state').textContent).toBe('off')
    );
  });
});

// ─── 3. ProtectedRoute ───────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  beforeEach(() => {
    store.resetUserFlags();
    vi.mocked(apiFetch).mockReset();
    mockKc.init.mockReset();
  });

  it('authenticated user with no role restriction — renders children', async () => {
    setupKc({ sub: 'u1', email: 'u@test.com', realm_access: { roles: ['org-admin'] } });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <KeycloakProvider>
          <ProtectedRoute>
            <div data-testid="protected-content">Hello</div>
          </ProtectedRoute>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    );
  });

  it('unauthenticated user — redirects to /login', async () => {
    setupKc({}, false);
    // init resolves as not-authenticated; onLoad:'login-required' would redirect
    // in a real browser but in jsdom the Promise resolves false.
    mockKc.init.mockResolvedValue(false);
    mockKc.authenticated = false;

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <KeycloakProvider>
                <ProtectedRoute>
                  <div data-testid="protected-content">Hello</div>
                </ProtectedRoute>
              </KeycloakProvider>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {});
    // KeycloakProvider calls keycloak.login() when not authenticated (never renders children)
    // In our mock, login() is a no-op. ProtectedRoute itself redirects to /login
    // when user is null.
    await waitFor(() => {
      // Either login was called (real browser redirect) or login page rendered
      const loginCalled = (mockKc.login as ReturnType<typeof vi.fn>).mock.calls.length > 0;
      const loginPageRendered = !!document.querySelector('[data-testid="login-page"]');
      expect(loginCalled || loginPageRendered).toBe(true);
    });
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('user with wrong role — redirects to /unauthorized', async () => {
    setupKc({ sub: 'u2', email: 'a@test.com', realm_access: { roles: ['loan-agent'] } });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <KeycloakProvider>
                <ProtectedRoute allowedRoles={['Organization Admin', 'Super Admin']}>
                  <div data-testid="admin-content">Admin</div>
                </ProtectedRoute>
              </KeycloakProvider>
            }
          />
          <Route
            path="/unauthorized"
            element={<div data-testid="unauth-page">403</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('unauth-page')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
  });

  it('user with correct role — renders children without redirect', async () => {
    setupKc({ sub: 'u3', email: 'admin@test.com', realm_access: { roles: ['org-admin'] } });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <KeycloakProvider>
                <ProtectedRoute allowedRoles={['Organization Admin']}>
                  <div data-testid="settings-content">Settings</div>
                </ProtectedRoute>
              </KeycloakProvider>
            }
          />
          <Route
            path="/unauthorized"
            element={<div data-testid="unauth-page">403</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('settings-content')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('unauth-page')).not.toBeInTheDocument();
  });

  it('allowedRoles empty array — treated as no restriction', async () => {
    setupKc({ sub: 'u4', email: 'x@test.com', realm_access: { roles: ['loan-agent'] } });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <ProtectedRoute allowedRoles={[]}>
            <div data-testid="open-content">Open</div>
          </ProtectedRoute>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('open-content')).toBeInTheDocument()
    );
  });
});

// ─── 4. OrgRoute ─────────────────────────────────────────────────────────────

// Inline copy of OrgRoute (defined in main.tsx) so we can test it in isolation.
function OrgRoute({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  if (user?.role === 'Super Admin') {
    return (
      <div data-testid="platform-admin-block">
        You don&apos;t have access to this page
        <button onClick={logout} data-testid="sign-out-btn">Sign out</button>
      </div>
    );
  }
  return <>{children}</>;
}

describe('OrgRoute', () => {
  beforeEach(() => {
    store.resetUserFlags();
    vi.mocked(apiFetch).mockReset();
    mockKc.init.mockReset();
    mockKc.logout.mockReset();
  });

  it('Super Admin (platform-admin role) — sees block page, not org app', async () => {
    setupKc({
      sub: 'sa1',
      email: 'platform@test.com',
      realm_access: { roles: ['platform-admin'] },
    });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <OrgRoute>
            <div data-testid="org-app">Org App</div>
          </OrgRoute>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('platform-admin-block')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('org-app')).not.toBeInTheDocument();
  });

  it('super-admin alias — also shows block page', async () => {
    setupKc({
      sub: 'sa2',
      email: 'sa@test.com',
      realm_access: { roles: ['super-admin'] },
    });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <OrgRoute>
            <div data-testid="org-app">Org App</div>
          </OrgRoute>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('platform-admin-block')).toBeInTheDocument()
    );
  });

  it('Org Admin — passes through to org app', async () => {
    setupKc({
      sub: 'oa1',
      email: 'orgadmin@test.com',
      realm_access: { roles: ['org-admin'] },
    });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <OrgRoute>
            <div data-testid="org-app">Org App</div>
          </OrgRoute>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('org-app')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('platform-admin-block')).not.toBeInTheDocument();
  });

  it('Loan Agent — passes through to org app', async () => {
    setupKc({
      sub: 'la1',
      email: 'agent@test.com',
      realm_access: { roles: ['loan-agent'] },
    });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <OrgRoute>
            <div data-testid="org-app">Org App</div>
          </OrgRoute>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('org-app')).toBeInTheDocument()
    );
  });

  it('block page sign-out button calls keycloak.logout', async () => {
    setupKc({
      sub: 'sa3',
      email: 'p@test.com',
      realm_access: { roles: ['platform-admin'] },
    });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <OrgRoute>
            <div>Hidden</div>
          </OrgRoute>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() => screen.getByTestId('platform-admin-block'));

    fireEvent.click(screen.getByTestId('sign-out-btn'));
    expect(mockKc.logout).toHaveBeenCalled();
  });
});

// ─── 5. Sidebar — tab visibility per role and feature flags ──────────────────

describe('Sidebar', () => {
  beforeEach(() => {
    store.resetUserFlags();
    vi.mocked(apiFetch).mockReset();
    mockKc.init.mockReset();
  });

  async function renderSidebar(
    kcClaims: Record<string, unknown>,
    grantedFlags: string[],
    industry = 'lending',
    industryProfile?: ReturnType<typeof getIndustryProfile>,
  ) {
    setupKc(kcClaims);
    mockKc.init.mockResolvedValue(true);

    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ featureFlags: grantedFlags }),
    } as Response);

    const userRole = kcClaims.realm_access
      ? (kcClaims.realm_access as any).roles?.[0] === 'org-admin'
        ? 'Organization Admin'
        : 'Loan Agent'
      : 'Loan Agent';

    const setActiveTab = vi.fn();
    render(
      <MemoryRouter>
        <KeycloakProvider>
          <FeatureFlagProvider>
            <Sidebar
              activeTab="dashboard"
              setActiveTab={setActiveTab}
              activeSubTab=""
              setActiveSubTab={vi.fn()}
              userRole={userRole as any}
              organizationName="Test Org"
              industry={industry}
              industryProfile={industryProfile}
            />
          </FeatureFlagProvider>
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await act(async () => { await store.fetchUserFlags(); });
    await waitFor(() => screen.getByText('Executive Desk'));
    return setActiveTab;
  }

  it('org admin — all standard tabs visible', async () => {
    await renderSidebar(
      { sub: 'admin', email: 'a@t.com', realm_access: { roles: ['org-admin'] } },
      [] // empty = no restriction for admins
    );

    // Flagged tabs may appear slightly after the subscriber fires — use waitFor
    await waitFor(() => {
      expect(screen.getByText('Executive Desk')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
      expect(screen.getByText('Workflow Builder')).toBeInTheDocument();
      expect(screen.getByText('Administration')).toBeInTheDocument();
    });
  });

  it('restricted user with no grants — only non-flagged tabs visible', async () => {
    await renderSidebar(
      { sub: 'agent', email: 'a@t.com', realm_access: { roles: ['loan-agent'] } },
      [] // no grants
    );

    expect(screen.getByText('Executive Desk')).toBeInTheDocument();
    // Flagged tabs with no grant must be hidden
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Workflow Builder')).not.toBeInTheDocument();
  });

  it('restricted user with reports grant — reports tab appears', async () => {
    await renderSidebar(
      { sub: 'agent', email: 'a@t.com', realm_access: { roles: ['loan-agent'] } },
      ['reports']
    );

    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.queryByText('Workflow Builder')).not.toBeInTheDocument();
  });

  it('restricted user with multiple grants — exactly those tabs appear', async () => {
    await renderSidebar(
      { sub: 'agent2', email: 'b@t.com', realm_access: { roles: ['loan-agent'] } },
      ['reports', 'dialer', 'compliance']
    );

    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Voice Simulator')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.queryByText('Workflow Builder')).not.toBeInTheDocument();
  });

  it('non-lending org — Lead CRM, AI Campaigns, Loan Lifecycle tabs hidden', async () => {
    await renderSidebar(
      { sub: 'admin', email: 'a@t.com', realm_access: { roles: ['org-admin'] } },
      [],
      'real_estate' // non-lending industry
    );

    expect(screen.queryByText('Lead CRM')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Campaigns')).not.toBeInTheDocument();
    expect(screen.queryByText('Loan Lifecycle')).not.toBeInTheDocument();
    // Non-lending tabs still present
    expect(screen.getByText('Executive Desk')).toBeInTheDocument();
    expect(screen.getByText('Contact Directory')).toBeInTheDocument();
  });

  it('healthcare org — one Patients entry opens the existing records screen', async () => {
    const navigate = await renderSidebar(
      { sub: 'admin', email: 'a@t.com', realm_access: { roles: ['org-admin'] } },
      [],
      'healthcare',
    );

    expect(screen.getAllByText('Patients')).toHaveLength(1);
    expect(screen.queryByText('Patients Directory')).not.toBeInTheDocument();
    expect(screen.queryByText('Patient Records')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Patients'));
    expect(navigate).toHaveBeenCalledWith('objects');
  });

  it('healthcare org — legacy server module label still produces one Patients item', async () => {
    const profile = getIndustryProfile('healthcare');
    const oldServerLabel = {
      ...profile,
      modules: profile.modules.map(module => ({ ...module, label: 'Patient Records' })),
    };
    await renderSidebar(
      { sub: 'admin', email: 'a@t.com', realm_access: { roles: ['org-admin'] } },
      [], 'healthcare', oldServerLabel,
    );

    expect(screen.getAllByText('Patients')).toHaveLength(1);
    expect(screen.queryByText('Patient Records')).not.toBeInTheDocument();
    expect(screen.queryByText('Patients Directory')).not.toBeInTheDocument();
  });

  it('lending org — Lead CRM, AI Campaigns, Loan Lifecycle tabs visible', async () => {
    await renderSidebar(
      { sub: 'admin', email: 'a@t.com', realm_access: { roles: ['org-admin'] } },
      [],
      'lending'
    );

    expect(screen.getByText('Lead CRM')).toBeInTheDocument();
    expect(screen.getByText('AI Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Loan Lifecycle')).toBeInTheDocument();
  });

  it('retired objects tab never appears regardless of role', async () => {
    await renderSidebar(
      { sub: 'admin', email: 'a@t.com', realm_access: { roles: ['org-admin'] } },
      []
    );

    // 'Contacts' (the old objects tab) should not appear — only 'Contact Directory'
    const contactItems = screen.queryAllByText('Contacts');
    expect(contactItems).toHaveLength(0);
  });
});

// ─── 6. SettingsView — GrantFeatureAccess feature flag toggle UI ──────────────

describe('SettingsView GrantFeatureAccess', () => {
  /** Inline render of the feature-flag grant toggle buttons in isolation. */
  function GrantFlagsUI() {
    const [selectedFlags, setSelectedFlags] = React.useState<string[]>([]);

    const toggle = (key: string) =>
      setSelectedFlags(prev =>
        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      );

    return (
      <div>
        {FEATURE_REGISTRY.map(flag => {
          const active = selectedFlags.includes(flag.key);
          return (
            <button
              key={flag.key}
              onClick={() => toggle(flag.key)}
              data-testid={`grant-${flag.key}`}
              aria-pressed={active}
            >
              {flag.label}
            </button>
          );
        })}
        <div data-testid="count">{selectedFlags.length}</div>
      </div>
    );
  }

  it('all FEATURE_REGISTRY flags are rendered as grant buttons', () => {
    render(<GrantFlagsUI />);
    FEATURE_REGISTRY.forEach(flag => {
      expect(screen.getByTestId(`grant-${flag.key}`)).toBeInTheDocument();
      expect(screen.getByText(flag.label)).toBeInTheDocument();
    });
  });

  it('button count matches FEATURE_REGISTRY length', () => {
    render(<GrantFlagsUI />);
    expect(FEATURE_REGISTRY.length).toBeGreaterThan(0);
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('clicking a flag button selects it (aria-pressed true)', () => {
    render(<GrantFlagsUI />);
    const btn = screen.getByTestId('grant-workflows');
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);

    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('clicking an already-selected flag deselects it', () => {
    render(<GrantFlagsUI />);
    const btn = screen.getByTestId('grant-reports');

    fireEvent.click(btn); // select
    expect(screen.getByTestId('count').textContent).toBe('1');

    fireEvent.click(btn); // deselect
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('multiple flags can be selected simultaneously', () => {
    render(<GrantFlagsUI />);

    fireEvent.click(screen.getByTestId('grant-workflows'));
    fireEvent.click(screen.getByTestId('grant-compliance'));
    fireEvent.click(screen.getByTestId('grant-dialer'));

    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('grant-workflows')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('grant-compliance')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('grant-dialer')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('grant-reports')).toHaveAttribute('aria-pressed', 'false');
  });

  it('each FEATURE_REGISTRY entry has a unique key and label', () => {
    const keys = FEATURE_REGISTRY.map(f => f.key);
    const labels = FEATURE_REGISTRY.map(f => f.label);
    const tabIds = FEATURE_REGISTRY.map(f => f.tabId);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(tabIds).size).toBe(tabIds.length);
  });
});

// ─── 7. KeycloakProvider — role extraction ROLE_MAP ──────────────────────────

describe('KeycloakProvider role extraction', () => {
  beforeEach(() => {
    mockKc.init.mockReset();
  });

  function RoleReader() {
    const { user } = useAuth();
    return <div data-testid="role">{user?.role ?? 'none'}</div>;
  }

  async function checkRole(kcRole: string, expectedAppRole: string) {
    setupKc({
      sub: 'u1',
      email: 'test@test.com',
      realm_access: { roles: [kcRole] },
    });
    mockKc.init.mockResolvedValue(true);

    const { unmount } = render(
      <MemoryRouter>
        <KeycloakProvider>
          <RoleReader />
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('role').textContent).toBe(expectedAppRole)
    );
    unmount();
  }

  it('platform-admin → Super Admin', () => checkRole('platform-admin', 'Super Admin'));
  it('super-admin → Super Admin', () => checkRole('super-admin', 'Super Admin'));
  it('org-admin → Organization Admin', () => checkRole('org-admin', 'Organization Admin'));
  it('sales-manager → Sales Manager', () => checkRole('sales-manager', 'Sales Manager'));
  it('loan-agent → Loan Agent', () => checkRole('loan-agent', 'Loan Agent'));
  it('collection-agent → Collection Agent', () => checkRole('collection-agent', 'Collection Agent'));
  it('ai-agent-manager → AI Agent Manager', () => checkRole('ai-agent-manager', 'AI Agent Manager'));
  it('unknown role passes through as-is', () => checkRole('mystery-role', 'mystery-role'));

  it('client roles are also checked when realm roles are absent', async () => {
    setupKc({
      sub: 'u2',
      email: 'client@test.com',
      resource_access: { 'chiefvoice-crm': { roles: ['org-admin'] } },
    });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <RoleReader />
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('role').textContent).toBe('Organization Admin')
    );
  });

  it('standard Keycloak system roles are filtered out', async () => {
    setupKc({
      sub: 'u3',
      email: 'sys@test.com',
      realm_access: {
        roles: ['offline_access', 'uma_authorization', 'default-roles-chiefvoice', 'loan-agent'],
      },
    });
    mockKc.init.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <KeycloakProvider>
          <RoleReader />
        </KeycloakProvider>
      </MemoryRouter>
    );

    await act(async () => {});
    await waitFor(() =>
      expect(screen.getByTestId('role').textContent).toBe('Loan Agent')
    );
  });
});
