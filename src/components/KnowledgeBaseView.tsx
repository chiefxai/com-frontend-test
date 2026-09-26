import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, Trash2, Search, Loader2, Upload, FileText, Database, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Button from './ui/Button';
import Modal from './ui/Modal';
import IconButton from './ui/IconButton';

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
    const res = await apiFetch('/api/knowledge/documents', { method: 'POST', body: JSON.stringify({ title, text }) });
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
    const res = await apiFetch('/api/knowledge/search', { method: 'POST', body: JSON.stringify({ query: testQuery }) });
    setSearching(false);
    if (res.ok) setResults(await res.json());
  };

  return (
    <PageShell
      title="Knowledge Base"
      subtitle="Give your AI agents trusted information they can retrieve during calls and messages."
      action={<Button variant="primary" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>Add Document</Button>}
      onRefresh={() => loadDocuments()}
    >
      {loading ? (
        <div className="col-span-12 flex items-center justify-center py-20 text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
      <>
      {/* Documents list */}
      <Widget colSpan={12} className="lg:col-span-7 min-h-0" title="Documents" subtitle="Facts your AI agent can reference during conversations." icon={BookOpen} accent="#2563eb" padding="md">
        {documents.length === 0 && <p className="text-xs text-slate-400 mb-2">No documents yet. Add one to give your agent real facts to answer from.</p>}
        <div className="space-y-2 max-h-[min(52vh,520px)] overflow-auto pr-1">
          {documents.map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-3">
              <div>
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">{d.title}</div>
                <div className="text-[10px] text-slate-400">{d.chunkCount} chunk{d.chunkCount === 1 ? '' : 's'}</div>
              </div>
              <button onClick={() => handleDelete(d.id)} className="text-slate-300 hover:text-rose-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Widget>

      {/* Test search */}
      <Widget colSpan={12} className="lg:col-span-5 min-h-0" title="Test Search" subtitle="See exactly what your agent would retrieve for a question." icon={Search} accent="#7c3aed" padding="md">
        <p className="text-[11px] text-slate-400 mb-3">No real call or message needed — just type a question to preview retrieval.</p>
        <div className="flex flex-col gap-2 mb-4 sm:flex-row">
          <input
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTestSearch()}
            placeholder="Ask a question…"
            className="min-w-0 flex-1 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-violet-400"
          />
          <Button variant="primary" size="sm" icon={searching ? Loader2 : Search} loading={searching} onClick={handleTestSearch} className="w-full justify-center sm:w-auto">Search</Button>
        </div>
        {results && (
          results.length === 0
            ? <p className="text-xs text-slate-400">No matches found.</p>
            : (
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div key={i} className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-indigo-700 mb-1">{r.documentTitle}</div>
                    <div className="text-indigo-900">{r.content}</div>
                  </div>
                ))}
              </div>
            )
        )}
      </Widget>
      </>
      )}

      {/* Add document modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Document">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Title <span className="normal-case text-slate-400 font-normal">(optional for file upload)</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Refund Policy" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Upload a file</label>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md"
              onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); }}
              disabled={uploading}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-xs file:font-semibold hover:file:bg-indigo-100 cursor-pointer disabled:opacity-60"
            />
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
              {uploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Extracting and indexing…</> : <><Upload className="h-3 w-3" /> PDF, Word, Excel, CSV, TXT, or Markdown</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] text-slate-400 uppercase font-semibold">or paste text</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="Paste the document text here." />
          <Button variant="primary" loading={saving} disabled={!title.trim() || !text.trim()} onClick={handleAdd} className="w-full justify-center">
            Add to Knowledge Base
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
}
