import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCheck2,
  FileText,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Button from './ui/Button';
import Modal from './ui/Modal';
import KpiCard from './ui/KpiCard';
import Tooltip from './ui/Tooltip';
import SearchInput from './ui/SearchInput';

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
  const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(false);
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
    if (res.ok) {
      setShowAdd(false);
      setTitle('');
      setText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadDocuments();
    } else {
      alert((await res.json()).error || 'Failed to upload document');
    }
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
    setShowAdd(false);
    setTitle('');
    setText('');
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
        <div className="col-span-12 flex min-h-[420px] items-center justify-center text-sm text-[var(--text-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading knowledge base…
        </div>
      ) : (
        <div className="col-span-12 space-y-5">
          <div className="grid grid-cols-12 gap-4">
            <KpiCard className="!col-span-12 md:!col-span-4 min-h-[122px]" label="Knowledge sources" value={documents.length} sub="Documents available to agents" icon={FileText} iconBg="var(--bg-subtle)" iconColor="#2563eb" iconPosition="left" />
            <KpiCard className="!col-span-12 md:!col-span-4 min-h-[122px]" label="Indexed chunks" value={totalChunks} sub="Searchable knowledge pieces" icon={Database} iconBg="var(--bg-subtle)" iconColor="#7c3aed" iconPosition="left" />
            <KpiCard className="!col-span-12 md:!col-span-4 min-h-[122px]" label="Retrieval" value="Ready" sub="Agent retrieval is available" badge="LIVE" badgeColor="green" icon={Sparkles} iconBg="var(--bg-subtle)" iconColor="#059669" iconPosition="left" />
          </div>

          <section className="min-h-[560px] overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm">
            <div className="border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">Knowledge workspace</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Manage sources and test retrieval without leaving this page.</p>
                </div>
                <span className="hidden rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-muted)] sm:inline-flex">
                  {documents.length} source{documents.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div className="min-h-[500px] p-3 sm:p-4 xl:p-5">
              <div className="mb-3 flex items-center justify-between gap-3 rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 lg:hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500"><BookOpen className="h-4 w-4" /></div>
                  <div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--text-primary)]">Knowledge sources</p><p className="text-[10px] text-[var(--text-muted)]">{documents.length} source{documents.length === 1 ? "" : "s"}</p></div>
                </div>
                <button type="button" onClick={() => setIsSourcesCollapsed(prev => !prev)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-blue-400 hover:text-[var(--text-primary)]" aria-expanded={!isSourcesCollapsed}>
                  {isSourcesCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  {isSourcesCollapsed ? "Show sources" : "Hide sources"}
                </button>
              </div>
              <div className="grid min-h-[460px] grid-cols-12 gap-4 xl:gap-5">
              <div className={`${isSourcesCollapsed ? 'hidden lg:block lg:col-span-1' : 'lg:col-span-4'} col-span-12 min-w-0 transition-all duration-200`}>
                {isSourcesCollapsed ? (
                  <div className="flex h-full min-h-[480px] flex-col items-center rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)]/50 py-3">
                    <button
                      type="button"
                      onClick={() => setIsSourcesCollapsed(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-blue-400 hover:text-[var(--text-primary)]"
                      aria-label="Expand knowledge sources"
                      title="Expand knowledge sources"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <div className="my-3 h-px w-7 bg-[var(--border)]" />
                    <div className="flex min-h-0 w-full flex-col items-center gap-2 overflow-auto px-2">
                      {documents.map(document => (
                        <Tooltip key={document.id} side="right" label={`${document.title} · ${document.chunkCount} chunks`}>
                          <button
                            type="button"
                            onClick={() => { setIsSourcesCollapsed(false); setDocumentSearch(document.title); }}
                            className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-[var(--border)] bg-[var(--bg-surface)] transition hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
                            aria-label={document.title}
                          >
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Widget
                    colSpan={12}
                    responsive={false}
                    title="Knowledge sources"
                    subtitle="Documents available to your AI agents."
                    icon={BookOpen}
                    accent="#2563eb"
                    padding="none"
                    className="h-full !col-span-12"
                    action={
                      <button
                        type="button"
                        onClick={() => setIsSourcesCollapsed(true)}
                        className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] transition hover:border-blue-400 hover:text-[var(--text-primary)]"
                        aria-label="Collapse knowledge sources"
                        title="Collapse knowledge sources"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    }
                  >
                    <div className="flex min-h-[480px] flex-col">
                      <div className="border-b border-[var(--border)] p-4">
                        <SearchInput value={documentSearch} onChange={setDocumentSearch} placeholder="Search sources..." />
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">All sources</p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{filteredDocuments.length} visible</p>
                        </div>
                      </div>
                      <div className="space-y-2 overflow-auto px-3 pb-3">
                        {filteredDocuments.length === 0 ? (
                          <div className="flex min-h-52 flex-col items-center justify-center rounded-[9px] border border-dashed border-[var(--border)] px-4 text-center">
                            <div className="flex h-11 w-11 items-center justify-center rounded-[9px] bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                              <FileCheck2 className="h-5 w-5" />
                            </div>
                            <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{documents.length ? 'No documents found' : 'No sources yet'}</p>
                            <p className="mt-1 max-w-xs text-[11px] leading-4 text-[var(--text-muted)]">{documents.length ? 'Try another search term.' : 'Add a policy, FAQ, guide, or other trusted source.'}</p>
                          </div>
                        ) : filteredDocuments.map(d => (
                          <div key={d.id} className="group flex items-center gap-3 rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3 transition hover:border-blue-200 dark:hover:border-blue-900/60">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{d.title}</p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{d.chunkCount} indexed chunk{d.chunkCount === 1 ? '' : 's'}{d.createdAt ? ` · Added ${new Date(d.createdAt).toLocaleDateString()}` : ''}</p>
                            </div>
                            <button
                              type="button"
                              aria-label={`Delete ${d.title}`}
                              onClick={() => handleDelete(d.id)}
                              className="rounded-lg p-2 text-[var(--text-muted)] opacity-70 transition hover:bg-rose-50 hover:text-rose-500 hover:opacity-100 dark:hover:bg-rose-950/20"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Widget>
                )}
              </div>

              <div className={`${isSourcesCollapsed ? 'lg:col-span-11' : 'lg:col-span-8'} col-span-12 min-w-0 transition-all duration-200`}>
                <Widget
                  colSpan={12}
                  responsive={false}
                  title="Retrieval playground"
                  subtitle="Ask a question and inspect exactly what your agent can retrieve."
                  icon={Sparkles}
                  accent="#7c3aed"
                  padding="none"
                  className="h-full min-h-[480px] !col-span-12"
                >
                  <div className="p-4 sm:p-5">
                    <div className="rounded-[14px] border border-violet-200/70 bg-violet-50/40 p-4 dark:border-violet-900/40 dark:bg-violet-950/10">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-violet-100 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                          <Search className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-violet-900 dark:text-violet-300">Test retrieval before shipping</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-violet-700/70 dark:text-violet-300/70">This runs against your indexed knowledge only — no call is required.</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={testQuery}
                          onChange={e => setTestQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleTestSearch()}
                          placeholder="Ask something like “What is our refund policy?”"
                          className="min-w-0 flex-1 rounded-[9px] border border-violet-200 bg-[var(--bg-surface)] px-3.5 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-400 dark:border-violet-900/50"
                        />
                        <Button variant="primary" size="sm" icon={Search} loading={searching} disabled={!testQuery.trim()} onClick={handleTestSearch} className="sm:min-w-[92px]">
                          Test
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4">
                      {results === null ? (
                        <div className="flex min-h-[330px] flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-subtle)]/40 px-4 text-center">
                          <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[var(--bg-subtle)]">
                            <Sparkles className="h-5 w-5 text-[var(--text-muted)]" />
                          </div>
                          <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">Ready to test retrieval</p>
                          <p className="mt-1 max-w-sm text-[11px] leading-4 text-[var(--text-muted)]">Enter a question above to inspect the source context returned to your agent.</p>
                        </div>
                      ) : results.length === 0 ? (
                        <div className="flex min-h-[330px] flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-subtle)]/40 px-4 text-center">
                          <Search className="h-5 w-5 text-[var(--text-muted)]" />
                          <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">No matches found</p>
                          <p className="mt-1 max-w-sm text-[11px] leading-4 text-[var(--text-muted)]">Try a more specific question or add more source material.</p>
                        </div>
                      ) : (
                        <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                          {results.map((r, i) => (
                            <div key={i} className="rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5">
                              <div className="mb-1.5 flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-violet-500" />
                                <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{r.documentTitle}</span>
                              </div>
                              <p className="text-xs leading-5 text-[var(--text-secondary)]">{r.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Widget>
              </div>
              </div>
            </div>
          </section>
        </div>
      )}

      <Modal open={showAdd} onClose={closeAdd} title="Add to knowledge base">
        <div className="space-y-4">
          <div className="rounded-[9px] border border-blue-200/70 bg-blue-50/50 p-3 dark:border-blue-900/40 dark:bg-blue-950/10">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Add a trusted source</p>
            <p className="mt-0.5 text-[11px] text-blue-700/70 dark:text-blue-300/70">Upload a supported file or paste the source text directly.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Title <span className="normal-case font-normal">(optional for file upload)</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-blue-400" placeholder="e.g. Refund Policy" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Upload file</label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed border-blue-300 bg-blue-50/40 px-5 py-7 text-center transition hover:bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/10 dark:hover:bg-blue-950/20">
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md" onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }} disabled={uploading} className="sr-only" />
              <Upload className="h-5 w-5 text-blue-500" />
              <span className="mt-2 text-xs font-semibold text-[var(--text-primary)]">{uploading ? 'Extracting and indexing…' : 'Choose a file to upload'}</span>
              <span className="mt-1 text-[10px] text-[var(--text-muted)]">PDF, Word, Excel, CSV, TXT or Markdown</span>
            </label>
          </div>
          <div className="flex items-center gap-2"><div className="h-px flex-1 bg-[var(--border)]" /><span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">or paste text</span><div className="h-px flex-1 bg-[var(--border)]" /></div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={7} className="w-full resize-y rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-blue-400" placeholder="Paste policy, FAQ, product or process information here." />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" icon={X} onClick={closeAdd} disabled={saving || uploading}>Cancel</Button>
            <Button variant="primary" size="sm" loading={saving} disabled={!title.trim() || !text.trim() || uploading} onClick={handleAdd}>Add text source</Button>
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
