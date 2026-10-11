import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrganizationWorkspaceSetup from '../admin/OrganizationWorkspaceSetup';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

const basePolicy = {
  mode: 'mixed_industry',
  primaryIndustry: 'lending',
  planId: 'growth',
  pricing: { includedWorkspaces: 1, maxWorkspaces: 4, extraWorkspaceMonthlyInr: 300 },
};
const workspace = { id: 'w-1', name: 'Main branch', industry: 'lending' };
const setup = {
  policy: basePolicy,
  workspaces: [workspace],
  currentQuote: { totalMonthlyInr: 2200, seatCount: 3 },
  addBranchQuote: { totalMonthlyInr: 2500, paymentRequired: false },
};
const response = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockResolvedValue(response(setup));
});

describe('Subscription workspaces card', () => {
  it('shows plan allowances, workspace list, and monthly estimate without an oversized form', async () => {
    render(<OrganizationWorkspaceSetup orgId="org-1" />);
    expect(await screen.findByText('Main branch')).toBeInTheDocument();
    expect(screen.getByText('Growth')).toBeInTheDocument();
    expect(screen.getByText('₹300.00')).toBeInTheDocument();
    expect(screen.getByText('₹2200.00')).toBeInTheDocument();
    expect(screen.getByText('1 total')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Workspace name' })).not.toBeInTheDocument();
  });

  it('opens an accessible form and preserves the existing workspace creation API', async () => {
    mocks.apiFetch.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return response({ id: 'w-2' });
      return response(setup);
    });
    render(<OrganizationWorkspaceSetup orgId="org-1" />);
    const trigger = await screen.findByRole('button', { name: 'Add workspace' });
    fireEvent.click(trigger);
    expect(screen.getByText('Estimated subscription after adding')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), { target: { value: 'Support branch' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'New workspace industry' }), { target: { value: 'insurance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/organizations/org-1/workspaces', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Support branch', industry: 'insurance' }),
      }));
    });
    expect(await screen.findByText(/Workspace created and assigned/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Workspace name' })).not.toBeInTheDocument();
  });

  it('explains when the plan limit prevents creation', async () => {
    mocks.apiFetch.mockResolvedValue(response({
      ...setup,
      policy: { ...basePolicy, mode: 'single', pricing: { ...basePolicy.pricing, maxWorkspaces: 1 } },
      addBranchQuote: null,
    }));
    render(<OrganizationWorkspaceSetup orgId="org-1" />);
    expect(await screen.findByText(/reached its workspace limit/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add workspace' })).not.toBeInTheDocument();
  });

  it('does not allow workspace creation before the required add-on payment is approved', async () => {
    mocks.apiFetch.mockResolvedValue(response({
      ...setup,
      addBranchQuote: { totalMonthlyInr: 2500, paymentRequired: true },
    }));
    render(<OrganizationWorkspaceSetup orgId="org-1" />);
    expect(await screen.findByText(/requires an approved add-on payment/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add workspace' })).not.toBeInTheDocument();
  });
});
