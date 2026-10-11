import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, Check, ChevronDown, ChevronRight, Cpu, Languages, Loader2, Plus, RotateCcw, Save, Search, ShieldCheck, Sparkles, Volume2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Widget from '../components/ui/Widget';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

type PromptSection = 'voice' | 'language' | 'system';
type SavedSection = 'voice' | 'language' | 'dialect' | 'system';

const requiredVoiceTokens = [
  '{{agent_name}}', '{{company_name}}', '{{industry}}', '{{language}}',
  '{{dialect}}', '{{dialect_profile}}', '{{dialect_examples}}', '{{business_context}}',
];
// Mirror the server's required post-call placeholders for immediate feedback.
// Server-side validation remains the source of truth when saving.
const requiredSystemTokens: Record<string, string[]> = {
  'sentiment-analyzer': ['{transcript}', '{workflowAnswers}'],
  'call-summarizer': ['{transcript}', '{workflowAnswers}', '{callerNow}'],
  'workflow-answer-extractor': ['{transcript}', '{questions}'],
  'follow-up-safety-net': ['{transcript}', '{callerNow}', '{sentiment}', '{summary}'],
};
const editorClass = 'min-h-52 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 font-mono text-xs leading-6 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] disabled:opacity-60';
const inputClass = 'h-10 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]';

