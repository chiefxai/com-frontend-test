import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  Plus,
  Upload,
  Download,
  Edit,
  Trash2,
  FileSpreadsheet,
  Database,
  Check,
  X,
  AlertCircle,
  Phone,
  Mail,
  CheckCircle2,
  FolderOpen,
  Settings2
} from 'lucide-react';
import { Lead, CallLog, ContactGroup } from '../types';
import { apiFetch, getPlayableRecordingUrl } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { useRefresh } from '../lib/RefreshContext';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Modal from './ui/Modal';
import FilterBar from './ui/FilterBar';
import ActionMenu from './ui/ActionMenu';
import DataTable, { Column } from './ui/DataTable';
import { newClientId } from '../lib/ids';
import Badge from './ui/Badge';
import { usePipelineStages, stageLabel } from '../lib/pipelineStages';


interface ContactDirectoryViewProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  industry?: string;
  callLogs?: CallLog[];
  // Non-lending orgs store contacts as Industry Objects records, not rows
  // in the lending `leads` table — this is that object type's key, needed
  // to hit the right delete/update route (see App.tsx's own primaryObject
  // state). Undefined for lending orgs.
  primaryObjectKey?: string;
  primaryObjectFields?: { id: string; key: string; label: string; type: string; required?: boolean }[];
}

const NO_GROUP = '__no_group__';

