import React, { useEffect, useState } from 'react';
import { ScrollText, Loader2 } from 'lucide-react';
import FilterBar from './ui/FilterBar';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import DataTable, { Column } from './ui/DataTable';
import EmptyState from './ui/EmptyState';

interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function describeAction(action: string): string {
  const labels: Record<string, string> = {
    'config.update': 'Updated AI persona config',
    'config.apply_preset': 'Applied a persona preset',
    'dnc.add': 'Added a number to the Do-Not-Call list',
    'dnc.remove': 'Removed a number from the Do-Not-Call list',
    'calling_window.update': 'Updated calling window',
    'knowledge.add_document': 'Added a knowledge base document',
    'knowledge.delete_document': 'Deleted a knowledge base document',
    'team.add': 'Added a team member',
    'team.update': 'Updated a team member',
    'org_settings.update': 'Updated organization settings',
    'channel.connect': 'Connected a channel',
    'object.create': 'Created a custom object',
  };
  return labels[action] || action;
}

const COLUMNS: Column<AuditEntry>[] = [
  { key: 'action', header: 'Action', cell: r => <span className="font-medium text-slate-700">{describeAction(r.action)}</span> },
  { key: 'by', header: 'By', cell: r => <span className="text-slate-500">{r.actorEmail || '—'}</span> },
  {
    key: 'details', header: 'Details',
    cell: r => (
      <span className="text-slate-400 text-xs truncate block max-w-xs" title={JSON.stringify(r.metadata)}>
        {Object.keys(r.metadata || {}).length ? JSON.stringify(r.metadata) : '—'}
      </span>
    ),
  },
  {
    key: 'when', header: 'When', align: 'right',
    cell: r => <span className="text-slate-400 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</span>,
  },
];

export default function AuditLogView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');

  const actionOptions = Array.from(new Set(entries.map((entry) => entry.action)))
    .sort()
    .map((action) => ({ label: describeAction(action), value: action }));
  const actorOptions = Array.from(new Set(entries.map((entry) => entry.actorEmail).filter(Boolean) as string[]))
    .sort()
    .map((actor) => ({ label: actor, value: actor }));
  const targetTypeOptions = Array.from(new Set(entries.map((entry) => entry.targetType).filter(Boolean) as string[]))
    .sort()
    .map((type) => ({ label: type, value: type }));

  const filteredEntries = entries.filter((entry) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query
      || describeAction(entry.action).toLowerCase().includes(query)
      || (entry.actorEmail || '').toLowerCase().includes(query)
      || (entry.targetType || '').toLowerCase().includes(query)
      || JSON.stringify(entry.metadata || {}).toLowerCase().includes(query);
    return matchesSearch
      && (actionFilter === 'all' || entry.action === actionFilter)
      && (actorFilter === 'all' || entry.actorEmail === actorFilter)
      && (targetTypeFilter === 'all' || entry.targetType === targetTypeFilter);
  });
  const hasActiveFilters = Boolean(search.trim()) || actionFilter !== 'all' || actorFilter !== 'all' || targetTypeFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setActionFilter('all');
    setActorFilter('all');
    setTargetTypeFilter('all');
  };

  // Server-side pagination: the backend only returns this one page's rows
  // plus the true total count (see /api/audit-log?page=&limit=), so the
  // whole audit log never has to be fetched at once.
  const loadEntries = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    apiFetch(`/api/audit-log?page=${page}&limit=${pageSize}`)
      .then(async (r) => {
        // Was parsed unconditionally regardless of status — a 500 (e.g.
        // the backend's paginated-query bug that used to make this whole
        // page look empty) got JSON.parse'd as if it were {rows, total},
        // silently rendering "No admin actions recorded yet" instead of
        // surfacing the actual failure.
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || `Failed to load audit log (${r.status})`);
        return body as { rows: AuditEntry[]; total: number };
      })
      .then((result) => {
        setEntries(Array.isArray(result?.rows) ? result.rows : []);
        setTotal(result?.total ?? 0);
      })
      .catch((err) => console.error('Failed to load audit log:', err))
      .finally(() => { if (showSpinner) setLoading(false); });
  };

  useEffect(() => { loadEntries(true); }, [page, pageSize]);

  return (
    <PageShell title="Audit Log" subtitle="Admin actions across this organization — who changed what, and when." onRefresh={() => loadEntries()} layout="fill">
      <div className="flex-1 flex flex-col overflow-hidden px-8 pb-8 pt-6">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 gap-3">
            <Widget className="flex-1 min-h-0" showHeader={false} padding="none">
              <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <FilterBar
                  search={{ value: search, onChange: setSearch, placeholder: 'Search audit actions, users, targets…' }}
                  selects={[
                    { key: 'Action', label: 'Action', value: actionFilter, onChange: setActionFilter, options: [{ label: 'All actions', value: 'all' }, ...actionOptions] },
                    { key: 'Actor', label: 'Actor', value: actorFilter, onChange: setActorFilter, options: [{ label: 'All actors', value: 'all' }, ...actorOptions] },
                    { key: 'Target Type', label: 'Target Type', value: targetTypeFilter, onChange: setTargetTypeFilter, options: [{ label: 'All target types', value: 'all' }, ...targetTypeOptions] },
                  ]}
                  onClear={clearFilters}
                  hasActiveFilters={hasActiveFilters}
                  resultCount={{ filtered: filteredEntries.length, total: entries.length, label: 'loaded entries' }}
                />
              </div>
            {total === 0
              ? <EmptyState icon={ScrollText} heading="No admin actions recorded yet" />
              : (
                <DataTable
                  bare
                  resizable
                  columns={COLUMNS}
                  rows={filteredEntries}
                  rowKey={r => r.id}
                  serverPagination={{
                    page,
                    pageSize,
                    total,
                    onPageChange: setPage,
                    onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
                  }}
                />
              )
            }
            </Widget>
          </div>
        )}
      </div>
    </PageShell>
  );
}
