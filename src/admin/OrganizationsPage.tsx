import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { OrgRow } from './types';
import OrgDetailPanel from './OrgDetailPanel';
import { formatInr } from '../lib/pricing';
import IconButton from '../components/ui/IconButton';
import DataTable, { Column } from '../components/ui/DataTable';
import FilterBar from '../components/ui/FilterBar';
import { useNavigate } from 'react-router-dom';

type SortKey = 'name' | 'industry' | 'subscriptionPlan' | 'memberCount' | 'leadCount' | 'createdAt';

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = q
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.workspaceName.toLowerCase().includes(q) ||
            o.industry.toLowerCase().includes(q),
        )
      : orgs;

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
  }, [orgs, query, sortKey, sortDir]);

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

  return (
    <div className="space-y-4">
      <FilterBar
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search organizations…',
        }}
        resultCount={{
          filtered: filtered.length,
          total: orgs.length,
          label: 'organizations',
        }}
        actions={
          <IconButton
            icon={Plus}
            label="Create Workspace"
            onClick={() => navigate('/admin/organizations/create')}
            className="!bg-amber-500 hover:!bg-amber-400"
          />
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(o) => o.id}
        loading={loading}
        emptyMessage={
          query
            ? `No organizations match "${query}"`
            : 'No workspaces yet. Create one above.'
        }
        onRowClick={(o) => setSelectedOrgId(o.id)}
        paginated
        defaultPageSize={25}
      />

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