export default function ContactDirectoryView({
  leads,
  setLeads,
  industry,
  callLogs = [],
  primaryObjectKey,
  primaryObjectFields = []
}: ContactDirectoryViewProps) {
  // Contact Directory is a lightweight address book (name/phone/email +
  // groups) shared across every industry — loan-specific details
  // (amount requested, employer, income, credit score/DTI) belong to
  // Leads/Pipeline, not here, so this view never displays or collects them.
  const { stages: pipelineStages } = usePipelineStages();
  // Navigation & filtering state
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [groupFilter, setGroupFilter] = useState('All');
  const hasActiveFilters = Boolean(searchTerm.trim()) || sourceFilter !== 'All' || statusFilter !== 'All' || groupFilter !== 'All';
  const clearFilters = () => { setSearchTerm(''); setSourceFilter('All'); setStatusFilter('All'); setGroupFilter('All'); };

  // Groups
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState('');
  const [formGroupIds, setFormGroupIds] = useState<string[]>([]);

  const loadGroups = () => {
    apiFetch('/api/contact-groups')
      .then(r => r.json())
      .then(data => setContactGroups(Array.isArray(data) ? data : []))
      .catch(() => setContactGroups([]));
  };

  useEffect(loadGroups, []);

  const refreshLeads = useRefresh();
  const handlePageRefresh = () => { loadGroups(); refreshLeads?.(); };

  const groupNameById = (id: string) => contactGroups.find(g => g.id === id)?.name || 'Unknown Group';

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const res = await apiFetch('/api/contact-groups', { method: 'POST', body: JSON.stringify({ name }) });
      if (!res.ok) { alert((await res.json()).error || 'Failed to create group'); return; }
      const group = await res.json();
      setContactGroups(prev => [...prev, group]);
      setNewGroupName('');
    } catch {
      alert('Network error — check your connection.');
    }
  };

  const handleRenameGroup = async (id: string) => {
    const name = renameGroupValue.trim();
    if (!name) return;
    try {
      const res = await apiFetch(`/api/contact-groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      if (!res.ok) { alert((await res.json()).error || 'Failed to rename group'); return; }
      const updated = await res.json();
      setContactGroups(prev => prev.map(g => g.id === id ? updated : g));
      setRenamingGroupId(null);
      setRenameGroupValue('');
    } catch {
      alert('Network error — check your connection.');
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"? Contacts in this group become ungrouped — they are not deleted.`)) return;
    try {
      const res = await apiFetch(`/api/contact-groups/${id}`, { method: 'DELETE' });
      if (!res.ok) { alert((await res.json()).error || 'Failed to delete group'); return; }
      setContactGroups(prev => prev.filter(g => g.id !== id));
      setLeads(prev => prev.map(l => (l.groupIds || []).includes(id)
        ? { ...l, groupIds: (l.groupIds || []).filter(g => g !== id) }
        : l
      ));
      if (groupFilter === id) setGroupFilter('All');
    } catch {
      alert('Network error — check your connection.');
    }
  };

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Single Contact Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGender, setFormGender] = useState('');
  const [formSource, setFormSource] = useState('Manual Entry');
  const [formNotes, setFormNotes] = useState('');

  // Bulk Upload State
  const [pastedData, setPastedData] = useState('');
  const [parsedPreview, setParsedPreview] = useState<Partial<Lead>[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter contacts
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.financialInfo?.employer || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSource = sourceFilter === 'All' || lead.source === sourceFilter;
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    const matchesGroup = groupFilter === 'All'
      || (groupFilter === NO_GROUP ? (lead.groupIds || []).length === 0 : (lead.groupIds || []).includes(groupFilter));
    return matchesSearch && matchesSource && matchesStatus && matchesGroup;
  });

  // Unique sources for filter dropdown
  const uniqueSources = ['All', ...Array.from(new Set(leads.map((l) => l.source)))];

  const totalContacts = leads.length;

  // Handle open individual add modal
  const openAddModal = () => {
    setEditingLead(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormGender('');
    setFormSource('Manual Entry');
    setFormNotes('Registered individually.');
    setFormGroupIds([]);
    setIsAddModalOpen(true);
  };

  // Handle open edit modal
  const openEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setFormName(lead.name);
    setFormPhone(lead.phone);
    setFormEmail(lead.email);
    setFormGender(lead.gender || '');
    setFormSource(lead.source);
    setFormNotes(lead.notes || '');
    setFormGroupIds(lead.groupIds || []);
    setIsAddModalOpen(true);
  };

  const toggleFormGroup = (groupId: string) => {
    setFormGroupIds(prev => prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]);
  };

  // Submit single/edited lead. setLeads keeps the optimistic local update
  // (and still feeds App.tsx's own leads-sync effect for the create case,
  // or as a backstop), but an edit also fires its PATCH here directly
  // instead of waiting on that effect, so the save is immediate and not
  // silently dependent on the debounced diff ever detecting the change.
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      alert('Please fill out required fields: Name and Phone.');
      return;
    }

    if (editingLead) {
      // Edit mode
      let updatedLead: Lead | null = null;
      const updatedLeads = leads.map((l) => {
        if (l.id === editingLead.id) {
          updatedLead = {
            ...l,
            name: formName,
            phone: formPhone,
            email: formEmail.trim(),
            gender: formGender.trim() || undefined,
            source: formSource,
            notes: formNotes,
            groupIds: formGroupIds,
          };
          return updatedLead;
        }
        return l;
      });
      setLeads(updatedLeads);
      // Non-lending orgs (primaryObjectKey set) are Industry Objects
      // records with per-pack field names — App.tsx's own leads-sync
      // effect already knows how to map a Lead back into that shape
      // (leadToRecordPatch) and picks this edit up from the setLeads
      // above, so only the lending case — a plain `leads` table row —
      // is safe to PATCH directly here with the raw lead body.
      if (updatedLead && !primaryObjectKey) {
        apiFetch(`/api/leads/${editingLead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedLead)
        }).catch((err) => console.error('Error saving contact:', err));
      }
    } else {
      // Create the contact on the backend BEFORE adding it to local state.
      // Campaign assignment uses leadIds as durable database ids; a
      // client-generated L-* id could race the background sync and produce a
      // dialer task pointing at a contact that does not exist server-side.
      const draftLead: Lead = {
        id: '',
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        gender: formGender.trim() || undefined,
        amountRequested: 0,
        score: 0,
        source: formSource,
        status: 'New',
        tags: ['Unassigned'],
        createdAt: new Date().toISOString(),
        notes: formNotes,
        groupIds: formGroupIds,
      };

      try {
        const url = primaryObjectKey
          ? `/api/objects/${primaryObjectKey}/records`
          : '/api/leads';
        const body = primaryObjectKey
          ? leadToRecordCreate(draftLead, primaryObjectFields)
          : draftLead;
        const res = await apiFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Create failed (${res.status})`);
        }
        const created = await res.json();
        const newLead: Lead = primaryObjectKey
          ? { ...draftLead, id: created.id }
          : created;
        setLeads([newLead, ...leads]);
      } catch (err: any) {
        console.error('Error creating contact:', err);
        alert(`Failed to create contact: ${err.message || 'Network error'}`);
        return;
      }
    }
    setIsAddModalOpen(false);
  };

  // Delete lead. The App.tsx-level leads-sync effect only ever diffs
  // leads that are still PRESENT in the array (create/update) — it never
  // notices one going missing, so a removed contact was never actually
  // deleted server-side. Call the real delete route directly, with an
  // optimistic local removal rolled back if the request fails.
  const handleDeleteContact = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name} from your contact directory?`)) return;
    const previous = leads;
    setLeads(leads.filter((l) => l.id !== id));
    try {
      const url = primaryObjectKey
        ? `/api/objects/${primaryObjectKey}/records/${id}`
        : `/api/leads/${id}`;
      const res = await apiFetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    } catch (err) {
      console.error('Error deleting contact:', err);
      alert('Failed to delete contact — restoring.');
      setLeads(previous);
    }
  };

  // Helper: Parse raw CSV text
  const parseCSVText = (text: string) => {
    setParsingError(null);
    if (!text.trim()) {
      setParsedPreview([]);
      return;
    }

    try {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) {
        setParsingError('CSV must include at least a header row and one data row.');
        setParsedPreview([]);
        return;
      }

      const headers = lines[0].toLowerCase().split(',').map((h) => h.trim());
      
      // Basic validation of required headers
      const hasName = headers.includes('name');
      const hasPhone = headers.includes('phone');
      if (!hasName || !hasPhone) {
        setParsingError('CSV columns must include: "name" and "phone". Optional keys: email, gender, amount, employer, income, credit, dti');
        setParsedPreview([]);
        return;
      }

      const previewList: Partial<Lead>[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        // Simple comma split (doesn't handle commas inside quotes for simplicity but is good for standard inputs)
        const cols = lines[i].split(',').map((c) => c.trim());
        const rowObj: any = {};
        
        headers.forEach((header, index) => {
          if (cols[index] !== undefined) {
            rowObj[header] = cols[index];
          }
        });

        previewList.push({
          id: `TEMP-${i}`,
          name: rowObj.name || `Lead #${i}`,
          phone: rowObj.phone || 'N/A',
          email: rowObj.email || '',
          gender: rowObj.gender || '',
          amountRequested: parseFloat(rowObj.amount) || 20000,
          source: 'Bulk Import',
          status: 'New',
          tags: ['Bulk Uploaded'],
          createdAt: new Date().toISOString(),
          notes: 'Bulk uploaded into CRM database.',
          financialInfo: {
            employer: rowObj.employer || 'Unspecified',
            monthlyIncome: parseFloat(rowObj.income) || 5000,
            creditScore: parseInt(rowObj.credit) || 680,
            debtToIncome: parseFloat(rowObj.dti) || 0.3
          }
        });
      }

      setParsedPreview(previewList);
    } catch (err: any) {
      setParsingError(`Parsing error: ${err.message}`);
      setParsedPreview([]);
    }
  };

  // CSV File reader
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setPastedData(text);
      parseCSVText(text);
    };
    reader.readAsText(file);
  };

  // Confirm Bulk Upload
  const handleConfirmBulkUpload = async () => {
    if (parsedPreview.length === 0) {
      alert('No valid contacts to import.');
      return;
    }

    const finalLeadsToImport: Lead[] = parsedPreview.map((item) => {
      return {
        id: newClientId('L'),
        name: item.name || 'Anonymous Contact',
        phone: item.phone || '+1 (555) 000-0000',
        email: item.email || '',
        gender: item.gender || undefined,
        amountRequested: item.amountRequested || 25000,
        score: 0,
        source: 'CSV Bulk Upload',
        status: 'New',
        tags: ['Bulk Uploaded'],
        createdAt: new Date().toISOString(),
        notes: item.notes || 'Bulk uploaded via CSV parser.',
        groupIds: bulkGroupId ? [bulkGroupId] : [],
        financialInfo: {
          employer: item.financialInfo?.employer || 'Unspecified',
          monthlyIncome: item.financialInfo?.monthlyIncome || 5000,
          creditScore: item.financialInfo?.creditScore || 700,
          debtToIncome: item.financialInfo?.debtToIncome || 0.3
        }
      };
    });

    try {
      // Persist first and only expose contacts with durable backend ids to
      // campaign assignment. This removes the same L-* sync race as single
      // contact creation.
      const createdLeads = await Promise.all(finalLeadsToImport.map(async (lead) => {
        const url = primaryObjectKey ? `/api/objects/${primaryObjectKey}/records` : '/api/leads';
        const body = primaryObjectKey ? leadToRecordCreate(lead, primaryObjectFields) : lead;
        const res = await apiFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Create failed (${res.status})`);
        }
        const created = await res.json();
        return primaryObjectKey ? { ...lead, id: created.id } : created;
      }));
      setLeads([...createdLeads, ...leads]);
      setIsBulkModalOpen(false);
      setPastedData('');
      setParsedPreview([]);
      setBulkGroupId('');
      alert(`Successfully created ${createdLeads.length} contacts. They are now available for campaign assignment.`);
    } catch (err: any) {
      console.error('Bulk contact creation failed:', err);
      alert(`Bulk upload failed: ${err.message || 'Network error'}`);
    }
  };

  return (
    <PageShell
      title="Unified Contact Directory"
      subtitle="Build, edit, and bulk upload your client repository. These contacts automatically stream into the outbound Task Assignment channels."
      onRefresh={handlePageRefresh}
      action={
        <ActionMenu
          tooltipLabel="Add Contact"
          items={[
            { key: 'groups', label: 'Manage Groups', icon: FolderOpen, onClick: () => setIsGroupsModalOpen(true) },
            { key: 'bulk', label: 'Bulk Upload Contacts', icon: Upload, onClick: () => setIsBulkModalOpen(true) },
            { key: 'add', label: 'Add Contact', icon: Plus, onClick: openAddModal },
          ]}
        />
      }
      layout="fill"
    >
      <div className="flex-1 flex flex-col overflow-hidden px-8 pb-8 pt-6">
        <Widget className="flex-1" showHeader={false} padding="none">
          <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <FilterBar
          search={{ value: searchTerm, onChange: setSearchTerm, placeholder: 'Search contacts by name, email, phone number, employer…' }}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
          resultCount={{ filtered: filteredLeads.length, total: leads.length, label: 'contacts' }}
          actions={
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 whitespace-nowrap">
              <Users className="h-3.5 w-3.5 text-blue-600" />
              {filteredLeads.length} Contacts
            </div>
          }
          selects={[
            {
              key: 'source',
              label: 'Source',
              value: sourceFilter,
              onChange: setSourceFilter,
              options: uniqueSources.map((src) => ({ label: src, value: src })),
            },
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { label: 'All CRM Statuses', value: 'All' },
                { label: 'New', value: 'New' },
                { label: 'In Progress', value: 'In Progress' },
                { label: 'Qualified', value: 'Qualified' },
                { label: 'Unqualified', value: 'Unqualified' },
              ],
            },
            {
              key: 'group',
              label: 'Group',
              value: groupFilter,
              onChange: setGroupFilter,
              options: [
                { label: 'All Groups', value: 'All' },
                { label: 'No Group', value: NO_GROUP },
                ...contactGroups.map((g) => ({ label: g.name, value: g.id })),
              ],
            },
          ]}
        />
          </div>

        {(() => {
          const columns: Column<Lead>[] = [
            {
              key: 'name',
              header: 'Name / Details',
              cell: (lead) => (
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-700 font-bold flex items-center justify-center uppercase">
                    {lead.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{lead.name}</p>
                  </div>
                </div>
              ),
            },
            { key: 'phone', header: 'Phone Number', cell: (lead) => <span className="font-mono text-slate-600">{formatPhone(lead.phone)}</span> },
            { key: 'email', header: 'Email Address', cell: (lead) => <span className="text-slate-500">{lead.email}</span> },
            {
              key: 'source',
              header: 'Source',
              cell: (lead) => (
                <span className="px-2 py-0.5 text-[9px] bg-slate-100 border border-slate-200 rounded text-slate-500 font-medium">
                  {lead.source}
                </span>
              ),
            },
            {
              key: 'groups',
              header: 'Groups',
              cell: (lead) => (lead.groupIds || []).length === 0 ? (
                <span className="text-[10px] text-slate-300 italic">No group</span>
              ) : (
                <div className="flex flex-wrap gap-1 max-w-[160px]">
                  {(lead.groupIds || []).map((gid) => (
                    <span key={gid} className="px-2 py-0.5 text-[9px] bg-indigo-50 border border-indigo-200 rounded text-indigo-600 font-medium">
                      {groupNameById(gid)}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              key: 'stage',
              header: 'Stage',
              cell: (lead) => {
                const STAGE_COLOR: Record<string, 'blue' | 'amber' | 'green' | 'slate' | 'indigo'> = {
                  contact: 'slate', campaign: 'blue', lead: 'indigo', opportunity: 'amber', client: 'green',
                };
                return <Badge color={STAGE_COLOR[lead.pipelineStage || 'contact']}>{stageLabel(pipelineStages, lead.pipelineStage)}</Badge>;
              },
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              cell: (lead) => (
                <div className="flex items-center justify-end space-x-1">
                  <button
                    onClick={() => openEditModal(lead)}
                    title="Edit Contact"
                    className="p-1.5 hover:bg-slate-100 hover:text-blue-600 rounded-lg text-slate-400 transition-all cursor-pointer"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteContact(lead.id, lead.name)}
                    title="Delete Contact"
                    className="p-1.5 hover:bg-slate-100 hover:text-rose-600 rounded-lg text-slate-400 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ];
          return (
            <DataTable
              bare
              resizable
              paginated
              columns={columns}
              rows={filteredLeads}
              rowKey={(lead) => lead.id}
              emptyMessage='No contacts found in the directory database matching search criteria. Click "Add Contact" or "Bulk Upload" to populate.'
            />
          );
        })()}
      </Widget>
      </div>

      {/* MODAL: Add / Edit Single Contact */}
      {isAddModalOpen && (
        <Modal
          open
          onClose={() => setIsAddModalOpen(false)}
          title={editingLead ? `Modify Contact: ${editingLead.name}` : 'Originate New Contact Entry'}
          maxWidth="max-w-xl"
        >
            {editingLead && (() => {
              const contactCalls = callLogs
                .filter((log) => log.leadId === editingLead.id)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              if (contactCalls.length === 0) return null;
              return (
                <div className="px-6 pt-4 pb-2 border-b border-slate-100 bg-slate-50/50">
                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                    Call History ({contactCalls.length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {contactCalls.map((log) => (
                      <div key={log.id} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="text-[10px] font-mono text-slate-400 uppercase">{log.direction || '—'}</span>
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                          <span className="text-slate-400">· {log.duration}s</span>
                          <span className={`text-[10px] font-bold ${log.sentiment === 'Positive' ? 'text-emerald-600' : log.sentiment === 'Negative' ? 'text-rose-600' : 'text-slate-500'}`}>
                            {log.sentiment}
                          </span>
                        </div>
                        {log.recordingUrl && (
                          <a
                            href={getPlayableRecordingUrl(log.id, log.recordingUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Play
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <form onSubmit={handleSaveContact} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Contact Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="e.g. Gavin Belson"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="+1 (555) 012-3456"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email Address <span className="font-normal text-slate-400">(Optional)</span></label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                  placeholder="gavin@hooli.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Gender <span className="font-normal text-slate-400">(Optional)</span></label>
                <select
                  value={formGender}
                  onChange={(e) => setFormGender(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="">Prefer not to say</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
                  Group{formGroupIds.length > 0 ? ` (${formGroupIds.length} selected)` : ' — leave unchecked for no group'}
                </label>
                {contactGroups.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    No groups yet. Click "Manage Groups" to create one.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {contactGroups.map((g) => {
                      const active = formGroupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleFormGroup(g.id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                            active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                          }`}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  {editingLead ? 'Update Details' : 'Register Contact'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* MODAL: Bulk Upload Contacts */}
      {isBulkModalOpen && (
        <Modal
          open
          onClose={() => { setIsBulkModalOpen(false); setBulkGroupId(''); }}
          title={<div className="flex items-center space-x-2"><Database className="h-5 w-5 text-blue-600" /><span>Bulk Upload Contacts Database</span></div>}
          maxWidth="max-w-3xl"
        >
            <div className="space-y-6">
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-8 text-center transition-all cursor-pointer bg-slate-50/50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                  <p className="text-xs font-semibold text-slate-700">Select .csv file to upload</p>
                  <p className="text-[10px] text-slate-400 mt-1">Columns: name, phone, email (optional), gender (optional), amount, employer, income, credit, dti</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
                {pastedData && (
                  <div className="text-[10px] font-mono text-slate-500 bg-slate-50 p-2 border border-slate-200 rounded-xl truncate">
                    Loaded: {pastedData.split('\n').length} lines
                  </div>
                )}
              </div>

              {/* Assign all uploaded contacts to a group */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Add to Group (optional)</label>
                <select
                  value={bulkGroupId}
                  onChange={(e) => setBulkGroupId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="">No group</option>
                  {contactGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {contactGroups.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic mt-1">No groups yet — create one via "Manage Groups".</p>
                )}
              </div>

              {/* Parsing Feedback Error / Live Preview */}
              {parsingError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start space-x-3 text-rose-700">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
                  <div className="text-xs">
                    <p className="font-bold">Parsing Error Detected</p>
                    <p className="mt-1">{parsingError}</p>
                  </div>
                </div>
              )}

              {parsedPreview.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-1 text-emerald-500" /> Live Parsing Preview ({parsedPreview.length} contacts parsed successfully)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Row structure verified</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/30">
                    {parsedPreview.map((item, index) => (
                      <div key={index} className="p-3 text-xs flex justify-between items-center">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-800">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.phone} • {item.email}</p>
                        </div>
                        <div className="text-right text-[10px] text-slate-500">
                          <p className="font-bold text-slate-700">${item.amountRequested?.toLocaleString()}</p>
                          <p>{item.financialInfo?.employer || 'Unspecified'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
              <span className="text-xs text-slate-500 italic">
                * Uploaded contacts will be appended to your Outbound CRM Dialer targets list.
              </span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => { setIsBulkModalOpen(false); setBulkGroupId(''); }}
                  className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkUpload}
                  disabled={parsedPreview.length === 0}
                  className={`px-5 py-2 font-semibold text-xs rounded-xl cursor-pointer text-white flex items-center ${
                    parsedPreview.length > 0 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Database className="h-4 w-4 mr-1.5" />
                  Save {parsedPreview.length > 0 ? parsedPreview.length : ''} Contacts
                </button>
              </div>
            </div>
        </Modal>
      )}

      {/* MODAL: Manage Groups */}
      {isGroupsModalOpen && (
        <Modal
          open
          onClose={() => { setIsGroupsModalOpen(false); setRenamingGroupId(null); setRenameGroupValue(''); }}
          title={<div className="flex items-center space-x-2"><Settings2 className="h-5 w-5 text-blue-600" /><span>Manage Contact Groups</span></div>}
          maxWidth="max-w-lg"
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); }}
                placeholder="New group name, e.g. VIP Customers"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Create
              </button>
            </div>

            {contactGroups.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No groups yet — create one above.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {contactGroups.map((g) => {
                  const memberCount = leads.filter(l => (l.groupIds || []).includes(g.id)).length;
                  return (
                    <div key={g.id} className="flex items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      {renamingGroupId === g.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={renameGroupValue}
                          onChange={(e) => setRenameGroupValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameGroup(g.id); if (e.key === 'Escape') setRenamingGroupId(null); }}
                          className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
                        />
                      ) : (
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{g.name}</p>
                          <p className="text-[10px] text-slate-400">{memberCount} contact{memberCount === 1 ? '' : 's'}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        {renamingGroupId === g.id ? (
                          <button
                            type="button"
                            onClick={() => handleRenameGroup(g.id)}
                            className="p-1.5 hover:bg-emerald-100 hover:text-emerald-600 rounded-lg text-slate-400 transition-all cursor-pointer"
                            title="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setRenamingGroupId(g.id); setRenameGroupValue(g.name); }}
                            className="p-1.5 hover:bg-slate-200 hover:text-blue-600 rounded-lg text-slate-400 transition-all cursor-pointer"
                            title="Rename"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(g.id, g.name)}
                          className="p-1.5 hover:bg-rose-100 hover:text-rose-600 rounded-lg text-slate-400 transition-all cursor-pointer"
                          title="Delete group"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
