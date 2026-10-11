import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ChevronUp, ChevronDown, RefreshCw, Archive } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { OrgRow } from './types';
import OrgDetailPanel from './OrgDetailPanel';
import { formatInr } from '../lib/pricing';
import IconButton from '../components/ui/IconButton';
import DataTable, { Column } from '../components/ui/DataTable';
import Widget from '../components/ui/Widget';
import FilterBar from '../components/ui/FilterBar';
import Button from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

type SortKey = 'name' | 'industry' | 'subscriptionPlan' | 'memberCount' | 'leadCount' | 'createdAt';
type OrgStatusFilter = 'current' | 'active' | 'suspended' | 'deleted';

// Deletion permanently removes the live organization. The cost archive
// contains read-only final snapshots, not recoverable organization records.
export type DeletedOrganizationSnapshot = {
  id: string;
  orgId: string;
  orgName: string | null;
  workspaceName: string | null;
  industry: string | null;
  deletedAt: string;
  deletedByEmail: string | null;
  aiMinutesUsed: number | null;
  aiMinutesCostInr: number | null;
  phoneCharges: number | null;
  callProviderLabel: string | null;
  aiTotalTokens: number | null;
  aiTokenProviderLabel: string | null;
  aiTokenTotalCostInr: number | null;
};


