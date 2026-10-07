export interface FinancialInfo {
  monthlyIncome: number;
  creditScore: number;
  employer: string;
  debtToIncome: number;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender?: string;
  amountRequested: number;
  score: number; // AI score 0-100
  source: string; // e.g., Website, Facebook, Direct, Partner
  status: 'New' | 'In Progress' | 'Qualified' | 'Unqualified' | 'Converted';
  tags: string[];
  createdAt: string;
  notes: string;
  financialInfo?: FinancialInfo;
  // True when the last score came from the offline fallback algorithm
  // (Gemini unavailable/unconfigured), not a real AI assessment.
  scoreDegraded?: boolean;
  // Contact Directory groups this contact belongs to — zero, one, or many.
  // Undefined/empty means "no group" (solo contact).
  groupIds?: string[];
  // Universal contact -> campaign -> lead -> opportunity -> client
  // progression every contact moves through, worded per-industry (see
  // src/lib/pipelineStages.ts / GET /api/settings/pipeline-stages).
  // Advanced automatically when a contact joins a campaign or a call to
  // them is answered; advanced manually (via `status`) into opportunity/
  // client. Missing/undefined reads as "contact", the starting stage.
  pipelineStage?: string;
  // Preferred time for a human advisor to speak with this contact (from questionnaire).
  callbackTime?: string;
}

// One of the 5 universal pipeline stage keys, worded for this org's
// industry — see GET /api/settings/pipeline-stages.
export interface PipelineStageLabel {
  key: string;
  label: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  createdAt: string;
}

export type CampaignStatus = 'Draft' | 'Running' | 'Paused' | 'Completed';

export interface CampaignRetryConfig {
  enabled: boolean;
  strategy: 'fixed' | 'exponential';
  intervalMinutes: number;
  maxRetries: number;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  workflowId: string;
  totalLeads: number;
  calledLeads: number;
  successfulCalls: number;
  createdAt: string;
  retryConfig?: CampaignRetryConfig;
}

export type NodeType = 'trigger' | 'call' | 'question' | 'decision' | 'action';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  config: {
    triggerType?: 'new_lead' | 'manual' | 'api';
    prompt?: string;
    questionText?: string;
    branches?: { condition: string; targetId: string }[];
    actionType?: 'assign_agent' | 'schedule_callback' | 'close_lead' | 'send_sms' | 'tag_lead';
    agentId?: string;
    tagName?: string;
  };
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  active: boolean;
  createdAt: string;
}

export interface CallLog {
  id: string;
  leadId: string;
  leadName: string;
  callerNumber?: string;
  campaignId?: string;
  duration: number; // in seconds
  // "Callback Scheduled" — the caller said they were busy and asked for a
  // callback; the backend (callFinalizer.js) sets this instead of
  // "Completed" and schedules an automatic redial (see callbackTime
  // below and services/dialerRetryEngine.js).
  status: 'Completed' | 'Failed' | 'Busy' | 'In Progress' | 'No Answer' | 'Answering Machine' | 'Callback Scheduled';
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Unknown';
  intent: 'Interested' | 'Not Interested' | 'Callback Scheduled' | 'Wrong Number' | 'Unknown';
  transcript: { speaker: 'AI' | 'Customer'; text: string; timestamp: string }[];
  summary: string;
  recordingUrl?: string;
  direction?: 'inbound' | 'outbound';
  answers?: Record<string, string>;
  createdAt: string;
  // The telephony provider's own call id (Vobiz CallUUID) for the call
  // that produced this log — only present on
  // rows that arrived via the live call_completed SSE broadcast, not on
  // rows loaded from the call-logs API. Lets DialerSimulator.tsx match
  // "this is MY active call" by exact id instead of comparing phone
  // number strings.
  providerCallSid?: string;
  // Best-effort ISO datetime for the automatic redial, set only when
  // status is "Callback Scheduled" and the caller gave a specific enough
  // time for the backend to resolve one — see
  // src/ai/postCallAgents.js:extractFollowUp.
  callbackTime?: string;
  // True only when the callee actually engaged (said more than a
  // throwaway word or two) — a call can still be status "Completed" while
  // this is false, e.g. picked up, said nothing/"wrong number", hung up.
  // See callFinalizer.js's callerWordCount heuristic. Undefined on data
  // captured before this field existed.
  callAnswered?: boolean;
  // One-line reason the caller asked for a callback — only set alongside
  // status "Callback Scheduled". See callFinalizer.js's
  // followUp.querySummary.
  callbackReason?: string;
  conversationOutcome?: 'completed' | 'busy' | 'callback_scheduled' | 'enquiry' | 'callback_and_enquiry' | 'no_answer' | 'answering_machine';
  callbackStatus?: 'none' | 'scheduled' | 'completed';
  enquiryStatus?: 'none' | 'open' | 'contacted' | 'resolved';
}

