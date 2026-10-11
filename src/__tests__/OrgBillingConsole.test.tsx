import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrgBillingConsole from '../admin/OrgBillingConsole';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../components/ui/DataTable', () => ({
  default: () => <div role="table">Billing records</div>,
}));

const billing = {
  services: { mode: 'prepaid', aiEnabled: true, phoneEnabled: false, chargeScope: 'ai_only' },
  overview: {
    billingMethod: 'recharge_based',
    currentBalanceInr: 5000,
    reservedInr: 600,
    availableInr: 4400,
    currentMonthSpendInr: 750,
  },
  billingPeriod: { label: 'October 2026', timeZone: 'Asia/Kolkata' },
  aiBilling: { pricingMode: 'TIME_BASED', source: 'platform_default', effective: {
    voice: { timeRateAmount: 4 }, postCall: { timeRateAmount: 0.5 },
  } },
  usageAndCost: [],
  ledger: [],
};

const response = (data: unknown) => ({ ok: true, json: async () => data });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockResolvedValue(response(billing));
});

describe('Organization billing activity', () => {
  it('uses theme-consistent views and shows the existing recorded balances', async () => {
    render(<OrgBillingConsole orgId="org-1" />);
    expect(await screen.findByRole('navigation', { name: 'Billing activity views' })).toBeInTheDocument();
    expect(screen.getByText('₹5000.00')).toBeInTheDocument();
    expect(screen.getByText('₹4400.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('AI processing rates')).toBeInTheDocument();
  });

  it('keeps transactions and pricing configuration discoverable', async () => {
    render(<OrgBillingConsole orgId="org-1" />);
    const ledger = await screen.findByRole('button', { name: 'Transactions' });
    fireEvent.click(ledger);
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pricing setup' }));
    expect(screen.getByText('Charge scope')).toBeInTheDocument();
    expect(screen.getByText('AI only')).toBeInTheDocument();
  });

  it('offers a retry after a billing console load failure', async () => {
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Billing service unavailable' }),
    }).mockResolvedValue(response(billing));
    render(<OrgBillingConsole orgId="org-1" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Billing service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Billing activity views' })).toBeInTheDocument());
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/organizations/org-1/billing-console');
  });
});
