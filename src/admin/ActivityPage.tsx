import React, { useEffect, useMemo, useState } from 'react';
import { ScrollText, Clock3 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AuditRow } from './types';
import Widget from '../components/ui/Widget';
import KpiCard from '../components/ui/KpiCard';
import DataTable, { Column } from '../components/ui/DataTable';
import FilterBar from '../components/ui/FilterBar';

export default function ActivityPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  useEffect(() => {
    apiFetch('/api/platform/audit-log')
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const orgNames = useMemo(() => {
    const names = new Set(rows.map((a) => a.orgName).filter(Boolean));
    return Array.from(names).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((a) => {
      if (orgFilter && a.orgName !== orgFilter) return false;
      if (!q) return true;
      return (a.orgName || '').toLowerCase().includes(q) || a.action.toLowerCase().includes(q) || (a.actorEmail || '').toLowerCase().includes(q);
    });
  }, [rows, query, orgFilter]);

  const eventsLast24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return rows.filter((a) => new Date(a.createdAt).getTime() >= cutoff).length;
  }, [rows]);

  const columns: Column<AuditRow>[] = [
    { key: 'org', header: 'Organization', cell: (a) => <span className="font-medium text-[var(--text-primary)]">{a.orgName}</span> },
    { key: 'action', header: 'Action', cell: (a) => a.action },
    { key: 'by', header: 'By', cell: (a) => a.actorEmail || '—' },
    { key: 'when', header: 'When', cell: (a) => <span className="text-xs whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</span> },
  ];

  return (
    <div className="grid grid-cols-12 gap-4">
      <KpiCard colSpan={3} label="Total events" value={rows.length} icon={ScrollText} iconBg="#2a78d61a" iconColor="#2a78d6" />
      <KpiCard colSpan={3} label="Events, last 24h" value={eventsLast24h} icon={Clock3} iconBg="#4a3aa71a" iconColor="#4a3aa7" />

      <Widget colSpan={12} showHeader={false} padding="none">
        <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <FilterBar
            search={{ value: query, onChange: setQuery, placeholder: 'Search by organization, action, or actor…' }}
            selects={[{ key: 'organization', label: 'Organization', value: orgFilter, onChange: setOrgFilter,
              options: [{ label: 'All organizations', value: '' }, ...orgNames.map(name => ({ label: name, value: name }))] }]}
            hasActiveFilters={Boolean(query.trim() || orgFilter)}
            onClear={() => { setQuery(''); setOrgFilter(''); }}
            resultCount={{ filtered: filtered.length, total: rows.length, label: 'events' }}
          />
        </div>
        <DataTable
          bare
          resizable
          columns={columns}
          rows={filtered}
          rowKey={row => row.id}
          loading={loading}
          emptyMessage={query || orgFilter ? 'No activity matches your filters.' : 'No activity recorded yet.'}
          paginated
          defaultPageSize={25}
        />
      </Widget>
    </div>
  );
}