export default function OrganizationsPage() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>('current');
  const [industryFilter, setIndustryFilter] = useState('');
  const [archive, setArchive] = useState<DeletedOrganizationSnapshot[]>([]);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const loadOrgs = () => {
    setLoading(true);
    apiFetch('/api/platform/organizations')
      .then((r) => r.json())
      .then((data) => setOrgs(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(loadOrgs, []);

  const loadArchive = useCallback(async () => {
    setLoadingArchive(true);
    setArchiveError('');
    try {
      const response = await apiFetch('/api/platform/cost-archive');
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to load deleted organizations.');
      setArchive(Array.isArray(data) ? data as DeletedOrganizationSnapshot[] : []);
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Unable to load deleted organizations.');
    } finally {
      setArchiveLoaded(true);
      setLoadingArchive(false);
    }
  }, []);

  // Archive data is only needed when Deleted is selected.
  useEffect(() => {
    if (statusFilter === 'deleted' && !archiveLoaded && !loadingArchive) void loadArchive();
  }, [statusFilter, archiveLoaded, loadingArchive, loadArchive]);

  const viewingDeleted = statusFilter === 'deleted';
  const industries = useMemo(() => {
    const values = viewingDeleted ? archive.map(row => row.industry) : orgs.map(row => row.industry);
    return [...new Set(values.filter((industry): industry is string => Boolean(industry)))].sort();
  }, [archive, orgs, viewingDeleted]);

  const filteredArchive = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archive.filter(row =>
      (!industryFilter || row.industry === industryFilter) &&
      (!q || [row.orgName, row.workspaceName, row.industry, row.deletedByEmail, row.orgId]
        .some(value => (value || '').toLowerCase().includes(q)))
    ).sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  }, [archive, query, industryFilter]);

  const onFilterStatus = (next: string) => {
    setStatusFilter(next as OrgStatusFilter);
    setIndustryFilter('');
    setQuery('');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = orgs.filter(o => {
      if (statusFilter === 'active' && String(o.status || '').toLowerCase() === 'suspended') return false;
      if (statusFilter === 'suspended' && String(o.status || '').toLowerCase() !== 'suspended') return false;
      if (industryFilter && o.industry !== industryFilter) return false;
      return !q || [o.name, o.workspaceName, o.industry].some(v => (v || '').toLowerCase().includes(q));
    });

    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === 'string'
          ? String(av).localeCompare(String(bv))
          : Number(av) - Number(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [orgs, query, sortKey, sortDir, statusFilter, industryFilter]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const columns: Column<OrgRow>[] = [
    {
      key: 'name',
      header: (
        <button
          type="button"
          onClick={() => handleSort('name')}
          className="inline-flex items-center gap-1"
        >
          Organization
          {sortKey === 'name' &&
            (sortDir === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </button>
      ),
      cell: (o) => (
        <>
          <span className="font-medium text-[var(--text-primary)]">{o.name}</span>
          <div className="text-[10px] text-[var(--text-muted)] font-normal">
            {o.workspaceName}
          </div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (o) => (
        <span
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            String(o.status || '').toLowerCase() === 'suspended'
              ? 'bg-rose-50 text-rose-600'
              : 'bg-emerald-50 text-emerald-600'
          }`}
        >
          {String(o.status || '').toLowerCase() === 'suspended' ? 'Suspended' : 'Active'}
        </span>
      ),
    },
    {
      key: 'industry',
      header: (
        <button
          type="button"
          onClick={() => handleSort('industry')}
          className="inline-flex items-center gap-1"
        >
          Industry
          {sortKey === 'industry' &&
            (sortDir === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </button>
      ),
      cell: (o) => o.industry,
    },
    {
      key: 'plan',
      header: (
        <button
          type="button"
          onClick={() => handleSort('subscriptionPlan')}
          className="inline-flex items-center gap-1"
        >
          Plan
          {sortKey === 'subscriptionPlan' &&
            (sortDir === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </button>
      ),
      cell: (o) => o.subscriptionPlan,
    },
    { key: 'aiMinutes', header: 'AI Minutes', cell: (o) => o.aiMinutesUsed },
    { key: 'aiCost', header: 'AI Cost', cell: (o) => formatInr(o.totalCostInr) },
    {
      key: 'members',
      header: (
        <button
          type="button"
          onClick={() => handleSort('memberCount')}
          className="inline-flex items-center gap-1"
        >
          Members
          {sortKey === 'memberCount' &&
            (sortDir === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </button>
      ),
      cell: (o) => o.memberCount,
    },
    {
      key: 'leads',
      header: (
        <button
          type="button"
          onClick={() => handleSort('leadCount')}
          className="inline-flex items-center gap-1"
        >
          Leads
          {sortKey === 'leadCount' &&
            (sortDir === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </button>
      ),
      cell: (o) => o.leadCount,
    },
    {
      key: 'created',
      header: (
        <button
          type="button"
          onClick={() => handleSort('createdAt')}
          className="inline-flex items-center gap-1"
        >
          Signed Up
          {sortKey === 'createdAt' &&
            (sortDir === 'asc' ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            ))}
        </button>
      ),
      cell: (o) => (
        <span className="text-xs whitespace-nowrap">
          {new Date(o.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const archivedColumns: Column<DeletedOrganizationSnapshot>[] = [
    { key: 'organization', header: 'Organization / workspace', width: '240px', cell: row =>
      <div className="min-w-0">
        <p className="truncate font-semibold text-[var(--text-primary)]" title={row.orgName || row.orgId}>{row.orgName || row.orgId}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">{row.workspaceName || row.industry || row.orgId}</p>
      </div> },
    { key: 'deleted', header: 'Deleted', width: '220px', cell: row =>
      <div>
        <p className="whitespace-nowrap text-xs text-[var(--text-secondary)]">{new Date(row.deletedAt).toLocaleDateString()}</p>
        <p className="truncate text-xs text-[var(--text-muted)]" title={row.deletedByEmail || ''}>{row.deletedByEmail || '—'}</p>
      </div> },
    { key: 'minutes', header: 'AI minutes', align: 'right', width: '120px', cell: row => (row.aiMinutesUsed ?? 0).toFixed(2) },
    { key: 'aiTimeCost', header: 'AI time cost', align: 'right', width: '140px', cell: row => row.aiMinutesCostInr != null ? formatInr(row.aiMinutesCostInr) : '—' },
    { key: 'callCost', header: 'Phone cost', align: 'right', width: '150px', cell: row =>
      <span title={row.callProviderLabel || undefined}>{formatInr(row.phoneCharges ?? 0)}</span> },
    { key: 'tokens', header: 'AI tokens', align: 'right', width: '130px', cell: row => (row.aiTotalTokens ?? 0).toLocaleString('en-IN') },
    { key: 'tokenCost', header: 'AI token cost', align: 'right', width: '150px', cell: row =>
      <span title={row.aiTokenProviderLabel || undefined}>
        {row.aiTokenTotalCostInr != null ? formatInr(row.aiTokenTotalCostInr) : '—'}
      </span> },
  ];

  return (
    <div className="space-y-4">
      <Widget showHeader={false} padding="none">
        <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <FilterBar
            search={{ value: query, onChange: setQuery, placeholder: viewingDeleted
              ? 'Search deleted organizations, workspaces, or administrators…'
              : 'Search organizations…' }}
            selects={[
              {
                key: 'status', label: 'Status', value: statusFilter, onChange: onFilterStatus,
                options: [
                  { label: 'Current organizations', value: 'current' },
                  { label: 'Active', value: 'active' },
                  { label: 'Suspended', value: 'suspended' },
                  { label: 'Deleted', value: 'deleted' },
                ],
              },
              {
                key: 'industry', label: 'Industry', value: industryFilter, onChange: setIndustryFilter,
                options: [{ label: 'All industries', value: '' }, ...industries.map(value => ({
                  value, label: value.replaceAll('_', ' '),
                }))],
              },
            ]}
            hasActiveFilters={Boolean(query.trim() || industryFilter || statusFilter !== 'current')}
            onClear={() => { setQuery(''); setIndustryFilter(''); setStatusFilter('current'); }}
            resultCount={viewingDeleted
              ? { filtered: filteredArchive.length, total: archive.length, label: 'deleted organizations' }
              : { filtered: filtered.length, total: orgs.length, label: 'organizations' }}
            actions={
              <>
                {viewingDeleted && <IconButton icon={RefreshCw} label="Refresh deleted organizations"
                  disabled={loadingArchive} onClick={() => void loadArchive()} />}
                <IconButton icon={Plus} label="Create Workspace"
                  onClick={() => navigate('/admin/organizations/create')} />
              </>
            }
          />
        </div>
        {viewingDeleted ? (
          <>
            <div className="flex items-start gap-2 border-b border-[var(--border)] bg-[var(--bg-subtle)]/60 px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
              <Archive aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              Deleted organizations are permanent cost snapshots. They are not active workspaces and cannot be opened as organization details.
            </div>
            {archiveError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
                <span>{archiveError}</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => void loadArchive()}>Retry</Button>
              </div>
            )}
            <DataTable<DeletedOrganizationSnapshot>
              bare resizable paginated defaultPageSize={25}
              columns={archivedColumns} rows={filteredArchive} rowKey={row => row.id}
              loading={loadingArchive && !archiveLoaded}
              emptyMessage={archiveError ? 'Archived organizations are unavailable.' : query || industryFilter
                ? 'No deleted organizations match these filters.'
                : 'No deleted organizations have been archived yet.'}
            />
          </>
        ) : (
          <DataTable
            bare resizable columns={columns} rows={filtered} rowKey={row => row.id}
            loading={loading}
            emptyMessage={query || industryFilter || statusFilter !== 'current'
              ? 'No organizations match these filters.' : 'No workspaces yet. Create one above.'}
            onRowClick={row => setSelectedOrgId(row.id)}
            paginated defaultPageSize={25}
          />
        )}
      </Widget>

      {selectedOrgId && (
        <OrgDetailPanel
          orgId={selectedOrgId}
          onClose={() => setSelectedOrgId(null)}
          onChanged={loadOrgs}
        />
      )}
    </div>
  );
}
