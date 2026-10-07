import React, { useEffect, useState } from 'react';
import { Plus, X, ChevronRight, Trash2, Boxes, Loader2, Search, Upload, Pencil, LayoutGrid, List } from 'lucide-react';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Modal from './ui/Modal';
import ActionMenu from './ui/ActionMenu';
import type { IndustryProfile } from '../lib/industry';

interface ObjectField {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'boolean' | 'select' | 'phone' | 'email';
  options: string[];
  required: boolean;
}

interface ObjectStage {
  id: string;
  key: string;
  label: string;
  color: string;
}

interface CustomObject {
  id: string;
  key: string;
  label: string;
  icon: string;
  description: string | null;
  hasPipeline: boolean;
  fields: ObjectField[];
  stages: ObjectStage[];
}

interface ObjectRecord {
  id: string;
  objectId: string;
  stageId: string | null;
  createdAt: string;
  updatedAt: string;
  [fieldKey: string]: unknown;
}

function FieldInput({ field, value, onChange }: { field: ObjectField; value: unknown; onChange: (v: unknown) => void }) {
  const baseClass = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500";
  if (field.type === 'textarea') {
    return <textarea className={baseClass} rows={3} value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} required={field.required} />;
  }
  if (field.type === 'select') {
    return (
      <select className={baseClass} value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} required={field.required}>
        <option value="" disabled>Select…</option>
        {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  if (field.type === 'boolean') {
    return (
      <input type="checkbox" className="h-4 w-4" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
    );
  }
  const inputType = field.type === 'number' || field.type === 'currency' ? 'number'
    : field.type === 'date' ? 'date'
    : field.type === 'email' ? 'email'
    : field.type === 'phone' ? 'tel'
    : 'text';
  return (
    <input
      type={inputType}
      className={baseClass}
      value={(value as string | number) ?? ''}
      onChange={(e) => onChange(inputType === 'number' ? Number(e.target.value) : e.target.value)}
      required={field.required}
    />
  );
}

function RecordCard({ object, record, onAdvance, onEdit, onDelete }: {
  object: CustomObject;
  record: ObjectRecord;
  onAdvance: (() => void) | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const primaryFields = object.fields.slice(0, 3);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 mb-2 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          {primaryFields.map((f) => (
            <div key={f.key} className="text-xs truncate">
              {f.key === primaryFields[0].key ? (
                <span className="font-semibold text-slate-800">{String(record[f.key] ?? '—')}</span>
              ) : (
                <span className="text-slate-500">{f.label}: {String(record[f.key] ?? '—')}</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
          <button onClick={onEdit} className="text-slate-300 hover:text-blue-500"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {onAdvance && (
        <button
          onClick={onAdvance}
          className="mt-2 w-full flex items-center justify-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
        >
          Move forward <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// Simple comma-split CSV parsing — header row's column names are matched
// against the object's real field keys/labels (case-insensitive), so bulk
// upload works for any industry's fields without per-industry code.
function parseCsv(text: string, fields: ObjectField[]): { rows: Record<string, string>[]; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], error: null };
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return { rows: [], error: 'Paste a header row plus at least one data row.' };

  const headerCells = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const keyByHeader = headerCells.map((h) => {
    const match = fields.find((f) => f.key.toLowerCase() === h || f.label.toLowerCase() === h);
    return match ? match.key : null;
  });
  if (keyByHeader.every((k) => !k)) {
    return { rows: [], error: `None of the header columns matched a real field. Expected some of: ${fields.map((f) => f.key).join(', ')}` };
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    keyByHeader.forEach((key, idx) => {
      if (key && cols[idx] !== undefined) row[key] = cols[idx];
    });
    rows.push(row);
  }
  return { rows, error: null };
}

export default function CustomObjectsView({ industryProfile }: { industryProfile?: IndustryProfile }) {
  const [objects, setObjects] = useState<CustomObject[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [records, setRecords] = useState<ObjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [editingRecord, setEditingRecord] = useState<ObjectRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);

  useEffect(() => {
    apiFetch('/api/objects')
      .then((r) => r.json())
      .then((list: CustomObject[]) => {
        const configured = industryProfile?.domainModel?.objects || [];
        const configuredByKey = new Map(configured.map((object) => [object.key, object]));
        const merged = list.map((object) => {
          const definition = configuredByKey.get(object.key);
          if (!definition) return object;
          return {
            ...object,
            label: definition.pluralLabel || object.label,
            description: definition.description || object.description,
            fields: definition.fields.map((field) => ({
              id: field.key,
              key: field.key,
              label: field.label,
              type: field.type,
              options: field.options || [],
              required: !!field.required,
            })),
          };
        });
        setObjects(merged);
        if (merged.length > 0) setSelectedKey(merged[0].key);
      })
      .catch(() => setObjects([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedObject = objects.find((o) => o.key === selectedKey) || null;

  const loadRecords = () => {
    if (!selectedKey) return;
    setRecordsLoading(true);
    apiFetch(`/api/objects/${selectedKey}/records`)
      .then((r) => r.json())
      .then((list: ObjectRecord[]) => setRecords(list))
      .catch(() => setRecords([]))
      .finally(() => setRecordsLoading(false));
  };

  useEffect(loadRecords, [selectedKey]);

  const visibleRecords = records.filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(term));
  });

  const openCreateModal = () => {
    setEditingRecord(null);
    setFormData({});
    setShowForm(true);
  };

  const openEditModal = (record: ObjectRecord) => {
    setEditingRecord(record);
    setFormData({ ...record });
    setShowForm(true);
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedObject) return;
    if (editingRecord) {
      const res = await apiFetch(`/api/objects/${selectedObject.key}/records/${editingRecord.id}`, {
        method: 'PATCH',
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const updated = await res.json();
        setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setShowForm(false);
        setEditingRecord(null);
        setFormData({});
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update record');
      }
    } else {
      const res = await apiFetch(`/api/objects/${selectedObject.key}/records`, {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const created = await res.json();
        setRecords((prev) => [created, ...prev]);
        setShowForm(false);
        setFormData({});
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create record');
      }
    }
  };

  const handleAdvanceStage = async (record: ObjectRecord) => {
    if (!selectedObject) return;
    const currentIdx = selectedObject.stages.findIndex((s) => s.id === record.stageId);
    const nextStage = selectedObject.stages[currentIdx + 1];
    if (!nextStage) return;
    const res = await apiFetch(`/api/objects/${selectedObject.key}/records/${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ stageKey: nextStage.key })
    });
    if (res.ok) {
      const updated = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  };

  const handleDeleteRecord = async (record: ObjectRecord) => {
    if (!selectedObject) return;
    if (!confirm('Delete this record?')) return;
    const res = await apiFetch(`/api/objects/${selectedObject.key}/records/${record.id}`, { method: 'DELETE' });
    if (res.ok) setRecords((prev) => prev.filter((r) => r.id !== record.id));
  };

  const bulkPreview = selectedObject ? parseCsv(bulkText, selectedObject.fields) : { rows: [], error: null };

  const handleBulkUpload = async () => {
    if (!selectedObject || !bulkPreview.rows.length) return;
    setBulkUploading(true);
    let success = 0, failed = 0;
    const created: ObjectRecord[] = [];
    for (const row of bulkPreview.rows) {
      try {
        const res = await apiFetch(`/api/objects/${selectedObject.key}/records`, { method: 'POST', body: JSON.stringify(row) });
        if (res.ok) { created.push(await res.json()); success++; }
        else failed++;
      } catch {
        failed++;
      }
    }
    setRecords((prev) => [...created, ...prev]);
    setBulkUploading(false);
    setBulkResult({ success, failed });
    if (failed === 0) {
      setBulkText('');
      setTimeout(() => { setShowBulkModal(false); setBulkResult(null); }, 1200);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (objects.length === 0) {
    return (
      <PageShell title="Contacts" subtitle="Custom pipelines for your business, beyond lending." layout="fill">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Boxes className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 max-w-sm">
            No custom objects are configured for this organization. These are seeded automatically based on the industry chosen at signup (Real Estate, Healthcare, Education, E-commerce, Automotive, Field Services).
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={selectedObject?.label || 'Contacts'}
      subtitle={selectedObject?.description || undefined}
      layout="fill"
      onRefresh={loadRecords}
      action={
        <ActionMenu
          tooltipLabel={`New ${selectedObject?.label.replace(/s$/, '') || 'Record'}`}
          items={[
            { key: 'bulk', label: 'Bulk Upload', icon: Upload, onClick: () => { setBulkText(''); setBulkResult(null); setShowBulkModal(true); } },
            { key: 'new', label: `New ${selectedObject?.label.replace(/s$/, '') || 'Record'}`, icon: Plus, onClick: openCreateModal },
          ]}
        />
      }
    >

      {objects.length > 1 && (
        <div className="px-8 flex gap-2 mb-4">
          {objects.map((o) => (
            <button
              key={o.key}
              onClick={() => setSelectedKey(o.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                o.key === selectedKey ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="px-8 mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search…"
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>
        {selectedObject?.hasPipeline && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('board')} className={`p-1.5 rounded-md ${viewMode === 'board' ? 'bg-white shadow-sm' : ''}`}><LayoutGrid className="h-3.5 w-3.5 text-slate-600" /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}><List className="h-3.5 w-3.5 text-slate-600" /></button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-x-auto px-8 pb-8">
        {recordsLoading ? (
          <div className="flex items-center text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading records…</div>
        ) : selectedObject?.hasPipeline && viewMode === 'board' ? (
          <div className="flex gap-4 min-w-max">
            {selectedObject.stages.map((stage) => {
              const stageRecords = visibleRecords.filter((r) => r.stageId === stage.id);
              return (
                <div key={stage.id} className="w-64 shrink-0">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }}></span>
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{stage.label}</span>
                    <span className="text-[10px] text-slate-400">({stageRecords.length})</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2 min-h-[200px]">
                    {stageRecords.map((r) => (
                      <RecordCard
                        key={r.id}
                        object={selectedObject}
                        record={r}
                        onAdvance={selectedObject.stages.findIndex((s) => s.id === r.stageId) < selectedObject.stages.length - 1 ? () => handleAdvanceStage(r) : null}
                        onEdit={() => openEditModal(r)}
                        onDelete={() => handleDeleteRecord(r)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Widget padding="none">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {selectedObject?.fields.slice(0, 5).map((f) => <th key={f.key} className="p-3 px-4">{f.label}</th>)}
                  {selectedObject?.hasPipeline && <th className="p-3 px-4">Stage</th>}
                  <th className="p-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visibleRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    {selectedObject?.fields.slice(0, 5).map((f) => (
                      <td key={f.key} className="p-3 px-4">{String(r[f.key] ?? '—')}</td>
                    ))}
                    {selectedObject?.hasPipeline && (
                      <td className="p-3 px-4">{selectedObject.stages.find((s) => s.id === r.stageId)?.label || '—'}</td>
                    )}
                    <td className="p-3 px-4 text-right">
                      <button onClick={() => openEditModal(r)} className="text-slate-400 hover:text-blue-500 mr-2"><Pencil className="h-3.5 w-3.5 inline" /></button>
                      <button onClick={() => handleDeleteRecord(r)} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5 inline" /></button>
                    </td>
                  </tr>
                ))}
                {visibleRecords.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-slate-400">No records{searchTerm ? ' match your search' : ' yet'}.</td></tr>
                )}
              </tbody>
            </table>
          </Widget>
        )}
      </div>

      {showForm && selectedObject && (
        <Modal
          open
          onClose={() => { setShowForm(false); setEditingRecord(null); }}
          title={`${editingRecord ? 'Edit' : 'New'} ${selectedObject.label.replace(/s$/, '')}`}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSaveRecord} className="space-y-4">
            {selectedObject.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  {field.label} {field.required && <span className="text-rose-500">*</span>}
                </label>
                <FieldInput
                  field={field}
                  value={formData[field.key]}
                  onChange={(v) => setFormData((prev) => ({ ...prev, [field.key]: v }))}
                />
              </div>
            ))}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
              {editingRecord ? 'Save Changes' : 'Create'}
            </button>
          </form>
        </Modal>
      )}

      {showBulkModal && selectedObject && (
        <Modal
          open
          onClose={() => setShowBulkModal(false)}
          title={`Bulk Upload ${selectedObject.label}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Paste comma-separated data with a header row. Column names should match this object's field keys or labels: <span className="font-mono text-slate-700">{selectedObject.fields.map((f) => f.key).join(', ')}</span>
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={8}
                placeholder={`${selectedObject.fields.slice(0, 3).map((f) => f.key).join(',')}\nJohn Doe,+1234567890,...`}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
              />
              {bulkPreview.error && <p className="text-xs text-rose-500">{bulkPreview.error}</p>}
              {bulkPreview.rows.length > 0 && !bulkPreview.error && (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 uppercase">
                        {Object.keys(bulkPreview.rows[0]).map((k) => <th key={k} className="p-2 px-3">{k}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkPreview.rows.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((v, j) => <td key={j} className="p-2 px-3">{v}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-400 px-3 py-1.5 bg-slate-50">{bulkPreview.rows.length} row{bulkPreview.rows.length === 1 ? '' : 's'} ready to upload{bulkPreview.rows.length > 10 ? ' (showing first 10)' : ''}.</p>
                </div>
              )}
              {bulkResult && (
                <p className={`text-xs font-semibold ${bulkResult.failed ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {bulkResult.success} uploaded{bulkResult.failed ? `, ${bulkResult.failed} failed` : ''}.
                </p>
              )}
              <button
                onClick={handleBulkUpload}
                disabled={bulkUploading || !bulkPreview.rows.length || !!bulkPreview.error}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                {bulkUploading ? 'Uploading…' : `Upload ${bulkPreview.rows.length || ''} Record${bulkPreview.rows.length === 1 ? '' : 's'}`}
              </button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
