import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TelephonyConnectorsPage from '../admin/TelephonyConnectorsPage';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

const providers = [{
  providerKey: 'voice-example', name: 'Voice Example', label: 'Voice Example',
  credentialSchema: [
    { key: 'accountSid', label: 'Account SID', type: 'text', required: true, placeholder: 'AC…' },
    { key: 'authToken', label: 'Auth token', type: 'password', required: true },
    { key: 'region', label: 'Region', type: 'select', required: true, options: [{ value: 'in', label: 'India' }, { value: 'us', label: 'United States' }] },
  ], capabilities: { inbound: true, outbound: true },
}];
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const first = { id: 'conn-a', providerKey: 'voice-example', displayName: 'Account A', providerAccountId: 'acct-a', credentialFieldsConfigured: true, status: 'active' };
const second = { ...first, id: 'conn-b', displayName: 'Account B', providerAccountId: 'acct-b' };
let inventory: Array<{ id: string; phoneNumberE164: string; inventoryStatus: string; provisioningStatus: string; assignedOrgId?: string | null; assignedWorkspaceId?: string | null; assignedAt?: string | null; providerNumberId?: string; displayName?: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  inventory = [{ id: 'number-a', phoneNumberE164: '+14155550123', inventoryStatus: 'available', provisioningStatus: 'pending', assignedOrgId: null, assignedWorkspaceId: null }];
  mocks.apiFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/api/platform/telephony/providers') return response({ providers });
    if (url === '/api/platform/telephony/connectors' && !options) return response({ connectors: [first, second] });
    if (url === '/api/platform/telephony/connectors' && options?.method === 'POST') return response({ connector: first });
    if (url.startsWith('/api/platform/telephony/connectors/') && options?.method === 'PATCH') return response({ connector: first });
    if (url === '/api/platform/telephony/connectors/conn-a/numbers' && !options) return response({ numbers: inventory });
    if (url === '/api/platform/telephony/connectors/conn-a/numbers' && options?.method === 'POST') {
      const data = JSON.parse(options.body || '{}');
      inventory.push({ id: 'number-new', ...data, inventoryStatus: 'available', provisioningStatus: 'pending', assignedOrgId: null, assignedWorkspaceId: null });
      return response({ number: inventory[inventory.length - 1] }, 201);
    }
    if (url === '/api/platform/telephony/numbers/number-a/mark-ready' && options?.method === 'POST') {
      inventory = inventory.map(number => number.id === 'number-a' ? { ...number, provisioningStatus: 'ready' } : number);
      return response({ number: { id: 'number-a', provisioningStatus: 'ready' } });
    }
    if (url === '/api/platform/telephony/numbers/number-a/assign' && options?.method === 'POST') {
      const data = JSON.parse(options.body || '{}');
      inventory = inventory.map(number => number.id === 'number-a' ? { ...number, inventoryStatus: 'assigned', assignedOrgId: data.orgId, assignedWorkspaceId: data.workspaceId, assignedAt: '2026-10-11T12:00:00.000Z' } : number);
      return response({ assignment: { id: 'assignment-a', phoneNumberId: 'number-a', ...data, assignedAt: '2026-10-11T12:00:00.000Z' } }, 201);
    }
    if (url === '/api/platform/telephony/numbers/number-a/release' && options?.method === 'POST') {
      inventory = inventory.map(number => number.id === 'number-a' ? { ...number, inventoryStatus: 'available', assignedOrgId: null, assignedWorkspaceId: null, assignedAt: null } : number);
      return response({ assignment: { id: 'assignment-a', phoneNumberId: 'number-a', orgId: 'org-a', releaseReason: 'Customer returned the number' } });
    }
    throw new Error(`Unexpected request ${url}`);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('Platform telephony connector management', () => {
  it('renders credential fields from provider schema and can create a connector', async () => {
    render(<TelephonyConnectorsPage />);
    expect(await screen.findByLabelText('Account SID *')).toBeInTheDocument();
    expect(screen.getByLabelText('Auth token *')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Region *')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Connector name'), { target: { value: 'New account' } });
    fireEvent.change(screen.getByLabelText('Provider account ID (optional)'), { target: { value: 'account-new' } });
    fireEvent.change(screen.getByLabelText('Account SID *'), { target: { value: 'SID-123' } });
    fireEvent.change(screen.getByLabelText('Auth token *'), { target: { value: 'secret-value' } });
    fireEvent.change(screen.getByLabelText('Region *'), { target: { value: 'in' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create connector' }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/connectors', expect.objectContaining({ method: 'POST' })));
    const createCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url === '/api/platform/telephony/connectors' && options?.method === 'POST');
    expect(JSON.parse(createCall?.[1].body || '{}')).toEqual({
      providerKey: 'voice-example', displayName: 'New account', providerAccountId: 'account-new',
      credentials: { accountSid: 'SID-123', authToken: 'secret-value', region: 'in' },
    });
  });

  it('lists multiple accounts for the same provider and supports partial credential rotation', async () => {
    render(<TelephonyConnectorsPage />);
    await screen.findByText('2 connector accounts');
    expect(screen.getByText('Account A')).toBeInTheDocument();
    expect(screen.getByText('Account B')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit / rotate credentials' })[0]);
    expect(screen.getByLabelText('Auth token')).toHaveAttribute('placeholder', 'Leave blank to keep current credential');
    fireEvent.change(screen.getByLabelText('Auth token'), { target: { value: 'new-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save connector' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/connectors/conn-a', expect.objectContaining({ method: 'PATCH' })));
    const updateCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url.endsWith('/conn-a') && options?.method === 'PATCH');
    expect(JSON.parse(updateCall?.[1].body || '{}')).toEqual({ displayName: 'Account A', providerAccountId: 'acct-a', credentials: { authToken: 'new-secret' } });
  });

  it('shows an explicit feature-off state when connector APIs return 404', async () => {
    mocks.apiFetch.mockImplementation(async () => response({ error: 'Not found' }, 404));
    render(<TelephonyConnectorsPage />);
    expect(await screen.findByText('Telephony connectors are not enabled')).toBeInTheDocument();
    expect(screen.getByText(/unavailable until platform operations enables/i)).toBeInTheDocument();
  });

  it('registers provider inventory, assigns it, and releases it with a reason', async () => {
    render(<TelephonyConnectorsPage />);
    await screen.findByText('Account A');
    fireEvent.click(screen.getAllByRole('button', { name: 'Manage numbers' })[0]);
    expect(await screen.findByText('+14155550123')).toBeInTheDocument();
    expect(screen.getByText(/confirm each number is active on this provider account/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Provider-owned E.164 number'), { target: { value: '+14155550124' } });
    fireEvent.change(screen.getByLabelText('Provider number ID (optional)'), { target: { value: 'PN-124' } });
    fireEvent.change(screen.getByLabelText('Number name (optional)'), { target: { value: 'Support line' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to inventory' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/connectors/conn-a/numbers', expect.objectContaining({ method: 'POST' })));
    const registerCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url === '/api/platform/telephony/connectors/conn-a/numbers' && options?.method === 'POST');
    expect(JSON.parse(registerCall?.[1].body || '{}')).toEqual({ phoneNumberE164: '+14155550124', providerNumberId: 'PN-124', displayName: 'Support line' });
    expect(await screen.findByText('+14155550124')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Verify number' })[0]);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/number-a/mark-ready', expect.objectContaining({ method: 'POST' })));
    inventory = inventory.map(number => number.id === 'number-a' ? { ...number, provisioningStatus: 'ready' } : number);
    fireEvent.change(screen.getByLabelText('Organization ID for +14155550123'), { target: { value: 'org-a' } });
    fireEvent.change(screen.getByLabelText('Workspace ID for +14155550123'), { target: { value: 'workspace-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign +14155550123' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/number-a/assign', expect.objectContaining({ method: 'POST' })));
    const assignCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url.endsWith('/number-a/assign') && options?.method === 'POST');
    expect(JSON.parse(assignCall?.[1].body || '{}')).toEqual({ orgId: 'org-a', workspaceId: 'workspace-a' });
    expect(await screen.findByText('assigned')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Release reason for +14155550123'), { target: { value: 'Customer returned the number' } });
    fireEvent.click(screen.getByRole('button', { name: 'Release assignment' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/number-a/release', expect.objectContaining({ method: 'POST' })));
    const releaseCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url.endsWith('/number-a/release') && options?.method === 'POST');
    expect(JSON.parse(releaseCall?.[1].body || '{}')).toEqual({ orgId: 'org-a', reason: 'Customer returned the number' });
  });
});
