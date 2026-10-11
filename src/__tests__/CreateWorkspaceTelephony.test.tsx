import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateWorkspacePage from '../admin/CreateWorkspacePage';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), navigate: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const plan = {
  id: 'starter', name: 'Starter', active: true, defaultMode: 'single', retentionPolicyId: 'default',
  pricing: { baseMonthlyInr: 1000, includedWorkspaces: 1, maxWorkspaces: 1, extraWorkspaceMonthlyInr: 0, includedSeats: 5, maxSeats: 10, extraSeatMonthlyInr: 0, additionalIndustryMonthlyInr: 0 },
  industryModules: {},
};
const catalog = { version: 1, defaultPolicyId: 'default', policies: [{
  id: 'default', name: 'Default', description: '', retention: { call_recordings: 365, transcripts: 365, ai_summaries: 365, call_logs: 365, campaign_history: 365, audit_logs: 365, documents: 365, contacts: 365 }, backup: { enabled: false, frequency: 'monthly', retentionDays: 365 },
}] };
const number = { id: 'num-1', phoneNumberE164: '+14155550123', inventoryStatus: 'available', provisioningStatus: 'ready', displayName: 'Support' };

function setup({ connectorFeature = true } = {}) {
  const createRequests: Array<Record<string, any>> = [];
  mocks.navigate.mockClear();
  mocks.apiFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/api/platform/billing/workspace-plans') return response({ version: 1, plans: [plan] });
    if (url === '/api/platform/data-retention/policies') return response(catalog);
    if (url === '/api/platform/telephony/providers') return connectorFeature ? response({ providers: [{ providerKey: 'vobiz', label: 'Vobiz' }] }) : response({}, 404);
    if (url === '/api/platform/telephony/connectors') return connectorFeature ? response({ connectors: [{ id: 'conn-1', providerKey: 'vobiz', displayName: 'Platform account', status: 'active' }] }) : response({}, 404);
    if (url === '/api/platform/telephony/connectors/conn-1/numbers') return response({ numbers: [number] });
    if (url === '/api/platform/organizations' && options?.method === 'POST') {
      createRequests.push(JSON.parse(options.body || '{}'));
      return response({ id: 'org-1' }, 201);
    }
    throw new Error(`Unexpected request ${url}`);
  });
  render(<MemoryRouter><CreateWorkspacePage /></MemoryRouter>);
  return { createRequests };
}

async function fillRequiredOrgFields() {
  await screen.findByLabelText('Workspace plan');
  fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByPlaceholderText('Paste the service account JSON here'), { target: { value: '{"project_id":"acme-project"}' } });
  fireEvent.change(screen.getByDisplayValue('AI usage'), { target: { value: 'ai_and_call_provider' } });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('organization creation telephony selection', () => {
  it('hides platform number selection when connector APIs are unavailable and preserves BYO payload', async () => {
    const { createRequests } = setup({ connectorFeature: false });
    await fillRequiredOrgFields();
    expect(screen.queryByText('Reserve a platform connector number')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth ID'), { target: { value: 'auth-id' } });
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth Token'), { target: { value: 'auth-token' } });
    fireEvent.change(screen.getByPlaceholderText('+14155550123'), { target: { value: '+14155550124' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }));
    await waitFor(() => expect(createRequests).toHaveLength(1));
    expect(createRequests[0].callProvider).toEqual({ provider: 'vobiz', authId: 'auth-id', authToken: 'auth-token', phoneNumber: '+14155550124' });
    expect(createRequests[0]).not.toHaveProperty('platformTelephonyNumberId');
  });

  it('sends the selected platform inventory number without asking for BYO credentials', async () => {
    const { createRequests } = setup();
    await fillRequiredOrgFields();
    fireEvent.click(await screen.findByLabelText('Reserve a platform connector number'));
    expect(await screen.findByLabelText('Available platform number *')).toHaveTextContent('+14155550123');
    expect(screen.getByRole('note')).toHaveTextContent(/administrator has verified/i);
    fireEvent.change(screen.getByLabelText('Available platform number *'), { target: { value: 'num-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Workspace' }));
    await waitFor(() => expect(createRequests).toHaveLength(1));
    expect(createRequests[0].platformTelephonyNumberId).toBe('num-1');
    expect(createRequests[0]).not.toHaveProperty('callProvider');
  });
});
