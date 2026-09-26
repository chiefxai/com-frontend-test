import React, { useEffect, useState } from 'react';
import { MessageCircleQuestion, Loader2, Phone, Mail, MapPin, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Badge from './ui/Badge';
import EmptyState from './ui/EmptyState';
import DataTable, { Column } from './ui/DataTable';
import FilterBar from './ui/FilterBar';

interface Enquiry {
  id: string;
  callId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  queryText: string;
  assignedTeamMemberId: string | null;
  status: 'new' | 'contacted' | 'resolved';
  createdAt: string;
}

const STATUS_COLOR: Record<string, 'amber' | 'blue' | 'green'> = { new: 'amber', contacted: 'blue', resolved: 'green' };

export default function EnquiriesView() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Enquiry['status'] | 'all'>('all');

  const filteredEnquiries = enquiries.filter((enquiry) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query
      || (enquiry.name || '').toLowerCase().includes(query)
      || (enquiry.phone || '').toLowerCase().includes(query)
      || (enquiry.email || '').toLowerCase().includes(query)
      || enquiry.queryText.toLowerCase().includes(query)
      || (enquiry.location || '').toLowerCase().includes(query)
      || (enquiry.callId || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || enquiry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  // Server-side pagination — the backend only sends this one page's rows,
  // the true total, and a separate openCount (computed across the whole
  // table server-side) so the "N still open" header stays correct without
  // fetching every enquiry.
  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    apiFetch(`/api/enquiries?page=${page}&limit=${pageSize}`)
      .then(async (r) => {
        if (!r.ok) {
          // Was silently treated the same as "no enquiries yet" — a
          // backend failure (e.g. the paginated-query bug that used to
          // make this whole page look empty) never surfaced anywhere.
          const body = await r.json().catch(() => null);
          console.error('Failed to load enquiries:', body?.error || r.status);
          return null;
        }
        return r.json();
      })
      .then((result: { rows: Enquiry[]; total: number; openCount: number } | null) => {
        setEnquiries(Array.isArray(result?.rows) ? result.rows : []);
        setTotal(result?.total ?? 0);
        setOpenCount(result?.openCount ?? 0);
      })
      .catch((err) => console.error('Failed to load enquiries:', err))
      .finally(() => { if (showSpinner) setLoading(false); });
  };

  useEffect(() => { load(true); }, [page, pageSize]);

  const handleMarkStatus = async (id: string, status: Enquiry['status']) => {
    setUpdatingId(id);
    const wasNew = enquiries.find(e => e.id === id)?.status === 'new';
    try {
      const res = await apiFetch(`/api/enquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) {
        setEnquiries(prev => prev.map(e => e.id === id ? { ...e, status } : e));
        if (wasNew) setOpenCount(prev => Math.max(0, prev - 1));
      }
    } finally { setUpdatingId(null); }
  };

  return (
    <PageShell
      title="Enquiries"
      subtitle={`Callers who asked something mid-call and need a follow-up — ${openCount} still open.`}
      onRefresh={() => load()}
      toolbar={
        <div className="w-full flex items-center justify-end">
          <FilterBar
            search={{ value: search, onChange: setSearch, placeholder: 'Search caller, phone, email, enquiry…' }}
            selects={[{
              key: 'Status',
              label: 'Status',
              value: statusFilter,
              onChange: (value) => setStatusFilter(value as Enquiry['status'] | 'all'),
              options: [
                { label: 'All statuses', value: 'all' },
                { label: 'New', value: 'new' },
                { label: 'Contacted', value: 'contacted' },
                { label: 'Resolved', value: 'resolved' },
              ],
            }]}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
            resultCount={{ filtered: filteredEnquiries.length, total, label: 'enquiries' }}
          />
        </div>
      }
      layout="fill"
    >
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 sm:px-5 md:px-6 xl:px-8 pb-6 pt-4">
        <Widget className="flex-1 min-h-0 w-full" bodyClassName="flex-1 min-h-0 overflow-hidden flex flex-col" showHeader={false} padding="none">
        {total === 0
          ? <EmptyState icon={MessageCircleQuestion} heading="No enquiries captured yet" message="Enquiries from AI calls will appear here automatically." />
          : (() => {
              const columns: Column<Enquiry>[] = [
                {
                  key: 'caller',
                  header: 'Caller',
                  cell: (e) => (
                    <>
                      <div className="font-medium text-slate-700">{e.name || 'Unknown caller'}</div>
                      <div className="flex flex-col gap-0.5 mt-1 text-xs text-slate-400">
                        {e.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {e.phone}</span>}
                        {e.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {e.email}</span>}
                        {e.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {e.location}</span>}
                      </div>
                    </>
                  ),
                },
                { key: 'enquiry', header: 'Enquiry', cell: (e) => <span className="text-slate-600 max-w-sm">{e.queryText}</span> },
                { key: 'status', header: 'Status', cell: (e) => <Badge color={STATUS_COLOR[e.status]}>{e.status}</Badge> },
                { key: 'when', header: 'When', cell: (e) => <span className="text-slate-400 text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span> },
                {
                  key: 'action',
                  header: 'Action',
                  align: 'right',
                  cell: (e) => e.status !== 'resolved' ? (
                    <button
                      disabled={updatingId === e.id}
                      onClick={() => handleMarkStatus(e.id, e.status === 'new' ? 'contacted' : 'resolved')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {e.status === 'new' ? 'Mark Contacted' : 'Mark Resolved'}
                    </button>
                  ) : null,
                },
              ];
              return (
                <DataTable
                  bare
                  resizable
                  className="flex-1 min-h-0 h-full overflow-hidden"
                  columns={columns}
                  rows={filteredEnquiries}
                  rowKey={(e) => e.id}
                  serverPagination={{
                    page,
                    pageSize,
                    total,
                    onPageChange: setPage,
                    onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
                  }}
                />
              );
            })()
        }
      </Widget>
      </div>
    </PageShell>
  );
}
