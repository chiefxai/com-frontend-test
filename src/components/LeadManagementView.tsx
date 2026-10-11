import React, { useState, useRef } from 'react';
import {
  Plus,
  Upload,
  User,
  Phone,
  Mail,
  DollarSign,
  Tag,
  AlertCircle,
  FileText,
  Calendar,
  Play,
  Briefcase,
  Layers,
  Sparkles,
  ChevronRight,
  Clock,
  ThumbsUp,
  X,
  Download
} from 'lucide-react';
import { downloadCSV } from '../shared/lib/exporters';
import { Lead, CallLog, TeamMember } from '../types';
import Pagination from '../shared/components/Pagination';
import { usePagination } from '../shared/hooks/usePagination';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import SlideOver from './ui/SlideOver';
import Modal from './ui/Modal';
import FilterBar from './ui/FilterBar';
import Badge from './ui/Badge';
import { formatPhone } from '../lib/phone';
import { newClientId } from '../lib/ids';
import { apiFetch } from '../lib/api';

interface LeadManagementViewProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  callLogs: CallLog[];
  teamMembers: TeamMember[];
}

export default function LeadManagementView({
  leads,
  setLeads,
  callLogs,
  teamMembers
}: LeadManagementViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScoringLoading, setIsScoringLoading] = useState(false);
  const [selectedCallLog, setSelectedCallLog] = useState<CallLog | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // New Lead Form state
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadAmount, setNewLeadAmount] = useState('20000');
  const [newLeadSource, setNewLeadSource] = useState('Website Form');
  const [newLeadEmployer, setNewLeadEmployer] = useState('');
  const [newLeadIncome, setNewLeadIncome] = useState('5000');
  const [newLeadCredit, setNewLeadCredit] = useState('700');
  const [newLeadDti, setNewLeadDti] = useState('0.30');

  // Filtered Leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    const matchesSource = sourceFilter === 'All' || lead.source === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  });
  const leadPagination = usePagination(filteredLeads, 20);

  // Handle lead creation
  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName || !newLeadPhone || !newLeadEmail) return;

    const added: Lead = {
      id: newClientId('L'),
      name: newLeadName,
      phone: newLeadPhone,
      email: newLeadEmail,
      amountRequested: parseFloat(newLeadAmount),
      score: 0, // initially unscored
      source: newLeadSource,
      status: 'New',
      tags: ['Unassigned'],
      createdAt: new Date().toISOString(),
      notes: 'Manually added to CRM.',
      financialInfo: {
        employer: newLeadEmployer || 'Self-Employed',
        monthlyIncome: parseFloat(newLeadIncome),
        creditScore: parseInt(newLeadCredit),
        debtToIncome: parseFloat(newLeadDti)
      }
    };

    setLeads([added, ...leads]);
    setIsAddModalOpen(false);
    // Reset form
    setNewLeadName('');
    setNewLeadPhone('');
    setNewLeadEmail('');
    setNewLeadEmployer('');
  };

  // Real CSV batch import — parses whatever file the user actually
  // selects (same header/column shape as ContactDirectoryView's
  // parser: name, phone, email required; amount, employer, income,
  // credit, dti optional) instead of always injecting fake sample leads.
  const handleCSVImportClick = () => {
    csvFileInputRef.current?.click();
  };

  const parseCSVAndImport = (text: string) => {
    if (!text.trim()) return;

    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) {
      alert('CSV must include at least a header row and one data row.');
      return;
    }

    const headers = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const hasName = headers.includes('name');
    const hasPhone = headers.includes('phone');
    const hasEmail = headers.includes('email');

    if (!hasName || !hasPhone || !hasEmail) {
      alert('CSV columns must include: "name", "phone", and "email". Other optional keys: amount, employer, income, credit, dti');
      return;
    }

    const importedLeads: Lead[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(',').map((c) => c.trim());
      const rowObj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (cols[idx] !== undefined) rowObj[header] = cols[idx];
      });

      importedLeads.push({
        id: newClientId('L'),
        name: rowObj.name || `Lead #${i}`,
        phone: rowObj.phone || 'N/A',
        email: rowObj.email || 'N/A',
        amountRequested: parseFloat(rowObj.amount) || 20000,
        score: 0,
        source: 'CSV Upload',
        status: 'New',
        tags: ['Bulk Uploaded'],
        createdAt: new Date().toISOString(),
        notes: 'Imported via CSV batch upload.',
        financialInfo: {
          employer: rowObj.employer || 'Unspecified',
          monthlyIncome: parseFloat(rowObj.income) || 5000,
          creditScore: parseInt(rowObj.credit) || 680,
          debtToIncome: parseFloat(rowObj.dti) || 0.3
        }
      });
    }

    if (importedLeads.length === 0) {
      alert('No valid rows found in the CSV.');
      return;
    }

    setLeads([...importedLeads, ...leads]);
    alert(`Imported ${importedLeads.length} lead${importedLeads.length === 1 ? '' : 's'}: ${importedLeads.map((l) => l.name).join(', ')}.`);
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseCSVAndImport(text);
    };
    reader.readAsText(file);
    // Allow re-selecting the same file name to re-trigger onChange next time.
    e.target.value = '';
  };

  // Run dynamic Gemini AI Lead Scorer
  const triggerAILeadScoring = async (lead: Lead) => {
    setIsScoringLoading(true);
    try {
      const res = await apiFetch('/api/gemini/score-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Lead scoring failed (${res.status}).`);
      if (data.success) {
        // Update state
        const updatedLeads = leads.map((l) => {
          if (l.id === lead.id) {
            return {
              ...l,
              score: data.score,
              tags: data.tags,
              notes: `${data.decision}\n\nNotes: ${l.notes}`,
              scoreDegraded: !!data.degraded
            };
          }
          return l;
        });
        setLeads(updatedLeads);
        // Sync open lead modal
        setSelectedLead({
          ...lead,
          score: data.score,
          tags: data.tags,
          notes: `${data.decision}\n\nNotes: ${lead.notes}`,
          scoreDegraded: !!data.degraded
        });
      }
    } catch (err) {
      console.error(err);
      alert(`AI lead scoring is unavailable. No score was changed. ${err instanceof Error ? err.message : ''}`);
    } finally {
      setIsScoringLoading(false);
    }
  };

  // Lead Assign helper
  const handleAssignLead = (leadId: string, agentId: string) => {
    const agent = teamMembers.find((t) => t.id === agentId);
    if (!agent) return;

    const updated = leads.map((l) => {
      if (l.id === leadId) {
        return {
          ...l,
          tags: [...l.tags.filter((t) => t !== 'Unassigned'), `Assigned: ${agent.name}`]
        };
      }
      return l;
    });
    setLeads(updated);
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({
        ...selectedLead,
        tags: [...selectedLead.tags.filter((t) => t !== 'Unassigned'), `Assigned: ${agent.name}`]
      });
    }
  };

  const selectedLeadCallLogs = callLogs.filter((c) => c.leadId === selectedLead?.id);

  return (
    <PageShell
      title="Lead CRM"
      subtitle="Track, score, and manage every prospect through your sales pipeline."
      action={
        <div className="flex items-center space-x-3 shrink-0">
          <input
            type="file"
            accept=".csv,text/csv"
            ref={csvFileInputRef}
            onChange={handleCSVFileChange}
            className="hidden"
          />
          <button
            onClick={() => downloadCSV('leads.csv',
              ['Name', 'Phone', 'Email', 'Status', 'Source', 'Employer', 'Loan Amount', 'Income'],
              filteredLeads.map(l => [l.name, l.phone, l.email, l.status, l.source, l.financialInfo?.employer ?? '', l.amountRequested, l.financialInfo?.monthlyIncome ?? ''])
            )}
            className="flex items-center px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={handleCSVImportClick}
            className="flex items-center px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Upload className="h-4 w-4 mr-2" />
            Batch Import (CSV)
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-600/10 hover:shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Originate Lead
          </button>
        </div>
      }
    >
      {/* Searching & Filters */}
      <Widget showHeader={false} padding="md" colSpan={12}>
        <FilterBar
          search={{ value: searchTerm, onChange: setSearchTerm, placeholder: 'Search leads by name, email, phone…' }}
          selects={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { label: 'All Statuses', value: 'All' },
                { label: 'New', value: 'New' },
                { label: 'In Progress', value: 'In Progress' },
                { label: 'Qualified', value: 'Qualified' },
                { label: 'Unqualified', value: 'Unqualified' },
                { label: 'Converted', value: 'Converted' },
              ],
            },
            {
              key: 'source',
              label: 'Channel',
              value: sourceFilter,
              onChange: setSourceFilter,
              options: [
                { label: 'All Channels', value: 'All' },
                { label: 'Website Form', value: 'Website Form' },
                { label: 'Facebook Ads', value: 'Facebook Ads' },
                { label: 'Direct Mail', value: 'Direct Mail' },
                { label: 'Google Search', value: 'Google Search' },
                { label: 'Partner Referral', value: 'Partner Referral' },
                { label: 'CSV Upload', value: 'CSV Upload' },
              ],
            },
          ]}
        />
      </Widget>

      {/* Main Table Grid */}
      <Widget title="All Leads" icon={User} accent="#2563eb" padding="none" scrollable colSpan={12}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-surface)' }}>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-4 px-6">Lead Profile</th>
                <th className="py-4 px-6">Requested Amt</th>
                <th className="py-4 px-6">Inbound Origin</th>
                <th className="py-4 px-6">AI Underwriting</th>
                <th className="py-4 px-6">CRM Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {leadPagination.paginatedItems.map((lead) => {
                const isUnassigned = lead.tags.includes('Unassigned');
                return (
                  <tr
                    key={lead.id}
                    id={`lead-row-${lead.id}`}
                    className="hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                          {lead.name.split(' ').map((n) => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{lead.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-semibold text-slate-800">
                      ${lead.amountRequested.toLocaleString()}
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-xs text-slate-500 font-medium">{lead.source}</span>
                    </td>
                    <td className="py-4 px-6">
                      {lead.score > 0 ? (
                        <div className="flex items-center space-x-2">
                          <div
                            className={`h-2.5 w-2.5 rounded-full ${
                              lead.score >= 80
                                ? 'bg-emerald-500'
                                : lead.score >= 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                          ></div>
                          <span className="font-bold text-slate-800">{lead.score} / 100</span>
                          {lead.scoreDegraded && (
                            <span title="AI scoring was unavailable — this is an estimate from an offline fallback algorithm" className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              Estimated
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          Unscored
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          lead.status === 'Qualified'
                            ? 'bg-emerald-700 text-emerald-50'
                            : lead.status === 'In Progress'
                            ? 'bg-indigo-700 text-indigo-50'
                            : lead.status === 'New'
                            ? 'bg-amber-600 text-amber-50'
                            : 'bg-rose-700 text-rose-50'
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        {isUnassigned ? (
                          <select
                            onChange={(e) => handleAssignLead(lead.id, e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-xs text-slate-600 rounded px-2 py-1 focus:outline-none"
                            defaultValue=""
                          >
                            <option value="" disabled>Assign...</option>
                            {teamMembers.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50/50 px-2 py-1 rounded border border-indigo-100">
                            {lead.tags.find((t) => t.startsWith('Assigned:')) || 'Assigned'}
                          </span>
                        )}
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                        >
                          <ChevronRight className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            page={leadPagination.page}
            totalPages={leadPagination.totalPages}
            totalItems={leadPagination.totalItems}
            pageSize={leadPagination.pageSize}
            onPageChange={leadPagination.setPage}
          />
        </div>
      </Widget>

      {/* Slide-over Drawer for Lead Details */}
      {selectedLead && (
        <SlideOver
          open
          onClose={() => { setSelectedLead(null); setSelectedCallLog(null); }}
          title={
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold font-display shrink-0">
                {selectedLead.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedLead.name}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Lead ID: {selectedLead.id}</div>
              </div>
            </div>
          }
        >
            <div className="space-y-8">
              {/* Score Underwriter Panel */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-2xl border border-indigo-900 flex items-center justify-between">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider flex items-center">
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Automated Underwriting
                  </span>
                  <h4 className="text-md font-semibold font-display text-indigo-100">Credit Qualification Matrix</h4>
                  <p className="text-xs text-slate-400">Evaluate risk metrics dynamically utilizing Gemini analysis proxy.</p>
                </div>
                <div className="flex flex-col items-center shrink-0">
                  {selectedLead.score > 0 ? (
                    <div className="text-center">
                      <span className="text-3xl font-extrabold font-display text-emerald-400">{selectedLead.score}</span>
                      <span className="text-xs text-slate-400">/ 100</span>
                      {selectedLead.scoreDegraded && (
                        <div title="AI scoring was unavailable — this is an estimate from an offline fallback algorithm" className="text-[10px] font-semibold text-amber-400 mt-1">
                          Estimated (AI unavailable)
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => triggerAILeadScoring(selectedLead)}
                      disabled={isScoringLoading}
                      className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all"
                    >
                      {isScoringLoading ? 'Evaluating...' : 'Run AI Underwriting'}
                    </button>
                  )}
                </div>
              </div>

              {/* Profiles & Financial Data */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Profile Cards</h4>
                  <div className="space-y-2.5">
                    <div className="flex items-center text-xs text-slate-600">
                      <Phone className="h-4 w-4 mr-2.5 text-slate-400" />
                      <span>{formatPhone(selectedLead.phone)}</span>
                    </div>
                    <div className="flex items-center text-xs text-slate-600 font-medium">
                      <Mail className="absolute inline h-4 w-4 text-slate-400 mr-2.5" />
                      <span className="pl-6">{selectedLead.email}</span>
                    </div>
                    <div className="flex items-center text-xs text-slate-600">
                      <Calendar className="h-4 w-4 mr-2.5 text-slate-400" />
                      <span>Inbound since {new Date(selectedLead.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Financial Disclosures</h4>
                  {selectedLead.financialInfo ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Employer:</span>
                        <strong className="text-slate-700">{selectedLead.financialInfo.employer}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Monthly Income:</span>
                        <strong className="text-slate-700">${selectedLead.financialInfo.monthlyIncome.toLocaleString()}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Credit Score:</span>
                        <strong className="text-slate-700">{selectedLead.financialInfo.creditScore}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Debt-To-Income (DTI):</span>
                        <strong className="text-slate-700">{(selectedLead.financialInfo.debtToIncome * 100).toFixed(0)}%</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No financial details declared.</p>
                  )}
                </div>
              </div>

              {/* Tags panel */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Classifications</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedLead.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200"
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Timeline Notes */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Underwriting Audit Logs</h4>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                  {selectedLead.notes}
                </div>
              </div>

              {/* Communication Logs playbox */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Simulated Outbound Voice Transcript</h4>
                {selectedLeadCallLogs.length > 0 ? (
                  <div className="space-y-4">
                    {/* Call list select */}
                    <div className="grid grid-cols-2 gap-3">
                      {selectedLeadCallLogs.map((log) => (
                        <button
                          key={log.id}
                          onClick={() => setSelectedCallLog(log)}
                          className={`p-3 rounded-xl text-left border transition-all ${
                            selectedCallLog?.id === log.id
                              ? 'border-indigo-600 bg-indigo-50/20'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">{log.id}</span>
                            <Badge color={log.sentiment === 'Positive' ? 'green' : log.sentiment === 'Negative' ? 'rose' : 'slate'} className="text-[9px]">
                              {log.sentiment}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 truncate">{log.summary}</p>
                        </button>
                      ))}
                    </div>

                    {/* Active call details */}
                    {selectedCallLog && (
                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        {/* Summary Block */}
                        <div className="p-4 bg-slate-50 border-b border-slate-100 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700 flex items-center">
                              <ThumbsUp className="h-3.5 w-3.5 mr-1 text-indigo-500" /> Sentiment: {selectedCallLog.sentiment}
                            </span>
                            <span className="text-slate-400 flex items-center">
                              <Clock className="h-3.5 w-3.5 mr-1" /> {selectedCallLog.duration} seconds
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-normal"><strong className="text-slate-800">Brief:</strong> {selectedCallLog.summary}</p>
                        </div>

                        {/* Speech bubbles */}
                        <div className="p-4 space-y-4 max-h-64 overflow-y-auto bg-slate-950">
                          {selectedCallLog.transcript.map((line, idx) => {
                            const isAI = line.speaker === 'AI';
                            return (
                              <div
                                key={idx}
                                className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}
                              >
                                <span className="text-[9px] text-slate-500 font-mono mb-1">{line.speaker} • {line.timestamp}</span>
                                <div
                                  className={`rounded-2xl px-4 py-2 max-w-[80%] text-xs font-sans ${
                                    isAI
                                      ? 'bg-indigo-900 text-indigo-100 rounded-tl-none'
                                      : 'bg-slate-800 text-slate-200 rounded-tr-none'
                                  }`}
                                >
                                  {line.text}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No automated call history available. Navigate to 'Campaign' to launch a dynamic test call.</p>
                )}
              </div>
            </div>
        </SlideOver>
      )}

      {/* Add Lead Modal */}
      {isAddModalOpen && (
        <Modal open onClose={() => setIsAddModalOpen(false)} title="New Lead Entry Registration" maxWidth="max-w-lg">
            <form onSubmit={handleAddLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Customer Full Name</label>
                  <input
                    type="text"
                    required
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Richard Hendricks"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Phone (Primary)</label>
                  <input
                    type="text"
                    required
                    value={newLeadPhone}
                    onChange={(e) => setNewLeadPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Corporate Email</label>
                <input
                  type="email"
                  required
                  value={newLeadEmail}
                  onChange={(e) => setNewLeadEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="name@company.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Amount Requested</label>
                  <input
                    type="number"
                    value={newLeadAmount}
                    onChange={(e) => setNewLeadAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Inbound Channel</label>
                  <select
                    value={newLeadSource}
                    onChange={(e) => setNewLeadSource(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  >
                    <option value="Website Form">Website Form</option>
                    <option value="Facebook Ads">Facebook Ads</option>
                    <option value="Direct Mail">Direct Mail</option>
                    <option value="Google Search">Google Search</option>
                    <option value="Partner Referral">Partner Referral</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Active Employer</label>
                  <input
                    type="text"
                    value={newLeadEmployer}
                    onChange={(e) => setNewLeadEmployer(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Pied Piper Inc"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Monthly Wages ($)</label>
                  <input
                    type="number"
                    value={newLeadIncome}
                    onChange={(e) => setNewLeadIncome(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Credit Score</label>
                  <input
                    type="number"
                    value={newLeadCredit}
                    onChange={(e) => setNewLeadCredit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Debt-To-Income Ratio</label>
                  <input
                    type="text"
                    value={newLeadDti}
                    onChange={(e) => setNewLeadDti(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 rounded-lg shadow-md transition-all mt-4 cursor-pointer"
              >
                Register & Originate
              </button>
            </form>
        </Modal>
      )}
    </PageShell>
  );
}
