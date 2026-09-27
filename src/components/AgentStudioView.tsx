import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Loader2, Mic, Check, Plus, Trash2, Edit2,
  Phone, PhoneOff, Bot, Zap, ToggleRight, ToggleLeft, BookOpen, FileText, MoreVertical,
  Cpu, Wrench, X, ArrowLeft,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { isDevEnv } from '../lib/env';
import PageShell from './ui/PageShell';
import AwsCreateLayout from './ui/AwsCreateLayout';
import IconButton from './ui/IconButton';
import ActionMenu from './ui/ActionMenu';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VirtualNumber {
  id: string;
  number: string;
  friendlyName?: string;
  friendly_name?: string; // from listNumbersWithAgent (snake_case)
  provider?: string;
  agentId?: string | null;
  agent_id?: string | null; // from listNumbersWithAgent (snake_case)
}

interface KnowledgeDocument {
  id: string;
  title: string;
  chunkCount: number;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  systemPrompt?: string;
  activeVoice: string;
  emotion: number;
  speed: number;
  friendliness: number;
  language: string;
  industry?: string | null;
  dialect?: string | null;
  businessContext?: string | null;
  callType?: 'INBOUND' | 'OUTBOUND';
  assignedNumber?: VirtualNumber | null;   // inbound (exclusive)
  outboundNumber?: VirtualNumber | null;   // outbound (shared)
  outboundNumberId?: string | null;
  active?: boolean;
  // Knowledge base scope: 'all' (whole org KB, default), 'specific'
  // (only knowledgeBaseDocumentIds), or 'none' (disabled for this agent).
  knowledgeBaseMode?: 'all' | 'specific' | 'none';
  knowledgeBaseDocumentIds?: string[];
}

// A built-in post-call AI agent (sentiment, summary, workflow-answer
// extraction, follow-up safety net — see crm-backend-demo's
// src/ai/systemAgents.js) — fixed pipeline behavior, not something a user
// created. Unlike a user-created Agent, it has no phone number or voice:
// it never places or answers a call, it runs against a finished
// transcript. Shown read-only here so it's visible what's actually
// analyzing every call, not hidden in backend source.
interface SystemAgent {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  defaultSystemPrompt: string;
  isCustomized: boolean;
  tools: string[];
  runsOn: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const VOICES = ['Arjun', 'Priya', 'Dev', 'Kavya'];

interface IndustryOption {
  key: string;
  label: string;
}

const CALL_TYPES: { value: 'INBOUND' | 'OUTBOUND'; label: string }[] = [
  { value: 'INBOUND', label: 'Inbound' },
  { value: 'OUTBOUND', label: 'Outbound' },
];

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-[var(--text-primary)]">{label}</label>
        <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{value}</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-600 h-1.5"
      />
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
}

function emptyForm(defaultIndustry = ''): Omit<Agent, 'id'> {
  return {
    name: '',
    systemPrompt: '',
    activeVoice: 'Arjun',
    emotion: 78,
    speed: 52,
    friendliness: 82,
    language: 'English',
    industry: defaultIndustry,
    dialect: '',
    businessContext: '',
    callType: 'INBOUND',
    assignedNumber: null,
    outboundNumber: null,
    knowledgeBaseMode: 'all',
    knowledgeBaseDocumentIds: [],
  };
}

interface AgentFormFrameProps {
  children: React.ReactNode;
  creating: boolean;
  agentWizardStep: number;
  form: Omit<Agent, 'id'>;
  onBack: () => void;
}

