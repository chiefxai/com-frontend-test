import React from 'react';
import { useRef, useState } from 'react';
import { X, Download, FileText, Phone, PhoneOutgoing } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { CallLog } from '../types';
import { callCostInr, formatInr } from '../lib/pricing';
import { downloadCSV } from '../shared/lib/exporters';

interface DialTaskCallResult {
  status: string;
  duration: number;
  sentiment: string;
  intent: string;
  summary: string;
  recordingUrl?: string;
}

interface DialTask {
  id: string;
  name: string;
  leadIds: string[];
  status: string;
  createdAt: string;
  callResults: Record<string, DialTaskCallResult>;
}

interface LeadRef { id: string; name: string; phone: string }

interface PrintableReportProps {
  onClose: () => void;
  orgName: string;
  fromDate: string;
  toDate: string;
  direction: 'all' | 'inbound' | 'outbound';
  granularity: string;
  filteredCalls: CallLog[];
  dialerTasks: DialTask[];
  leads: LeadRef[];
  costPerMinuteInr: number;
}

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function sentimentColor(s: string) {
  return s === 'Positive' ? '#059669' : s === 'Negative' ? '#dc2626' : '#64748b';
}

function intentColor(i: string) {
  const map: Record<string, string> = {
    'Interested': '#2563eb', 'Not Interested': '#dc2626',
    'Callback Scheduled': '#d97706', 'Wrong Number': '#6b7280',
  };
  return map[i] || '#6b7280';
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', minWidth: 110 }}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CallRow({ c, cpm }: { c: CallLog; cpm: number }) {
  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 12, color: '#0f172a' }}>{c.leadName}</td>
      <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
        {c.direction === 'inbound'
          ? <span style={{ color: '#059669' }}>↓ In</span>
          : <span style={{ color: '#2563eb' }}>↑ Out</span>}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>{fmt(c.duration)}</td>
      <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569' }}>{formatInr(callCostInr(c.duration, cpm))}</td>
      <td style={{ padding: '8px 10px', fontSize: 10, color: '#475569', fontWeight: 700 }}>{c.conversationOutcome === 'callback_scheduled' ? 'Callback Scheduled' : c.conversationOutcome === 'callback_and_enquiry' ? 'Callback + Enquiry' : c.conversationOutcome === 'enquiry' ? 'Enquiry' : c.conversationOutcome === 'busy' ? 'Busy' : c.conversationOutcome === 'no_answer' ? 'No Answer' : c.conversationOutcome === 'answering_machine' ? 'Answering Machine' : c.status}</td>
      <td style={{ padding: '8px 10px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: sentimentColor(c.sentiment), background: sentimentColor(c.sentiment) + '18', padding: '2px 8px', borderRadius: 100 }}>
          {c.sentiment}
        </span>
      </td>
      <td style={{ padding: '8px 10px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: intentColor(c.intent), background: intentColor(c.intent) + '18', padding: '2px 8px', borderRadius: 100 }}>
          {c.intent}
        </span>
      </td>
      <td style={{ padding: '8px 10px', fontSize: 11, color: '#64748b', maxWidth: 200 }}>{c.summary || '—'}</td>
      <td style={{ padding: '8px 10px', fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>
        {new Date(c.createdAt).toLocaleString()}
      </td>
    </tr>
  );
}

const REPORT_ID = 'chiefvoice-pdf-report';

export default function PrintableReport({
  onClose, orgName, fromDate, toDate, direction,
  granularity, filteredCalls, dialerTasks, leads, costPerMinuteInr,
}: PrintableReportProps) {

  const inbound  = filteredCalls.filter(c => c.direction === 'inbound');
  const outbound = filteredCalls.filter(c => c.direction === 'outbound');
  const totalDur = filteredCalls.reduce((s, c) => s + c.duration, 0);
  const totalCost = filteredCalls.reduce((s, c) => s + callCostInr(c.duration, costPerMinuteInr), 0);
  const positive  = filteredCalls.filter(c => c.sentiment === 'Positive').length;
  const negative  = filteredCalls.filter(c => c.sentiment === 'Negative').length;
  const interested = filteredCalls.filter(c => c.intent === 'Interested').length;
  const visibleCalls = direction === 'inbound' ? inbound : direction === 'outbound' ? outbound : filteredCalls;

  const relevantTasks = dialerTasks.filter(t => {
    const d = new Date(t.createdAt);
    return d >= new Date(fromDate + 'T00:00:00') && d <= new Date(toDate + 'T23:59:59');
  });

  const reportRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handlePDF = async () => {
    if (!reportRef.current || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await new Promise(requestAnimationFrame);
      const canvas = await html2canvas(reportRef.current, {
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = 210, pageHeight = 297, margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const pagePxHeight = canvas.width * ((pageHeight - margin * 2) / usableWidth);
      let sourceY = 0;
      while (sourceY < canvas.height) {
        const sliceHeight = Math.min(pagePxHeight, canvas.height - sourceY);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceHeight;
        slice.getContext('2d')?.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const renderedHeight = sliceHeight * usableWidth / canvas.width;
        if (sourceY > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, usableWidth, renderedHeight, undefined, 'FAST');
        sourceY += sliceHeight;
      }
      pdf.save(`${orgName.replace(/[^a-z0-9]+/gi, "_")}_call_report_${fromDate}_${toDate}.pdf`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCSV = () => {
    const headers = ['Name', 'Direction', 'Duration (s)', 'Cost (INR)', 'Outcome', 'Status', 'Sentiment', 'Intent', 'Summary', 'Date'];
    const rows = visibleCalls.map(c => [
      c.leadName,
      c.direction || 'unknown',
      c.duration,
      callCostInr(c.duration, costPerMinuteInr).toFixed(2),
      c.conversationOutcome || c.status,
      c.status,
      c.sentiment,
      c.intent,
      c.summary,
      new Date(c.createdAt).toLocaleString(),
    ]);
    downloadCSV(`${orgName.replace(/\s+/g, '_')}_call_report_${fromDate}_${toDate}.csv`, headers, rows);
  };

  return (
    <>
      {/* Print CSS: visibility approach works regardless of DOM nesting depth */}
      <style>{`
        @media print {
          @page { margin: 12mm; size: A4 portrait; }
          body * { visibility: hidden !important; }
          #${REPORT_ID}, #${REPORT_ID} * { visibility: visible !important; }
          #${REPORT_ID} {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            max-width: none !important;
          }
        }
      `}</style>

      <div
        id="chiefvoice-print-root"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', overflowY: 'auto' }}
      >
        {/* ── Unified toolbar ── */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, width: '100%', maxWidth: 940, marginBottom: 14, flexShrink: 0 }}>
          <div style={{ background: '#1e293b', borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
            {/* Left: title */}
            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>Report Preview</span>

            {/* Right: actions grouped together */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleCSV}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <Download size={13} /> Export CSV
              </button>
              <button
                onClick={handlePDF}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <FileText size={13} /> Download PDF
              </button>
              <div style={{ width: 1, height: 20, background: '#334155', margin: '0 4px' }} />
              <button
                onClick={onClose}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}
                title="Close preview"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* ── PDF-capturable document ── */}
        <div
          id={REPORT_ID}
          style={{ background: '#ffffff', width: '100%', maxWidth: 940, borderRadius: 16, overflow: 'hidden', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", boxShadow: '0 8px 48px rgba(0,0,0,0.18)', flexShrink: 0 }}
        >
          {/* Header band */}
          <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '32px 40px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Call Intelligence Report</div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', margin: 0, lineHeight: 1.2 }}>{orgName}</h1>
                <p style={{ color: '#64748b', fontSize: 13, margin: '6px 0 0', fontWeight: 500 }}>
                  {fromDate} → {toDate} &nbsp;·&nbsp; {direction === 'all' ? 'All directions' : direction === 'inbound' ? 'Inbound only' : 'Outbound only'} &nbsp;·&nbsp; Grouped by {granularity}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#475569' }}>Generated</div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{new Date().toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ padding: '24px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <StatCard label="Total Calls"    value={filteredCalls.length} />
            <StatCard label="Inbound"        value={inbound.length}  sub={`${Math.round(inbound.length / Math.max(filteredCalls.length, 1) * 100)}% of total`} />
            <StatCard label="Outbound"       value={outbound.length} sub={`${Math.round(outbound.length / Math.max(filteredCalls.length, 1) * 100)}% of total`} />
            <StatCard label="Total Duration" value={fmt(totalDur)} />
            <StatCard label="Total Cost"     value={formatInr(totalCost)} sub={`₹${costPerMinuteInr}/min`} />
            <StatCard label="Positive"       value={positive}  sub="sentiment" />
            <StatCard label="Negative"       value={negative}  sub="sentiment" />
            <StatCard label="Interested"     value={interested} sub="intent" />
            <StatCard label="Interest Rate"  value={`${Math.round(interested / Math.max(filteredCalls.length, 1) * 100)}%`} />
          </div>

          {/* Sentiment bar */}
          {filteredCalls.length > 0 && (
            <div style={{ padding: '16px 40px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sentiment Distribution</div>
              <div style={{ display: 'flex', height: 10, borderRadius: 100, overflow: 'hidden', gap: 1 }}>
                {(['Positive', 'Neutral', 'Negative', 'Unknown'] as const).map(s => {
                  const cnt = filteredCalls.filter(c => c.sentiment === s).length;
                  const pct = Math.round(cnt / filteredCalls.length * 100);
                  const colors: Record<string, string> = { Positive: '#059669', Neutral: '#94a3b8', Negative: '#dc2626', Unknown: '#e2e8f0' };
                  return pct > 0 ? <div key={s} style={{ width: `${pct}%`, background: colors[s] }} title={`${s}: ${pct}%`} /> : null;
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                {(['Positive', 'Neutral', 'Negative', 'Unknown'] as const).map(s => {
                  const cnt = filteredCalls.filter(c => c.sentiment === s).length;
                  const colors: Record<string, string> = { Positive: '#059669', Neutral: '#94a3b8', Negative: '#dc2626', Unknown: '#cbd5e1' };
                  return cnt > 0 ? (
                    <span key={s} style={{ fontSize: 10, color: '#475569' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colors[s], marginRight: 4, verticalAlign: 'middle' }} />
                      {s}: {cnt}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* Call log table */}
          <div style={{ padding: '24px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Phone size={16} color="#2563eb" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                Call Log ({visibleCalls.length} calls)
              </span>
            </div>
            {visibleCalls.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No calls in this period.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {['Name', 'Dir', 'Duration', 'Cost', 'Outcome', 'Sentiment', 'Intent', 'Summary', 'When'].map(h => (
                        <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCalls.map(c => <CallRow key={c.id} c={c} cpm={costPerMinuteInr} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Dialer task breakdown */}
          {direction !== 'inbound' && relevantTasks.length > 0 && (
            <div style={{ padding: '0 40px 32px' }}>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 24, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <PhoneOutgoing size={16} color="#7c3aed" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Dialer Task Breakdown</span>
                </div>
                {relevantTasks.map(task => {
                  const rows = task.leadIds.map(lid => {
                    const lead = leads.find(l => l.id === lid);
                    const res  = task.callResults[lid];
                    return { lid, name: lead?.name || 'Unknown', phone: lead?.phone || '', ...res };
                  });
                  const done = rows.filter(r => r.status === 'Completed').length;
                  const conv = done > 0 ? Math.round(rows.filter(r => r.intent === 'Interested').length / done * 100) : 0;
                  return (
                    <div key={task.id} style={{ marginBottom: 20, breakInside: 'avoid' }}>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{task.name}</span>
                        <div style={{ display: 'flex', gap: 16 }}>
                          {[['Leads', rows.length], ['Completed', done], ['Conv. Rate', `${conv}%`]].map(([k, v]) => (
                            <span key={String(k)} style={{ fontSize: 11, color: '#475569' }}><strong style={{ color: '#0f172a' }}>{v}</strong> {k}</span>
                          ))}
                        </div>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            {['Lead', 'Phone', 'Status', 'Outcome', 'Duration', 'Sentiment', 'Intent', 'Summary'].map(h => (
                              <th key={h} style={{ padding: '7px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.lid} style={{ borderBottom: '1px solid #f8fafc' }}>
                              <td style={{ padding: '7px 8px', fontWeight: 600 }}>{r.name}</td>
                              <td style={{ padding: '7px 8px', color: '#64748b' }}>{r.phone}</td>
                              <td style={{ padding: '7px 8px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: r.status === 'Completed' ? '#059669' : '#94a3b8', background: r.status === 'Completed' ? '#f0fdf4' : '#f8fafc', padding: '2px 7px', borderRadius: 100 }}>
                                  {r.status || 'Pending'}
                                </span>
                              </td>
                              <td style={{ padding: '7px 8px', color: '#475569', fontWeight: 700 }}>{r.conversationOutcome === 'callback_scheduled' ? 'Callback Scheduled' : r.conversationOutcome === 'callback_and_enquiry' ? 'Callback + Enquiry' : r.conversationOutcome === 'enquiry' ? 'Enquiry' : r.conversationOutcome === 'busy' ? 'Busy' : r.conversationOutcome === 'no_answer' ? 'No Answer' : r.conversationOutcome === 'answering_machine' ? 'Answering Machine' : r.status || '—'}</td>
                              <td style={{ padding: '7px 8px', color: '#475569' }}>{fmt(r.duration || 0)}</td>
                              <td style={{ padding: '7px 8px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: sentimentColor(r.sentiment || 'Unknown') }}>{r.sentiment || '—'}</span>
                              </td>
                              <td style={{ padding: '7px 8px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: intentColor(r.intent || 'Unknown') }}>{r.intent || '—'}</span>
                              </td>
                              <td style={{ padding: '7px 8px', color: '#64748b', maxWidth: 200 }}>{r.summary || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '14px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>ChiefVoice AI CRM · Confidential</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Generated {new Date().toLocaleString()}</span>
          </div>
        </div>
      </div>
    </>
  );
}
