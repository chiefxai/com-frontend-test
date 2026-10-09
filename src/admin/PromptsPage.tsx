import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Cpu, Loader2, RotateCcw, Save, Sparkles, Volume2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Widget from '../components/ui/Widget';

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
  const [loading, setLoading] = useState(true);
  const [activeVoice, setActiveVoice] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [voiceDraft, setVoiceDraft] = useState('');
  const [systemDraft, setSystemDraft] = useState('');
  const [saving, setSaving] = useState<'voice' | 'system' | null>(null);
  const [saved, setSaved] = useState<'voice' | 'system' | null>(null);
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

  const selectVoice = (type: 'INBOUND' | 'OUTBOUND') => {
    setActiveVoice(type);
    setVoiceDraft(data.voice.find(p => p.callType === type)?.prompt || '');
    setSaved(null);
  };

  const selectSystem = (id: string) => {
    setActiveSystem(id);
    setSystemDraft(data.system.find(p => p.id === id)?.systemPrompt || '');
    setSaved(null);
  };

  const saveVoice = async () => {
    if (!currentVoice) return;
    setSaving('voice'); setSaved(null); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/voice/${activeVoice}`, {
        method: 'PUT',
        body: JSON.stringify({ prompt: voiceDraft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save voice prompt');
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
      setData(d => ({ ...d, voice: d.voice.map(p => p.callType === activeVoice ? body : p) }));
      setVoiceDraft(body.prompt);
      setSaved('voice');
    } catch (e: any) {
      setError(e.message || 'Failed to reset voice prompt');
    } finally { setSaving(null); }
  };

  const saveSystem = async () => {
    if (!currentSystem) return;
    setSaving('system'); setSaved(null); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/system/${currentSystem.id}`, {
        method: 'PUT',
        body: JSON.stringify({ systemPrompt: systemDraft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save system prompt');
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
      setData(d => ({ ...d, system: d.system.map(p => p.id === currentSystem.id ? body : p) }));
      setSystemDraft(body.systemPrompt);
      setSaved('system');
    } catch (e: any) {
      setError(e.message || 'Failed to reset system prompt');
    } finally { setSaving(null); }
  };



  const currentLanguage = catalog.languages.find(x => x.language === activeLanguage) || null;
  const currentDialect = (catalog.dialectsByLanguage[activeLanguage] || []).find(x => x.dialect === activeDialect) || null;

  const selectLanguage = (language: string) => {
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
    setActiveDialect(dialect);
    const d = (catalog.dialectsByLanguage[activeLanguage] || []).find(x => x.dialect === dialect);
    setDialectDraft(d?.prompt || '');
    setExamplesDraft((d?.examples || []).join('\n'));
    setSaved(null);
  };

  const saveLanguage = async () => {
    if (!currentLanguage) return;
    setSavingLanguage(true); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/languages/${encodeURIComponent(activeLanguage)}`, {
        method: 'PUT', body: JSON.stringify({ prompt: languageDraft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save language prompt');
      setCatalog(body); setSaved('voice');
    } catch (e: any) { setError(e.message || 'Failed to save language prompt'); }
    finally { setSavingLanguage(false); }
  };

  const saveDialect = async () => {
    if (!currentDialect) return;
    setSavingDialect(true); setError('');
    try {
      const res = await apiFetch(`/api/platform/prompts/languages/${encodeURIComponent(activeLanguage)}/dialects/${encodeURIComponent(activeDialect)}`, {
        method: 'PUT',
        body: JSON.stringify({ prompt: dialectDraft, examples: examplesDraft.split('\n').map(x => x.trim()).filter(Boolean) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save dialect prompt');
      setCatalog(body); setSaved('voice');
    } catch (e: any) { setError(e.message || 'Failed to save dialect prompt'); }
    finally { setSavingDialect(false); }
  };

  const addLanguage = async () => {
    const language = prompt('New language name');
    if (!language?.trim()) return;
    try {
      const res = await apiFetch('/api/platform/prompts/languages', {
        method: 'POST', body: JSON.stringify({ language: language.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to add language');
      setCatalog(body); selectLanguage(language.trim());
    } catch (e: any) { setError(e.message || 'Failed to add language'); }
  };

  const addDialect = async () => {
    if (!activeLanguage) return;
    const dialect = prompt(`New dialect for ${activeLanguage}`);
    if (!dialect?.trim()) return;
    try {
      const res = await apiFetch(`/api/platform/prompts/languages/${encodeURIComponent(activeLanguage)}/dialects`, {
        method: 'POST', body: JSON.stringify({ dialect: dialect.trim(), prompt: '' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to add dialect');
      setCatalog(body); selectDialect(dialect.trim());
    } catch (e: any) { setError(e.message || 'Failed to add dialect'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading prompts…</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Widget title="Voice agent master prompts" subtitle="These are the two platform-level templates used when generating voice-agent prompts. Existing agents keep their saved prompt until updated.">
        <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl lg:flex-row">
          <div className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] dark:border-[var(--border)] p-2">
            {data.voice.map(p => (
              <button key={p.callType} onClick={() => selectVoice(p.callType)}
                className={`w-full text-left px-3 py-3 rounded-xl text-sm font-medium mb-1 ${activeVoice === p.callType ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                <div className="flex items-center gap-2"><Volume2 className="h-4 w-4" /> {p.callType}</div>
                <div className={`text-[10px] mt-1 ${activeVoice === p.callType ? 'text-slate-300' : 'text-[var(--text-muted)]'}`}>
                  {p.isCustomized ? 'Customized' : 'Default template'}
                </div>
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">Voice prompt · {activeVoice}</div>
                <div className="text-[11px] text-[var(--text-muted)]">Keep the required <code>{'{{...}}'}</code> placeholders intact.</div>
              </div>
              <button onClick={resetVoice} disabled={saving === 'voice'} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
            <textarea value={voiceDraft} onChange={e => setVoiceDraft(e.target.value)} className="w-full min-h-[460px] resize-y rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-xs font-mono leading-5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
            <div className="flex items-center justify-end gap-3 mt-3">
              {saved === 'voice' && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> Saved</span>}
              <button onClick={saveVoice} disabled={saving === 'voice'} className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                {saving === 'voice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save prompt
              </button>
            </div>
          </div>
        </div>
      </Widget>



      <Widget title="Language & dialect prompts" subtitle="Manage language and dialect guidance from the admin panel. New languages and dialects are stored in the platform settings, so Agent Studio can support them without a code deployment.">
        <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl lg:flex-row">
          <div className="lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] dark:border-[var(--border)] p-2">
            <div className="flex items-center justify-between px-2 py-1 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Languages</span>
              <button onClick={addLanguage} className="text-[11px] font-semibold text-amber-600 hover:text-amber-700">+ Add</button>
            </div>
            {catalog.languages.map(lang => (
              <button key={lang.language} onClick={() => selectLanguage(lang.language)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm mb-1 ${activeLanguage === lang.language ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-[var(--bg-subtle)]'}`}>
                {lang.language}
              </button>
            ))}
          </div>
          <div className="flex-1 p-5 space-y-6">
            {currentLanguage ? <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Language prompt · {activeLanguage}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Use {'{{language}}'} when the language name should be inserted dynamically.</div>
                  </div>
                  <button onClick={saveLanguage} disabled={savingLanguage} className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
                    {savingLanguage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save language
                  </button>
                </div>
                <textarea value={languageDraft} onChange={e => setLanguageDraft(e.target.value)} className="w-full h-28 resize-none rounded-2xl border border-[var(--border)] dark:border-[var(--border)] bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] px-4 py-3 text-xs font-mono leading-5 text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
              </div>

              <div className="border-t border-[var(--border)] dark:border-[var(--border)] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Dialect prompt</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Speech, vocabulary, regional rules and examples for the selected dialect.</div>
                  </div>
                  <button onClick={addDialect} className="text-[11px] font-semibold text-amber-600 hover:text-amber-700">+ Add dialect</button>
                </div>
                <select value={activeDialect} onChange={e => selectDialect(e.target.value)} className="w-full mb-2 rounded-2xl border border-[var(--border)] dark:border-[var(--border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  {!activeDialect && <option value="">No dialect configured</option>}
                  {(catalog.dialectsByLanguage[activeLanguage] || []).map(d => <option key={d.dialect} value={d.dialect}>{d.dialect}</option>)}
                </select>
                {currentDialect ? <>
                  <textarea value={dialectDraft} onChange={e => setDialectDraft(e.target.value)} className="w-full h-36 resize-none rounded-2xl border border-[var(--border)] dark:border-[var(--border)] bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] px-4 py-3 text-xs font-mono leading-5 text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Natural phrasing examples · one per line</div>
                    <textarea value={examplesDraft} onChange={e => setExamplesDraft(e.target.value)} className="w-full h-24 resize-none rounded-2xl border border-[var(--border)] dark:border-[var(--border)] bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] px-4 py-3 text-xs font-mono leading-5 text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <div className="flex justify-end mt-3">
                    <button onClick={saveDialect} disabled={savingDialect} className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                      {savingDialect ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save dialect
                    </button>
                  </div>
                </> : <div className="rounded-2xl border border-dashed border-[var(--border)] dark:border-[var(--border)] p-8 text-center text-xs text-[var(--text-muted)]">Add a dialect to configure dialect-specific speech guidance.</div>}
              </div>
            </> : <div className="p-10 text-center text-xs text-[var(--text-muted)]">No languages configured.</div>}
          </div>
        </div>
      </Widget>

      <Widget title="System / post-call agent prompts" subtitle="Global defaults for the built-in agents that analyze completed calls. Organization-level overrides still take precedence.">
        <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl lg:flex-row">
          <div className="lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border)] dark:border-[var(--border)] p-2 max-h-[540px] overflow-y-auto">
            {data.system.map(p => (
              <button key={p.id} onClick={() => selectSystem(p.id)}
                className={`w-full text-left px-3 py-3 rounded-xl mb-1 ${activeSystem === p.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                <div className="flex items-center gap-2 text-sm font-medium"><Cpu className="h-4 w-4" /> {p.name}</div>
                <div className={`text-[10px] mt-1 ${activeSystem === p.id ? 'text-slate-300' : 'text-[var(--text-muted)]'}`}>{p.model}</div>
                {p.isCustomized && <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${activeSystem === p.id ? 'bg-slate-700 text-white' : 'bg-amber-100 text-amber-700'}`}>CUSTOMIZED</span>}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 p-6>
            {currentSystem && <>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{currentSystem.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{currentSystem.description}</div>
                </div>
                <button onClick={resetSystem} disabled={saving === 'system'} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-3"><Sparkles className="h-3.5 w-3.5" /> Runs: {currentSystem.runsOn}</div>
              <textarea value={systemDraft} onChange={e => setSystemDraft(e.target.value)} className="w-full min-h-[460px] resize-y rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-xs font-mono leading-5 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <div className="flex items-center justify-end gap-3 mt-3">
                {saved === 'system' && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> Saved</span>}
                <button onClick={saveSystem} disabled={saving === 'system'} className="flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                  {saving === 'system' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save prompt
                </button>
              </div>
            </>}
          </div>
        </div>
      </Widget>

      <div className="text-[10px] text-[var(--text-muted)]">
        <ChevronDown className="inline h-3 w-3 mr-1" /> Platform prompt changes are audited server-side. Validate placeholders before saving.
      </div>
    </div>
  );
}
