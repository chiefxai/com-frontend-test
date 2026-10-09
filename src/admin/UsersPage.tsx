import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Users as UsersIcon, UserX } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { UserRow } from './types';
import Widget from '../components/ui/Widget';
import KpiCard from '../components/ui/KpiCard';
import DataTable, { Column } from '../components/ui/DataTable';
import FilterBar from '../components/ui/FilterBar';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    apiFetch('/api/platform/users')
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q) || (u.orgName || '').toLowerCase().includes(q));
  }, [users, query]);

  const unassignedCount = useMemo(() => users.filter((u) => !u.orgName).length, [users]);

  const columns: Column<UserRow>[] = [
    { key: 'email', header: 'Email', cell: (u) => <span className="font-medium text-[var(--text-primary)]">{u.email}</span> },
    { key: 'org', header: 'Organization', cell: (u) => u.orgName || <span className="text-rose-400">unassigned</span> },
    { key: 'role', header: 'Role', cell: (u) => u.role || '—' },
    { key: 'created', header: 'Signed Up', cell: (u) => <span className="text-xs whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString()}</span> },
    { key: 'lastSignIn', header: 'Last Sign-in', cell: (u) => <span className="text-xs whitespace-nowrap">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : 'never'}</span> },
  ];

  return (
    <div className="grid grid-cols-12 gap-4">
      <KpiCard colSpan={3} label="Registered users" value={users.length} icon={UsersIcon} iconBg="#2a78d61a" iconColor="#2a78d6" />
      <KpiCard colSpan={3} label="Unassigned to an org" value={unassignedCount} icon={UserX} iconBg="#e11d481a" iconColor="#e11d48" />

      <Widget colSpan={12} showHeader={false} padding="none">
        <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <FilterBar
            search={{ value: query, onChange: setQuery, placeholder: 'Search users or organizations…' }}
            hasActiveFilters={Boolean(query.trim())}
            onClear={() => setQuery('')}
            resultCount={{ filtered: filtered.length, total: users.length, label: 'users' }}
          />
        </div>
        <DataTable
          bare
          resizable
          columns={columns}
          rows={filtered}
          rowKey={row => row.id}
          loading={loading}
          emptyMessage={query ? 'No users match your search.' : 'No users yet.'}
          paginated
          defaultPageSize={25}
        />
      </Widget>
    </div>
  );
}
