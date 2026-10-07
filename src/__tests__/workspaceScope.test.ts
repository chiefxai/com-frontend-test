import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../features/auth/session', () => ({ getSessionToken: vi.fn(), getSessionTokenSync: vi.fn() }));
import { getSessionToken } from '../features/auth/session';
import { apiFetch } from '../lib/api';
import { loadFromStorage, saveToStorage, setStorageScope } from '../lib/storage';
import { fetchUserFlags, resetUserFlags, getMembershipRole, subscribe } from '../features/feature-flags/userFlagsStore';

describe('workspace browser isolation', () => {
  beforeEach(() => {
    localStorage.clear(); setStorageScope(null, null); resetUserFlags(); vi.restoreAllMocks();
    vi.mocked(getSessionToken).mockResolvedValue('token');
  });
  it('does not restore legacy operational cache before membership validation', () => {
    localStorage.setItem('chiefx_leads', JSON.stringify(['private']));
    expect(loadFromStorage('chiefx_leads', [])).toEqual([]);
    saveToStorage('chiefx_leads', ['other']);
    expect(localStorage.getItem('chiefx_leads')).toBe('["private"]');
  });
  it('separates caches by user and workspace, retaining global theme', () => {
    setStorageScope('user-a', 'branch-a'); saveToStorage('chiefx_leads', ['a']);
    saveToStorage('chiefx_theme_mode', 'dark');
    setStorageScope('user-a', 'branch-b'); expect(loadFromStorage('chiefx_leads', [])).toEqual([]);
    setStorageScope('user-b', 'branch-a'); expect(loadFromStorage('chiefx_leads', [])).toEqual([]);
    setStorageScope('user-a', 'branch-a'); expect(loadFromStorage('chiefx_leads', [])).toEqual(['a']);
    expect(loadFromStorage('chiefx_theme_mode', '')).toBe('dark');
  });
  it('does not redirect an in-flight token refresh into a newly selected organization', async () => {
    localStorage.setItem('chiefx_active_workspace_id', 'org-a');
    let resolve!: (value: string) => void;
    vi.mocked(getSessionToken).mockReturnValue(new Promise(r => { resolve = r; }));
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const request = apiFetch('/api/leads');
    localStorage.setItem('chiefx_active_workspace_id', 'org-b'); resolve('token');
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects responses from a workspace that changed during the request', async () => {
    localStorage.setItem('chiefx_active_workspace_id', 'org-a');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      expect(new Headers(options?.headers).get('X-Organization-Id')).toBe('org-a');
      localStorage.setItem('chiefx_active_workspace_id', 'org-b');
      return new Response('{}');
    });
    await expect(apiFetch('/api/leads')).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('does not restore permissions from an old request after reset', async () => {
    let resolve!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(r => { resolve = r; }));
    const request = fetchUserFlags();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    resetUserFlags();
    resolve(new Response(JSON.stringify({ role: 'Super Admin', featureFlags: ['leads'] })));
    await request;
    expect(getMembershipRole()).toBe('');
  });
  it('supplies organization grants to late permission subscribers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ role: 'Agent', featureFlags: ['leads'], orgFeatureFlags: ['leads', 'calls'] })));
    await fetchUserFlags();
    const listener = vi.fn(); const unsubscribe = subscribe(listener);
    expect(listener).toHaveBeenCalledWith(['leads'], true, 'Agent', ['leads', 'calls']); unsubscribe();
  });
});
