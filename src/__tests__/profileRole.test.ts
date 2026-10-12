import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthorization, setAuthorization, type Authorization } from '../lib/authorization';
import { profileRole, refreshProfileAuthorization } from '../lib/profileRole';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
const access = (workspaceRole: string | null, organizationRole = 'Member'): Authorization => ({
  organizationRole, workspaceRole, platformAdmin: false, permissions: ['workspace.read'],
});
const selected = { orgId: 'org-1', workspaceId: 'workspace-1' };
const session = (authorization: Authorization, workspaceId = 'workspace-1') => ({
  org: { id: 'org-1' }, workspace: { id: workspaceId }, authorization,
});
afterEach(() => { setAuthorization(null); vi.clearAllMocks(); });

describe('profile role in the selected workspace', () => {
  it.each(['Workspace Admin', 'Manager', 'Member', 'Viewer'])('shows %s instead of the creation role', role => {
    expect(profileRole(access(role), 'Member')).toBe(role);
  });
  it.each(['Owner', 'Organization Admin', 'Billing Admin'])('preserves %s organization identity', role => {
    expect(profileRole(access('Viewer', role), 'Member')).toBe(role);
  });
  it('uses legacy identity only before verified authorization arrives', () => {
    expect(profileRole(null, 'Member')).toBe('Member');
    expect(profileRole(access(null), 'Member')).toBe('No workspace access');
  });
  it('refreshes a role changed by an administrator from auth/me', async () => {
    setAuthorization(access('Member'));
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => session(access('Manager')) });
    await refreshProfileAuthorization(selected);
    expect(profileRole(getAuthorization(), 'Member')).toBe('Manager');
  });
  it('rejects a response for another workspace', async () => {
    const previous = access('Member');
    setAuthorization(previous);
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => session(access('Manager'), 'workspace-2') });
    await refreshProfileAuthorization(selected);
    expect(getAuthorization()).toBe(previous);
  });
  it('discards a response after logout or workspace change', async () => {
    setAuthorization(access('Member'));
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => {
      setAuthorization(null);
      return session(access('Manager'));
    } });
    await refreshProfileAuthorization(selected);
    expect(getAuthorization()).toBeNull();
  });
  it('retains the verified role during a network failure', async () => {
    const previous = access('Viewer');
    setAuthorization(previous);
    mocks.apiFetch.mockRejectedValue(new Error('Offline'));
    await refreshProfileAuthorization(selected);
    expect(getAuthorization()).toBe(previous);
  });
});
