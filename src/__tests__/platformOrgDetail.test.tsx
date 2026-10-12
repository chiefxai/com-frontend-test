import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OrgDetailPanel from '../admin/OrgDetailPanel';
import { fetchPlatformOrgDetail, parsePlatformOrgDetail } from '../lib/platformOrgDetail';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), onChanged: vi.fn(), onClose: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
// The billing and subscription views are already covered by dedicated tests.
vi.mock('../admin/OrgBillingConsole', () => ({
  default: () => <div data-testid="org-billing-console">Billing overview</div>,
}));
vi.mock('../admin/OrganizationWorkspaceSetup', () => ({
  default: () => <div data-testid="org-workspace-setup">Subscription workspaces</div>,
}));

const detail = {
  id: 'org-one',
  name: 'Acme Healthcare',
  workspaceName: 'Main office',
  industry: 'healthcare',
  subscriptionPlan: 'Enterprise',
  status: 'Active',
  aiMinutesUsed: 8,
  totalCostInr: 120,
  billingPeriodEnd: null,
  createdAt: '2026-09-01T12:00:00.000Z',
  settings: {},
  counts: { members: 2, workspaces: 1, workflows: 3, agents: 0 },
  members: [],
  recentCalls: [],
  recentActivity: [],
};

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/platform/organizations/org-one') return response(detail);
    if (path.endsWith('/features')) return response({ featureFlags: [] });
    if (path.endsWith('/numbers')) return response([]);
    if (path.endsWith('/gcp-project')) return response({});
    throw Error('Unexpected request: ' + path);
  });
});
afterEach(cleanup);

describe('platform organization details response safety', () => {
  it('keeps valid zero counts and preserves the backend result', () => {
    const parsed = parsePlatformOrgDetail(detail, 'org-one');
    expect(parsed.name).toBe('Acme Healthcare');
    expect(parsed.counts?.agents).toBe(0);
    expect(parsed.counts?.members).toBe(2);
  });

  it('does not invent zero counts for a successful older response without counts', () => {
    const parsed = parsePlatformOrgDetail({ ...detail, counts: undefined }, 'org-one');
    expect(parsed.counts).toEqual({});
    expect(parsed.counts?.members).toBeUndefined();
    expect(parsePlatformOrgDetail({ ...detail, counts: { members: 0, workflows: '123', agents: -1 } }, 'org-one').counts)
      .toEqual({ members: 0 });
  });

  it('rejects error envelopes, malformed successful results and cross-organization responses', () => {
    expect(() => parsePlatformOrgDetail({ error: 'Forbidden' }, 'org-one')).toThrow(/response was incomplete/);
    expect(() => parsePlatformOrgDetail({ ...detail, members: null }, 'org-one')).toThrow(/response was incomplete/);
    expect(() => parsePlatformOrgDetail({ ...detail, id: 'another-org' }, 'org-one')).toThrow(/did not match/);
  });

  it('rejects unsuccessful HTTP responses before treating their JSON as organization data', async () => {
    mocks.apiFetch.mockResolvedValueOnce(response({ error: 'Not allowed to view organization' }, 403));
    await expect(fetchPlatformOrgDetail('org-one')).rejects.toThrow('Not allowed to view organization');
    mocks.apiFetch.mockResolvedValueOnce(response({ error: 'Database unavailable' }, 500));
    await expect(fetchPlatformOrgDetail('org-one')).rejects.toThrow('Database unavailable');
  });

  it('handles non-JSON failed responses without crashing or inventing organization data', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: false, status: 502, json: async () => { throw new Error('Invalid JSON'); },
    });
    await expect(fetchPlatformOrgDetail('org-one')).rejects.toThrow(/HTTP 502/);
  });

  it('encodes requested organization identifiers in its API request', async () => {
    const orgId = 'org/1';
    mocks.apiFetch.mockResolvedValueOnce(response({ ...detail, id: orgId }));
    await expect(fetchPlatformOrgDetail(orgId)).resolves.toMatchObject({ id: orgId });
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/organizations/org%2F1');
  });

  it('lets platform admins recover an organization trial that failed during creation', async () => {
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/platform/organizations/org-one/free-trial/retry') {
        return response({ status: 'free_trial', days: 7 }, 200);
      }
      if (path === '/api/platform/organizations/org-one') return response(detail);
      if (path.endsWith('/features')) return response({ featureFlags: [] });
      if (path.endsWith('/numbers')) return response([]);
      if (path.endsWith('/gcp-project')) return response({});
      throw Error('Unexpected request: ' + path);
    });
    render(<OrgDetailPanel orgId="org-one" onClose={mocks.onClose} onChanged={mocks.onChanged} />);

    fireEvent.change(await screen.findByLabelText('Trial duration (days)'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Provision free trial' }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/organizations/org-one/free-trial/retry', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ days: 7 }),
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('Free trial is active for 7 days.');
  });
});

describe('Platform Admin organization detail panel', () => {
  it('renders unavailable indicators instead of throwing when counts are missing', async () => {
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/platform/organizations/org-one') return response({ ...detail, counts: undefined });
      return response([]);
    });
    render(<OrgDetailPanel orgId="org-one" onClose={mocks.onClose} onChanged={mocks.onChanged} />);
    expect(await screen.findByText('Acme Healthcare')).toBeInTheDocument();
    const overview = screen.getByRole('region', { name: 'Organization overview' });
    expect(within(overview).getByText('Members')).toBeInTheDocument();
    expect(within(overview).getByText('Workspaces')).toBeInTheDocument();
    expect(within(overview).getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('shows an actionable error state for a failed request, then recovers on Retry', async () => {
    let attempts = 0;
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/platform/organizations/org-one') {
        attempts += 1;
        return attempts === 1 ? response({ error: 'Organization API temporarily unavailable' }, 503) : response(detail);
      }
      return response([]);
    });
    render(<OrgDetailPanel orgId="org-one" onClose={mocks.onClose} onChanged={mocks.onChanged} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Organization API temporarily unavailable');
    expect(screen.getByText('Organization details unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading details' }));
    expect(await screen.findByText('Acme Healthcare')).toBeInTheDocument();
    expect(screen.queryByText('Organization details unavailable')).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('rejects an HTTP-200 error envelope and keeps destructive actions hidden', async () => {
    mocks.apiFetch.mockImplementation(async (path: string) =>
      path === '/api/platform/organizations/org-one'
        ? response({ error: 'Token expired' })
        : response([]));
    render(<OrgDetailPanel orgId="org-one" onClose={mocks.onClose} onChanged={mocks.onChanged} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/response was incomplete/);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(mocks.onChanged).not.toHaveBeenCalled();
  });

  it('does not display a stale response when switching between organizations', async () => {
    let finishFirst!: (result: Response) => void;
    const first = new Promise<Response>(resolve => { finishFirst = resolve; });
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/platform/organizations/org-one') return first;
      if (path === '/api/platform/organizations/org-two')
        return response({ ...detail, id: 'org-two', name: 'Beta Finance' });
      return response([]);
    });
    const app = render(<OrgDetailPanel orgId="org-one" onClose={mocks.onClose} onChanged={mocks.onChanged} />);
    app.rerender(<OrgDetailPanel orgId="org-two" onClose={mocks.onClose} onChanged={mocks.onChanged} />);
    expect(await screen.findByText('Beta Finance')).toBeInTheDocument();
    await act(async () => { finishFirst(response(detail)); });
    await waitFor(() => {
      expect(screen.getByText('Beta Finance')).toBeInTheDocument();
      expect(screen.queryByText('Acme Healthcare')).not.toBeInTheDocument();
    });
  });
});
