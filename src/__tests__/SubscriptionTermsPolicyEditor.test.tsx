import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscriptionTermsPolicyEditor from '../admin/SubscriptionTermsPolicyEditor';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), showToast: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

const configuredPolicy = {
  includedDistinctIndustries: 1,
  maxDistinctIndustries: null,
  taxes: [],
  postpaid: { eligible: false, workspaceModes: [], organizationExposureLimit: null },
  serviceAfterExpiry: { mode: 'suspend', graceSeconds: 0 },
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockResolvedValue(ok({ configured: false, version: 0, policy: null }));
});
afterEach(cleanup);

describe('subscription terms policy editor', () => {
  it('hides informational financial terms until Configure is opened', async () => {
    const view = render(<SubscriptionTermsPolicyEditor open={false} />);
    expect(screen.queryByText('Subscription financial terms')).not.toBeInTheDocument();
    expect(screen.queryByText('Starter defaults active')).not.toBeInTheDocument();
    view.rerender(<SubscriptionTermsPolicyEditor open />);
    expect(await screen.findByText('Subscription financial terms')).toBeInTheDocument();
  });

  it('shows an unconfigured state and requires explicit confirmation for no taxes', async () => {
    render(<SubscriptionTermsPolicyEditor />);
    await screen.findByText('Not configured');
    expect(screen.getByText(/No financial terms are approved or active/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Included distinct industries'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Policy'), { target: { value: 'suspend' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Postpaid eligibility' }), { target: { value: 'ineligible' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save financial terms' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm explicitly if this policy has no tax rules.');
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
  });

  it('saves explicit zero-tax policy with optimistic version and serialized terms', async () => {
    mocks.apiFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return ok({ configured: true, version: 1, policy: configuredPolicy });
      return ok({ configured: false, version: 0, policy: null });
    });
    render(<SubscriptionTermsPolicyEditor />);
    await screen.findByText('Not configured');
    fireEvent.change(screen.getByLabelText('Included distinct industries'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Policy'), { target: { value: 'suspend' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Postpaid eligibility' }), { target: { value: 'ineligible' } });
    fireEvent.click(screen.getByLabelText(/I confirm there are no applicable tax rules/));
    fireEvent.click(screen.getByRole('button', { name: 'Save financial terms' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/billing/subscription-terms-policy', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ expectedVersion: 0, policy: {
        ...configuredPolicy,
        includedDistinctIndustries: 2,
        maxDistinctIndustries: null,
      } }),
    })));
    expect(mocks.showToast).toHaveBeenCalledWith('Subscription financial terms saved.', 'success');
  });

  it('requires a finite exposure limit or explicit unlimited choice when postpaid is eligible', async () => {
    mocks.apiFetch.mockResolvedValue(ok({ configured: false, version: 0, policy: null }));
    render(<SubscriptionTermsPolicyEditor />);
    await screen.findByText('Not configured');
    fireEvent.change(screen.getByLabelText('Included distinct industries'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Policy'), { target: { value: 'suspend' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Postpaid eligibility' }), { target: { value: 'eligible' } });
    fireEvent.click(screen.getByLabelText('limited'));
    fireEvent.click(screen.getByLabelText(/I confirm there are no applicable tax rules/));
    fireEvent.click(screen.getByRole('button', { name: 'Save financial terms' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Set an organization exposure limit or explicitly confirm there is no limit.');
  });
});
