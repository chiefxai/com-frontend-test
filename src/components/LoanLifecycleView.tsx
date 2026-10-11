import React, { useState } from 'react';
import {
  Layers,
  FileText,
  CheckCircle,
  AlertTriangle,
  Upload,
  Clock,
  Sparkles,
  TrendingUp,
  DollarSign,
  Briefcase,
  User,
  Activity,
  Calendar,
  X
} from 'lucide-react';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import { Loan, LoanDocument, Lead } from '../types';
import { apiFetch } from '../lib/api';

interface LoanLifecycleViewProps {
  loans: Loan[];
  setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
  leads: Lead[];
  currentUserLabel: string;
}

export default function LoanLifecycleView({
  loans,
  setLoans,
  leads,
  currentUserLabel
}: LoanLifecycleViewProps) {
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(loans[0] || null);
  const [activeDoc, setActiveDoc] = useState<LoanDocument | null>(loans[0]?.documents[0] || null);
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);

  // Status updates
  const handleUpdateLoanStatus = (loanId: string, nextStatus: Loan['status'], noteText: string) => {
    const updated = loans.map((loan) => {
      if (loan.id === loanId) {
        return {
          ...loan,
          status: nextStatus,
          history: [
            ...loan.history,
            {
              status: nextStatus,
              updatedAt: new Date().toISOString(),
              note: noteText,
              updatedBy: currentUserLabel
            }
          ]
        };
      }
      return loan;
    });

    setLoans(updated);
    const updatedLoanObj = updated.find((l) => l.id === loanId);
    if (updatedLoanObj) {
      setSelectedLoan(updatedLoanObj);
    }
  };

  // Run server-side Gemini OCR compliance verification
  const triggerAIOCRCompliance = async (loanId: string, document: LoanDocument) => {
    setIsOCRProcessing(true);
    try {
      if (!document.fileContent?.trim()) {
        throw new Error('No document text is attached. Upload or extract the actual document content before analysis.');
      }
      const res = await apiFetch('/api/gemini/verify-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: document.type,
          docName: document.name,
          fileContent: document.fileContent
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Document analysis failed (${res.status}).`);
      if (data.success) {
        // Update document ocrData inside target loan
        const updated = loans.map((loan) => {
          if (loan.id === loanId) {
            const updatedDocs = loan.documents.map((d) => {
              if (d.id === document.id) {
                return {
                  ...d,
                  status: data.status,
                  ocrData: { ...data.ocrData, degraded: !!data.degraded }
                };
              }
              return d;
            });

            return {
              ...loan,
              documents: updatedDocs,
              history: [
                ...loan.history,
                {
                  status: loan.status,
                  updatedAt: new Date().toISOString(),
                  note: `AI OCR parsed document [${document.name}]. Compliance check: ${data.status}. Confidence: ${data.ocrData.confidenceScore}%`,
                  updatedBy: 'AI Compliance Guard'
                }
              ]
            };
          }
          return loan;
        });

        setLoans(updated);
        const updatedLoanObj = updated.find((l) => l.id === loanId);
        if (updatedLoanObj) {
          setSelectedLoan(updatedLoanObj);
          const updatedDocObj = updatedLoanObj.documents.find((d) => d.id === document.id);
          if (updatedDocObj) {
            setActiveDoc(updatedDocObj);
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert(`Document was not verified: ${err instanceof Error ? err.message : 'document analysis is unavailable.'}`);
    } finally {
      setIsOCRProcessing(false);
    }
  };

  // EMI Schedule Payment simulated
  const handleSimulateEMIPayment = (loanId: string) => {
    const updated = loans.map((loan) => {
      if (loan.id === loanId) {
        const nextPaidCount = Math.min(loan.totalEmiCount, loan.paidEmiCount + 1);
        return {
          ...loan,
          paidEmiCount: nextPaidCount,
          history: [
            ...loan.history,
            {
              status: loan.status,
              updatedAt: new Date().toISOString(),
              note: `Repayment received: Automated bank draft. EMI ${nextPaidCount} logged successfully.`,
              updatedBy: 'ACH Bank Gateway'
            }
          ]
        };
      }
      return loan;
    });

    setLoans(updated);
    const updatedLoanObj = updated.find((l) => l.id === loanId);
    if (updatedLoanObj) {
      setSelectedLoan(updatedLoanObj);
    }
  };

  return (
    <PageShell
      title="Underwriting & Loan Lifecycle"
      subtitle="Audit active credit applications, verify borrower income documents via AI OCR, and log monthly EMI drafts."
      layout="fill"
    >
      <div className="overflow-y-auto px-8 pb-8 pt-6 space-y-6">
      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Loan Application Pool */}
        <div className="lg:col-span-2 space-y-4">
          <Widget title="Active Loan Portfolio" padding="none"
            action={<span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Active: {loans.length}</span>}
          >

            <div className="divide-y divide-slate-100">
              {loans.map((loan) => {
                const isActive = selectedLoan?.id === loan.id;
                return (
                  <div
                    key={loan.id}
                    onClick={() => {
                      setSelectedLoan(loan);
                      setActiveDoc(loan.documents[0] || null);
                    }}
                    className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all cursor-pointer ${
                      isActive ? 'bg-blue-50/40 border-l-4 border-blue-600' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-2">
                        <h5 className="text-sm font-bold text-slate-800 font-display">{loan.leadName}</h5>
                        <span className="text-xs font-mono text-slate-400">({loan.id})</span>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-slate-400">
                        <span className="flex items-center">
                          <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                          <span>${loan.amount.toLocaleString()} at {loan.interestRate}%</span>
                        </span>
                        <span>Term: {loan.termMonths} Months</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6 shrink-0">
                      <div className="text-right space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Phase</span>
                        <p className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {loan.status}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-blue-600 hover:underline">
                        Manage & Underwrite →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Widget>
        </div>

        {/* Right Side: Underwriter panel */}
        <div className="space-y-6">
          {selectedLoan ? (
            <Widget title="Origination Desk" subtitle={selectedLoan?.leadName} padding="md"
              action={<span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">{selectedLoan?.id}</span>}
            >

              {/* Pipeline Step Navigator */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Set Origination Stage
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Lead', 'Application', 'Verification', 'Approval', 'Disbursement', 'Repayment'] as const).map((stage) => {
                    const isCurrent = selectedLoan.status === stage;
                    return (
                      <button
                        key={stage}
                        onClick={() => handleUpdateLoanStatus(selectedLoan.id, stage, `Manually advanced to ${stage} phase.`)}
                        className={`py-1.5 text-[9px] font-bold rounded-md border transition-all ${
                          isCurrent
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {stage}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* EMI Repayment Section */}
              {selectedLoan.status === 'Repayment' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      EMI Repayments
                    </span>
                    <button
                      onClick={() => handleSimulateEMIPayment(selectedLoan.id)}
                      className="text-[9px] font-bold text-blue-600 hover:underline flex items-center cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Log ACH payment
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">
                        Monthly EMI:
                      </span>
                      <strong className="text-slate-700 block">${selectedLoan.monthlyEmi.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">
                        Cleared EMIs:
                      </span>
                      <strong className="text-slate-700 block">{selectedLoan.paidEmiCount} / {selectedLoan.totalEmiCount}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* OCR document verification */}
              <div className="space-y-4">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block border-b border-slate-100 pb-2">
                  Borrower Compliance Documents
                </span>

                <div className="space-y-2">
                  {selectedLoan.documents.map((doc) => {
                    const isSelected = activeDoc?.id === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => setActiveDoc(doc)}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                          isSelected ? 'border-blue-600 bg-blue-50/20' : 'border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <FileText className="h-4.5 w-4.5 text-slate-400" />
                          <div className="max-w-[150px] truncate">
                            <p className="text-xs font-bold text-slate-700 truncate">{doc.name}</p>
                            <p className="text-[9px] text-slate-400">{doc.type}</p>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            doc.status === 'Verified'
                              ? 'bg-emerald-50 text-emerald-700'
                              : doc.status === 'Uploaded'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {doc.status}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Document Detail Preview box */}
                {activeDoc && (
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-slate-700">{activeDoc.name}</h5>
                        <p className="text-[9px] text-slate-400">Underwriting review channel: {activeDoc.type} · AI extraction requires document text and remains Needs Review</p>
                      </div>
                      {activeDoc.status !== 'Verified' && (
                        <button
                          onClick={() => triggerAIOCRCompliance(selectedLoan.id, activeDoc)}
                          disabled={isOCRProcessing}
                          className="flex items-center px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[9px] rounded-md transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          {isOCRProcessing ? 'Scanning...' : 'OCR AI Audit'}
                        </button>
                      )}
                    </div>

                    {/* OCR Data outputs */}
                    {activeDoc.ocrData ? (
                      <div className="space-y-2 border-t border-slate-200/60 pt-2 text-[10px] font-mono text-slate-600">
                        {activeDoc.ocrData.degraded && (
                          <div title="Document AI was unavailable — this data is a placeholder, not real extraction from the uploaded file" className="flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 font-sans font-semibold">
                            <AlertTriangle className="h-3 w-3 shrink-0" /> Estimated — AI document analysis temporarily unavailable
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>
                            Verified Borrower Name:
                          </span>
                          <strong className="text-slate-800">{activeDoc.ocrData.extractedName}</strong>
                        </div>
                        {activeDoc.ocrData.extractedEmployer && (
                          <div className="flex justify-between">
                            <span>
                              W2 Corporate Employer:
                            </span>
                            <strong className="text-slate-800">{activeDoc.ocrData.extractedEmployer}</strong>
                          </div>
                        )}
                        {activeDoc.ocrData.extractedIncome && (
                          <div className="flex justify-between">
                            <span>
                              Extracted Base Income:
                            </span>
                            <strong className="text-slate-800">${activeDoc.ocrData.extractedIncome.toLocaleString()} / mo</strong>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-dashed border-slate-200 pt-1.5">
                          <span>Compliance Confidence:</span>
                          <strong className="text-emerald-600">{activeDoc.ocrData.confidenceScore}%</strong>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">No OCR extraction recorded. Click "OCR AI Audit" to extract parameters using Gemini.</p>
                    )}
                  </div>
                )}
              </div>

              {/* History Timeline feed */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block border-b border-slate-100 pb-2">Audit History Timeline</span>
                <div className="space-y-3 max-h-36 overflow-y-auto pr-1">
                  {selectedLoan.history.map((hist, idx) => (
                    <div key={idx} className="flex items-start space-x-2 text-[10px]">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1 shrink-0"></div>
                      <div className="space-y-0.5">
                        <p className="text-slate-500 font-medium">
                          <strong className="text-slate-700">{hist.status}</strong> • {hist.note}
                        </p>
                        <span className="text-[9px] text-slate-400">By {hist.updatedBy} at {new Date(hist.updatedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Widget>
          ) : (
            <p className="text-xs text-slate-400 italic text-center my-auto">Select any borrower portfolio item on the left to begin underwriter actions.</p>
          )}
        </div>
      </div>
      </div>
    </PageShell>
  );
}
