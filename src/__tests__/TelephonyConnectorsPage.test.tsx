import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TelephonyConnectorsPage from '../admin/TelephonyConnectorsPage';
import { PageHeaderProvider } from '../lib/PageHeaderContext';
import PageHeaderBar from '../components/ui/PageHeaderBar';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

const providers = [{ providerKey: 'voice-example', name: 'Voice Example', label: 'Voice Example', credentialSchema: [
  { key: 'accountSid', label: 'Account SID', type: 'text', required: true, placeholder: 'AC…' },
  { key: 'authToken', label: 'Auth token', type: 'password', required: true },
  { key: 'region', label: 'Region', type: 'select', required: true, options: [{ value: 'in', label: 'India' }, { value: 'us', label: 'United States' }] },
], capabilities: { inbound: true, outbound: true } }];
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const first = { id: 'conn-a', providerKey: 'voice-example', displayName: 'Account A', providerAccountId: 'acct-a', credentialFieldsConfigured: true, status: 'active' };
const second = { ...first, id: 'conn-b', displayName: 'Account B', providerAccountId: 'acct-b' };
let inventory: Array<{ id: string; phoneNumberE164: string; inventoryStatus: string; provisioningStatus: string; allocatedOrgId?: string | null; assignedOrgId?: string | null; assignedWorkspaceId?: string | null; displayName?: string | null }>;

beforeEach(() => {
  vi.clearAllMocks();
  inventory = [{ id: 'number-a', phoneNumberE164: '+14155550123', inventoryStatus: 'available', provisioningStatus: 'pending', allocatedOrgId: null }];
  mocks.apiFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/api/platform/telephony/providers') return response({ providers });
    if (url === '/api/platform/telephony/connectors' && !options) return response({ connectors: [first, second] });
    if (url === '/api/platform/telephony/connectors' && options?.method === 'POST') return response({ connector: first }, 201);
    if (url.startsWith('/api/platform/telephony/connectors/') && options?.method === 'PATCH') return response({ connector: first });
    if (url === '/api/platform/telephony/connectors/conn-a/numbers' && !options) return response({ numbers: inventory });
    if (url === '/api/platform/telephony/connectors/conn-a/numbers' && options?.method === 'POST') {
      const data = JSON.parse(options.body || '{}');
      inventory.push({ id: 'number-new', phoneNumberE164: data.phoneNumberE164, displayName: data.displayName, inventoryStatus: 'available', provisioningStatus: 'pending' });
      return response({ number: inventory[inventory.length - 1] }, 201);
    }
    if (url === '/api/platform/telephony/numbers/number-a/mark-ready' && options?.method === 'POST') {
      inventory = inventory.map(number => number.id === 'number-a' ? { ...number, provisioningStatus: 'ready' } : number);
      return response({ number: { id: 'number-a', provisioningStatus: 'ready' } });
    }
    if (url === '/api/platform/telephony/numbers/number-a/allocate' && options?.method === 'POST') {
      const data = JSON.parse(options.body || '{}');
      inventory = inventory.map(number => number.id === 'number-a' ? { ...number, inventoryStatus: 'assigned', allocatedOrgId: data.orgId } : number);
      return response({ allocation: { phoneNumberId: 'number-a', orgId: data.orgId } }, 201);
    }
    if (url === '/api/platform/telephony/numbers/number-a/release' && options?.method === 'POST') {
      inventory = inventory.map(number => number.id === 'number-a' ? { ...number, inventoryStatus: 'available', allocatedOrgId: null, assignedOrgId: null } : number);
      return response({ allocation: { phoneNumberId: 'number-a', released: true } });
    }
    throw new Error(`Unexpected request ${url}`);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('Platform telephony connector management', () => {
  it('shows connector cards and opens provider-schema form from the header action', async () => {
  render(<PageHeaderProvider><PageHeaderBar /><TelephonyConnectorsPage /></PageHeaderProvider>);
    const card = await screen.findByText('Account A');
    expect(screen.getByText('Account B')).toBeInTheDocument();
    expect(screen.queryByText('acct-a')).not.toBeInTheDocument();
    expect(screen.queryByText('conn-a')).not.toBeInTheDocument();
    // Cards render before the shared header's loading state finishes updating.
    // Wait for the action to be enabled before clicking it.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add connector' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Add connector' }));
    expect(await screen.findByRole('dialog', { name: 'Add connector' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Connector name'), { target: { value: 'New account' } });
    fireEvent.change(screen.getByLabelText('Account SID *'), { target: { value: 'SID-123' } });
    fireEvent.change(screen.getByLabelText('Auth token *'), { target: { value: 'secret-value' } });
    fireEvent.change(screen.getByLabelText('Region *'), { target: { value: 'in' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create connector' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/connectors', expect.objectContaining({ method: 'POST' })));
    const createCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url === '/api/platform/telephony/connectors' && options?.method === 'POST');
    expect(JSON.parse(createCall?.[1].body || '{}')).toEqual({ providerAccountId: null, providerKey: 'voice-example', displayName: 'New account', credentials: { accountSid: 'SID-123', authToken: 'secret-value', region: 'in' } });
    expect(card).toBeInTheDocument();
  });

  it('supports multiple accounts and rotates only credentials entered by the admin', async () => {
    render(<PageHeaderProvider><PageHeaderBar /><TelephonyConnectorsPage /></PageHeaderProvider>);
    const edit = await screen.findByRole('button', { name: 'Edit Account A' });
    fireEvent.click(edit);
    fireEvent.change(screen.getByLabelText('Auth token'), { target: { value: 'new-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/connectors/conn-a', expect.objectContaining({ method: 'PATCH' })));
    const updateCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url.endsWith('/conn-a') && options?.method === 'PATCH');
    expect(JSON.parse(updateCall?.[1].body || '{}')).toEqual({ displayName: 'Account A', providerAccountId: null, credentials: { authToken: 'new-secret' } });
  });

  it('keeps feature-off state when the connector API returns 404', async () => {
    mocks.apiFetch.mockImplementation(async () => response({ error: 'Not found' }, 404));
    render(<PageHeaderProvider><PageHeaderBar /><TelephonyConnectorsPage /></PageHeaderProvider>);
    expect(await screen.findByText('Telephony connectors are not enabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('saves numbers and confirms readiness without allocating organizations from connector inventory', async () => {
    render(<PageHeaderProvider><PageHeaderBar /><TelephonyConnectorsPage /></PageHeaderProvider>);
    await screen.findByText('Account A');
    fireEvent.click(screen.getAllByRole('button', { name: 'View details' })[0]);
    expect(await screen.findByText('+14155550123')).toBeInTheDocument();
    expect(screen.queryByText(/Provisioning:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider ID:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add number' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+14155550124' } });
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: 'Support line' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save number' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/connectors/conn-a/numbers', expect.objectContaining({ method: 'POST' })));
    const addCall = mocks.apiFetch.mock.calls.find(([url, options]: [string, { method?: string }]) => url === '/api/platform/telephony/connectors/conn-a/numbers' && options?.method === 'POST');
    expect(JSON.parse(addCall?.[1].body || '{}')).toEqual({ phoneNumberE164: '+14155550124', displayName: 'Support line' });
    expect(await screen.findByText('+14155550124')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm active' })[0]);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/number-a/mark-ready', expect.objectContaining({ method: 'POST' })));
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(mocks.apiFetch.mock.calls.some(([url]: [string]) => url.endsWith('/allocate'))).toBe(false);
  });
});
