import React from 'react';
import { Phone, Mail, Tag, FileText, Calendar, Check } from 'lucide-react';
import { Lead, PipelineStageLabel } from '../../types';
import { formatPhone } from '../../lib/phone';
import { stageLabel } from '../../lib/pipelineStages';
import { apiFetch } from '../../lib/api';
import SlideOver from './SlideOver';
import Badge from './Badge';

const STAGE_COLOR: Record<string, 'blue' | 'amber' | 'green' | 'slate' | 'indigo'> = {
  contact: 'slate', campaign: 'blue', lead: 'indigo', opportunity: 'amber', client: 'green',
};

interface ContactDetailsSlideOverProps {
  lead: Lead | null;
  onClose: () => void;
  stages: PipelineStageLabel[];
  /** Page-specific action buttons (e.g. "Advance to Opportunity") rendered below the details. */
  actions?: React.ReactNode;
  /**
   * The lead's most recent call with extracted workflow answers, if any —
   * pass the callId from that dialer task's callResults (same source
   * DialerSimulator's "Workflow View" reads from). When set, this panel
   * fetches and shows the same "Extracted Campaign Answers" the Active
   * Campaign List's Workflow View shows for this lead, so Leads/Pipeline
   * don't need to duplicate that fetch+render themselves.
   */
  callId?: string | null;
}

interface ExtractedAnswerRow { label: string; dataType?: string; answer: string }

// Common right-sidebar contact detail view — shared by LeadsView and
// PipelineView (and anywhere else that needs "click a row, see the full
// contact" without duplicating this panel). Read-only: editing a contact
// stays in Contact Directory, which already owns that flow.
export default function ContactDetailsSlideOver({ lead, onClose, stages, actions, callId }: ContactDetailsSlideOverProps) {
  const [answerRows, setAnswerRows] = React.useState<ExtractedAnswerRow[]>([]);

  React.useEffect(() => {
    if (!callId) { setAnswerRows([]); return; }
    let cancelled = false;
    apiFetch(`/api/calls/${encodeURIComponent(callId)}/lead-responses`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { label?: string; question: string; answer: string; dataType?: string | null }[] | null) => {
        if (cancelled) return;
        setAnswerRows(
          (rows || [])
            .filter((row) => row.label && row.answer)
            .map((row) => ({ label: row.label as string, dataType: row.dataType || undefined, answer: row.answer }))
        );
      })
      .catch(() => { if (!cancelled) setAnswerRows([]); });
    return () => { cancelled = true; };
  }, [callId]);

  return (
    <SlideOver
      open={!!lead}
      onClose={onClose}
      title={lead?.name}
      subtitle={lead ? `Contact since ${new Date(lead.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
      maxWidth="max-w-lg"
    >
      {lead && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Badge color={STAGE_COLOR[lead.pipelineStage || 'contact']}>{stageLabel(stages, lead.pipelineStage)}</Badge>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-slate-500 font-medium">{lead.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Phone</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Phone className="h-3.5 w-3.5 text-slate-400" /> {formatPhone(lead.phone) || lead.phone}</p>
            </div>
            <div className="rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Email</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 truncate"><Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {lead.email || '—'}</p>
            </div>
            <div className="rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Source</p>
              <p className="text-sm font-semibold text-slate-700">{lead.source || '—'}</p>
            </div>
            <div className="rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>AI Score</p>
              <p className="text-sm font-semibold text-slate-700">{lead.score ?? '—'}</p>
            </div>
          </div>

          {lead.amountRequested > 0 && (
            <div className="rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Amount Requested</p>
              <p className="text-sm font-semibold text-slate-700">${lead.amountRequested.toLocaleString()}</p>
            </div>
          )}

          {lead.financialInfo && (lead.financialInfo.employer || lead.financialInfo.monthlyIncome > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Employer</p>
                <p className="text-sm font-semibold text-slate-700">{lead.financialInfo.employer || '—'}</p>
              </div>
              <div className="rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Monthly Income</p>
                <p className="text-sm font-semibold text-slate-700">${(lead.financialInfo.monthlyIncome || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          {answerRows.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Check className="h-3 w-3 text-emerald-500" /> Extracted Campaign Answers
              </p>
              <div className="space-y-2">
                {answerRows.map((row, i) => (
                  <div key={i} className="p-2.5 rounded-[9px] border space-y-1.5" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{row.label}</span>
                      {row.dataType && (
                        <span className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded border shrink-0" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                          {row.dataType}
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg px-2.5 py-2 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      <div className="text-emerald-600 flex items-start gap-1.5 text-xs">
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <p style={{ color: 'var(--text-primary)' }}>{row.answer}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lead.tags?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <Tag className="h-3 w-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 text-[10px] bg-indigo-50 border border-indigo-200 rounded text-indigo-600 font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {lead.notes && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <FileText className="h-3 w-3" /> Notes
              </p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-[9px] p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>{lead.notes}</p>
            </div>
          )}

          <p className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Calendar className="h-3 w-3" /> Added {new Date(lead.createdAt).toLocaleString()}
          </p>

          {actions && <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>{actions}</div>}
        </div>
      )}
    </SlideOver>
  );
}
