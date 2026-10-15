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

function setup({ connectorFeature = true, trialProvisioningStatus = 'free_trial', trialProvisioningCode = 'SUBSCRIPTION_PLAN_VERSION_UNAVAILABLE' } = {}) {
  const createRequests: Array<Record<string, any>> = [];
  let registeredNumberCount = 0;
  mocks.navigate.mockClear();
  mocks.apiFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/api/platform/billing/workspace-plans') return response({ version: 1, plans: [plan] });
    if (url === '/api/platform/data-retention/policies') return response(catalog);
    if (url === '/api/platform/telephony/providers') return connectorFeature ? response({ providers: [{ providerKey: 'vobiz', label: 'Vobiz' }, { providerKey: 'twilio', label: 'Twilio' }] }) : response({}, 404);
    if (url === '/api/platform/telephony/connectors') return connectorFeature ? response({ connectors: [{ id: 'conn-1', providerKey: 'twilio', displayName: 'Platform account', status: 'active' }] }) : response({}, 404);
    if (url === '/api/platform/telephony/connectors/conn-1/numbers' && !options) return response({ numbers: [number, { ...number, id:'num-2', phoneNumberE164:'+14155550125', displayName:'Sales' }] });
    if (url === '/api/platform/organizations' && options?.method === 'POST') {
      const request = JSON.parse(options.body || '{}');
      createRequests.push(request);
      return response({ id: 'org-1', initialSubscriptionPurchase: request.freeTrial
        ? { status: trialProvisioningStatus, code: trialProvisioningCode }
        : { status: 'awaiting_payment', quoteId: 'quote-1', paymentAmount: { asset: 'INR', units: '100000', scale: 2 } } }, 201);
    }
    if (url === '/api/platform/organizations/org-1/initial-subscription-payment') return response({ id: 'payment-1' }, 201);
    if (url === '/api/platform/telephony/numbers/bulk-allocate' && options?.method === 'POST') return response({ orgId:'org-1', allocations: JSON.parse(options.body || '{}').phoneNumberIds.map((phoneNumberId:string)=>({phoneNumberId,orgId:'org-1'})) },201);
    if (url === '/api/platform/telephony/connectors/conn-1/numbers' && options?.method === 'POST') return response({ number: { id: `new-num-${++registeredNumberCount}` } }, 201);
    if (/^\/api\/platform\/telephony\/numbers\/new-num-\d+\/mark-ready$/.test(url) && options?.method === 'POST') return response({ number: { id: url.split('/')[5] } });
    throw new Error(`Unexpected request ${url}`);
  });
  render(<MemoryRouter><CreateWorkspacePage /></MemoryRouter>);
  return { createRequests };
}