function PromptState({ dirty, saved, busy, customized, idleLabel }: { dirty: boolean; saved: boolean; busy: boolean; customized?: boolean; idleLabel?: string }) {
  return <span role="status" className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${dirty ? 'text-amber-600 dark:text-amber-400' : saved ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'}`}>
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : saved ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
    {busy ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? 'Saved' : idleLabel || (customized ? 'Customized' : 'Platform default')}
  </span>;
}
function ItemStatus({ customized }: { customized: boolean }) {
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${customized ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'}`}>
    {customized ? 'Custom' : 'Default'}
  </span>;
}
function FieldTitle({ label, description, htmlFor }: { label: string; description?: string; htmlFor: string }) {
  return <div className="mb-2">
    <label htmlFor={htmlFor} className="text-xs font-semibold text-[var(--text-primary)]">{label}</label>
    {description && <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">{description}</p>}
  </div>;
}
type VoicePrompt = {
  callType: 'INBOUND' | 'OUTBOUND';
  prompt: string;
  defaultPrompt: string;
  isCustomized: boolean;
};

type SystemPrompt = {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  defaultSystemPrompt: string;
  isCustomized: boolean;
  tools: string[];
  runsOn: string;
};

type PromptPayload = {
  voice: VoicePrompt[];
  system: SystemPrompt[];
};

type LanguagePrompt = { id: string; language: string; prompt: string };
type DialectPrompt = { id: string; dialect: string; prompt: string; examples: string[] };
type LanguageDialectCatalog = {
  languages: LanguagePrompt[];
  dialectsByLanguage: Record<string, DialectPrompt[]>;
};

export default function PromptsPage() {
  const [data, setData] = useState<PromptPayload>({ voice: [], system: [] });
  const [section, setSection] = useState<PromptSection>('voice');
  const [systemSearch, setSystemSearch] = useState('');
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [showAddDialect, setShowAddDialect] = useState(false);
  const [newLanguage, setNewLanguage] = useState('');
  const [newDialect, setNewDialect] = useState('');
  const [adding, setAdding] = useState<'language' | 'dialect' | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeVoice, setActiveVoice] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [voiceDraft, setVoiceDraft] = useState('');
  const [systemDraft, setSystemDraft] = useState('');
  const [saving, setSaving] = useState<'voice' | 'system' | null>(null);
  const [saved, setSaved] = useState<SavedSection | null>(null);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<LanguageDialectCatalog>({ languages: [], dialectsByLanguage: {} });
  const [activeLanguage, setActiveLanguage] = useState('');
  const [activeDialect, setActiveDialect] = useState('');
  const [languageDraft, setLanguageDraft] = useState('');
  const [dialectDraft, setDialectDraft] = useState('');
  const [examplesDraft, setExamplesDraft] = useState('');
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [savingDialect, setSavingDialect] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [res, catalogRes] = await Promise.all([
        apiFetch('/api/platform/prompts'),
        apiFetch('/api/platform/prompts/languages-dialects'),
      ]);
      const body = await res.json();
      const catalogBody = await catalogRes.json();
      if (!catalogRes.ok) throw new Error(catalogBody?.error || 'Failed to load language and dialect prompts');
      if (!res.ok) throw new Error(body?.error || 'Failed to load prompts');
      const next: PromptPayload = {
        voice: Array.isArray(body.voice) ? body.voice : [],
        system: Array.isArray(body.system) ? body.system : [],
      };
      setData(next);
      const nextCatalog: LanguageDialectCatalog = {
        languages: Array.isArray(catalogBody.languages) ? catalogBody.languages : [],
        dialectsByLanguage: catalogBody.dialectsByLanguage || {},
      };
      setCatalog(nextCatalog);
      const firstLanguage = activeLanguage && nextCatalog.languages.some(x => x.language === activeLanguage)
        ? activeLanguage : nextCatalog.languages[0]?.language || '';
      const firstDialect = (nextCatalog.dialectsByLanguage[firstLanguage] || []).some(x => x.dialect === activeDialect)
        ? activeDialect : (nextCatalog.dialectsByLanguage[firstLanguage] || [])[0]?.dialect || '';
      setActiveLanguage(firstLanguage);
      setActiveDialect(firstDialect);
      setLanguageDraft(nextCatalog.languages.find(x => x.language === firstLanguage)?.prompt || '');
      setDialectDraft((nextCatalog.dialectsByLanguage[firstLanguage] || []).find(x => x.dialect === firstDialect)?.prompt || '');
      setExamplesDraft(((nextCatalog.dialectsByLanguage[firstLanguage] || []).find(x => x.dialect === firstDialect)?.examples || []).join('\n'));
      const voice = next.voice.find(p => p.callType === activeVoice);
      setVoiceDraft(voice?.prompt || '');
      const firstSystem = activeSystem && next.system.some(p => p.id === activeSystem)
        ? activeSystem
        : next.system[0]?.id || null;
      setActiveSystem(firstSystem);
      setSystemDraft(next.system.find(p => p.id === firstSystem)?.systemPrompt || '');
    } catch (e: any) {
      setError(e.message || 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const currentVoice = useMemo(
    () => data.voice.find(p => p.callType === activeVoice) || null,
    [data.voice, activeVoice]
  );
  const currentSystem = useMemo(
    () => data.system.find(p => p.id === activeSystem) || null,
    [data.system, activeSystem]
  );

  const currentLanguage = catalog.languages.find(x => x.language === activeLanguage) || null;
  const currentDialect = (catalog.dialectsByLanguage[activeLanguage] || []).find(x => x.dialect === activeDialect) || null;
  const voiceDirty = Boolean(currentVoice && voiceDraft !== currentVoice.prompt);
  const systemDirty = Boolean(currentSystem && systemDraft !== currentSystem.systemPrompt);
  const languageDirty = Boolean(currentLanguage && languageDraft !== currentLanguage.prompt);
  const dialectDirty = Boolean(currentDialect && (dialectDraft !== currentDialect.prompt || examplesDraft !== currentDialect.examples.join('\n')));
  const hasUnsavedChanges = voiceDirty || systemDirty || languageDirty || dialectDirty;
  const missingTokens = requiredVoiceTokens.filter(token => !voiceDraft.includes(token));
  const systemTokens = currentSystem ? (requiredSystemTokens[currentSystem.id] || []) : [];
  const missingSystemTokens = systemTokens.filter(token => !systemDraft.includes(token));
  const isBusy = Boolean(saving || savingLanguage || savingDialect || adding);
  const canLeave = () => !isBusy && (!hasUnsavedChanges || window.confirm('You have unsaved prompt changes. Discard them?'));
  const discardUnsavedDrafts = () => {
    setVoiceDraft(data.voice.find(p => p.callType === activeVoice)?.prompt || '');
    setSystemDraft(data.system.find(p => p.id === activeSystem)?.systemPrompt || '');
    setLanguageDraft(currentLanguage?.prompt || '');
    setDialectDraft(currentDialect?.prompt || '');
    setExamplesDraft(currentDialect?.examples.join('\n') || '');
    setSaved(null);
  };
  const changeSection = (next: PromptSection) => {
    if (next === section || !canLeave()) return;
    discardUnsavedDrafts();
    setSection(next);
  };

  const selectVoice = (type: 'INBOUND' | 'OUTBOUND') => {
    if (type === activeVoice || !canLeave()) return;
    discardUnsavedDrafts();
    setActiveVoice(type);
    setVoiceDraft(data.voice.find(p => p.callType === type)?.prompt || '');
    setSaved(null);
  };

  const selectSystem = (id: string) => {
    if (id === activeSystem || !canLeave()) return;
    discardUnsavedDrafts();
    setActiveSystem(id);
    setSystemDraft(data.system.find(p => p.id === id)?.systemPrompt || '');
    setSaved(null);
  };

  const saveVoice = async () => {
    if (!currentVoice || !voiceDirty || missingTokens.length || !voiceDraft.trim()) return;
    setSaving('voice'); setSaved(null); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/voice/${activeVoice}`, {
        method: 'PUT',
        body: JSON.stringify({ prompt: voiceDraft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save voice prompt');
      if (typeof body?.prompt !== 'string') throw new Error('The server returned an invalid voice prompt response.');
      setData(d => ({ ...d, voice: d.voice.map(p => p.callType === activeVoice ? body : p) }));
      setVoiceDraft(body.prompt);
      setSaved('voice');
    } catch (e: any) {
      setError(e.message || 'Failed to save voice prompt');
    } finally { setSaving(null); }
  };

  const resetVoice = async () => {
    if (!currentVoice || !confirm(`Reset the ${activeVoice.toLowerCase()} voice prompt to the platform default?`)) return;
    setSaving('voice'); setSaved(null); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/voice/${activeVoice}`, {
        method: 'PUT',
        body: JSON.stringify({ prompt: '' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to reset voice prompt');
      if (typeof body?.prompt !== 'string') throw new Error('The server returned an invalid voice prompt response.');
      setData(d => ({ ...d, voice: d.voice.map(p => p.callType === activeVoice ? body : p) }));
      setVoiceDraft(body.prompt);
      setSaved('voice');
    } catch (e: any) {
      setError(e.message || 'Failed to reset voice prompt');
    } finally { setSaving(null); }
  };

  const saveSystem = async () => {
    if (!currentSystem || !systemDirty || !systemDraft.trim() || missingSystemTokens.length) return;
    setSaving('system'); setSaved(null); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/system/${currentSystem.id}`, {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt: systemDraft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save system prompt');
      if (typeof body?.systemPrompt !== 'string') throw new Error('The server returned an invalid system prompt response.');
      setData(d => ({ ...d, system: d.system.map(p => p.id === currentSystem.id ? body : p) }));
      setSystemDraft(body.systemPrompt);
      setSaved('system');
    } catch (e: any) {
      setError(e.message || 'Failed to save system prompt');
    } finally { setSaving(null); }
  };

  const resetSystem = async () => {
    if (!currentSystem || !confirm(`Reset "${currentSystem.name}" to the platform default?`)) return;
    setSaving('system'); setSaved(null); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/system/${currentSystem.id}`, {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt: '' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to reset system prompt');
      if (typeof body?.systemPrompt !== 'string') throw new Error('The server returned an invalid system prompt response.');
      setData(d => ({ ...d, system: d.system.map(p => p.id === currentSystem.id ? body : p) }));
      setSystemDraft(body.systemPrompt);
      setSaved('system');
    } catch (e: any) {
      setError(e.message || 'Failed to reset system prompt');
    } finally { setSaving(null); }
  };



  const selectLanguage = (language: string) => {
    if (language === activeLanguage || !canLeave()) return;
    discardUnsavedDrafts();
    setActiveLanguage(language);
    const item = catalog.languages.find(x => x.language === language);
    const dialect = (catalog.dialectsByLanguage[language] || [])[0]?.dialect || '';
    setActiveDialect(dialect);
    setLanguageDraft(item?.prompt || '');
    const d = (catalog.dialectsByLanguage[language] || []).find(x => x.dialect === dialect);
    setDialectDraft(d?.prompt || '');
    setExamplesDraft((d?.examples || []).join('\n'));
    setSaved(null);
  };

  const selectDialect = (dialect: string) => {
    if (dialect === activeDialect || !canLeave()) return;
    discardUnsavedDrafts();
    setActiveDialect(dialect);
    const d = (catalog.dialectsByLanguage[activeLanguage] || []).find(x => x.dialect === dialect);
    setDialectDraft(d?.prompt || '');
    setExamplesDraft((d?.examples || []).join('\n'));
    setSaved(null);
  };

  const saveLanguage = async () => {
    if (!currentLanguage || !languageDirty || !languageDraft.trim()) return;
    setSavingLanguage(true); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/languages/${encodeURIComponent(activeLanguage)}`, {
        method: 'PUT', body: JSON.stringify({ prompt: languageDraft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save language prompt');
      setCatalog(body);
      setLanguageDraft(body.languages?.find((x: LanguagePrompt) => x.language === activeLanguage)?.prompt ?? languageDraft);
      setSaved('language');
    } catch (e: any) { setError(e.message || 'Failed to save language prompt'); }
    finally { setSavingLanguage(false); }
  };

  const saveDialect = async () => {
    if (!currentDialect || !dialectDirty) return;
    setSavingDialect(true); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/languages/${encodeURIComponent(activeLanguage)}/dialects/${encodeURIComponent(activeDialect)}`, {
        method: 'PUT',
        body: JSON.stringify({ prompt: dialectDraft, examples: examplesDraft.split('\n').map(x => x.trim()).filter(Boolean) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save dialect prompt');
      setCatalog(body);
      const updated = body.dialectsByLanguage?.[activeLanguage]?.find((x: DialectPrompt) => x.dialect === activeDialect);
      setDialectDraft(updated?.prompt ?? dialectDraft);
      setExamplesDraft((updated?.examples || examplesDraft.split('\n')).join('\n'));
      setSaved('dialect');
    } catch (e: any) { setError(e.message || 'Failed to save dialect prompt'); }
    finally { setSavingDialect(false); }
  };

  const addLanguage = async () => {
    const language = newLanguage.trim();
    if (!language || adding || !canLeave()) return;
    setAdding('language'); setError('');
    try {
      const res = await apiFetch('/api/platform/prompts/languages', {
        method: 'POST', body: JSON.stringify({ language }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to add language');
      discardUnsavedDrafts();
      setCatalog(body);
      setActiveLanguage(language);
      setLanguageDraft(body.languages?.find((x: LanguagePrompt) => x.language === language)?.prompt || '');
      setActiveDialect('');
      setDialectDraft('');
      setExamplesDraft('');
      setNewLanguage('');
      setShowAddLanguage(false);
      setSaved(null);
    } catch (e: any) { setError(e.message || 'Failed to add language'); }
    finally { setAdding(null); }
  };
  const addDialect = async () => {
    const dialect = newDialect.trim();
    if (!activeLanguage || !dialect || adding || !canLeave()) return;
    setAdding('dialect'); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/languages/${encodeURIComponent(activeLanguage)}/dialects`, {
        method: 'POST', body: JSON.stringify({ dialect, prompt: '' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to add dialect');
      discardUnsavedDrafts();
      setCatalog(body);
      const item = body.dialectsByLanguage?.[activeLanguage]?.find((x: DialectPrompt) => x.dialect === dialect);
      setActiveDialect(dialect);
      setDialectDraft(item?.prompt || '');
      setExamplesDraft((item?.examples || []).join('\n'));
      setNewDialect('');
      setShowAddDialect(false);
      setSaved(null);
    } catch (e: any) { setError(e.message || 'Failed to add dialect'); }
    finally { setAdding(null); }
  };

  if (loading) {
    return <div role="status" className="flex min-h-72 items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading platform prompts…
    </div>;
  }

  const systemList = data.system.filter(p => `${p.name} ${p.model} ${p.description}`.toLowerCase().includes(systemSearch.trim().toLowerCase()));
  const sectionOptions = [
    { id: 'voice' as const, label: 'Voice templates', icon: Volume2, count: data.voice.length },
    { id: 'language' as const, label: 'Languages & dialects', icon: Languages, count: catalog.languages.length },
    { id: 'system' as const, label: 'System agents', icon: Bot, count: data.system.length },
  ];
  const listButtonClass = (active: boolean) => `w-full min-w-0 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${active
    ? 'border-[var(--accent)]/30 bg-[var(--accent-subtle)] text-[var(--text-primary)]'
    : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'}`;

  return (
    <div className="space-y-4 pb-6">
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/5 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error"
            className="rounded-lg p-1 hover:bg-rose-500/10"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <Widget showHeader={false} padding="none" bodyOverflow="visible" className="!h-auto overflow-hidden">
        <nav aria-label="Prompt categories" className="flex min-w-0 gap-1.5 overflow-x-auto border-b border-[var(--border)] p-2.5 sm:p-3">
          {sectionOptions.map(({ id, label, icon: Icon, count }) => (
            <button key={id} type="button" aria-current={section === id ? 'page' : undefined}
              onClick={() => changeSection(id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${section === id
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'}`}>
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {label}
              <span className="rounded-md bg-[var(--bg-surface)]/80 px-1.5 py-0.5 text-[10px] tabular-nums">{count}</span>
            </button>
          ))}
        </nav>

        <div className="grid min-h-[420px] min-w-0 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside aria-label={section === 'voice' ? 'Voice templates' : section === 'system' ? 'System agent list' : 'Language list'}
            className="min-w-0 border-b border-[var(--border)] bg-[var(--bg-subtle)]/30 p-3 lg:border-b-0 lg:border-r">
            {section === 'voice' && (
              <>
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Call direction</p>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {data.voice.map(p => (
                    <button key={p.callType} type="button" aria-pressed={activeVoice === p.callType}
                      onClick={() => selectVoice(p.callType)} className={listButtonClass(activeVoice === p.callType)}>
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <Volume2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        {p.callType === 'INBOUND' ? 'Inbound calls' : 'Outbound calls'}
                        {activeVoice === p.callType && <ChevronRight aria-hidden="true" className="ml-auto h-3.5 w-3.5" />}
                      </span>
                      <span className="mt-2 block"><ItemStatus customized={p.isCustomized} /></span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {section === 'language' && (
              <>
                <div className="mb-2 flex items-center justify-between gap-2 px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Languages</p>
                  <button type="button" aria-label="Add language" title="Add language" onClick={() => { setShowAddLanguage(v => !v); setNewLanguage(''); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--accent)] transition-colors hover:bg-[var(--accent-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                    {showAddLanguage ? <X aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </div>
                {showAddLanguage && (
                  <form onSubmit={e => { e.preventDefault(); void addLanguage(); }}
                    className="mb-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-2.5">
                    <label htmlFor="new-prompt-language" className="text-[11px] font-semibold text-[var(--text-primary)]">New language name</label>
                    <input id="new-prompt-language" autoFocus value={newLanguage} onChange={e => setNewLanguage(e.target.value)} maxLength={80}
                      placeholder="e.g. Hindi" className={inputClass} />
                    <Button type="submit" variant="primary" size="sm" icon={Plus} loading={adding === 'language'}
                      disabled={!newLanguage.trim()} className="w-full justify-center">Create language</Button>
                  </form>
                )}
                <div className="max-h-80 space-y-1 overflow-y-auto lg:max-h-[540px]">
                  {catalog.languages.map(lang => (
                    <button key={lang.id} type="button" aria-pressed={activeLanguage === lang.language}
                      onClick={() => selectLanguage(lang.language)} className={listButtonClass(activeLanguage === lang.language)}>
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <Languages aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        <span className="min-w-0 flex-1 truncate">{lang.language}</span>
                        {activeLanguage === lang.language && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                      </span>
                      <span className="mt-1.5 block text-[11px] text-[var(--text-muted)]">
                        {(catalog.dialectsByLanguage[lang.language] || []).length} dialects
                      </span>
                    </button>
                  ))}
                  {!catalog.languages.length && <p className="px-2 py-6 text-xs text-[var(--text-muted)]">No languages yet.</p>}
                </div>
              </>
            )}
            {section === 'system' && (
              <>
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Post-call agents</p>
                <div className="relative mb-3">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
                  <input type="search" aria-label="Search system agents" value={systemSearch} onChange={e => setSystemSearch(e.target.value)}
                    placeholder="Search agents…" className={inputClass + ' pl-9'} />
                </div>
                <div className="max-h-80 space-y-1 overflow-y-auto lg:max-h-[540px]">
                  {systemList.map(p => (
                    <button key={p.id} type="button" aria-pressed={activeSystem === p.id}
                      onClick={() => selectSystem(p.id)} className={listButtonClass(activeSystem === p.id)}>
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <Cpu aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      </span>
                      <span className="mt-1.5 block truncate text-[11px] text-[var(--text-muted)]">{p.model}</span>
                      <span className="mt-2 block"><ItemStatus customized={p.isCustomized} /></span>
                    </button>
                  ))}
                  {!systemList.length && <p className="px-2 py-6 text-xs text-[var(--text-muted)]">No matching system agents.</p>}
                </div>
              </>
            )}
          </aside>

          <div className="min-w-0 space-y-5 p-4 sm:p-5">
            {section === 'voice' && (currentVoice ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{activeVoice === 'INBOUND' ? 'Inbound' : 'Outbound'} voice master prompt</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Base instructions used when generating new voice-agent prompts.</p>
                  </div>
                  <PromptState dirty={voiceDirty} saved={saved === 'voice'} busy={saving === 'voice'} customized={currentVoice.isCustomized} />
                </div>
                <div>
                  <FieldTitle htmlFor="voice-prompt-editor" label="Prompt instructions"
                    description="Edit the text below. Preserve all required variables so generation can insert the right agent, company and language." />
                  <textarea id="voice-prompt-editor" spellCheck={false} value={voiceDraft} onChange={e => { setVoiceDraft(e.target.value); setSaved(null); }}
                    className={editorClass + ' min-h-[350px]'} />
                  <p className="mt-1 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{voiceDraft.length.toLocaleString()} characters</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-3.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
                    <h4 className="text-xs font-semibold text-[var(--text-primary)]">Required variables</h4>
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">{requiredVoiceTokens.length - missingTokens.length}/{requiredVoiceTokens.length} present</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {requiredVoiceTokens.map(token => (
                      <code key={token} className={`rounded-md border px-2 py-1 text-[10px] ${missingTokens.includes(token)
                        ? 'border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}>{token}</code>
                    ))}
                  </div>
                  {missingTokens.length > 0 && <p role="alert" className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">
                    Restore the missing variables before saving.
                  </p>}
                </div>
                <details key={activeVoice} className="group rounded-xl border border-[var(--border)]">
                  <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]">
                    <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /> Compare with platform default
                  </summary>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4 font-mono text-[11px] leading-5 text-[var(--text-secondary)]">{currentVoice.defaultPrompt}</pre>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
                  <Button type="button" variant="secondary" size="sm" icon={RotateCcw} disabled={Boolean(saving) || (!currentVoice.isCustomized && !voiceDirty)}
                    onClick={() => void resetVoice()}>Restore default</Button>
                  <Button type="button" variant="primary" size="sm" icon={Save} loading={saving === 'voice'}
                    disabled={Boolean(saving) || !voiceDirty || missingTokens.length > 0 || !voiceDraft.trim()}
                    onClick={() => void saveVoice()}>Save voice prompt</Button>
                </div>
              </>
            ) : <EmptyState icon={Volume2} heading="No voice prompts" message="Voice prompt templates have not been configured." />)}

            {section === 'language' && (currentLanguage ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{activeLanguage} language guidance</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Guidance shared by agents speaking this language.</p>
                  </div>
                  <PromptState dirty={languageDirty} saved={saved === 'language'} busy={savingLanguage} idleLabel="Up to date" />
                </div>
                <div>
                  <FieldTitle htmlFor="language-prompt-editor" label="Language prompt"
                    description="Use {{language}} to insert the selected language dynamically." />
                  <textarea id="language-prompt-editor" value={languageDraft} onChange={e => { setLanguageDraft(e.target.value); setSaved(null); }}
                    className={editorClass + ' min-h-36'} />
                  <div className="mt-3 flex justify-end">
                    <Button type="button" variant="primary" size="sm" icon={Save} loading={savingLanguage}
                      disabled={!languageDirty || !languageDraft.trim() || savingLanguage || savingDialect}
                      onClick={() => void saveLanguage()}>Save language</Button>
                  </div>
                </div>

                <div className="border-t border-[var(--border)] pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">Dialect-specific guidance</h4>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Adjust regional phrasing, vocabulary and examples.</p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" icon={showAddDialect ? X : Plus}
                      onClick={() => { setShowAddDialect(v => !v); setNewDialect(''); }}>
                      {showAddDialect ? 'Cancel' : 'Add dialect'}
                    </Button>
                  </div>
                  {showAddDialect && (
                    <form onSubmit={e => { e.preventDefault(); void addDialect(); }}
                      className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-3 sm:flex-row sm:items-end">
                      <label htmlFor="new-prompt-dialect" className="min-w-0 flex-1 text-xs font-semibold text-[var(--text-secondary)]">
                        Dialect name
                        <input id="new-prompt-dialect" autoFocus value={newDialect} onChange={e => setNewDialect(e.target.value)}
                          maxLength={80} placeholder="e.g. Mumbai Hindi" className={inputClass + ' mt-1.5'} />
                      </label>
                      <Button type="submit" variant="primary" size="sm" icon={Plus} loading={adding === 'dialect'}
                        disabled={!newDialect.trim()}>Create dialect</Button>
                    </form>
                  )}
                  <label htmlFor="prompt-dialect-selector" className="mt-4 block text-xs font-semibold text-[var(--text-primary)]">Selected dialect</label>
                  <select id="prompt-dialect-selector" value={activeDialect} onChange={e => selectDialect(e.target.value)}
                    className={inputClass + ' mt-2'}>
                    {!activeDialect && <option value="">Select a dialect</option>}
                    {(catalog.dialectsByLanguage[activeLanguage] || []).map(d => <option key={d.id} value={d.dialect}>{d.dialect}</option>)}
                  </select>

                  {currentDialect ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <FieldTitle htmlFor="dialect-prompt-editor" label="Dialect instructions" description="Speech rules and regional vocabulary for this dialect." />
                        <textarea id="dialect-prompt-editor" value={dialectDraft} onChange={e => { setDialectDraft(e.target.value); setSaved(null); }}
                          className={editorClass + ' min-h-36'} />
                      </div>
                      <div>
                        <FieldTitle htmlFor="dialect-examples-editor" label="Natural phrasing examples" description="One example per line. These examples are included with the dialect instructions." />
                        <textarea id="dialect-examples-editor" value={examplesDraft} onChange={e => { setExamplesDraft(e.target.value); setSaved(null); }}
                          className={editorClass + ' min-h-28'} />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <PromptState dirty={dialectDirty} saved={saved === 'dialect'} busy={savingDialect} idleLabel="Up to date" />
                        <Button type="button" variant="primary" size="sm" icon={Save} loading={savingDialect}
                          disabled={!dialectDirty || savingLanguage || savingDialect}
                          onClick={() => void saveDialect()}>Save dialect</Button>
                      </div>
                    </div>
                  ) : <div className="mt-4"><EmptyState icon={Languages} heading="No dialect selected" message="Add a dialect to configure regional speech instructions." className="rounded-xl border border-dashed border-[var(--border)] !py-9" /></div>}
                </div>
              </>
            ) : <EmptyState icon={Languages} heading="No language selected" message="Choose or add a language to get started." />)}

            {section === 'system' && (currentSystem ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{currentSystem.name}</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{currentSystem.description}</p>
                  </div>
                  <PromptState dirty={systemDirty} saved={saved === 'system'} busy={saving === 'system'} customized={currentSystem.isCustomized} />
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5"><Cpu aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />{currentSystem.model}</span>
                  <span className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5"><Sparkles aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />Runs: {currentSystem.runsOn}</span>
                  {!!currentSystem.tools.length && <span className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5">{currentSystem.tools.length} tools available</span>}
                </div>
                <div>
                  <FieldTitle htmlFor="system-prompt-editor" label="System instructions" description="Platform-level instructions for this post-call agent. Organization overrides still take precedence." />
                  <textarea id="system-prompt-editor" spellCheck={false} value={systemDraft} onChange={e => { setSystemDraft(e.target.value); setSaved(null); }}
                    className={editorClass + ' min-h-[350px]'} />
                  <p className="mt-1 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{systemDraft.length.toLocaleString()} characters</p>
                </div>
                {systemTokens.length > 0 && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">Required input variables</h4>
                      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{systemTokens.length - missingSystemTokens.length}/{systemTokens.length} present</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {systemTokens.map(token => (
                        <code key={token} className={`rounded-md border px-2 py-1 text-[10px] ${missingSystemTokens.includes(token)
                          ? 'border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                          : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}>{token}</code>
                      ))}
                    </div>
                    {!!missingSystemTokens.length && <p role="alert" className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">Restore missing variables before saving this agent's instructions.</p>}
                  </div>
                )}
                <details key={currentSystem.id} className="group rounded-xl border border-[var(--border)]">
                  <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]">
                    <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /> Compare with platform default
                  </summary>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4 font-mono text-[11px] leading-5 text-[var(--text-secondary)]">{currentSystem.defaultSystemPrompt}</pre>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
                  <Button type="button" variant="secondary" size="sm" icon={RotateCcw} disabled={Boolean(saving) || (!currentSystem.isCustomized && !systemDirty)}
                    onClick={() => void resetSystem()}>Restore default</Button>
                  <Button type="button" variant="primary" size="sm" icon={Save} loading={saving === 'system'}
                    disabled={Boolean(saving) || !systemDirty || !systemDraft.trim() || missingSystemTokens.length > 0}
                    onClick={() => void saveSystem()}>Save system prompt</Button>
                </div>
              </>
            ) : <EmptyState icon={Bot} heading="No system prompts" message="No system agents are configured." />)}
          </div>
        </div>
      </Widget>
    </div>
  );
}
