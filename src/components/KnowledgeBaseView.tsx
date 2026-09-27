import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Trash2, Search, Loader2, Upload, FileText, Database, Sparkles, FileCheck2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Button from './ui/Button';
import Modal from './ui/Modal';
import KpiCard from './ui/KpiCard';

interface KnowledgeDocument { id: string; title: string; chunkCount: number; createdAt: string; }
interface SearchResult { content: string; documentTitle: string; }

export default function KnowledgeBaseView() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [testQuery, setTestQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    apiFetch('/api/knowledge/documents')
      .then(r => r.json())
      .then((list: KnowledgeDocument[]) => setDocuments(Array.isArray(list) ? list : []))
      .finally(() => { if (showSpinner) setLoading(false); });
  };

  useEffect(() => { loadDocuments(true); }, []);

  const handleAdd = async () => {
    if (!title.trim() || !text.trim()) return;
    setSaving(true);
    const res = await apiFetch('/api/knowledge/documents', { method: 'POST', body: JSON.stringify({ title: title.trim(), text }) });
    setSaving(false);
    if (res.ok) { setShowAdd(false); setTitle(''); setText(''); loadDocuments(); }
    else alert((await res.json()).error || 'Failed to add document');
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (title.trim()) formData.append('title', title.trim());
    const res = await apiFetch('/api/knowledge/documents/upload', { method: 'POST', body: formData });
    setUploading(false);
    if (res.ok) { setShowAdd(false); setTitle(''); setText(''); if (fileInputRef.current) fileInputRef.current.value = ''; loadDocuments(); }
    else alert((await res.json()).error || 'Failed to upload document');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    const res = await apiFetch(`/api/knowledge/documents/${id}`, { method: 'DELETE' });
    if (res.ok) setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;
    setSearching(true);
    setResults(null);
    const res = await apiFetch('/api/knowledge/search', { method: 'POST', body: JSON.stringify({ query: testQuery.trim() }) });
    setSearching(false);
    if (res.ok) setResults(await res.json());
    else setResults([]);
  };

  const filteredDocuments = useMemo(() => {
    const q = documentSearch.trim().toLowerCase();
    return q ? documents.filter(d => d.title.toLowerCase().includes(q)) : documents;
  }, [documents, documentSearch]);

  const totalChunks = useMemo(() => documents.reduce((sum, d) => sum + (d.chunkCount || 0), 0), [documents]);

  const closeAdd = () => {
    if (saving || uploading) return;
    setShowAdd(false); setTitle(''); setText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <PageShell
      title="Knowledge Base"
      subtitle="Manage the trusted information your AI agents can retrieve during calls and messages."
      action={<Button variant="primary" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>Add document</Button>}
      onRefresh={() => loadDocuments()}
    >
      {loading ? (
        <div className="col-span-12 flex min-h-[360px] items-center justify-center text-[var(--text-muted)]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading knowledge base…</div>
      ) : (
        <div className="col-span-12 space-y-5">
          <div className="grid grid-cols-12 gap-3 xl:gap-4">
            <KpiCard className="!col-span-12 sm:!col-span-6 xl:!col-span-4 min-h-[124px] lg:min-h-[136px] xl:min-h-[148px]" label="Knowledge sources" value={documents.length} sub="Documents available to agents" icon={FileText} iconBg="var(--bg-subtle)" iconColor="#2563eb" iconPosition="left" />
            <KpiCard className="!col-span-12 sm:!col-span-6 xl:!col-span-4 min-h-[124px] lg:min-h-[136px] xl:min-h-[148px]" label="Indexed chunks" value={totalChunks} sub="Searchable knowledge pieces" icon={Database} iconBg="var(--bg-subtle)" iconColor="#7c3aed" iconPosition="left" />
            <KpiCard className="!col-span-12 sm:!col-span-6 xl:!col-span-4 min-h-[124px] lg:min-h-[136px] xl:min-h-[148px]" label="Retrieval" value="Ready" sub="Agent retrieval is available" badge="LIVE" badgeColor="green" icon={Sparkles} iconBg="var(--bg-subtle)" iconColor="#059669" iconPosition="left" />
          </div>

          <div className="grid grid-cols-12 gap-4 xl:gap-5">
            {/* Knowledge sources */}
            <Widget colSpan={12} className="col-span-12 lg:col-span-7 min-h-0" title="Knowledge sources" subtitle="Documents available to your AI agents." icon={BookOpen} accent="#2563eb" padding="md">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input value={documentSearch} onChange={e => setDocumentSearch(e.target.value)} placeholder="Search documents…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] py-2.5 pl-9 pr-3 text-sm text-[var(--text)] outline-none focus:border-blue-400" />
                </div>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{filteredDocuments.length} of {documents.length}</span>
              </div>

              <div className="max-h-[min(55vh,560px)] space-y-2 overflow-auto pr-1">
                {filteredDocuments.length === 0 ? (
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] px-5 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><FileCheck2 className="h-5 w-5" /></div>
                    <p className="mt-3 text-sm font-semibold text-[var(--text)]">{documents.length ? 'No documents found' : 'Your knowledge base is empty'}</p>
                    <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">{documents.length ? 'Try another search term.' : 'Add a policy, FAQ, product guide, or other source your agent should know.'}</p>
                    {!documents.length && <Button className="mt-4" variant="primary" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>Add your first document</Button>}
                  </div>
                ) : filteredDocuments.map(d => (
                  <div key={d.id} className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 transition hover:border-blue-200 hover:bg-blue-50/30 dark:hover:border-blue-900/60 dark:hover:bg-blue-500/5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"><FileText className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{d.title}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{d.chunkCount} indexed chunk{d.chunkCount === 1 ? '' : 's'}{d.createdAt ? ` · Added ${new Date(d.createdAt).toLocaleDateString()}` : ''}</p>
                    </div>
                    <button type="button" aria-label={`Delete ${d.title}`} onClick={() => handleDelete(d.id)} className="rounded-lg p-2 text-[var(--text-muted)] opacity-70 transition hover:bg-rose-50 hover:text-rose-500 hover:opacity-100 dark:hover:bg-rose-950/20"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </Widget>

            {/* Retrieval playground */}
            <Widget colSpan={12} className="col-span-12 lg:col-span-5 min-h-0" title="Retrieval playground" subtitle="Preview the information your agent can retrieve for a question." icon={Sparkles} accent="#7c3aed" padding="md">
              <div className="rounded-2xl border border-violet-200/70 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/10 sm:p-4">
                <div className="mb-3 flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"><Search className="h-3.5 w-3.5" /></div>
                  <div><p className="text-xs font-semibold text-violet-800 dark:text-violet-300">Ask before you ship</p><p className="mt-0.5 text-[11px] text-violet-700/70 dark:text-violet-300/70">No call is required. This checks retrieval against your indexed documents.</p></div>
                </div>
                <div className="flex gap-2">
                  <input value={testQuery} onChange={e => setTestQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestSearch()} placeholder="e.g. What is our refund policy?" className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-violet-400 dark:border-violet-900/50" />
                  <Button variant="primary" size="sm" icon={searching ? Loader2 : Search} loading={searching} onClick={handleTestSearch} className="shrink-0">Test</Button>
                </div>
              </div>

              <div className="mt-4">
                {results === null ? (
                  <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] px-4 text-center">
                    <Sparkles className="h-5 w-5 text-[var(--text-muted)]" />
                    <p className="mt-2 text-xs font-medium text-[var(--text)]">No test run yet</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">Enter a question above to inspect retrieved context.</p>
                  </div>
                ) : results.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center"><Search className="mx-auto h-5 w-5 text-[var(--text-muted)]" /><p className="mt-2 text-xs font-semibold text-[var(--text)]">No matches found</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">Try a more specific question or add more source material.</p></div>
                ) : (
                  <div className="max-h-[min(45vh,440px)] space-y-2 overflow-auto pr-1">
                    {results.map((r, i) => (
                      <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                        <div className="mb-1.5 flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-violet-500" /><span className="truncate text-xs font-semibold text-[var(--text)]">{r.documentTitle}</span></div>
                        <p className="text-xs leading-5 text-[var(--text-secondary)]">{r.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Widget>
          </div>
        </div>
      )}

      <Modal open={showAdd} onClose={closeAdd} title="Add to knowledge base">
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200/70 bg-blue-50/50 p-3 dark:border-blue-900/40 dark:bg-blue-950/10">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Add a trusted source</p>
            <p className="mt-0.5 text-[11px] text-blue-700/70 dark:text-blue-300/70">Upload a supported file or paste the source text directly.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Title <span className="normal-case font-normal">(optional for file upload)</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-400" placeholder="e.g. Refund Policy" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Upload file</label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-300 bg-blue-50/40 px-5 py-7 text-center transition hover:bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/10 dark:hover:bg-blue-950/20">
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md" onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }} disabled={uploading} className="sr-only" />
              <Upload className="h-5 w-5 text-blue-500" />
              <span className="mt-2 text-xs font-semibold text-[var(--text)]">{uploading ? 'Extracting and indexing…' : 'Choose a file to upload'}</span>
              <span className="mt-1 text-[10px] text-[var(--text-muted)]">PDF, Word, Excel, CSV, TXT or Markdown</span>
            </label>
          </div>
          <div className="flex items-center gap-2"><div className="h-px flex-1 bg-[var(--border)]" /><span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">or paste text</span><div className="h-px flex-1 bg-[var(--border)]" /></div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={7} className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-400" placeholder="Paste policy, FAQ, product or process information here." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" icon={X} onClick={closeAdd} disabled={saving || uploading}>Cancel</Button>
            <Button variant="primary" size="sm" loading={saving} disabled={!title.trim() || !text.trim() || uploading} onClick={handleAdd}>Add text source</Button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}