async function fillRequiredOrgFields({ freeTrial = true } = {}) {
  await screen.findByLabelText('Workspace plan');
  fireEvent.change(screen.getByPlaceholderText('Acme Corp'), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByPlaceholderText('Paste the service account JSON here'), { target: { value: '{"project_id":"acme-project"}' } });
  fireEvent.change(screen.getByDisplayValue('AI usage'), { target: { value: 'ai_and_call_provider' } });
  if (freeTrial) fireEvent.click(screen.getByLabelText('Start this organization with a free trial'));
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('organization creation telephony selection', () => {
  it('hides platform number selection when connector APIs are unavailable and preserves BYO payload', async () => {
    const { createRequests } = setup({ connectorFeature: false });
    await fillRequiredOrgFields();
    expect(screen.queryByText('Use platform-managed phone numbers')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth ID'), { target: { value: 'auth-id' } });
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth Token'), { target: { value: 'auth-token' } });
    fireEvent.change(screen.getByPlaceholderText('+14155550123'), { target: { value: '+14155550124' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Workspace' }).closest('form')!);
    await waitFor(() => expect(createRequests).toHaveLength(1));
    expect(createRequests[0].callProvider).toEqual({ provider: 'vobiz', authId: 'auth-id', authToken: 'auth-token', phoneNumber: '+14155550124', phoneNumbers: ['+14155550124'] });
    expect(createRequests[0]).not.toHaveProperty('platformTelephonyNumberId');
  });

  it('sends the selected platform inventory number without asking for BYO credentials', async () => {
    const { createRequests } = setup();
    await fillRequiredOrgFields();
    fireEvent.click(await screen.findByLabelText('Use platform-managed phone numbers'));
    expect(await screen.findByLabelText('Available platform number *')).toHaveTextContent('+14155550123');
    expect(screen.getByRole('note')).toHaveTextContent(/assign each number to the appropriate workspace/i);
    fireEvent.change(screen.getByLabelText('Available platform number *'), { target: { value: 'num-1' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Workspace' }).closest('form')!);
    await waitFor(() => expect(createRequests).toHaveLength(1));
    expect(createRequests[0]).not.toHaveProperty('platformTelephonyNumberId');
    expect(createRequests[0]).not.toHaveProperty('callProvider');
    expect(createRequests[0].platformTelephonyAllocationPending).toBe(true);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/bulk-allocate', expect.objectContaining({ method: 'POST', body: JSON.stringify({ orgId: 'org-1', phoneNumberIds:['num-1'] }) })));
  });

  it('registers an entered platform number on the selected provider connector, confirms and allocates it', async () => {
    setup();
    await fillRequiredOrgFields();
    fireEvent.click(await screen.findByLabelText('Use platform-managed phone numbers'));
    fireEvent.click(screen.getByLabelText('Enter a number from a connector'));
    fireEvent.change(screen.getByLabelText('Platform connector *'), { target: { value: 'conn-1' } });
    fireEvent.change(screen.getByLabelText('Phone number *'), { target: { value: '+14155550199' } });
    fireEvent.click(screen.getByLabelText(/I confirm this number is active/));
    fireEvent.submit(screen.getByRole('button', { name: 'Create Workspace' }).closest('form')!);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/connectors/conn-1/numbers', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/new-num-1/mark-ready', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/bulk-allocate', expect.objectContaining({ method: 'POST' })));
  });

  it('registers, verifies, and allocates multiple entered platform connector numbers', async () => {
    setup();
    await fillRequiredOrgFields();
    fireEvent.click(await screen.findByLabelText('Use platform-managed phone numbers'));
    fireEvent.click(screen.getByLabelText('Enter a number from a connector'));
    fireEvent.change(screen.getByLabelText('Platform connector *'),{target:{value:'conn-1'}});
    fireEvent.change(screen.getByLabelText('Phone number *'),{target:{value:'+14155550135'}});
    fireEvent.click(screen.getByLabelText(/I confirm this number is active on the selected provider account/));
    fireEvent.click(screen.getByRole('button',{name:/Add another provider number/i}));
    const secondNumber=screen.getByLabelText('Additional platform phone number 2');
    fireEvent.change(secondNumber,{target:{value:'+14155550136'}});
    const fieldset=secondNumber.closest('fieldset')!;
    fireEvent.change(fieldset.querySelector('select')!,{target:{value:'conn-1'}});
    fireEvent.click(fieldset.querySelector('input[type="checkbox"]')!);
    fireEvent.submit(screen.getByRole('button',{name:'Create Workspace'}).closest('form')!);
    await waitFor(()=>expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/bulk-allocate',
      expect.objectContaining({method:'POST',body:JSON.stringify({
        orgId:'org-1',phoneNumberIds:['new-num-1','new-num-2'],
      })})));
    expect(mocks.apiFetch.mock.calls.filter(([url,options]:[string,{method?:string}]) =>
      url==='/api/platform/telephony/connectors/conn-1/numbers' && options?.method==='POST')).toHaveLength(2);
  });

  it('maps multiple customer-owned Vobiz phone numbers using one credential set', async () => {
    const { createRequests } = setup({connectorFeature:false});
    await fillRequiredOrgFields();
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth ID'), {target:{value:'auth-id'}});
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth Token'), {target:{value:'auth-token'}});
    fireEvent.change(screen.getByPlaceholderText('+14155550123'), {target:{value:'+14155550123'}});
    fireEvent.click(screen.getByRole('button',{name:/Add another phone number/i}));
    fireEvent.change(screen.getByLabelText('Additional provider phone number 2'),{target:{value:'+14155550124'}});
    fireEvent.submit(screen.getByRole('button',{name:'Create Workspace'}).closest('form')!);
    await waitFor(()=>expect(createRequests).toHaveLength(1));
    expect(createRequests[0].callProvider).toEqual({
      provider:'vobiz',authId:'auth-id',authToken:'auth-token',
      phoneNumber:'+14155550123',phoneNumbers:['+14155550123','+14155550124'],
    });
  });

  it('blocks duplicate customer-owned phone numbers before organization creation', async () => {
    const { createRequests } = setup({connectorFeature:false});
    await fillRequiredOrgFields();
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth ID'),{target:{value:'auth-id'}});
    fireEvent.change(screen.getByPlaceholderText('Vobiz Auth Token'),{target:{value:'auth-token'}});
    fireEvent.change(screen.getByPlaceholderText('+14155550123'),{target:{value:'+14155550123'}});
    fireEvent.click(screen.getByRole('button',{name:/Add another phone number/i}));
    fireEvent.change(screen.getByLabelText('Additional provider phone number 2'),{target:{value:'+14155550123'}});
    fireEvent.submit(screen.getByRole('button',{name:'Create Workspace'}).closest('form')!);
    expect(await screen.findByText(/distinct phone numbers/i)).toBeInTheDocument();
    expect(createRequests).toHaveLength(0);
  });

  it('maps two distinct saved platform numbers in one bulk allocation',async()=>{
    const {createRequests}=setup();
    await fillRequiredOrgFields();
    fireEvent.click(await screen.findByLabelText('Use platform-managed phone numbers'));
    fireEvent.change(screen.getByLabelText('Available platform number *'),{target:{value:'num-1'}});
    fireEvent.click(screen.getByRole('button',{name:/Add another platform number/i}));
    fireEvent.change(screen.getByLabelText('Additional platform number 2'),{target:{value:'num-2'}});
    fireEvent.submit(screen.getByRole('button',{name:'Create Workspace'}).closest('form')!);
    await waitFor(()=>expect(createRequests).toHaveLength(1));
    await waitFor(()=>expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/telephony/numbers/bulk-allocate',
      expect.objectContaining({method:'POST',body:JSON.stringify({orgId:'org-1',phoneNumberIds:['num-1','num-2']})})));
  });

  it('collects payment reference and receipt for direct purchase, then submits them to Payment Reviews', async () => {
    const { createRequests } = setup({ connectorFeature: false });
    await fillRequiredOrgFields({ freeTrial: false });
    fireEvent.change(screen.getByDisplayValue('AI and call-provider usage'), { target: { value: 'ai_only' } });
    fireEvent.change(screen.getByLabelText('Bank or UPI transaction reference'), { target: { value: 'UTR-INITIAL-1' } });
    const receipt = new File(['receipt'], 'payment.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Payment receipt/), { target: { files: [receipt] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Workspace' }).closest('form')!);
    await waitFor(() => expect(createRequests).toHaveLength(1));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/organizations/org-1/initial-subscription-payment', expect.objectContaining({ method: 'POST' })));
    const paymentCall = mocks.apiFetch.mock.calls.find(([url]: [string]) => url.includes('initial-subscription-payment'));
    const form = paymentCall[1].body as FormData;
    expect(JSON.parse(String(form.get('command')))).toMatchObject({ quoteId: 'quote-1', paymentReference: 'UTR-INITIAL-1', expectedAmount: { units: '100000' } });
    expect(form.get('proof')).toMatchObject({ name: 'payment.png', type: 'image/png' });
  });

  it('shows an explicit error when organization creation succeeds but trial provisioning fails', async () => {
    setup({ connectorFeature: false, trialProvisioningStatus: 'pending' });
    await fillRequiredOrgFields();
    fireEvent.change(screen.getByDisplayValue('AI and call-provider usage'), { target: { value: 'ai_only' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Workspace' }).closest('form')!);
    expect(await screen.findByText(/free trial was not provisioned \(SUBSCRIPTION_PLAN_VERSION_UNAVAILABLE\)/i)).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
