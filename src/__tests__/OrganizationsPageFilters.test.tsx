import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrganizationsPage from '../admin/OrganizationsPage';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../admin/OrgDetailPanel', () => ({ default: () => <div>Live organization details</div> }));
vi.mock('../components/ui/FilterBar', () => ({
  default: ({ search, selects, resultCount, onClear }: any) => (
    <div>
      <input aria-label="Search organizations" value={search.value} onChange={e => search.onChange(e.target.value)} />
      {selects.map((filter: any) => (
        <select key={filter.key} aria-label={filter.label} value={filter.value}
          onChange={event => filter.onChange(event.target.value)}>
          {filter.options.map((option: any) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ))}
      <span>{resultCount.filtered} of {resultCount.total}</span>
      <button type="button" onClick={onClear}>Clear filters</button>
    </div>
  ),
}));
vi.mock('../components/ui/DataTable', () => ({
  default: ({ rows, emptyMessage, onRowClick }: any) => (
    <div data-testid="organizations-table">
      {rows.length === 0 ? <p>{emptyMessage}</p> : rows.map((row: any) => (
        <button type="button" key={row.id} onClick={() => onRowClick?.(row)}>
          {row.orgName || row.name}
        </button>
      ))}
    </div>
  ),
}));
const live = [
  { id: 'o1', name: 'Alpha', workspaceName: 'HQ', industry: 'healthcare',
    status: 'Active', subscriptionPlan: 'Pro', aiMinutesUsed: 5,
    totalCostInr: 10, memberCount: 2, leadCount: 3, createdAt: '2026-09-01' },
  { id: 'o2', name: 'Beta', workspaceName: 'North', industry: 'lending',
    status: 'Suspended', subscriptionPlan: 'Pro', aiMinutesUsed: 6,
    totalCostInr: 15, memberCount: 3, leadCount: 4, createdAt: '2026-09-01' },
];
const archive = [{
  id: 'arch-1', orgId: 'deleted-1', orgName: 'Former Org', workspaceName: 'Old HQ',
  industry: 'healthcare', deletedAt: '2026-09-15', deletedByEmail: 'admin@example.com',
  aiMinutesUsed: 4, aiMinutesCostInr: 8, phoneCharges: 2, callProviderLabel: 'Vobiz',
  aiTotalTokens: 100, aiTokenProviderLabel: 'Gemini', aiTokenTotalCostInr: 3,
}];
const json = (rows: unknown) => ({ ok: true, json: async () => rows });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/platform/organizations') return json(live);
    if (path === '/api/platform/cost-archive') return json(archive);
    throw Error('Unexpected request ' + path);
  });
});

describe('Platform Admin organization filters', () => {
  it('defaults to current organizations without loading cost archive', async () => {
    render(<OrganizationsPage />);
    expect(await screen.findByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalledWith('/api/platform/cost-archive');
  });

  it('filters current organizations by active or suspended status', async () => {
    render(<OrganizationsPage />);
    await screen.findByRole('button', { name: 'Alpha' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'suspended' } });
    expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
  });

  it('shows archived cost snapshots only under Deleted, without live detail clicks', async () => {
    render(<OrganizationsPage />);
    await screen.findByRole('button', { name: 'Alpha' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'deleted' } });
    expect(await screen.findByRole('button', { name: 'Former Org' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(screen.getByText(/permanent cost snapshots/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Former Org' }));
    expect(screen.queryByText('Live organization details')).not.toBeInTheDocument();
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/cost-archive');
  });

  it('keeps archive search and industry filters available and clears them', async () => {
    render(<OrganizationsPage />);
    await screen.findByRole('button', { name: 'Alpha' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'deleted' } });
    await screen.findByRole('button', { name: 'Former Org' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search organizations' }), { target: { value: 'not present' } });
    expect(screen.getByText('No deleted organizations match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('current'));
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
  });
});
