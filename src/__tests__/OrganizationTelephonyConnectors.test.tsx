import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrganizationTelephonyConnectors from '../components/settings/OrganizationTelephonyConnectors';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

const providers = [{ providerKey: 'vobiz', name: 'Vobiz', label: 'Vobiz.ai', credentialSchema: [
  { key: 'authId', label: 'Auth ID', type: 'text', required: true },
  { key: 'authToken', label: 'Auth token', type: 'secret', required: true },
] }];
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
let connectors: Array<{ id: string; providerKey: string; displayName: string; providerAccountId: string | null; credentialFieldsConfigured: boolean; status: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  connectors = [{ id: 'org-conn-1', providerKey: 'vobiz', displayName: 'Support account', providerAccountId: 'vobiz-org-1', credentialFieldsConfigured: true, status: 'active' }];
  mocks.apiFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/api/telephony/providers') return response({ providers });
    if (url === '/api/telephony/connectors' && !options) return response({ connectors });
    if (url === '/api/telephony/workspaces') return response({ workspaces: [{ id: 'ws-1', name: 'Support workspace' }] });
    if (url === '/api/telephony/numbers') return response({ numbers: [{ id: 'n-1', phoneNumberE164: '+14155550123', displayName: 'Support', connectorAccountId: 'org-conn-1', inventoryStatus: 'available', provisioningStatus: 'ready' }] });
    if (url === '/api/telephony/connectors' && options?.method === 'POST') {
      const data = JSON.parse(options.body || '{}');
      connectors.push({ id: 'org-conn-2', providerKey: data.providerKey, displayName: data.displayName, providerAccountId: data.providerAccountId, credentialFieldsConfigured: true, status: 'active' });
      return response({ connector: connectors[1] }, 201);
    }
    if (url === '/api/telephony/connectors/org-conn-1/numbers' && options?.method === 'POST') return response({ number: { id: 'n-1' } }, 201);
    if (url === '/api/telephony/connectors/org-conn-1/numbers' && !options) return response({ numbers: [{ id: 'n-1', phoneNumberE164: '+14155550123', displayName: 'Support', inventoryStatus: 'available' }] });
    if (url === '/api/telephony/numbers/n-1/assign' && options?.method === 'POST') return response({ assignment: { workspaceId: 'ws-1' } });
    throw new Error(`Unexpected request ${url}`);
  });
});

describe('Organization-owned telephony connector management', () => {
  it('creates multiple provider accounts and keeps credentials schema-driven', async () => {
    render(<OrganizationTelephonyConnectors />);
    expect(await screen.findByText('Support account')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Connector name'), { target: { value: 'Sales account' } });
    fireEvent.change(screen.getByLabelText('Provider account reference (optional)'), { target: { value: 'vobiz-org-2' } });
    fireEvent.change(screen.getByLabelText('Auth ID *'), { target: { value: 'auth-2' } });
    fireEvent.change(screen.getByLabelText('Auth token *'), { target: { value: 'secret-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/telephony/connectors', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('Sales account')).toBeInTheDocument();
    const call = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url === '/api/telephony/connectors' && options?.method === 'POST');
    expect(JSON.parse(call?.[1].body || '{}')).toMatchObject({ providerKey: 'vobiz', displayName: 'Sales account', providerAccountId: 'vobiz-org-2', credentials: { authId: 'auth-2', authToken: 'secret-2' } });
  });

  it('registers a number in the selected account inventory and states that this does not enable calling', async () => {
    render(<OrganizationTelephonyConnectors />);
    expect(await screen.findByText('Support account')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Phone number for Support account'), { target: { value: '+14155550123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add number to inventory' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/telephony/connectors/org-conn-1/numbers', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByRole('status')).toHaveTextContent('Live calling is not enabled');
  });

  it('assigns a ready number to a named workspace without exposing internal provisioning fields', async () => {
    render(<OrganizationTelephonyConnectors />);
    expect(await screen.findByText('Support account')).toBeInTheDocument();
    await screen.findByText('+14155550123 · Support');
    expect(screen.queryByText(/pending|available,/i)).not.toBeInTheDocument();
    const choice = await screen.findByLabelText('Workspace for +14155550123');
    fireEvent.change(choice, { target: { value: 'ws-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign to workspace' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/telephony/numbers/n-1/assign', expect.objectContaining({ method: 'POST', body: JSON.stringify({ workspaceId: 'ws-1' }) })));
  });
});