function AgentFormFrame({ children, creating, agentWizardStep, form, onBack }: AgentFormFrameProps) {
  return (
    <AwsCreateLayout
      breadcrumb={creating ? 'Agent Studio / Create Agent' : 'Agent Studio / Edit Agent'}
      title=""
      description=""
      steps={[]}
      activeStep={agentWizardStep}
      action={(
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-[9px] border border-slate-500 bg-slate-700 text-white hover:bg-slate-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Agent Studio
        </button>
      )}
    >
      {children}
    </AwsCreateLayout>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgentStudioView() {
  const [agentView, setAgentView] = useState<'user' | 'system'>('user');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [systemAgents, setSystemAgents] = useState<SystemAgent[]>([]);
  const [viewingSystemAgent, setViewingSystemAgent] = useState<SystemAgent | null>(null);
  const [editedSystemPrompt, setEditedSystemPrompt] = useState('');
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
  const [numbers, setNumbers] = useState<VirtualNumber[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Agent, 'id'>>(emptyForm());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [agentWizardStep, setAgentWizardStep] = useState<1 | 2>(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialectsByLanguage, setDialectsByLanguage] = useState<Record<string, { dialect: string }[]>>({});
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [orgIndustry, setOrgIndustry] = useState('');

  const savedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [agentsRes, systemAgentsRes, numsRes, docsRes, promptConfigRes, industriesRes, orgRes] = await Promise.all([
        apiFetch('/api/agents').then(r => r.json()),
        apiFetch('/api/agents/system').then(r => r.json()).catch(() => []),
        apiFetch('/api/settings/numbers').then(r => r.json()),
        apiFetch('/api/knowledge/documents').then(r => r.json()).catch(() => []),
        apiFetch('/api/agents/prompt-config').then(r => r.json()).catch(() => null),
        apiFetch('/api/auth/industries').then(r => r.json()).catch(() => []),
        apiFetch('/api/settings/org').then(r => r.json()).catch(() => null),
      ]);
      setAgents(Array.isArray(agentsRes) ? agentsRes : []);
      setSystemAgents(Array.isArray(systemAgentsRes) ? systemAgentsRes : []);
      setNumbers(Array.isArray(numsRes) ? numsRes : []);
      setKnowledgeDocs(Array.isArray(docsRes) ? docsRes : []);
      if (promptConfigRes?.dialectsByLanguage) setDialectsByLanguage(promptConfigRes.dialectsByLanguage);
      setIndustries(Array.isArray(industriesRes) ? industriesRes : []);
      if (orgRes?.industry) setOrgIndustry(orgRes.industry);
    } catch { /* silent */ }
    finally { if (showSpinner) setLoading(false); }
  };

  useEffect(() => { loadData(true); }, []);

  const getAgentId = (n: VirtualNumber) => n.agentId ?? n.agent_id ?? null;
  const freeNumbers = (editingId: string | null) =>
    numbers.filter(n => !getAgentId(n) || getAgentId(n) === editingId);

  const openCreate = () => {
    setForm(emptyForm(orgIndustry));
    setAgentWizardStep(1);
    setCreating(true);
    setEditingAgent(null);
    setSaveStatus('idle');
  };

  const openEdit = (agent: Agent) => {
    setForm({
      name: agent.name,
      systemPrompt: agent.systemPrompt ?? '',
      activeVoice: agent.activeVoice,
      emotion: agent.emotion,
      speed: agent.speed,
      friendliness: agent.friendliness,
      language: agent.language || 'English',
      industry: orgIndustry, // always the org's current industry, never per-agent
      dialect: agent.dialect ?? '',
      businessContext: agent.businessContext ?? '',
      callType: agent.callType ?? 'INBOUND',
      assignedNumber: agent.assignedNumber ?? null,
      outboundNumber: agent.outboundNumber ?? null,
      knowledgeBaseMode: agent.knowledgeBaseMode ?? 'all',
      knowledgeBaseDocumentIds: agent.knowledgeBaseDocumentIds ?? [],
    });
    setEditingAgent(agent);
    setAgentWizardStep(1);
    setCreating(false);
    setSaveStatus('idle');
  };

  const closeForm = () => { setCreating(false); setEditingAgent(null); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaveStatus('saving');
    try {
      let saved: Agent;
      if (creating) {
        const res = await apiFetch('/api/agents', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name, systemPrompt: form.systemPrompt,
            activeVoice: form.activeVoice, emotion: form.emotion,
            speed: form.speed, friendliness: form.friendliness, language: form.language,
            industry: form.industry, dialect: form.dialect, businessContext: form.businessContext, callType: form.callType,
            knowledgeBaseMode: form.knowledgeBaseMode, knowledgeBaseDocumentIds: form.knowledgeBaseDocumentIds,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Create failed');
        saved = await res.json();
      } else if (editingAgent) {
        const res = await apiFetch(`/api/agents/${editingAgent.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name, systemPrompt: form.systemPrompt,
            activeVoice: form.activeVoice, emotion: form.emotion,
            speed: form.speed, friendliness: form.friendliness, language: form.language,
            industry: form.industry, dialect: form.dialect, businessContext: form.businessContext, callType: form.callType,
            knowledgeBaseMode: form.knowledgeBaseMode, knowledgeBaseDocumentIds: form.knowledgeBaseDocumentIds,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
        saved = await res.json();
      } else return;

      const wantedInboundId  = form.assignedNumber?.id ?? null;
      const currentInboundId = editingAgent?.assignedNumber?.id ?? null;
      if (wantedInboundId !== currentInboundId) {
        await apiFetch(`/api/agents/${saved.id}/assign-number`, {
          method: 'PUT',
          body: JSON.stringify({ numberId: wantedInboundId }),
        });
      }

      const wantedOutboundId  = form.outboundNumber?.id ?? null;
      const currentOutboundId = editingAgent?.outboundNumber?.id ?? null;
      if (wantedOutboundId !== currentOutboundId) {
        const outboundRes = await apiFetch(`/api/agents/${saved.id}/assign-outbound-number`, {
          method: 'PUT',
          body: JSON.stringify({ numberId: wantedOutboundId }),
        });
        if (!outboundRes.ok) throw new Error((await outboundRes.json()).error || 'Failed to assign outbound number');
      }

      setSaveStatus('saved');
      if (savedRef.current) clearTimeout(savedRef.current);
      savedRef.current = setTimeout(() => setSaveStatus('idle'), 1500);
      await loadData();
      closeForm();
    } catch (err: any) {
      setSaveStatus('error');
      alert(err.message || 'Save failed');
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm('Delete this agent? Any assigned phone number will be unlinked.')) return;
    setDeletingId(agentId);
    try {
      await apiFetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      await loadData();
      if (editingAgent?.id === agentId) closeForm();
    } finally { setDeletingId(null); }
  };

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const handleToggleActive = async (agent: Agent) => {
    const nextActive = !(agent.active ?? true);
    setTogglingId(agent.id);
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, active: nextActive } : a));
    try {
      const res = await apiFetch(`/api/agents/${agent.id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active: nextActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update agent status');
    } catch (err: any) {
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, active: agent.active } : a));
      alert(err.message || 'Failed to update agent status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    try {
      const res = await apiFetch('/api/agents/generate-prompt', {
        method: 'POST',
        body: JSON.stringify({
          agentName: form.name,
          industry: industries.find(i => i.key === form.industry)?.label || form.industry,
          language: form.language,
          dialect: form.dialect,
          businessContext: form.businessContext,
          callType: form.callType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate prompt');
      setForm(f => ({ ...f, systemPrompt: data.prompt }));
    } catch (err: any) {
      alert(err.message || 'Failed to generate prompt');
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleSaveSystemPrompt = async () => {
    if (!viewingSystemAgent) return;
    setSavingSystemPrompt(true);
    try {
      const res = await apiFetch(`/api/agents/system/${viewingSystemAgent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt: editedSystemPrompt }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to save system prompt');
      setSystemAgents(prev => prev.map(a => (a.id === updated.id ? updated : a)));
      setViewingSystemAgent(updated);
      setEditedSystemPrompt(updated.systemPrompt);
    } catch (err: any) {
      alert(err.message || 'Failed to save system prompt');
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  const handleResetSystemPrompt = async () => {
    if (!viewingSystemAgent) return;
    if (!confirm(`Reset "${viewingSystemAgent.name}" back to its default system prompt? Your customization will be lost.`)) return;
    setSavingSystemPrompt(true);
    try {
      // A blank systemPrompt is how the backend recognizes "clear this
      // org's override, fall back to the shared default" — see
      // setPromptOverride in crm-backend-demo's src/ai/systemAgents.js.
      const res = await apiFetch(`/api/agents/system/${viewingSystemAgent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt: '' }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to reset system prompt');
      setSystemAgents(prev => prev.map(a => (a.id === updated.id ? updated : a)));
      setViewingSystemAgent(updated);
      setEditedSystemPrompt(updated.systemPrompt);
    } catch (err: any) {
      alert(err.message || 'Failed to reset system prompt');
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  const assignableNumbers = freeNumbers(editingAgent?.id ?? null);



  return (
    <PageShell
      title={creating || editingAgent
        ? (
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={closeForm}
                className="text-xs font-medium text-slate-400 hover:text-slate-700 dark:text-[var(--text-muted)] dark:hover:text-[var(--text-primary)] transition-colors shrink-0"
              >
                Agent Studio
              </button>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-lg font-semibold text-slate-900  truncate">
                {creating ? 'Create Agent' : 'Edit Agent'}
              </span>
            </div>
          )
        : 'Agent Studio'}
      subtitle={creating || editingAgent
        ? undefined
        : agentView === 'user'
          ? 'Create AI calling agents — each with its own voice, persona, and phone number.'
          : 'Built-in AI agents that run automatically after every call — no phone number, no voice, just a system prompt.'}
      onRefresh={() => loadData()}
      titleActions={
        creating || editingAgent ? (
          <IconButton
            icon={ArrowLeft}
            label="Back to Agent Studio"
            onClick={closeForm}
          />
        ) : undefined
      }
      action={
        creating || editingAgent ? (
          <button
            type="button"
            onClick={closeForm}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-[9px] border border-slate-500 bg-slate-700 text-white hover:bg-slate-600 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Agent Studio
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {isDevEnv && (
              <div className="flex items-center bg-[var(--bg-subtle)]  border border-[var(--border)] rounded-[9px] p-1">
                <button
                  type="button"
                  onClick={() => setAgentView('user')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${agentView === 'user' ? 'bg-[var(--bg-surface)] text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 hover:text-[var(--text-primary)]'}`}
                >
                  User Agents
                </button>
                <button
                  type="button"
                  onClick={() => setAgentView('system')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${agentView === 'system' ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]  shadow-sm' : 'text-slate-500 hover:text-[var(--text-primary)]'}`}
                >
                  System Agents
                </button>
              </div>
            )}
            {agentView === 'user' && <IconButton icon={Plus} label="New Agent" onClick={openCreate} />}
          </div>
        )
      }
    >
      {agentView === 'user' && !creating && !editingAgent && (
      <div className="col-span-12">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-[14px] bg-indigo-50 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">No agents yet</p>
              <p className="text-xs text-slate-400 mt-1.5 max-w-xs">
                Create an agent with its own voice and persona, then assign a phone number so it handles calls on that line.
              </p>
              <button
                onClick={openCreate}
                className="mt-5 px-5 py-2.5 bg-indigo-600 text-white text-xs font-semibold rounded-[9px] hover:bg-indigo-700 transition-colors"
              >
                Create your first agent
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {agents.map(agent => (
                <div
                  key={agent.id}
                  className="relative flex flex-col rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] hover:border-indigo-300 hover:shadow-md transition-all group overflow-hidden"
                >
                  {/* Top accent bar */}
                  <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-purple-500" />

                  <div className="p-5 flex flex-col gap-4 flex-1">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-[9px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
                          <Bot className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold text-slate-800 truncate leading-tight">{agent.name}</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                              (agent.active ?? true) ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--bg-subtle)] text-slate-400'
                            }`}>
                              {(agent.active ?? true) ? 'ACTIVE' : 'PAUSED'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Mic className="h-3 w-3" /> {agent.activeVoice}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <ActionMenu
                          tooltipLabel="Options"
                          triggerIcon={MoreVertical}
                          triggerVariant="ghost"
                          loading={togglingId === agent.id || deletingId === agent.id}
                          items={[
                            {
                              key: 'toggle',
                              label: (agent.active ?? true) ? 'Disable Agent' : 'Enable Agent',
                              icon: (agent.active ?? true) ? ToggleLeft : ToggleRight,
                              onClick: () => handleToggleActive(agent),
                            },
                            { key: 'edit', label: 'Edit', icon: Edit2, onClick: () => openEdit(agent) },
                            { key: 'delete', label: 'Delete', icon: Trash2, danger: true, onClick: () => handleDelete(agent.id) },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Delivery sliders summary */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Emotion', value: agent.emotion, color: 'bg-indigo-500' },
                        { label: 'Speed', value: agent.speed, color: 'bg-blue-500' },
                        { label: 'Friendly', value: agent.friendliness, color: 'bg-violet-500' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="bg-[var(--bg-base)] rounded-[9px] p-2.5 text-center">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{label}</p>
                          <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                          </div>
                          <p className="text-[10px] font-bold text-[var(--text-primary)] mt-1.5">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Number badge — an agent is either Inbound or Outbound
                        (see Call Type), never both, so show only the one
                        number that's actually relevant to it. */}
                    <div className="mt-auto">
                      {agent.callType === 'OUTBOUND' ? (
                        agent.outboundNumber ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-violet-50 border border-violet-200 rounded-lg min-w-0">
                            <Zap className="h-3 w-3 text-violet-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[8px] font-semibold text-violet-500 uppercase tracking-wider leading-tight">Outbound</p>
                              <p className="text-[11px] font-bold text-violet-700 truncate leading-tight">{agent.outboundNumber.number}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--bg-base)] border border-dashed border-slate-300 rounded-lg min-w-0">
                            <Zap className="h-3 w-3 text-slate-400 shrink-0" />
                            <p className="text-[10px] text-slate-400 truncate">Outbound · org default</p>
                          </div>
                        )
                      ) : (
                        agent.assignedNumber ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg min-w-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[8px] font-semibold text-emerald-500 uppercase tracking-wider leading-tight">Inbound</p>
                              <p className="text-[11px] font-bold text-emerald-700 truncate leading-tight">{agent.assignedNumber.number}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--bg-base)] border border-dashed border-slate-300 rounded-lg min-w-0">
                            <PhoneOff className="h-3 w-3 text-slate-400 shrink-0" />
                            <p className="text-[10px] text-slate-400 truncate">Inbound · no number</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
      )}

      {/* ── System Agents — dev-only, see the action toggle's comment above ── */}
      {isDevEnv && agentView === 'system' && (
        <div className="col-span-12">
          {systemAgents.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {systemAgents.map(sa => (
                <button
                  key={sa.id}
                  type="button"
                  onClick={() => { setViewingSystemAgent(sa); setEditedSystemPrompt(sa.systemPrompt); }}
                  className="relative flex flex-col text-left rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)]/80 hover:border-slate-300 hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)] transition-all overflow-hidden cursor-pointer"
                >
                  <div className="h-1 w-full bg-gradient-to-r from-slate-400 to-slate-500" />
                  <div className="p-5 flex flex-col gap-3 flex-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-[9px] bg-slate-600 flex items-center justify-center shrink-0 shadow-sm">
                        <Cpu className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-slate-800 truncate leading-tight">{sa.name}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-slate-200 text-[var(--text-primary)]">SYSTEM</span>
                          {sa.isCustomized && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-amber-100 text-amber-700">CUSTOMIZED</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{sa.model}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">{sa.description}</p>
                    <div className="mt-auto flex items-center gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-subtle)]  border border-[var(--border)] rounded-lg">
                        <PhoneOff className="h-3 w-3 text-slate-400" />
                        <span className="text-[9px] text-slate-500 font-semibold">No phone number</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-subtle)]  border border-[var(--border)] rounded-lg">
                        <Wrench className="h-3 w-3 text-slate-400" />
                        <span className="text-[9px] text-slate-500 font-semibold">{sa.tools.length > 0 ? `${sa.tools.length} tool${sa.tools.length === 1 ? '' : 's'}` : 'No tools'}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── System agent detail / edit ── */}
      {viewingSystemAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setViewingSystemAgent(null)}>
          <div
            className="w-full max-w-xl max-h-[85vh] flex flex-col bg-[var(--bg-surface)] rounded-[14px] shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-[9px] bg-slate-600 flex items-center justify-center shrink-0">
                  <Cpu className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-slate-800 truncate">{viewingSystemAgent.name}</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-slate-200 text-[var(--text-primary)]">SYSTEM</span>
                    {viewingSystemAgent.isCustomized && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-amber-100 text-amber-700">CUSTOMIZED</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{viewingSystemAgent.model} · no phone number, no voice — text-only</p>
                </div>
              </div>
              <button onClick={() => setViewingSystemAgent(null)} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-slate-400 hover:text-[var(--text-primary)] shrink-0 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <p className="text-xs text-[var(--text-primary)] leading-relaxed">{viewingSystemAgent.description}</p>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Runs</p>
                <p className="text-[11px] text-slate-500">{viewingSystemAgent.runsOn}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tools</p>
                {viewingSystemAgent.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {viewingSystemAgent.tools.map(t => (
                      <span key={t} className="text-[10px] font-mono px-2 py-1 bg-[var(--bg-subtle)]  border border-[var(--border)] rounded-lg text-[var(--text-primary)]">{t}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">This agent doesn't call any tools — it only reads the transcript and replies with text.</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">System Prompt</p>
                  {viewingSystemAgent.isCustomized && (
                    <button
                      type="button"
                      onClick={handleResetSystemPrompt}
                      disabled={savingSystemPrompt}
                      className="text-[10px] font-semibold text-slate-400 hover:text-[var(--text-primary)] disabled:opacity-50 cursor-pointer"
                    >
                      Reset to default
                    </button>
                  )}
                </div>
                <textarea
                  value={editedSystemPrompt}
                  onChange={(e) => setEditedSystemPrompt(e.target.value)}
                  rows={10}
                  className="w-full bg-[var(--bg-base)]  border border-[var(--border)] rounded-[9px] px-4 py-3 text-[11px] font-mono text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Must keep <code className="font-mono bg-[var(--bg-subtle)] px-1 rounded">{'{transcript}'}</code>
                  {viewingSystemAgent.id === 'workflow-answer-extractor' && (
                    <> and <code className="font-mono bg-[var(--bg-subtle)] px-1 rounded">{'{questions}'}</code></>
                  )} — that's where the real call data gets substituted in.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setViewingSystemAgent(null)}
                className="text-sm text-slate-500 hover:text-[var(--text-primary)] font-medium px-4 py-2.5 rounded-[9px] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSystemPrompt}
                disabled={savingSystemPrompt || editedSystemPrompt.trim() === viewingSystemAgent.systemPrompt.trim()}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-[9px] shadow-sm transition-all disabled:opacity-60 bg-slate-700 text-white hover:bg-[var(--bg-surface)] cursor-pointer"
              >
                {savingSystemPrompt && <Loader2 className="h-4 w-4 animate-spin" />}
                {savingSystemPrompt ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Agent create page / edit modal ── */}
      {(creating || !!editingAgent) && (
      <AgentFormFrame creating={creating} agentWizardStep={1} form={form} onBack={closeForm}>
        <div className="mx-auto w-full max-w-5xl space-y-5 pb-2">
          {false && (
            <div className="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)]/80  px-4 py-3">
              <div className={`flex items-center gap-2 ${agentWizardStep === 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${agentWizardStep === 1 ? 'bg-indigo-600 text-white' : 'bg-[var(--bg-surface)] border border-[var(--border)]'}`}>1</span>
                <span className="text-xs font-semibold">Configure</span>
              </div>
              <div className="h-px flex-1 bg-slate-200 dark:bg-[var(--border)]" />
              <div className={`flex items-center gap-2 ${agentWizardStep === 2 ? 'text-indigo-600' : 'text-slate-400'}`}>
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${agentWizardStep === 2 ? 'bg-indigo-600 text-white' : 'bg-[var(--bg-surface)] border border-[var(--border)]'}`}>2</span>
                <span className="text-xs font-semibold">{creating ? 'Review & Create' : 'Review & Save'}</span>
              </div>
            </div>
          )}

          {true && (
            <>
          {/* Agent Name */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-base)]/80 dark:bg-[var(--bg-surface)] p-4">
            <label className="block text-xs font-semibold text-[var(--text-primary)]  mb-1.5">Agent Name</label>
            <input
              autoFocus
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sales Agent, Support Bot, Loan Advisor"
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] px-4 py-2.5 text-sm placeholder:text-slate-400 dark:placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
            />
          </div>

          

          {/* Voice */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mic className="h-4 w-4 text-violet-500" />
              <p className="text-xs font-semibold text-[var(--text-primary)]  uppercase tracking-widest">Voice</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {VOICES.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, activeVoice: v }))}
                  className={`py-2.5 text-sm font-semibold rounded-[9px] border-2 transition-all cursor-pointer ${
                    form.activeVoice === v
                      ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                      : 'bg-[var(--bg-surface)] text-[var(--text-primary)]  border-[var(--border)] hover:border-slate-300 dark:hover:border-[var(--border)] hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          

          {/* Voice-agent prompt configuration: industry, language, dialect,
              call type, business context — assembled into the two master
              prompts (INBOUND/OUTBOUND) via /api/agents/generate-prompt. */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="h-4 w-4 text-indigo-500" />
              <p className="text-xs font-semibold text-[var(--text-primary)]  uppercase tracking-widest">Agent Configuration</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">Industry</label>
                {/* Not user-editable here — every agent in this org shares the
                    org's own industry (set at signup / in Company Profile),
                    same as the industry used elsewhere in the app. */}
                <div className="w-full bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-sm text-[var(--text-muted)]">
                  {industries.find(i => i.key === orgIndustry)?.label || orgIndustry || 'Not set — see Company Profile'}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">Call Type</label>
                <select
                  value={form.callType ?? 'INBOUND'}
                  onChange={e => {
                    const nextCallType = e.target.value as 'INBOUND' | 'OUTBOUND';
                    // An agent's prompt is now direction-specific (see the two
                    // master prompts), so a single agent shouldn't be assigned
                    // both an inbound and an outbound number at once — clear
                    // whichever number no longer matches the selected direction.
                    setForm(f => ({
                      ...f,
                      callType: nextCallType,
                      assignedNumber: nextCallType === 'OUTBOUND' ? null : f.assignedNumber,
                      outboundNumber: nextCallType === 'INBOUND' ? null : f.outboundNumber,
                    }));
                  }}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
                >
                  {CALL_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">Language</label>
                <select
                  value={form.language}
                  onChange={e => {
                    const nextLanguage = e.target.value;
                    const validDialects = (dialectsByLanguage[nextLanguage] || []).map(d => d.dialect);
                    setForm(f => ({ ...f, language: nextLanguage, dialect: validDialects[0] || '' }));
                  }}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
                >
                  {Object.keys(dialectsByLanguage).length === 0
                    ? <option value={form.language}>{form.language}</option>
                    : Object.keys(dialectsByLanguage).map(lang => <option key={lang} value={lang}>{lang}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">Dialect</label>
                <select
                  value={form.dialect ?? ''}
                  onChange={e => setForm(f => ({ ...f, dialect: e.target.value }))}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all"
                >
                  <option value="">Standard / none</option>
                  {(dialectsByLanguage[form.language] || []).map(d => (
                    <option key={d.dialect} value={d.dialect}>{d.dialect}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">Business Context</label>
              <textarea
                value={form.businessContext ?? ''}
                onChange={e => setForm(f => ({ ...f, businessContext: e.target.value }))}
                rows={4}
                placeholder="Services, products, business hours, policies, eligibility rules, escalation process, callback rules, compliance rules — only what's written here is available to the agent on a call."
                className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] px-4 py-3 text-xs text-[var(--text-primary)]  placeholder:text-slate-400 dark:placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all resize-none"
              />
            </div>
            <button
              type="button"
              onClick={handleGeneratePrompt}
              disabled={generatingPrompt}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300  bg-[var(--bg-surface)] text-slate-700  hover:bg-slate-200  disabled:opacity-50 cursor-pointer transition-colors"
            >
              {generatingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generate Prompt
            </button>
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
              Builds the system prompt below from the master inbound/outbound template using the settings above — review it before saving.
            </p>
          </div>

          

          {/* Delivery sliders */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-blue-500" />
              <p className="text-xs font-semibold text-[var(--text-primary)]  uppercase tracking-widest">Delivery</p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Slider label="Emotion" value={form.emotion} onChange={v => setForm(f => ({ ...f, emotion: v }))} />
              <Slider label="Speed" value={form.speed} onChange={v => setForm(f => ({ ...f, speed: v }))} />
              <Slider label="Friendliness" value={form.friendliness} onChange={v => setForm(f => ({ ...f, friendliness: v }))} />
            </div>
          </div>

          

          {/* System Prompt */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-semibold text-[var(--text-primary)]  uppercase tracking-widest">System Prompt</p>
            </div>
            <textarea
              value={form.systemPrompt}
              onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
              rows={5}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] px-4 py-3 text-xs font-mono text-[var(--text-primary)]  placeholder:text-slate-400 dark:placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-all resize-none"
              placeholder="Write the agent's system prompt here, or use Generate Prompt above…"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
              The agent always introduces itself using the <strong className="font-semibold text-[var(--text-secondary)]">Agent Name</strong> above, regardless of what's written here. Use <strong className="font-semibold text-[var(--text-secondary)]">Generate Prompt</strong> above to rebuild this from the Agent Configuration settings, or edit it directly.
            </p>
          </div>

          {form.callType !== 'OUTBOUND' && (
          <>
          

          {/* Inbound Number — exclusive (one number → one agent). Hidden
              when Call Type is Outbound: the generated prompt assumes one
              direction per agent, so it shouldn't also answer inbound calls. */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="h-4 w-4 text-emerald-500" />
              <p className="text-xs font-semibold text-[var(--text-primary)]  uppercase tracking-widest">Inbound Number</p>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mb-3">
              Incoming calls to this number are routed exclusively to this agent. A number can only have one inbound agent.
            </p>
            {numbers.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] text-xs text-[var(--text-secondary)]">
                <PhoneOff className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                No virtual numbers yet. Add one in <span className="font-semibold">Settings → Virtual Numbers</span>.
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, assignedNumber: null }))}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-[9px] border-2 text-left transition-all cursor-pointer ${
                    !form.assignedNumber ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-300 dark:hover:border-[var(--border)] hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="h-8 w-8 rounded-lg bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)] flex items-center justify-center shrink-0">
                    <PhoneOff className="h-4 w-4 text-[var(--text-muted)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] ">None</p>
                    <p className="text-[10px] text-[var(--text-muted)]">No inbound line for this agent</p>
                  </div>
                  {!form.assignedNumber && (
                    <div className="ml-auto h-4 w-4 rounded-full bg-[var(--bg-base)]0 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </button>
                {assignableNumbers.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, assignedNumber: n }))}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-[9px] border-2 text-left transition-all cursor-pointer ${
                      form.assignedNumber?.id === n.id ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-400 dark:hover:border-slate-500 hover:bg-[var(--bg-subtle)] '
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${form.assignedNumber?.id === n.id ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)]'}`}>
                      <Phone className={`h-4 w-4 ${form.assignedNumber?.id === n.id ? 'text-emerald-600 dark:text-emerald-300' : 'text-[var(--text-muted)]'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{n.number}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {(n.friendlyName ?? n.friendly_name) || '—'}{n.provider ? ` · ${n.provider}` : ''}
                      </p>
                    </div>
                    {form.assignedNumber?.id === n.id && (
                      <div className="ml-auto h-4 w-4 rounded-full bg-[var(--bg-base)]0 flex items-center justify-center shrink-0">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
                {assignableNumbers.length === 0 && (
                  <p className="text-[10px] text-[var(--text-muted)] px-1">All numbers are assigned to other agents for inbound. Reassign a number first or leave as None.</p>
                )}
              </div>
            )}
          </div>
          </>
          )}

          {form.callType !== 'INBOUND' && (
          <>
          

          {/* Outbound Number — shared (many agents can use the same number).
              Hidden when Call Type is Inbound, for the same reason as above. */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-violet-500" />
              <p className="text-xs font-semibold text-[var(--text-primary)]  uppercase tracking-widest">Outbound Number</p>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mb-3">
              Caller ID used when this agent makes outbound calls. Multiple agents can share the same number.
            </p>
            {numbers.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-[9px] text-xs text-[var(--text-secondary)]">
                <PhoneOff className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                No virtual numbers yet. Add one in <span className="font-semibold">Settings → Virtual Numbers</span>.
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, outboundNumber: null }))}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-[9px] border-2 text-left transition-all cursor-pointer ${
                    !form.outboundNumber ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-300 dark:hover:border-[var(--border)] hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="h-8 w-8 rounded-lg bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)] flex items-center justify-center shrink-0">
                    <PhoneOff className="h-4 w-4 text-[var(--text-muted)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] ">Use org default</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Falls back to the org's channel number</p>
                  </div>
                  {!form.outboundNumber && (
                    <div className="ml-auto h-4 w-4 rounded-full bg-[var(--bg-base)]0 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </button>
                {numbers.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, outboundNumber: n }))}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-[9px] border-2 text-left transition-all cursor-pointer ${
                      form.outboundNumber?.id === n.id ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-400 dark:hover:border-slate-500 hover:bg-[var(--bg-subtle)] '
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${form.outboundNumber?.id === n.id ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)]'}`}>
                      <Phone className={`h-4 w-4 ${form.outboundNumber?.id === n.id ? 'text-slate-600 dark:text-slate-300' : 'text-[var(--text-muted)]'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{n.number}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {(n.friendlyName ?? n.friendly_name) || '—'}{n.provider ? ` · ${n.provider}` : ''}
                      </p>
                    </div>
                    {form.outboundNumber?.id === n.id && (
                      <div className="ml-auto h-4 w-4 rounded-full bg-[var(--bg-base)]0 flex items-center justify-center shrink-0">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          </>
          )}

          

          {/* Knowledge Base — connect to the whole org KB, specific documents, or none */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-emerald-500" />
              <p className="text-xs font-semibold text-[var(--text-primary)]  uppercase tracking-widest">Knowledge Base</p>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mb-3">
              What this agent can reference when answering caller questions.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, knowledgeBaseMode: 'all' }))}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[9px] border-2 text-left transition-all cursor-pointer ${
                  form.knowledgeBaseMode === 'all' ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-400 dark:hover:border-slate-500 hover:bg-[var(--bg-subtle)] '
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${form.knowledgeBaseMode === 'all' ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)]'}`}>
                  <BookOpen className={`h-4 w-4 ${form.knowledgeBaseMode === 'all' ? 'text-emerald-600 dark:text-emerald-300' : 'text-[var(--text-muted)]'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Full Knowledge Base</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Every document in the org's knowledge base</p>
                </div>
                {form.knowledgeBaseMode === 'all' && (
                  <div className="ml-auto h-4 w-4 rounded-full bg-[var(--bg-base)]0 flex items-center justify-center shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, knowledgeBaseMode: 'specific' }))}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[9px] border-2 text-left transition-all cursor-pointer ${
                  form.knowledgeBaseMode === 'specific' ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-400 dark:hover:border-slate-500 hover:bg-[var(--bg-subtle)] '
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${form.knowledgeBaseMode === 'specific' ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)]'}`}>
                  <FileText className={`h-4 w-4 ${form.knowledgeBaseMode === 'specific' ? 'text-emerald-600 dark:text-emerald-300' : 'text-[var(--text-muted)]'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Specific Documents</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {(form.knowledgeBaseDocumentIds?.length ?? 0) > 0
                      ? `${form.knowledgeBaseDocumentIds!.length} document${form.knowledgeBaseDocumentIds!.length === 1 ? '' : 's'} selected`
                      : 'Choose which documents to use below'}
                  </p>
                </div>
                {form.knowledgeBaseMode === 'specific' && (
                  <div className="ml-auto h-4 w-4 rounded-full bg-[var(--bg-base)]0 flex items-center justify-center shrink-0">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </button>

              {form.knowledgeBaseMode === 'specific' && (
                <div className="ml-4 pl-4 border-l-2 border-[var(--border)] space-y-1.5">
                  {knowledgeDocs.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)] italic py-2">
                      No documents uploaded yet. Add some in <span className="font-semibold">Knowledge Base</span>.
                    </p>
                  ) : (
                    knowledgeDocs.map(doc => {
                      const selected = (form.knowledgeBaseDocumentIds ?? []).includes(doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setForm(f => {
                            const current = f.knowledgeBaseDocumentIds ?? [];
                            return {
                              ...f,
                              knowledgeBaseDocumentIds: current.includes(doc.id)
                                ? current.filter(id => id !== doc.id)
                                : [...current, doc.id],
                            };
                          })}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                            selected ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-subtle)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-400'
                          }`}
                        >
                          <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-[var(--bg-base)]0 border-slate-500' : 'border-[var(--border)]'}`}>
                            {selected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-xs font-medium text-[var(--text-primary)]  truncate flex-1">{doc.title}</span>
                          <span className="text-[10px] text-[var(--text-muted)] shrink-0">{doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, knowledgeBaseMode: 'none' }))}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[9px] border-2 text-left transition-all cursor-pointer ${
                  form.knowledgeBaseMode === 'none' ? 'border-slate-400 dark:border-slate-500 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-300 dark:hover:border-[var(--border)] hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)] dark:hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <div className="h-8 w-8 rounded-lg bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)] flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)] ">None</p>
                  <p className="text-[10px] text-[var(--text-muted)]">This agent won't reference the knowledge base at all</p>
                </div>
                {form.knowledgeBaseMode === 'none' && (
                  <div className="ml-auto h-4 w-4 rounded-full bg-[var(--bg-base)]0 flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </button>
            </div>
          </div>

            </>
          )}

          {false && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">{creating ? 'Review & Create' : 'Review & Save'}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {creating ? 'Review the agent configuration before creating it.' : 'Review the agent configuration before saving your changes.'}
                </p>
              </div>

              <div className="rounded-[14px] border border-[var(--border)] overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="p-4 border-b sm:border-r border-[var(--border)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Agent</p>
                    <p className="text-sm font-bold text-[var(--text-primary)] mt-1">{form.name || '—'}</p>
                  </div>
                  <div className="p-4 border-b border-[var(--border)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Call Type</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">{form.callType === 'OUTBOUND' ? 'Outbound' : 'Inbound'}</p>
                  </div>
                  <div className="p-4 border-b sm:border-r border-[var(--border)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Voice</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">{form.activeVoice}</p>
                  </div>
                  <div className="p-4 border-b border-[var(--border)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Language / Dialect</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">{form.language}{form.dialect ? ` · ${form.dialect}` : ''}</p>
                  </div>
                  <div className="p-4 border-b sm:border-r border-[var(--border)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone Number</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">
                      {form.callType === 'OUTBOUND'
                        ? (form.outboundNumber?.number || 'Use org default')
                        : (form.assignedNumber?.number || 'None')}
                    </p>
                  </div>
                  <div className="p-4 border-b border-[var(--border)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Knowledge Base</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1">
                      {form.knowledgeBaseMode === 'all'
                        ? 'Full Knowledge Base'
                        : form.knowledgeBaseMode === 'specific'
                          ? `${form.knowledgeBaseDocumentIds?.length ?? 0} specific document${(form.knowledgeBaseDocumentIds?.length ?? 0) === 1 ? '' : 's'}`
                          : 'None'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Business Context</p>
                <p className="text-xs text-[var(--text-primary)]  whitespace-pre-wrap">
                  {form.businessContext?.trim() || 'No business context provided.'}
                </p>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-2 mt-2 flex flex-col-reverse gap-3 border-t border-[var(--border)] bg-[var(--bg-surface)]/95 px-2 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">{creating ? 'Ready to create?' : 'Ready to save changes?'}</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">You can update these settings later from Agent Studio.</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button type="button" onClick={closeForm} className="h-10 flex-1 rounded-[9px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-subtle)] sm:flex-none">Cancel</button>
              <button type="button" onClick={handleSave} disabled={!form.name.trim() || saveStatus === 'saving'} className={`h-10 flex-1 rounded-[9px] px-5 text-xs font-semibold text-white shadow-sm transition sm:flex-none disabled:cursor-not-allowed disabled:opacity-50 ${saveStatus === 'saved' ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
                <span className="inline-flex items-center justify-center gap-1.5">
                  {saveStatus === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saveStatus === 'saved' && <Check className="h-3.5 w-3.5" />}
                  {creating ? (saveStatus === 'saved' ? 'Created!' : saveStatus === 'saving' ? 'Creating…' : 'Create Agent') : (saveStatus === 'saved' ? 'Saved!' : saveStatus === 'saving' ? 'Saving…' : 'Save Changes')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </AgentFormFrame>
      )}}
    </PageShell>
  );
}