export interface LoanDocument {
  id: string;
  name: string;
  type: 'ID Proof' | 'Paystub' | 'Bank Statement' | 'Tax Return';
  status: 'Uploaded' | 'OCR Processing' | 'Verified' | 'Rejected';
  fileSize?: string;
  ocrData?: {
    extractedName?: string;
    extractedIncome?: number;
    extractedEmployer?: string;
    confidenceScore?: number;
    issues?: string[];
    // True when this came from the fallback stub (Gemini unavailable),
    // not real OCR/document analysis.
    degraded?: boolean;
  };
}

export interface Loan {
  id: string;
  leadId: string;
  leadName: string;
  amount: number;
  interestRate: number; // e.g., 8.5 for 8.5%
  termMonths: number;
  status: 'Lead' | 'Application' | 'Verification' | 'Approval' | 'Disbursement' | 'Repayment' | 'Completed';
  monthlyEmi: number;
  paidEmiCount: number;
  totalEmiCount: number;
  nextPaymentDate: string;
  documents: LoanDocument[];
  history: {
    status: string;
    updatedAt: string;
    note: string;
    updatedBy: string;
  }[];
}

export interface VirtualNumber {
  id: string;
  number: string;
  provider: 'Vobiz.ai' | 'Telnyx' | 'Plivo' | 'SIP Trunk';
  status: 'Active' | 'Inactive';
  friendlyName: string;
  routingUrl: string;
  incomingCallCount: number;
  outgoingCallCount: number;
}

export type UserRole =
  | 'Owner'
  | 'Billing Admin'
  | 'Workspace Admin'
  | 'Manager'
  | 'Member'
  | 'Viewer'
  | 'Super Admin'
  | 'Organization Admin'
  | 'Sales Manager'
  | 'Loan Agent'
  | 'Collection Agent'
  | 'AI Agent Manager'
  | 'Customer';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  performanceScore: number;
  assignedLeadsCount: number;
  featureFlags?: string[];
}

export interface OrganizationSettings {
  id: string;
  organizationId?: string;
  workspaceId?: string;
  name: string;
  workspaceName: string;
  subscriptionPlan: 'Starter' | 'Growth' | 'Enterprise';
  aiMinutesUsed: number;
  phoneCharges: number;
  billingPeriodEnd: string;
  apiKeys: {
    service: string;
    key: string;
    lastUsed: string;
  }[];
  taxId?: string;
  nmlsId?: string;
  foundedYear?: string;
  headquarters?: string;
  website?: string;
  contactEmail?: string;
  supportPhone?: string;
  complianceOfficer?: string;
  regulatoryJurisdictions?: string[];
  businessType?: string;
  primaryLendingSectors?: string[];
  defaultInterestRate?: number;
  riskProfile?: 'Conservative' | 'Moderate' | 'Aggressive';
  companyBio?: string;
  verificationStatus?: 'Unverified' | 'Pending' | 'Verified';
  // Drives the isLending branch throughout the app (Dashboard, Reports,
  // Contact Directory's Underwriting fields, etc.) — was missing from this
  // type despite being read live in several places (App.tsx, DashboardView).
  industry?: string;
  // Which outbound number the Voice Simulator's dialer defaults to. Was
  // previously plain React state in DialerSimulator.tsx with no
  // persistence at all — reset to the first dialable number on every
  // reload, even on the same browser, and never carried over to a
  // different device on the same account. Living here means it rides the
  // workspace settings sync (POST /api/settings/workspace — a free-form
  // "settings" JSONB column on the backend, no schema change needed) like
  // other workspace preferences.
  defaultOutboundNumber?: string;
  // Recharge-based wallet billing. Only populated/displayed for organizations
  // whose billingMethod is recharge_based.
  billingMethod?: 'pay_as_you_go' | 'recharge_based';
  rechargeBalanceInr?: number;
  rechargeReservedInr?: number;
}
