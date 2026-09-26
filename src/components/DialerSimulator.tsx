import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  MessageSquare,
  Mic,
  Volume2,
  RefreshCw,
  Clock,
  Send,
  ThumbsUp,
  Activity,
  Smile,
  AlertCircle,
  Play,
  Pause,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileSpreadsheet,
  Check,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ChevronLeft,
  Inbox,
  History,
  PhoneForwarded,
  MessageCircleQuestion,
  GitBranch,
  Bot,
  User,
  Megaphone,
} from 'lucide-react';
import { Lead, CallLog, VirtualNumber, TeamMember, ContactGroup, OrganizationSettings } from '../types';
import { QuestionFlow } from '../features/workflows/types';
import PageShell from './ui/PageShell';
import AwsCreateLayout from './ui/AwsCreateLayout';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Widget from './ui/Widget';
import Modal from './ui/Modal';
import IconButton from './ui/IconButton';
import KpiCard from './ui/KpiCard';
import SearchInput from './ui/SearchInput';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import DataTable, { Column } from './ui/DataTable';
import SlideOver from './ui/SlideOver';
import Badge from './ui/Badge';
import { apiFetch, getPlayableRecordingUrl } from '../lib/api';
import { callCostInr, formatInr } from '../lib/pricing';
import { useToast } from './ui/Toast';

interface WizardAgent {
  id: string;
  name: string;
  outboundNumber?: { id: string; number: string } | null;
  activeVoice?: string;
  language?: string;
  active?: boolean;
}

interface DialerSimulatorProps {
  leads: Lead[];
  callLogs: CallLog[];
  setCallLogs: React.Dispatch<React.SetStateAction<CallLog[]>>;
  leadsDatabase: Lead[];
  setLeadsDatabase: React.Dispatch<React.SetStateAction<Lead[]>>;
  virtualNumbers?: VirtualNumber[];
  setVirtualNumbers?: React.Dispatch<React.SetStateAction<VirtualNumber[]>>;
  tasks: DialTask[];
  setTasks: React.Dispatch<React.SetStateAction<DialTask[]>>;
  companyName: string;
  teamMembers?: TeamMember[];
  industry?: string;
  flows?: QuestionFlow[];
  /** Outbound/Inbound sub-page, driven by the sidebar's Voice Simulator group */
  mode?: 'outbound' | 'inbound';
  setMode?: (mode: 'outbound' | 'inbound' | 'assign-task') => void;
  // Backend-persisted org settings (POST /api/settings/org) — used here
  // only to read/write defaultOutboundNumber, so the "which number am I
  // dialing from" choice survives a reload and follows the account to a
  // different device, instead of resetting every time like it used to.
  orgSettings?: OrganizationSettings;
  setOrgSettings?: React.Dispatch<React.SetStateAction<OrganizationSettings>>;
  /** True only while the Voice Simulator/Dialer tab is the visible app tab. */
  isActive?: boolean;
}

// Broad language list for per-task selection — a generic "speak fluently
// in {language}" instruction is used for anything other than the default,
// which still uses the hand-tuned Tamil/Tanglish speech-pattern prompt.
// See services/config.js on the backend for where this gets applied.
export const TASK_LANGUAGE_OPTIONS = [
  'Tamil + English (Tanglish)',
  'Hindi',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Bengali',
  'Marathi',
  'Gujarati',
  'Punjabi',
  'Odia',
  'English'
];
export const DEFAULT_TASK_LANGUAGE = TASK_LANGUAGE_OPTIONS[0];

const NO_GROUP_FILTER = '__no_group__';

// Super Star Health Insurance tele-script question bank — the AI asks
// these one by one, same sequential-flow mechanism as any other task's
// questions. Source: Super_Star_AI_Bot_Questions_Modern_Template.pdf.
const SUPER_STAR_QUESTIONS: string[] = [
  'Neenga pesura time convenient-a irukka?',
  'Super Star Health Insurance Plan pathi therinjika interest-a irukkeengala?',
  'Indha conversation-ku eppadi language prefer pannuveenga?',
  'Ippo unga kitta ethachum health insurance policy irukka?',
  'Ethana health insurance policies ippo unga kitta irukku?',
  'Unga existing policy ungalukku thaana illa family-kum sera irukka?',
  'Unga age enna sollunga?',
  'Neenga married-a illa single-a?',
  'Unga spouse age enna?',
  'Unga kitta ethana kuzhandhaigal irukanga?',
  'Avanga age enna?',
  'Neenga eppo edhu city-la irukeenga?',
  'Health insurance ungalukku mattum-a venuma illa full family-kum venuma?',
  'Enna level coverage neenga expect pannureenga?',
  'Unga premium budget evlo-nu oru idea irukka?',
  'Hospitalization expenses எப்படி cover aagum-nu therinjukka interest-a?',
  'Indha policy-la 24-hour hospitalization requirement pathi therinjikanuma?',
  'Day-care treatments pathi therinjikanuma?',
  'Pre and post hospitalization coverage pathi therinjikanuma?',
  'AYUSH treatments cover aagumaanu therinjikanuma?',
  'Ambulance mattum air ambulance coverage pathi therinjikanuma?',
  'Organ donor expenses pathi therinjikanuma?',
  'Home-care mattum domiciliary hospitalization pathi therinjikanuma?',
  'Second medical opinion facility pathi therinjikanuma?',
  'Cumulative bonus eppadi work aagum-nu therinjikanuma?',
  'Sum insured automatic-a eppadi restore aagum-nu therinjikanuma?',
  'Unlimited tele-consultation facility pathi therinjikanuma?',
  'AI-driven face scan facility pathi therinjikanuma?',
  'Dental check-up benefit pathi therinjikanuma?',
  'Star Wellness Program mattum premium discounts pathi therinjikanuma?',
  'Smart Network option select panni premium kammi pannikanuma?',
  'Quick Shield moolama sila pre-existing diseases-kum coverage venuma?',
  'Hospitalization time-la use aagura consumable items-kum coverage venuma?',
  'Neenga marriage plan panreengala, future spouse-kum coverage venuma?',
  'Maternity coverage add pannikanuma?',
  'Assisted reproduction treatment-kum coverage venuma?',
  'Ippo neenga pregnant-a irukeengala, Women Care option interest-a irukka?',
  'High-end diagnostic tests-kum extra coverage venuma?',
  'Personal Accident Cover add pannikanuma?',
  'Annual health check-up benefit venuma?',
  'Voluntary co-payment vachi premium kammi pannikanuma?',
  'Voluntary deductible vachi premium kammi pannikanuma?',
  'Room category change panni premium kammi pannikanuma?',
  'International second medical opinion venuma?',
  'Durable medical equipment-kum coverage venuma?',
  'Hospital Cash Benefit add pannikanuma?',
  'Specified diseases-ku waiting period kammi pannikanuma?',
  'Pre-existing diseases-ku waiting period kammi pannikanuma?',
  'Limitless Care option pathi therinjikanuma?',
  'Super Star Bonus option add pannikanuma?',
  'Ippo unga kitta ethachum pre-existing medical conditions irukka?',
  'Irundha, andha medical conditions enna-nu sollunga?',
  'Munnadi ethachum major medical treatment illa hospitalization aagi irukeengala?',
  'Ippo neenga ethachum medical treatment eduthu kittu irukeengala?',
  'Pre-existing diseases eppadi cover aagum-nu therinjikanuma?',
  '30-day initial waiting period pathi explain pannattuma?',
  'Ethana conditions-ku two-year waiting period irukku-nu therinjikanuma?',
  'Pre-existing diseases-ku waiting period pathi therinjikanuma?',
  'Waiting period eppadi kammi pannalam-nu therinjikanuma?',
  'Cashless hospitalization facility eppadi work aagum-nu therinjikanuma?',
  'Network-ku veliya irukura hospital-la treatment eppadi work aagum-nu therinjikanuma?',
  'Policy cancellation rules pathi therinjikanuma?',
  '30-day free-look cancellation period pathi therinjikanuma?',
  'Premium refund kidaikkura conditions pathi explain pannattuma?',
  'Super Star policy-ku proceed pannalaama?',
  'Unga full name sollunga?',
  'Unga email address sollunga?',
  'Proposal form-ku unga address sollunga?',
  'Online proposal form fill panna help venuma?',
  'Payment UPI, debit card, credit card illa NEFT moolama pannuveengala?',
  'Required medical information ellam correct-a kudutheengala?',
  'Nomination details complete pannikanuma?'
];

// Workflow variables' "Save answer as" field name is optional in the
// builder (see WorkflowVariables.tsx's "field_name" input) and easy to
// leave blank since the question text is the prominent element — when
// left blank, v.name was falling back to the raw question sentence as the
// display label, which is exactly what "Extracted Campaign Answers"
// should NOT show (the question is only useful to the agent live, not
// when reviewing what was learned). Auto-derives a short field-name-style
// label from the question text instead, e.g. "What is your monthly
// income?" -> "what_is_your_monthly", so every variable gets a real name
// even if the user never typed one.
function slugifyQuestion(question: string): string {
  const words = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join('_') || 'answer';
}

// Builds the wire-format questions payload for POST /api/vobiz/call
// — pairs each question with its label (falling back to the question text
// itself when no label was set) and its declared data type, so the backend
// can both attach the right label to the extracted answer AND format/
// coerce that answer to match what the workflow variable actually expects
// (a number as digits, a boolean as Yes/No, etc. — see
// postCallAgents/workflowAnswersAgent.js).
function buildQuestionsPayload(task: DialTask | null | undefined): { label: string; question: string; dataType?: string }[] {
  if (!task) return [];
  return task.questions.map((q, i) => ({ question: q, label: task.questionLabels?.[i] || q, dataType: task.questionDataTypes?.[i] }));
}

interface RetryConfig {
  enabled: boolean;
  strategy: 'fixed' | 'exponential';
  intervalMinutes: number;
  maxRetries: number;
  quietHoursStart: string;
  quietHoursEnd: string;
}

interface DialTask {
  id: string;
  name: string;
  // The workflow this task was created from — lets Reports group repeated
  // runs of the same workflow together (a task never had this before, so
  // there was no way to tell "Loan Follow-up — Week 1" and "...— Week 2"
  // came from the same workflow without string-matching the name).
  workflowId?: string;
  workflowName?: string;
  workflowRunMetadata?: {
    workflowId: string;
    workflowName?: string | null;
    runAt: string;
    runDate?: string;
    runTime?: string;
    timezone?: string;
  };
  questions: string[];
  // Short key per question (e.g. "customer_budget"), same order/length as
  // `questions` — set from the workflow builder's WorkflowVariable.name.
  // Optional/parallel rather than replacing `questions` so the live
  // question-by-question call flow (which indexes `questions` directly as
  // the literal text spoken) is untouched; only reporting/extraction
  // surfaces read this.
  questionLabels?: string[];
  // Same order/length as `questions` — the workflow variable's declared
  // type (string/number/boolean/date/array/object). Only meaningful post-
  // call: the Call Analysis sidebar's Extracted Campaign Answers panel
  // shows each answer as "name (dataType): value" instead of restating
  // the full question the agent asked live — the question text is only
  // useful to the agent in the moment, not for reviewing what was learned.
  questionDataTypes?: string[];
  leadIds: string[];
  status: 'Pending' | 'In Progress' | 'Completed';
  createdAt: string;
  language?: string;
  assignedTeamMemberId?: string;
  starhealthEnabled?: boolean;
  retryConfig?: RetryConfig;
  callResults: {
    [leadId: string]: {
      // "Callback Scheduled" — the caller said they're busy and asked to
      // be called back; set by the backend (callFinalizer.js) instead of
      // "Completed" so this lead doesn't read as done. The backend's
      // dialerRetryEngine.js automatically redials at callbackTime (or a
      // default delay if the caller was too vague for a specific time),
      // and flips this same row to "Completed" once that redial actually
      // reaches them — see callId, which lets the row track which
      // specific call_logs entry it's currently reflecting.
      status: 'Pending' | 'Calling' | 'Completed' | 'No Answer' | 'Skipped' | 'Callback Scheduled';
      duration: number;
      // Backend-constructed results (autoDialEngine.js, callFinalizer.js's
      // task-patch) never populate these two — only ever set when this
      // component builds the object itself from a live/foreground call.
      transcript?: { speaker: 'AI' | 'Customer'; text: string; timestamp: string }[];
      sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Unknown';
      intent: 'Interested' | 'Not Interested' | 'Callback Scheduled' | 'Wrong Number' | 'Unknown';
      summary: string;
      answers?: { [question: string]: string };
      recordingUrl?: string;
      // Real call_logs id this result reflects — lets a later poll/SSE
      // update recognize "this is a newer outcome for the same lead" and
      // which call to look up. Present on backend-constructed results.
      callId?: string;
      // Best-effort ISO datetime for when the automatic redial will
      // happen — present only when status is "Callback Scheduled" and the
      // caller gave a specific enough time to resolve one.
      callbackTime?: string;
      // True only when the callee actually engaged — a lead can be status
      // "Completed" while this is false (picked up, said nothing/"wrong
      // number", hung up). See callFinalizer.js.
      callAnswered?: boolean;
      callbackReason?: string;
      conversationOutcome?: 'completed' | 'busy' | 'callback_scheduled' | 'enquiry' | 'callback_and_enquiry' | 'no_answer' | 'answering_machine';
      callbackStatus?: 'none' | 'scheduled' | 'completed';
      enquiryStatus?: 'none' | 'open' | 'contacted' | 'resolved';
    }
  };
  // Server-side auto-dial runtime state — set by src/crm/autoDialEngine.js
  // on the backend (crm-backend-demo), not by this app. Present once the
  // task has been started via POST /api/dialer-tasks/:id/auto-dial/start;
  // absent on tasks that have never been auto-dialed.
  autoDialEnabled?: boolean;
  autoDialStatus?: 'idle' | 'dialing' | 'waiting' | 'paused' | 'completed';
}

export default function DialerSimulator({
  leads,
  callLogs,
  setCallLogs,
  leadsDatabase,
  setLeadsDatabase,
  virtualNumbers = [],
  setVirtualNumbers,
  tasks,
  setTasks,
  companyName,
  teamMembers = [],
  industry,
  flows = [],
  mode,
  setMode,
  orgSettings,
  setOrgSettings,
  isActive = true
}: DialerSimulatorProps) {
  const { showToast } = useToast();
  const isInsurance = industry === 'insurance';
  const storagePrefix = `chiefx:${encodeURIComponent(orgSettings?.id || companyName || 'default')}`;
  const storageKey = (key: string) => `${storagePrefix}:${key}`;
  // Outbound/Inbound sub-page — driven by the sidebar's Voice Simulator group
  // when the parent supplies mode/setMode; falls back to internal state so
  // the component still works standalone (e.g. in isolation/tests).
  const [internalDialerMode, setInternalDialerMode] = useState<'outbound' | 'inbound'>('outbound');
  const dialerMode = mode ?? internalDialerMode;
  const setDialerMode = setMode ?? setInternalDialerMode;
  // Keep task assignment inside the Voice Simulator screen so the sidebar,
  // header and dialer state stay mounted. This is intentionally UI state,
  // not a route/sub-route.
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [isCampaignNavigatorOpen, setIsCampaignNavigatorOpen] = useState(false);
  const [isSimulatorNavigatorCollapsed, setIsSimulatorNavigatorCollapsed] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const taskPage = showAssignTask;
  useEffect(() => {
    if (!isActive || dialerMode !== 'outbound') setShowAssignTask(false);
  }, [isActive, dialerMode]);

  const activeVirtualNumbers = virtualNumbers;

  // Real inbound call history — sourced from `callLogs` (populated from the
  // backend's `call_logs` table, tagged `direction` by the Vobiz
  // webhooks themselves), not the fake simulator's `inboundCallLogs`.
  const realInboundCallLogs = callLogs.filter((log) => log.direction === 'inbound');

  // AI Voice and Prompt Configuration states from screenshots
  const [voicePersona, setVoicePersona] = useState<string>(() => {
    return localStorage.getItem(storageKey('chiefx_voice_persona')) || 'Priya — Female (friendly & clear)';
  });
  const [emotionIntensity, setEmotionIntensity] = useState<number>(() => {
    return Number(localStorage.getItem(storageKey('chiefx_emotion_intensity')) || '78');
  });
  const [speechSpeed, setSpeechSpeed] = useState<number>(() => {
    return Number(localStorage.getItem(storageKey('chiefx_speech_speed')) || '52');
  });
  const [friendliness, setFriendliness] = useState<number>(() => {
    return Number(localStorage.getItem(storageKey('chiefx_friendliness')) || '82');
  });
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    return localStorage.getItem(storageKey('chiefx_system_prompt')) || 
`You are a real human speaking out loud - not an AI, not reading a script.

========================================
CORE RULE - SPEAK THE VERBATIM FORM, NOT THE NORMALIZED FORM
========================================

Real Tamil speakers do not say the "correct" written form of a word. They contract it. This is the single most reliable, verified pattern in real Tamil speech data, and it holds no matter what the topic is or who the speaker is talking to. Apply it constantly...`;
  });
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);

  // The AI's spoken name for intro/greeting lines — derived from the
  // configured voice persona (e.g. "Priya — Female (friendly & clear)")
  // instead of a hardcoded name unrelated to what's actually configured.
  const agentDisplayName = voicePersona.split('—')[0].trim() || 'the assistant';

  const handleSaveConfig = () => {
    setIsConfigSaving(true);
    localStorage.setItem(storageKey('chiefx_voice_persona'), voicePersona);
    localStorage.setItem(storageKey('chiefx_emotion_intensity'), String(emotionIntensity));
    localStorage.setItem(storageKey('chiefx_speech_speed'), String(speechSpeed));
    localStorage.setItem(storageKey('chiefx_friendliness'), String(friendliness));
    localStorage.setItem(storageKey('chiefx_system_prompt'), systemPrompt);
    
    setTimeout(() => {
      setIsConfigSaving(false);
      setConfigSaveSuccess(true);
      setTimeout(() => setConfigSaveSuccess(false), 3000);
    }, 600);
  };

  // Tasks — real, persisted via App.tsx (props), not localStorage.

  // Active Selected Task
  const [searchParams] = useSearchParams();
  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => {
    return tasks[0]?.id || '';
  });

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || tasks[0];

  // Deep-link from Leads / Scheduled Callbacks (?campaign=<dialer task id>).
  useEffect(() => {
    const campaignId = searchParams.get('campaign');
    if (!campaignId) return;
    if (tasks.some((t) => t.id === campaignId)) {
      setSelectedTaskId(campaignId);
    }
  }, [searchParams, tasks]);

  // Campaign list: normal mode (Lead Contact/Value/Survey Status/AI
  // Sentiment/Survey Outcome) vs. a per-workflow-variable detail view —
  // same "one column per extracted answer" table as Reports' Campaign
  // Details, scoped to just this task. Reset when the selected task
  // changes so a stale detail table from a different campaign never shows.
  const [showWorkflowDetailView, setShowWorkflowDetailView] = useState(false);
  interface WorkflowDetailRow { leadId: string; leadName: string; phone: string; status: string; sentiment: string; answers: Record<string, string> }
  const [workflowDetailRows, setWorkflowDetailRows] = useState<WorkflowDetailRow[]>([]);
  const [workflowDetailColumns, setWorkflowDetailColumns] = useState<string[]>([]);
  const [workflowDetailLoading, setWorkflowDetailLoading] = useState(false);

  useEffect(() => {
    if (!showWorkflowDetailView || !selectedTask) { setWorkflowDetailRows([]); setWorkflowDetailColumns([]); return; }
    let cancelled = false;
    setWorkflowDetailLoading(true);

    const leadEntries = Object.entries(selectedTask.callResults).filter(([, r]) => r.callId);

    Promise.all(leadEntries.map(async ([leadId, result]) => {
      const lead = leadsDatabase.find((l) => l.id === leadId);
      let answers: Record<string, string> = {};
      try {
        const res = await apiFetch(`/api/calls/${encodeURIComponent(result.callId!)}/lead-responses`);
        if (res.ok) {
          const rows: { label?: string; question: string; answer: string }[] = await res.json();
          for (const row of rows) {
            if (row.answer) answers[row.label || row.question] = row.answer;
          }
        }
      } catch { /* leave answers empty for this lead */ }
      const row: WorkflowDetailRow = {
        leadId,
        leadName: lead?.name || 'Unknown',
        phone: lead?.phone || '—',
        status: result.status,
        sentiment: result.sentiment,
        answers,
      };
      return row;
    })).then((rows) => {
      if (cancelled) return;
      const columns: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        for (const label of Object.keys(row.answers)) {
          if (!seen.has(label)) { seen.add(label); columns.push(label); }
        }
      }
      setWorkflowDetailRows(rows);
      setWorkflowDetailColumns(columns);
      setWorkflowDetailLoading(false);
    }).catch(() => {
      if (!cancelled) { setWorkflowDetailRows([]); setWorkflowDetailColumns([]); setWorkflowDetailLoading(false); }
    });

    return () => { cancelled = true; };
  }, [showWorkflowDetailView, selectedTask, leadsDatabase]);

  // Task Creation Wizard States
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [wizardWorkflowId, setWizardWorkflowId] = useState('');
  const [wizardAgentId, setWizardAgentId] = useState('');
  const [wizardAgents, setWizardAgents] = useState<WizardAgent[]>([]);
  const [wizardAgentsLoading, setWizardAgentsLoading] = useState(false);
  const [wizardSelectedLeadIds, setWizardSelectedLeadIds] = useState<string[]>([]);
  const [wizardNewContacts, setWizardNewContacts] = useState<{ name: string; phone: string }[]>([]);
  const [wizardContactSearch, setWizardContactSearch] = useState('');
  const [wizardNewName, setWizardNewName] = useState('');
  const [wizardNewPhone, setWizardNewPhone] = useState('');
  const [showWizardContactModal, setShowWizardContactModal] = useState(false);
  const [wizardContactTab, setWizardContactTab] = useState<'existing' | 'new'>('existing');
  const [wizardContactGroups, setWizardContactGroups] = useState<ContactGroup[]>([]);
  const [wizardGroupFilter, setWizardGroupFilter] = useState('All');
  const [wizardRetryConfig, setWizardRetryConfig] = useState<RetryConfig>({
    enabled: true,
    strategy: 'exponential',
    intervalMinutes: 120,
    maxRetries: 3,
    quietHoursStart: '21:00',
    quietHoursEnd: '08:00',
  });

  // Call simulator live states
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [vobizCallSid, setVobizCallSid] = useState<string | null>(null);
  const [callState, setCallState] = useState<'idle' | 'dialing' | 'connected' | 'completed'>('idle');
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<{ speaker: 'AI' | 'Customer'; text: string; timestamp: string }[]>([]);
  const [customerUtterance, setCustomerUtterance] = useState('');
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [currentSentiment, setCurrentSentiment] = useState<'Positive' | 'Neutral' | 'Negative' | 'Unknown'>('Neutral');
  const [currentIntent, setCurrentIntent] = useState<'Interested' | 'Not Interested' | 'Callback Scheduled' | 'Wrong Number' | 'Unknown'>('Unknown');

  // Multi-question state
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [extractedAnswers, setExtractedAnswers] = useState<{ [question: string]: string }>({});

  // Audio Playback states for Call Tape (Supports both Outbound and Inbound recordings)
  const [playingTapeId, setPlayingTapeId] = useState<string | null>(null);
  const [playingTapeType, setPlayingTapeType] = useState<'outbound' | 'inbound'>('outbound');
  const [isTapePlaying, setIsTapePlaying] = useState(false);
  const [tapeProgress, setTapeProgress] = useState(0);
  const [tapeSpeed, setTapeSpeed] = useState<number>(1);
  const [tapeDuration, setTapeDuration] = useState<number>(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Whether the caller in the tape currently open raised an enquiry
  // mid-call, and its status — fetched per call, not bundled onto the
  // call/lead objects already in memory (see /api/enquiries?callId=).
  const [tapeEnquiries, setTapeEnquiries] = useState<{ id: string; queryText: string; status: 'new' | 'contacted' | 'resolved' }[]>([]);
  const [loadingTapeEnquiries, setLoadingTapeEnquiries] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Set when the agent clicks "Cancel Outbound Connection" while a call is
  // still being placed (the brief window between clicking Dial and the
  // provider's API actually returning a callSid). Without this, Cancel only
  // reset the local UI — the outbound call itself was already in flight and
  // kept ringing/connecting on the real phone with no UI left to hang it up
  // from, since callState had already gone back to 'idle'. Checked the
  // moment each provider's initiate call resolves so an accidental dial
  // gets hung up for real no matter which side of that race the click
  // lands on.
  const cancelDialRequestedRef = useRef(false);

  // Outbound numbers this org has actually provisioned (Settings > Numbers)
  // that can really place a call — Vobiz is wired to real dialing; other
  // provider labels are display-only for inbound routing.
  const dialableNumbers = virtualNumbers.filter((n) => /vobiz/i.test(n.provider || ''));
  // Backend-persisted (orgSettings.defaultOutboundNumber, via
  // POST /api/settings/org) instead of plain component state — this used
  // to reset to the first dialable number on every page reload, even on
  // the same browser, and never carried over to a different device on the
  // same account. setSelectedOutboundNumber below writes through to
  // orgSettings so every change is saved automatically (the existing
  // debounced org-settings sync already running in App.tsx picks it up).
  const [selectedOutboundNumber, setSelectedOutboundNumberState] = useState<string>('');
  const setSelectedOutboundNumber = (number: string) => {
    setSelectedOutboundNumberState(number);
    setOrgSettings?.((prev) => ({ ...prev, defaultOutboundNumber: number }));
  };
  useEffect(() => {
    if (selectedOutboundNumber || dialableNumbers.length === 0) return;
    // Prefer whatever was saved server-side, as long as it's still a
    // number this org actually has provisioned; otherwise fall back to
    // the first dialable number, same as before this was persisted.
    const saved = orgSettings?.defaultOutboundNumber;
    const stillValid = saved && dialableNumbers.some((n) => n.number === saved);
    setSelectedOutboundNumberState(stillValid ? saved! : dialableNumbers[0].number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialableNumbers, selectedOutboundNumber, orgSettings?.defaultOutboundNumber]);

  // Auto-redial status per phone (see services/dialerRetryEngine.js) — keyed
  // by the last 10 digits so formatting differences (with/without country
  // code, spaces, dashes) between a lead's saved number and what Vobiz
  // stored on the call_logs row still match up.
  const [retryStatuses, setRetryStatuses] = useState<Record<string, {
    status: string; attemptNumber: number; nextRetryAt: string | null; retryStatus: string; retryConfig?: RetryConfig;
  }>>({});
  const normalizePhone = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
  useEffect(() => {
    let cancelled = false;
    const fetchRetries = async () => {
      try {
        const res = await apiFetch('/api/dialer-retries');
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        const byPhone: typeof retryStatuses = {};
        for (const row of data) {
          const key = normalizePhone(row.phone);
          if (key) byPhone[key] = row;
        }
        setRetryStatuses(byPhone);
      } catch {
        // Silent — this is a supplementary status badge, not core dialer function.
      }
    };
    fetchRetries();
    const interval = setInterval(fetchRetries, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Active call timer
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Scroll transcript to bottom
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript.length, isAiResponding]);

  // Real audio playback for the call recording <audio> element — mirrors
  // isTapePlaying/tapeProgress/tapeSpeed off the actual element instead of
  // a fake setInterval animation, so the player genuinely plays the
  // uploaded recording rather than just simulating a moving progress bar.
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    if (isTapePlaying) {
      el.play().catch(() => setIsTapePlaying(false));
    } else {
      el.pause();
    }
  }, [isTapePlaying, playingTapeId]);

  useEffect(() => {
    const el = audioElRef.current;
    if (el) el.playbackRate = tapeSpeed;
  }, [tapeSpeed]);

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

    // Wizard: submit final task
  const handleCreateTask = async () => {
    const workflow = flows.find(f => f.id === wizardWorkflowId);
    if (!workflow) return;

    // The workflow runs many times over — auto-name each task run from the
    // workflow's own name, instead of asking for a title every time — the
    // date/time it ran stays as metadata (createdAt) rather than being
    // baked into the name itself, so the workflow's name stays clean and
    // Reports (which already groups tasks by workflowName and sorts each
    // group by createdAt) can filter "every run" vs. "just one day" off
    // that metadata instead of string-parsing a name.
    const taskName = workflow.name;

    // Flattens top-level variables AND every branch's conditional follow-up
    // variables (recursively — a follow-up can itself branch further, e.g.
    // "education_level" -> branch "10th" -> follow-up "tenth_percentage").
    // Only the top-level variables used to be included here, so a
    // branch-only variable like tenth_percentage never made it into
    // task.questions/questionLabels at all — meaning even though the AI
    // correctly asked it live (driven by the full workflow, not this flat
    // list) and the caller answered it, post-call extraction had no way to
    // recognize or label that answer, and it never showed up anywhere.
    const flattenVariables = (vars: typeof workflow.variables): NonNullable<typeof workflow.variables> => {
      const out: NonNullable<typeof workflow.variables> = [];
      for (const v of vars ?? []) {
        out.push(v);
        for (const branch of v.branches ?? []) {
          out.push(...flattenVariables(branch.variables));
        }
      }
      return out;
    };

    const questionPairs = flattenVariables(workflow.variables)
      .map(v => ({ label: v.name?.trim() || slugifyQuestion(v.questionText || ''), question: v.questionText || v.name, dataType: v.dataType }))
      .filter(p => p.question);
    const questions = questionPairs.map(p => p.question);
    const questionLabels = questionPairs.map(p => p.label);
    const questionDataTypes = questionPairs.map(p => p.dataType);

    // New contacts must exist in the backend before they can be dialed.
    // Previously these were added only to React state, so auto-dial correctly
    // found the task but db.getLeadById() could not find the new contact.
    const newLeads: Lead[] = wizardNewContacts.map(c => ({
      id: `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: c.name.trim(),
      phone: c.phone.trim(),
      email: '',
      source: 'Manual Entry',
      status: 'New' as const,
      tags: [],
      notes: '',
      amountRequested: 0,
      score: 0,
      createdAt: new Date().toISOString(),
    }));

    if (newLeads.length > 0) {
      try {
        const persistedNewLeads = await Promise.all(newLeads.map(async (lead) => {
          const res = await apiFetch('/api/leads', {
            method: 'POST',
            body: JSON.stringify(lead),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error(body?.error || `Failed to create contact ${lead.name}`);
          }
          return body as Lead;
        }));
        setLeadsDatabase(prev => [...prev, ...persistedNewLeads]);
        newLeads.splice(0, newLeads.length, ...persistedNewLeads);
      } catch (err: any) {
        alert(err?.message || 'Failed to save the new contact.');
        return;
      }
    }

    const allLeadIds = [...wizardSelectedLeadIds, ...newLeads.map(l => l.id)];
    if (allLeadIds.length === 0) {
      alert('Add at least one contact before creating the task.');
      return;
    }

    const agent = wizardAgents.find(a => a.id === wizardAgentId);

    const newTask: DialTask = {
      id: `TASK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: taskName,
      workflowId: workflow.id,
      workflowName: workflow.name,
      questions,
      questionLabels,
      questionDataTypes,
      leadIds: allLeadIds,
      status: 'Pending',
      createdAt: new Date().toISOString(),
      callResults: {},
      language: agent?.language || DEFAULT_TASK_LANGUAGE,
      assignedTeamMemberId: wizardAgentId || undefined,
      retryConfig: wizardRetryConfig,
    };

    setTasks(prev => [...prev, newTask]);
    setSelectedTaskId(newTask.id);
    setShowAssignTask(false);

    // Push the new task to the backend directly (a single-row create, not
    // the delete+reinsert /sync, which can take up to 800ms) so it exists
    // server-side right away. Auto-dial is NOT started here — creating a
    // task must never place a call on its own; dialing only ever begins
    // when the user explicitly clicks "Start Campaign" (see
    // handleStartServerAutoDial), which calls the same
    // /auto-dial/start endpoint this used to call automatically.
    try {
      const res = await apiFetch('/api/dialer-tasks', {
        method: 'POST',
        body: JSON.stringify(newTask),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || 'Failed to create the dialing task on the server.');
      }
      // Keep the server representation (including any normalized fields)
      // as the selected task so Start Campaign always targets a real DB row.
      setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, ...body } : t));
    } catch (err: any) {
      setTasks(prev => prev.filter(t => t.id !== newTask.id));
      setSelectedTaskId('');
      setShowAssignTask(true);
      alert(err?.message || 'Failed to create the dialing task.');
    }
  };

  useEffect(() => {
    if (!taskPage) return;
    initializeCreateTask();
  }, [taskPage]);

  const initializeCreateTask = () => {
    setWizardStep(1);
    setWizardWorkflowId('');
    setWizardAgentId('');
    setWizardAgents([]);
    setWizardSelectedLeadIds([]);
    setWizardNewContacts([]);
    setWizardContactSearch('');
    setWizardNewName('');
    setWizardNewPhone('');
    setWizardContactTab('existing');
    setWizardGroupFilter('All');
    setShowAssignTask(true);

    // Fetch agents with outbound support
    setWizardAgentsLoading(true);
    apiFetch('/api/agents')
      .then(r => r.json())
      .then((data: WizardAgent[]) => {
        setWizardAgents(Array.isArray(data) ? data : []);
      })
      .catch(() => setWizardAgents([]))
      .finally(() => setWizardAgentsLoading(false));

    // Fetch contact groups for the "select by group" shortcut
    apiFetch('/api/contact-groups')
      .then(r => r.json())
      .then((data: ContactGroup[]) => setWizardContactGroups(Array.isArray(data) ? data : []))
      .catch(() => setWizardContactGroups([]));
  };

  const ESTIMATED_CALL_RESERVATION_INR = 5;

  // Recharge-based organizations must have enough available balance before
  // any real outbound call is attempted. The backend enforces the same rule,
  // but the UI checks it first so users see an actionable warning immediately.
  const ensureCallBalance = () => {
    if (orgSettings?.billingMethod !== 'recharge_based') return true;
    const available = Math.max(
      0,
      Number(orgSettings.rechargeBalanceInr || 0) - Number(orgSettings.rechargeReservedInr || 0),
    );
    if (available >= ESTIMATED_CALL_RESERVATION_INR) return true;

    showToast(
      'Insufficient recharge balance. Available: ' +
        formatInr(available) +
        '. Estimated call reservation: ' +
        formatInr(ESTIMATED_CALL_RESERVATION_INR) +
        '. Please recharge your organization balance before calling.',
      'warning',
    );
    return false;
  };

  const handleInitiateVobizCall = async (lead: Lead) => {
    if (!ensureCallBalance()) return;
    if (callState === 'dialing' || callState === 'connected') return;

    cancelDialRequestedRef.current = false;
    setActiveLead(lead);
    setCallState('dialing');
    setDuration(0);
    setTranscript([]);
    setCurrentSentiment('Neutral');
    setCurrentIntent('Unknown');
    setActiveQuestionIndex(0);
    setExtractedAnswers({});
    setPlayingTapeId(null);
    setIsTapePlaying(false);

    try {
      const assignedMember = selectedTask?.assignedTeamMemberId
        ? teamMembers.find((m) => m.id === selectedTask.assignedTeamMemberId)
        : undefined;
      const res = await apiFetch('/api/vobiz/call', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: lead.phone,
          questions: buildQuestionsPayload(selectedTask),
          from: selectedOutboundNumber || undefined,
          language: selectedTask?.language || undefined,
          assignedContact: assignedMember ? { name: assignedMember.name, phone: assignedMember.phone } : undefined,
          starhealthEnabled: !!selectedTask?.starhealthEnabled,
          agentId: selectedTask?.assignedTeamMemberId || undefined,
          // Lets the backend (callFinalizer.js) patch this task's
          // callResults for this lead directly when the call finishes —
          // what makes a "call me back later" callback correctly flip
          // this row from "Callback Scheduled" to "Completed" once the
          // automatic redial actually reaches them, even though that
          // happens well after this tab may have moved on or closed.
          taskId: selectedTask?.id || undefined,
          leadId: lead.id,
          retryPolicy: selectedTask?.retryConfig || undefined,
        })
      });
      const data = await res.json();
      if (data.success && data.callSid) {
        if (cancelDialRequestedRef.current) {
          // Agent already clicked Cancel before this resolved — the call is
          // real now, so actually hang it up instead of showing it as
          // connected (see cancelDialRequestedRef's own comment for why).
          cancelDialRequestedRef.current = false;
          setVobizCallSid(null);
          setCallState('idle');
          apiFetch('/api/vobiz/hangup', { method: 'POST', body: JSON.stringify({ callSid: data.callSid }) }).catch(() => {});
          return;
        }
        setVobizCallSid(data.callSid);
        setCallState('connected');
        setTranscript([
          {
            speaker: 'AI',
            text: `[Vobiz Call Started] Dialing ${lead.name} at ${lead.phone}...`,
            timestamp: new Date().toTimeString().split(' ')[0]
          }
        ]);
      } else {
        throw new Error(data.error || 'Failed to initiate Vobiz call');
      }
    } catch (err: any) {
      setCallState('idle');
      alert(`Vobiz call failed: ${err.message}`);
    }
  };

  const handleHangupVobizCall = async () => {
    if (vobizCallSid) {
      try {
        await apiFetch('/api/vobiz/hangup', { method: 'POST', body: JSON.stringify({ callSid: vobizCallSid }) });
      } catch (err) { console.error('Vobiz hangup failed:', err); }
    }
    setVobizCallSid(null);
    handleHangupCall();
  };

  // Hangup call and save detailed conversation history, questionnaire answers, and tape logs.
  // `realCallLog` — when this was triggered by the real "call_completed" SSE
  // event (see the effect above) — carries the actual backend-saved call
  // data (recording, duration, sentiment). Without it, the outbound tape
  // player always showed "No recording available" even though the call
  // really was recorded: this function only ever wrote the local
  // simulated timer/transcript, never the real Supabase-hosted recording URL.
  const handleHangupCall = (realCallLog?: { recordingUrl?: string; duration?: number; sentiment?: string; summary?: string; callId?: string; transcript?: { speaker: 'AI' | 'Customer'; text: string; timestamp: string }[]; answers?: { label?: string; question: string; answer: string }[]; status?: string; callbackTime?: string; callAnswered?: boolean }) => {
    if (!activeLead) return;
    setCallState('completed');

    // Create Call Log in state
    const callLogId = `CALL-${600 + callLogs.length + 1}`;
    const answersText = Object.entries(extractedAnswers)
      .map(([q, a]) => `• ${q} Answered: "${a}"`)
      .join('\n');

    const summaryText = `Daily Task Call [${selectedTask.name}]. Customer responded with ${currentSentiment} sentiment and ${currentIntent} intent.\n\nAssigned Questionnaire Responses:\n${answersText || 'No answers collected.'}`;

    // Real calls carry their actual outcome from the backend — "Callback
    // Scheduled" must survive here instead of being forced to "Completed"
    // the way this used to unconditionally do, or a lead the caller asked
    // to be called back later would show as done. Simulation-mode calls
    // (no realCallLog at all) have no such backend status, so those still
    // default to "Completed" exactly as before.
    const realCallLogStatus = realCallLog?.status === 'Callback Scheduled' ? 'Callback Scheduled' as const : 'Completed' as const;

    // Update results inside selected task
    const updatedTasks = tasks.map((task) => {
      if (task.id === selectedTask.id) {
        // A "Callback Scheduled" outcome (see realCallLogStatus below)
        // deliberately does NOT count as dialed here — the lead isn't
        // done, it's holding for an automatic redial the backend will
        // place later (services/dialerRetryEngine.js), which is exactly
        // what should keep the task itself out of "Completed" too.
        const isAllLeadsDialed = task.leadIds.every((lId) => {
          if (lId === activeLead.id) return realCallLogStatus !== 'Callback Scheduled';
          return task.callResults[lId]?.status === 'Completed';
        });

        return {
          ...task,
          status: isAllLeadsDialed ? 'Completed' as const : 'In Progress' as const,
          callResults: {
            ...task.callResults,
            [activeLead.id]: {
              status: realCallLogStatus,
              duration: realCallLog?.duration ?? duration,
              // Real AI-driven outbound calls never go through the manual
              // simulation input flow that fills the local `transcript`
              // state — confirmed live: Archive Room showed a real,
              // completed outbound call with zero conversation displayed,
              // because it was reading that always-empty local state
              // instead of the actual saved transcript from the call.
              transcript: realCallLog?.transcript || transcript,
              sentiment: (realCallLog?.sentiment as typeof currentSentiment) || currentSentiment,
              intent: currentIntent,
              summary: realCallLog?.summary || summaryText,
              // Real calls: answers come from the backend (lead_responses
              // table, populated by the AI's save_question_response tool).
              // Simulation mode falls back to the local extractedAnswers state.
              // Keyed by label (falling back to the raw question text for
              // rows saved before labels existed) to match how the
              // "Extracted Campaign Answers" panel looks these up.
              answers: realCallLog?.answers
                ? Object.fromEntries(realCallLog.answers.map(a => [a.label || a.question, a.answer]))
                : { ...extractedAnswers },
              recordingUrl: realCallLog?.recordingUrl,
              // The real call_logs row's id — server.js now writes this as
              // the same internal call id lead_responses.call_id uses, so
              // this is the one precise way to fetch THIS call's actual
              // answers instead of guessing by phone (which returns every
              // answer that phone number ever gave, across every call).
              callId: realCallLog?.callId,
              callbackTime: realCallLog?.callbackTime,
              callAnswered: realCallLog?.callAnswered,
              callbackReason: realCallLog?.callbackReason,
              conversationOutcome: realCallLog?.conversationOutcome,
              callbackStatus: realCallLog?.callbackStatus,
              enquiryStatus: realCallLog?.enquiryStatus,
            }
          }
        };
      }
      return task;
    });

    setTasks(updatedTasks);

    // Save globally to call logs — but only when there's no real backend
    // record for this call already. When realCallLog is set (the real
    // "call_completed" SSE event fired — see the effect above), the
    // backend's own vobizProxy.js finalizeCall() already
    // saved the authoritative row (real id, real recording, correct
    // direction) the moment the call ended. Adding a second synthetic
    // entry here and syncing it via /api/call-logs/sync (a full
    // delete-and-reinsert of the whole table) just double-logged every
    // real call under a second fake "CALL-6xx" id with no direction set
    // — confirmed live: yesterday's call count included duplicates. The
    // real entry surfaces on its own next time call logs are reloaded.
    if (!realCallLog) {
      const globalLog: CallLog = {
        id: callLogId,
        leadId: activeLead.id,
        leadName: activeLead.name,
        campaignId: selectedTask.id,
        duration: duration,
        status: 'Completed',
        sentiment: currentSentiment,
        intent: currentIntent,
        transcript: transcript,
        summary: summaryText,
        createdAt: new Date().toISOString()
      };
      setCallLogs([globalLog, ...callLogs]);
    }

    // Update Lead status in leads database
    const updatedDatabase = leadsDatabase.map((l) => {
      if (l.id === activeLead.id) {
        return {
          ...l,
          status: currentIntent === 'Interested' ? 'Qualified' : currentIntent === 'Not Interested' ? 'Unqualified' : l.status,
          notes: `Dialer Task Summary [${selectedTask.name}]:\n${summaryText}\n\n${l.notes}`
        };
      }
      return l;
    });
    setLeadsDatabase(updatedDatabase);
  };

  // Submit Caller response - proceed question by question!
  const handleSendUtterance = async (utteranceText: string) => {
    if (!utteranceText.trim() || isAiResponding || !activeLead) return;

    const currentQuestion = selectedTask.questions[activeQuestionIndex];
    const timeStr = new Date().toTimeString().split(' ')[0];

    // Save answer, keyed by label to match how real-call answers are keyed
    // (see handleHangupCall) and how the "Extracted Campaign Answers" panel
    // looks values up.
    const currentLabel = selectedTask.questionLabels?.[activeQuestionIndex] || currentQuestion;
    const newAnswers = {
      ...extractedAnswers,
      [currentLabel]: utteranceText
    };
    setExtractedAnswers(newAnswers);

    const updatedTranscript = [
      ...transcript,
      { speaker: 'Customer' as const, text: utteranceText, timestamp: timeStr }
    ];
    setTranscript(updatedTranscript);
    setCustomerUtterance('');
    setIsAiResponding(true);

    // Advance index
    const nextIndex = activeQuestionIndex + 1;

    try {
      // Call Gemini API server
      const res = await fetch('/api/simulate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadName: activeLead.name,
          loanAmount: activeLead.amountRequested,
          prompt: `Today's Daily Dialing task: "${selectedTask.name}".
AI Voice Persona: ${voicePersona} (Emotion Intensity: ${emotionIntensity}%, Speed: ${speechSpeed}%, Friendliness: ${friendliness}%).
System Instructions/Guidelines to strictly follow:
${systemPrompt}

Currently on question ${nextIndex} out of ${selectedTask.questions.length}. Next question to ask them is: "${selectedTask.questions[nextIndex] || 'None, wrap up conversation and say goodbye.'}"`,
          transcript: updatedTranscript,
          customerUtterance: utteranceText
        })
      });

      const data = await res.json();
      if (data.success) {
        let aiReply = data.reply;
        setCurrentSentiment(data.sentiment);
        setCurrentIntent(data.intent);

        // If there's a next question, append or formulate it
        if (nextIndex < selectedTask.questions.length) {
          const nextQuestion = selectedTask.questions[nextIndex];
          aiReply = `${data.reply} Moving to my next point: ${nextQuestion}`;
          setActiveQuestionIndex(nextIndex);
        } else {
          aiReply = `${data.reply} I have successfully recorded all your answers on our secure audio line. Thank you so much for your time, goodbye!`;
          setActiveQuestionIndex(nextIndex);
        }

        setTranscript((prev) => [
          ...prev,
          {
            speaker: 'AI',
            text: data.degraded ? `[Estimated — AI unavailable, using scripted fallback] ${aiReply}` : aiReply,
            timestamp: new Date().toTimeString().split(' ')[0]
          }
        ]);

        // Auto hang up if final question completed
        if (nextIndex >= selectedTask.questions.length || data.isFinished) {
          setTimeout(() => {
            handleHangupCall();
          }, 4500);
        }
      }
    } catch (err: any) {
      console.error(err);
      // The AI reply genuinely failed to generate — say so instead of
      // fabricating a plausible-sounding scripted response. Don't advance
      // the question index or touch sentiment/intent, since nothing was
      // actually answered by the AI.
      setTranscript((prev) => [
        ...prev,
        {
          speaker: 'AI',
          text: `[AI response unavailable — ${err?.message || 'the call assistant failed to respond'}. Please retry or continue manually.]`,
          timestamp: new Date().toTimeString().split(' ')[0]
        }
      ]);
    } finally {
      setIsAiResponding(false);
    }
  };

  // Skip lead
  const handleSkipLead = (leadId: string) => {
    const updatedTasks = tasks.map((task) => {
      if (task.id === selectedTask.id) {
        return {
          ...task,
          callResults: {
            ...task.callResults,
            [leadId]: {
              status: 'Skipped' as const,
              duration: 0,
              transcript: [],
              sentiment: 'Unknown' as const,
              intent: 'Unknown' as const,
              summary: 'Call skipped by representative.',
              answers: {}
            }
          }
        };
      }
      return task;
    });
    setTasks(updatedTasks);
  };  // Open Cassette Recording Player for a Completed Call
  const handleOpenTapePlayer = (id: string, type: 'outbound' | 'inbound' = 'outbound') => {
    setPlayingTapeId(id);
    setPlayingTapeType(type);
    setTapeProgress(0);
    setTapeDuration(0);
    // Open the player paused — it used to auto-play the recording the
    // instant the sidebar opened, before the user had asked for it.
    setIsTapePlaying(false);
  };

  const activeTapeResult = playingTapeType === 'inbound'
    ? realInboundCallLogs.find((log) => log.id === playingTapeId)
    : selectedTask?.callResults[playingTapeId || ''];

  // Inbound tape entries are real CallLog rows (have a stable call_logs
  // id), so Vobiz-hosted recordings can go through the authenticated
  // proxy (see getPlayableRecordingUrl — media.vobiz.ai requires headers
  // a plain <audio src> can't send). Outbound dialer-task results don't
  // carry that id, so those still use the raw URL — a pre-existing gap,
  // not something introduced here.
  const playableTapeRecordingUrl = activeTapeResult?.recordingUrl
    ? (playingTapeType === 'inbound'
        ? getPlayableRecordingUrl((activeTapeResult as CallLog).id, activeTapeResult.recordingUrl)
        : activeTapeResult.recordingUrl)
    : undefined;

  const activeTapeLead = playingTapeType === 'inbound'
    ? null
    : leadsDatabase.find((l) => l.id === playingTapeId);

  // The real call_logs id behind whatever's open in the tape player —
  // inbound tape entries ARE call_logs rows (their own .id); outbound
  // dialer-task results carry it separately as .callId (see handleHangupCall).
  const activeTapeCallId = playingTapeType === 'inbound'
    ? (activeTapeResult as CallLog | undefined)?.id
    : (activeTapeResult as { callId?: string } | undefined)?.callId;

  useEffect(() => {
    if (!activeTapeCallId) {
      setTapeEnquiries([]);
      return;
    }
    let cancelled = false;
    setLoadingTapeEnquiries(true);
    apiFetch(`/api/enquiries?callId=${encodeURIComponent(activeTapeCallId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((result: { rows: { id: string; queryText: string; status: 'new' | 'contacted' | 'resolved' }[] } | null) => {
        if (!cancelled) setTapeEnquiries(Array.isArray(result?.rows) ? result.rows : []);
      })
      .catch(() => { if (!cancelled) setTapeEnquiries([]); })
      .finally(() => { if (!cancelled) setLoadingTapeEnquiries(false); });
    return () => { cancelled = true; };
  }, [activeTapeCallId]);

  // Single source of truth for "Extracted Campaign Answers": the backend
  // now resolves each row's real name + data type from the owning dialer
  // task's workflowId (persisted on dialer_tasks as of this fix — see
  // postgres.js's workflow_id column comment) matched against that
  // workflow's CURRENT variables, self-sufficient regardless of what's in
  // this browser tab's local state. Rendered directly as name:value pairs
  // instead of looping the task's frozen question list, so there's
  // nothing left to fall back to guessing (slugifying the question, or
  // showing a "No answer captured" placeholder) — a row only appears here
  // once it actually has a resolved name and a real answer.
  interface TapeAnswerRow { label: string; dataType?: string; answer: string }
  const [tapeAnswerRows, setTapeAnswerRows] = useState<TapeAnswerRow[]>([]);
  useEffect(() => {
    if (!activeTapeCallId) {
      setTapeAnswerRows([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/calls/${encodeURIComponent(activeTapeCallId)}/lead-responses`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { label?: string; question: string; answer: string; dataType?: string | null }[] | null) => {
        if (cancelled) return;
        setTapeAnswerRows(
          (rows || [])
            .filter((row) => row.label && row.answer)
            .map((row) => ({ label: row.label as string, dataType: row.dataType || undefined, answer: row.answer }))
        );
      })
      .catch(() => { if (!cancelled) setTapeAnswerRows([]); });
    return () => { cancelled = true; };
  }, [activeTapeCallId]);

  const dialLead = (lead: Lead) => {
    handleInitiateVobizCall(lead);
  };

  const [serverAutoDialBusy, setServerAutoDialBusy] = useState(false);

  // Server-side auto-dial: the backend (src/crm/autoDialEngine.js) walks
  // the task's lead list on its own polling loop and keeps going even if
  // this tab is closed, unlike the local "Start Campaign" toggle above,
  // which stops the instant the browser does. This just
  // flips the task's auto_dial_enabled flag server-side — the engine does
  // the actual dialing; this component only reflects its progress via the
  // task object refreshing (App.tsx already re-fetches /api/dialer-tasks
  // periodically, and auto_dial_progress broadcasts show as toast
  // notifications through App.tsx's existing SSE handler).
  const handleStartServerAutoDial = async () => {
    if (!selectedTask) return;
    if (!ensureCallBalance()) return;
    setServerAutoDialBusy(true);
    try {
      const res = await apiFetch(`/api/dialer-tasks/${selectedTask.id}/auto-dial/start`, {
        method: 'POST',
        body: JSON.stringify({ outboundNumber: selectedOutboundNumber || undefined }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to start server-side auto-dial');
      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updated } : t)));
    } catch (err: any) {
      alert(`Couldn't start background auto-dial: ${err.message}`);
    } finally {
      setServerAutoDialBusy(false);
    }
  };

  const handleStopServerAutoDial = async () => {
    if (!selectedTask) return;
    setServerAutoDialBusy(true);
    try {
      const res = await apiFetch(`/api/dialer-tasks/${selectedTask.id}/auto-dial/stop`, { method: 'POST' });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to stop server-side auto-dial');
      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updated } : t)));
    } catch (err: any) {
      alert(`Couldn't stop background auto-dial: ${err.message}`);
    } finally {
      setServerAutoDialBusy(false);
    }
  };

  // Detects the REAL end of a live outbound call (the AI hanging up via
  // end_call, or the callee hanging up) — without this, `callState` only
  // ever flipped to 'completed' from a manual "Hang Up" button click, so
  // Continuous Dialer Mode would sit stuck on 'connected' forever for any
  // call the AI ended on its own, never advancing to the next lead.
  //
  // IMPORTANT: this does NOT open its own SSE connection. App.tsx already
  // maintains the one authenticated EventSource to /api/logs-stream for the
  // whole app session and folds every "call_completed" event straight into
  // the shared `callLogs` prop. An earlier version of this effect opened a
  // second EventSource to that same endpoint here — torn down and reopened
  // on every callState change, which raced a fast-ending call (voicemail/
  // AMD auto-hangup, "no answer") against the connection being open again
  // and could silently lose that event (EventSource never replays missed
  // messages), leaving callState stuck on 'connected' forever. Making that
  // connection permanent instead (opened once, closed never) fixed the
  // race but meant TWO permanent connections to the same endpoint for the
  // lifetime of the tab — on HTTP/1.1 that can exhaust the browser's
  // ~6-connections-per-origin limit and starve unrelated requests (like
  // the data fetch for whatever page you navigate to next), which is
  // exactly why sidebar navigation stopped responding until a full reload
  // freed up connections. Watching the already-shared `callLogs` array
  // avoids a second connection altogether and can't miss events, since
  // App.tsx's listener is the single point that receives and records them.
  const processedCallLogIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (callState !== 'connected' || !activeLead) return;
    // Match by the exact provider call id (Vobiz CallUUID) rather than by
    // phone number — the backend now broadcasts this on every
    // call_completed event (see callFinalizer.js), and it's the SAME id
    // already sitting in vobizCallSid the moment this call was placed, so
    // there's no string formatting to get wrong. Phone-number matching was
    // fundamentally
    // fragile: activeLead.phone and the callerNumber the provider reports
    // back can differ in country-code/leading formatting (e.g. lead stored
    // as "6384670687" but Vobiz reports "+916384670687"), so an exact
    // string compare — or even a last-10-digits compare, for any lead
    // stored with a non-Indian or oddly-formatted number — could silently
    // never match, leaving the dialer UI stuck on "connected" forever even
    // though the backend had already logged the call and broadcast
    // call_completed. Falls back to the old phone-based match only for log
    // rows that predate this field (no providerCallSid present).
    const activeCallSid = vobizCallSid || null;
    const sanitize = (n: string) => (n || '').replace(/[\s\-\(\)\+]+/g, '').slice(-10);
    const targetPhone = sanitize(activeLead.phone);
    // Scan the most recent entries, not just callLogs[0] — a broadcast for
    // an unrelated call (a different concurrent inbound call, or a
    // duration-correction patch racing the initial create) can land ahead
    // of this call's own completion in the array. Checking only the very
    // top entry meant that one out-of-order arrival permanently missed
    // this call's real completion broadcast, leaving the dialer UI stuck
    // showing it as active. 10 is comfortably more than could arrive
    // between two polls of this effect in practice.
    const match = callLogs.slice(0, 10).find((log) => {
      if (processedCallLogIdRef.current === log.id) return false;
      if (activeCallSid && log.providerCallSid) return log.providerCallSid === activeCallSid;
      return (
        log.direction === 'outbound' &&
        targetPhone.length === 10 &&
        sanitize(log.callerNumber || log.leadName || '') === targetPhone
      );
    });
    if (!match) return;
    processedCallLogIdRef.current = match.id;
    handleHangupCall({
      recordingUrl: match.recordingUrl,
      duration: match.duration,
      sentiment: match.sentiment,
      summary: match.summary,
      callId: match.id,
      transcript: match.transcript,
      // Backend broadcasts this as { label, question, answer }[]; the
      // shared CallLog type declares `answers` as a plain string map for
      // other (non-workflow) callers of that type, so it's re-asserted here.
      answers: match.answers as unknown as { label?: string; question: string; answer: string }[] | undefined,
      status: match.status,
      callbackTime: match.callbackTime,
      callAnswered: match.callAnswered,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callLogs, callState, activeLead, vobizCallSid]);

  // Call/recording detail — a SlideOver (docked side panel, see
  // ./ui/SlideOver) instead of the full-page takeover this used to be.
  // Computed here (rather than left as an early `return`) so the rest of
  // the page stays mounted underneath it, exactly like every other
  // "click a row, see detail" panel in this app (ReportsView.tsx,
  // LeadManagementView.tsx) already does.
  const tapeSlideOverOpen = !!(playingTapeId && activeTapeResult);
  let tapeDisplayTitle = '';
  let tapeDisplaySubtitle = '';
  let tapeDetailContent: React.ReactNode = null;
  if (tapeSlideOverOpen && activeTapeResult) {
    const isOutbound = playingTapeType === 'outbound';
    // activeTapeResult is a CallLog when inbound (from realInboundCallLogs)
    // or a dialer-task callResults entry when outbound — the two don't
    // share leadName/createdAt, so every access below is guarded by
    // isOutbound at runtime; this cast just tells TS what that guard
    // already guarantees instead of it widening to the union.
    const inboundLog = !isOutbound ? (activeTapeResult as CallLog) : null;
    tapeDisplayTitle = isOutbound && activeTapeLead
      ? `${activeTapeLead.name} Call Analysis`
      : `${inboundLog?.leadName} Inbound Call Analysis`;

    tapeDisplaySubtitle = isOutbound
      ? `Campaign: ${selectedTask?.name}`
      : `Caller: ${inboundLog?.leadName} • Recorded ${inboundLog ? new Date(inboundLog.createdAt).toLocaleString() : ''}`;

    const filename = isOutbound && activeTapeLead
      ? `${activeTapeLead.name.toUpperCase()}_recording.wav`
      : `${String(inboundLog?.leadName).toUpperCase()}_inbound_recording.wav`;

    tapeDetailContent = (
      <div className="space-y-5 font-sans text-[var(--text-primary)]">
        <div className="flex items-center gap-2">
          <Badge color="blue" className="font-mono uppercase tracking-widest">Archive Room</Badge>
          <Badge color="green" className="font-mono uppercase tracking-widest">{isOutbound ? 'Outbound campaign' : 'Inbound call'}</Badge>
          {/* Picked up but never actually engaged — still status
              "Completed" but no real conversation happened. */}
          {activeTapeResult.status === 'Completed' && activeTapeResult.callAnswered === false && (
            <Badge color="rose" className="font-mono uppercase tracking-widest">Not Answered</Badge>
          )}
        </div>

        {/* Recording player */}
        <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
          {playableTapeRecordingUrl && (
            <audio
              ref={audioElRef}
              src={playableTapeRecordingUrl}
              preload="metadata"
              onLoadedMetadata={(e) => setTapeDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (el.duration) setTapeProgress((el.currentTime / el.duration) * 100);
              }}
              onEnded={() => {
                setIsTapePlaying(false);
                setTapeProgress(100);
              }}
              style={{ display: 'none' }}
            />
          )}
          <button
            onClick={() => setIsTapePlaying(!isTapePlaying)}
            disabled={!playableTapeRecordingUrl}
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all cursor-pointer active:scale-95 shadow-md shadow-emerald-600/10"
            title={!playableTapeRecordingUrl ? 'No recording available' : isTapePlaying ? 'Pause Tape' : 'Play Tape'}
          >
            {isTapePlaying ? (
              <Pause className="h-4 w-4 fill-white text-white" />
            ) : (
              <Play className="h-4 w-4 fill-white text-white ml-0.5" />
            )}
          </button>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono text-[var(--text-muted)]">
              <span className="truncate font-semibold text-blue-600">{filename}</span>
              <span className="shrink-0 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {activeTapeResult.recordingUrl
                  ? `${formatTime(Math.round(((tapeDuration || activeTapeResult.duration) * tapeProgress) / 100))} / ${formatTime(Math.round(tapeDuration || activeTapeResult.duration))}`
                  : 'No recording available'}
              </span>
            </div>
            <div className="relative h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-1.5 transition-all" style={{ width: `${tapeProgress}%` }}></div>
            </div>
          </div>
          <div className="flex border border-[var(--border)] bg-[var(--bg-surface)] rounded-lg overflow-hidden text-[10px] h-8 items-center shrink-0">
            {[1, 1.5, 2].map((sp) => (
              <button
                key={sp}
                onClick={() => setTapeSpeed(sp)}
                className={`px-2 h-full font-mono font-bold ${tapeSpeed === sp ? 'bg-blue-600 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]'} cursor-pointer transition-all`}
              >
                {sp}x
              </button>
            ))}
          </div>
        </div>

        {/* Cognitive Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)] px-3 py-2 rounded-xl text-center">
            <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Intent</span>
            <span className="text-xs font-bold text-blue-600">{activeTapeResult.intent}</span>
          </div>
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)] px-3 py-2 rounded-xl text-center">
            <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Sentiment</span>
            <span className="text-xs font-bold text-emerald-600">{activeTapeResult.sentiment}</span>
          </div>
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)] px-3 py-2 rounded-xl text-center">
            <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase tracking-wider block">Cost</span>
            <span className="text-xs font-bold text-[var(--text-secondary)]">{formatInr(callCostInr(activeTapeResult.duration))}</span>
          </div>
        </div>

        {/* Enquiry raised during this call, if any */}
        {loadingTapeEnquiries ? (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)]/60 rounded-xl p-4 text-[11px] text-[var(--text-muted)] flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking for enquiries…
          </div>
        ) : tapeEnquiries.length > 0 ? (
          <div className="bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 space-y-3">
            <span className="text-[9px] font-mono text-amber-700 dark:text-amber-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              Enquiry Raised{tapeEnquiries.length > 1 ? `s (${tapeEnquiries.length})` : ''}
            </span>
            {tapeEnquiries.map((eq) => (
              <div key={eq.id} className="flex items-start justify-between gap-3 bg-white/70 dark:bg-black/20 border border-amber-100 dark:border-amber-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-[var(--text-primary)] leading-relaxed flex-1">"{eq.queryText}"</p>
                <span
                  className={`shrink-0 text-[9px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                    eq.status === 'new'
                      ? 'bg-amber-200 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                      : eq.status === 'contacted'
                      ? 'bg-blue-200 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300'
                      : 'bg-emerald-200 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  {eq.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)]/60 rounded-xl p-4 text-[11px] text-[var(--text-muted)] flex items-center gap-2">
            <MessageCircleQuestion className="h-3.5 w-3.5" /> No enquiry raised on this call.
          </div>
        )}

        {/* Scheduled callback, if this call ended with the caller asking
            to be called back — same signal the Scheduled Callbacks page
            and dialerRetryEngine.js's automatic redial already key off
            (status === "Callback Scheduled"), just surfaced here too so
            it's visible without leaving the call's own detail panel. */}
        {activeTapeResult.status === 'Callback Scheduled' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <span className="text-[9px] font-mono text-blue-700 uppercase tracking-widest font-bold flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Scheduled Callback
            </span>
            <p className="text-xs text-[var(--text-primary)]">
              {activeTapeResult.callbackTime
                ? new Date(activeTapeResult.callbackTime).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                : 'Time not specified — will retry soon'}
            </p>
            {(activeTapeResult as { callbackReason?: string }).callbackReason && (
              <p className="text-xs text-[var(--text-secondary)] italic">"{(activeTapeResult as { callbackReason?: string }).callbackReason}"</p>
            )}
          </div>
        ) : (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)]/60 rounded-xl p-4 text-[11px] text-[var(--text-muted)] flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> No callback scheduled for this call.
          </div>
        )}

        {/* AI Summary */}
        <div className="bg-[var(--bg-subtle)] border border-[var(--border)]/60 rounded-xl p-4 space-y-1.5">
          <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-widest font-bold block">AI Summarized Intake</span>
          <p className="text-[var(--text-secondary)] leading-relaxed text-xs italic font-sans">
            "{activeTapeResult.summary}"
          </p>
        </div>

        {/* Conversation transcript */}
        <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border)] space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-widest font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              Conversation Transcript
            </span>
          </div>
          <div className="space-y-4">
            {activeTapeResult.transcript && activeTapeResult.transcript.length > 0 ? (
              activeTapeResult.transcript.map((line: any, idx: number) => {
                const isAI = line.speaker === 'AI';
                const speakerLabel = isAI
                  ? `AI ${agentDisplayName}`
                  : `${isOutbound && activeTapeLead ? activeTapeLead.name : inboundLog?.leadName}`;
                return (
                  <div key={idx} className="flex flex-col" style={{ alignItems: isAI ? 'flex-start' : 'flex-end' }}>
                    <div className="flex items-center space-x-1.5 mb-1.5 text-[9px] text-[var(--text-muted)] font-mono">
                      <span className="flex items-center gap-1 font-bold" style={{ color: 'var(--text-secondary)' }}>
                        {isAI ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {speakerLabel}
                      </span>
                      <span>•</span>
                      <span>{line.timestamp}</span>
                    </div>
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-[13px] font-sans leading-relaxed shadow-sm border ${
                        isAI
                          ? 'bg-blue-50/70 text-[var(--text-primary)] rounded-tl-none border-blue-100/80'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] rounded-tr-none border-[var(--border)]'
                      }`}
                    >
                      {line.text}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-[var(--text-muted)] text-center py-8">No conversation script captured.</p>
            )}
          </div>
        </div>

        {/* Answers / inbound metadata */}
        {!isOutbound && (
          <div className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-widest font-bold block border-b border-[var(--border)] pb-2">Inbound Metadata</span>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[var(--text-muted)] font-medium block">Caller Number</span>
                <span className="font-mono font-bold text-[var(--text-secondary)] block mt-0.5">{inboundLog?.leadName}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] font-medium block">Status</span>
                <span className="font-semibold text-blue-600 block mt-0.5">{activeTapeResult.status}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] font-medium block">Call Duration</span>
                <span className="font-mono text-[var(--text-secondary)] block mt-0.5">{activeTapeResult.duration} seconds</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] font-medium block">Recording Date</span>
                <span className="font-mono text-[var(--text-secondary)] block mt-0.5">{inboundLog ? new Date(inboundLog.createdAt).toLocaleString() : ''}</span>
              </div>
            </div>
          </div>
        )}
        {/* Extracted Campaign Answers — rendered directly from the
            backend's resolved rows (see the tapeAnswerRows fetch above and
            routes/calls.js): name + data type on their own line, the
            answer boxed on the line below. No fallback guessing
            (slugifying the question, showing "No answer captured") — a
            row only appears once the backend actually resolved a real
            name and there's a real answer for it. Shown for both outbound
            and inbound the same way; a call with nothing extracted just
            shows no section at all. */}
        {tapeAnswerRows.length > 0 && (
          <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border)] space-y-3">
            <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-widest font-bold pb-3 border-b border-[var(--border)] flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" />
              Extracted Campaign Answers
            </span>
            <div className="space-y-3">
              {tapeAnswerRows.map((row, i) => (
                <div key={i} className="p-3 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border)] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{row.label}</span>
                    {row.dataType && (
                      <span className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border)] shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {row.dataType}
                      </span>
                    )}
                  </div>
                  <div className="bg-[var(--bg-surface)] border border-[var(--border)]/80 rounded-lg px-3 py-2.5 font-sans text-xs shadow-sm">
                    <div className="text-emerald-600 flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <p className="text-[var(--text-primary)] leading-relaxed">{row.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Quick speech suggestions based on active question
  const getSuggestionsForActiveQuestion = () => {
    if (activeQuestionIndex === 0) {
      return ["Yes, I definitely want to proceed!", "No, please cancel my request.", "I am in a bit of a rush."];
    }
    if (activeQuestionIndex === 1) {
      return ["I work full-time as a corporate employee", "I run my own business", "I earn around $6,000 every month"];
    }
    if (activeQuestionIndex === 2) {
      return ["My credit is excellent, around 750", "I have fair credit", "My credit score is close to 600"];
    }
    return ["Thank you, goodbye!", "When will you call me back?", "Yes, send me the links."];
  };

  // Quick calculation for task metrics — selectedTask is undefined when the
  // org has no dialing tasks yet (a real, valid state now that this is real
  // backend data instead of always-seeded fake tasks).
  const totalLeadsInTask = selectedTask?.leadIds.length || 0;
  const completedLeadsInTask = selectedTask ? Object.keys(selectedTask.callResults).map(k => selectedTask.callResults[k]).filter(r => r.status === 'Completed').length : 0;
  const skippedLeadsInTask = selectedTask ? Object.keys(selectedTask.callResults).map(k => selectedTask.callResults[k]).filter(r => r.status === 'Skipped').length : 0;
  const conversionPercent = selectedTask && completedLeadsInTask > 0
    ? Math.round((Object.keys(selectedTask.callResults).map(k => selectedTask.callResults[k]).filter(r => r.intent === 'Interested').length / completedLeadsInTask) * 100)
    : 0;

  const selectedCampaignScriptName =
    selectedTask?.workflowName
    || selectedTask?.workflowRunMetadata?.workflowName
    || null;

  const dialerPageTitle = dialerMode === 'outbound' ? 'Outbound Campaigns' : 'Inbound Calls';
  const dialerPageSubtitle = dialerMode === 'outbound'
    ? 'Create and run outbound campaigns (each run is its own dialer task). Monitor the queue, auto-dial, and review extracted answers per campaign.'
    : 'Monitor calls to your virtual numbers. Inbound calls are not tied to an outbound campaign, but use the same analysis and extracted answers panels.';

  return (
    <PageShell
      title={taskPage
        ? (
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setShowAssignTask(false)}
                className="text-xs font-medium text-slate-400 hover:text-slate-700 dark:text-[var(--text-muted)] dark:hover:text-[var(--text-primary)] transition-colors shrink-0"
              >
                Voice Simulator
              </button>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="text-lg font-semibold text-slate-900 dark:text-[var(--text-primary)] truncate">New outbound campaign</span>
            </div>
          )
        : <BreadcrumbTitle group="Campaign" page={dialerPageTitle} />}
      subtitle={taskPage
        ? 'Choose a call script (workflow), agent, and contacts. Each create action starts a new campaign run with its own queue and callbacks.'
        : dialerPageSubtitle}
      layout={taskPage ? 'grid' : 'fill'}
      onRefresh={taskPage ? () => {} : undefined}
      titleActions={
        taskPage ? (
          <IconButton
            icon={ArrowLeft}
            label="Back to Voice Simulator"
            onClick={() => setShowAssignTask(false)}
          />
        ) : undefined
      }
      action={
        taskPage
          ? undefined
          : dialerMode === 'outbound' ? (
              <IconButton
                icon={Plus}
                label="New outbound campaign"
                onClick={() => setShowAssignTask(true)}
              />
            ) : undefined
      }
      toolbar={
        // Calling Telemetry — moved here from a static widget in the
        // campaign list body. Only rendered while a call is actually in
        // flight for this campaign (autoDialStatus 'dialing', not merely
        // autoDialEnabled — the task can be enabled but momentarily
        // 'waiting'/'paused' between dials with no call actually
        // happening), so it's simply absent the rest of the time instead
        // of showing an "OFF" state anywhere. Pinned in the shared
        // header's own toolbar slot (see PageHeaderBar.tsx) so it stays
        // visible right below the page header regardless of how far the
        // list below is scrolled, instead of scrolling away with it.
        dialerMode === 'outbound' && selectedTask?.autoDialEnabled && selectedTask.autoDialStatus === 'dialing' ? (
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider font-bold whitespace-nowrap">
              <Bot className="h-3 w-3" /> Calling Telemetry · LIVE
            </span>
            <span className="text-xs font-bold whitespace-nowrap">Continuous Dialer Mode: ON</span>
            <span className="text-[11px] truncate">Auto-dialing every pending lead in this list, one after another, on the server — keeps going even if you close this page. Hit "Stop Auto-Dial" to pause immediately.</span>
          </div>
        ) : undefined
      }
    >
      {!taskPage && (
      <div className="overflow-y-auto flex-1 px-8 pb-8 pt-6 space-y-6">

      {dialerMode === 'outbound' ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard colSpan={1} label="Targets Loaded" value={totalLeadsInTask} icon={FileSpreadsheet} iconPosition="right" iconBg="var(--bg-subtle)" iconColor="var(--text-muted)" className="!rounded-xl !min-h-0 !p-3.5" />
            <KpiCard colSpan={1} label="Recorded Dialed" value={completedLeadsInTask} icon={CheckCircle2} iconPosition="right" iconBg="var(--bg-subtle)" iconColor="var(--text-muted)" className="!rounded-xl !min-h-0 !p-3.5" />
            <KpiCard colSpan={1} label="Skipped/No Answer" value={skippedLeadsInTask} icon={XCircle} iconPosition="right" iconBg="var(--bg-subtle)" iconColor="var(--text-muted)" className="!rounded-xl !min-h-0 !p-3.5" />
            <KpiCard colSpan={1} label="Conversion Rate" value={`${conversionPercent}%`} icon={Activity} iconPosition="right" iconBg="var(--bg-subtle)" iconColor="#059669" className="!rounded-xl !min-h-0 !p-3.5" />
          </div>

          <div className="grid grid-cols-12 gap-3 xl:gap-4 items-stretch rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-2 lg:p-3 shadow-sm">
        {/* Unified simulator workspace: campaign navigator + active campaign */}
        <aside className={`col-span-12 transition-all duration-200 ${isSimulatorNavigatorCollapsed ? 'lg:col-span-1 xl:col-span-1' : 'lg:col-span-4 xl:col-span-3'}`}>
        {/* Left: campaign navigator */}
        <Widget
          colSpan={4}
          title="Campaigns"
          icon={Megaphone}
          className={`!col-span-12 min-h-0 lg:min-h-[60vh] lg:sticky lg:top-4 border-[var(--border)] shadow-none bg-transparent overflow-hidden ${isSimulatorNavigatorCollapsed ? 'lg:!p-1' : ''}`}
          action={
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">{tasks.length} runs</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsCampaignNavigatorOpen((open) => !open)}
                  className="lg:hidden h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-secondary)]"
                  aria-label={isCampaignNavigatorOpen ? 'Collapse campaigns' : 'Expand campaigns'}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isCampaignNavigatorOpen ? 'rotate-180' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSimulatorNavigatorCollapsed((collapsed) => !collapsed)}
                  className="hidden lg:flex h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label={isSimulatorNavigatorCollapsed ? 'Expand campaigns' : 'Collapse campaigns'}
                  title={isSimulatorNavigatorCollapsed ? 'Expand campaigns' : 'Collapse campaigns'}
                >
                  {isSimulatorNavigatorCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>
              </div>
            </div>
          }
        >
          <div className={`flex flex-col ${isCampaignNavigatorOpen ? 'flex' : 'hidden lg:flex'} ${isSimulatorNavigatorCollapsed ? 'lg:hidden' : ''}`}>
            <div className="px-3 pb-3 border-b border-[var(--border)]">
              <div className="relative">
                <SearchInput
                  value={campaignSearch}
                  onChange={setCampaignSearch}
                  placeholder="Search campaigns..."
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">All campaigns</span>
              <span className="text-[10px] text-[var(--text-muted)]">{tasks.length}</span>
            </div>

            <div className="space-y-1.5 max-h-[52vh] lg:max-h-[62vh] overflow-y-auto px-2 pb-2">
              {tasks
                .filter((task) => {
                  const q = campaignSearch.trim().toLowerCase();
                  if (!q) return true;
                  return task.name.toLowerCase().includes(q)
                    || (task.workflowName || task.workflowRunMetadata?.workflowName || '').toLowerCase().includes(q);
                })
                .map((task) => {
                  const isActive = task.id === selectedTaskId;
                  const completed = Object.values(task.callResults).filter((r) => r.status === 'Completed').length;
                  const total = task.leadIds.length;
                  const pending = Math.max(0, total - completed);
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                  const scriptName = task.workflowName || task.workflowRunMetadata?.workflowName || 'No script';
                  const statusDot = task.status === 'Completed'
                    ? 'bg-emerald-500'
                    : task.status === 'In Progress'
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-slate-400';

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setPlayingTapeId(null);
                        setIsTapePlaying(false);
                      }}
                      className={`w-full text-left rounded-xl border transition-all p-3 group ${
                        isActive
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/20 shadow-sm'
                          : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${statusDot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-[var(--text-primary)] truncate">{task.name}</p>
                            <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isActive ? 'text-blue-600 translate-x-0.5' : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100'}`} />
                          </div>

                          <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{scriptName}</p>

                          <div className="flex items-center gap-2 mt-2 text-[9px] text-[var(--text-muted)]">
                            <span>{completed}/{total} dialed</span>
                            <span>•</span>
                            <span>{pending} pending</span>
                            <span className="ml-auto font-medium">{percent}%</span>
                          </div>

                          <div className="h-1 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden mt-1.5">
                            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-[9px] text-[var(--text-muted)] truncate">
                              {new Date(task.workflowRunMetadata?.runAt || task.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className={`text-[9px] font-semibold ${
                              task.status === 'Completed' ? 'text-emerald-600 dark:text-emerald-400'
                              : task.status === 'In Progress' ? 'text-blue-600 dark:text-blue-400'
                              : 'text-[var(--text-muted)]'
                            }`}>
                              {task.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

              {tasks.length === 0 && (
                <div className="px-3 py-10 text-center">
                  <Megaphone className="h-7 w-7 mx-auto text-[var(--text-muted)] mb-2" />
                  <p className="text-xs font-semibold text-[var(--text-primary)]">No campaigns yet</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">Create your first outbound campaign.</p>
                </div>
              )}
            </div>
          </div>
        </Widget>
        </aside>

        {isSimulatorNavigatorCollapsed && (
          <div className="hidden lg:flex lg:col-span-1 xl:col-span-1 min-h-[65vh] lg:min-h-[60vh] flex-col items-center gap-2 py-2">
            {tasks.slice(0, 10).map((task) => {
              const active = task.id === selectedTaskId;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  title={task.name}
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-colors ${active ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-subtle)]'}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${task.status === 'Completed' ? 'bg-emerald-500' : task.status === 'In Progress' ? 'bg-blue-500' : 'bg-slate-400'}`} />
                </button>
              );
            })}
          </div>
        )}

        {/* Main Column: Selected Task Queue Workspace */}
        <div className={`col-span-12 transition-all duration-200 ${isSimulatorNavigatorCollapsed ? 'lg:col-span-10 xl:col-span-10' : 'lg:col-span-8 xl:col-span-9'}`}>
        <Widget colSpan={12} showHeader={false} className="!col-span-12 min-h-[65vh] lg:min-h-[60vh] border-0 shadow-none overflow-hidden">
          {!selectedTask ? (
            <EmptyState
              icon={FileSpreadsheet}
              heading="No outbound campaigns yet"
              message="Create a campaign to dial contacts with a call script and track results per run."
              action={
                <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowAssignTask(true)}>
                  New outbound campaign
                </Button>
              }
            />
          ) : (
          <div className="flex flex-col h-full gap-4">
            <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)]/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-blue-600 shrink-0" />
                  <span className="truncate">{selectedTask.name}</span>
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Campaign queue
                  {selectedCampaignScriptName ? ` · Call script: ${selectedCampaignScriptName}` : ''}
                  {' · '}{selectedTask.leadIds.length} contact{selectedTask.leadIds.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={showWorkflowDetailView ? 'primary' : 'secondary'}
                  size="sm"
                  icon={MessageCircleQuestion}
                  onClick={() => setShowWorkflowDetailView((v) => !v)}
                  title={showWorkflowDetailView
                    ? 'Switch back to the dial queue — status, sentiment, and outcomes per contact'
                    : 'Show one column per extracted answer for every contact in this campaign'}
                >
                  {showWorkflowDetailView ? 'Queue view' : 'Answer columns'}
                </Button>
              {selectedTask.status !== 'Completed' && (
                <Button
                  variant={selectedTask.autoDialEnabled ? 'danger' : 'primary'}
                  size="sm"
                  icon={PhoneCall}
                  disabled={serverAutoDialBusy || dialableNumbers.length === 0}
                  onClick={selectedTask.autoDialEnabled ? handleStopServerAutoDial : handleStartServerAutoDial}
                  title={selectedTask.autoDialEnabled
                    ? 'Stops auto-dialing this task — hangs up the current call immediately'
                    : 'Dials every pending lead in this list automatically, on the server — keeps going even if you close this tab or the app'}
                >
                  {selectedTask.autoDialEnabled ? 'Stop Auto-Dial' : 'Start Campaign'}
                </Button>
              )}
              </div>

            </div>

            {/* List Queue Table — normal mode (Lead Contact/Value/Survey
                Status/AI Sentiment/Survey Outcome) or, toggled, one column
                per workflow variable actually extracted for this campaign
                (same shape as Reports' Campaign Details table, scoped to
                just this task). */}
            <div className="flex-1 min-h-0 rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-surface)]">
            {showWorkflowDetailView ? (
              workflowDetailLoading ? (
                <div className="flex items-center justify-center py-16 text-[var(--text-muted)] text-sm">Loading campaign answers…</div>
              ) : workflowDetailRows.length === 0 ? (
                <EmptyState heading="No completed calls in this campaign yet" />
              ) : (() => {
                const columns: Column<WorkflowDetailRow>[] = [
                  { key: 'leadName', header: 'Lead Contact', cell: (r) => (
                    <div className="space-y-0.5">
                      <p className="font-bold text-[var(--text-primary)]">{r.leadName}</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">{r.phone}</p>
                    </div>
                  ) },
                  { key: 'status', header: 'Survey Status', cell: (r) => <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.status}</span> },
                  { key: 'sentiment', header: 'AI Sentiment', cell: (r) => <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.sentiment}</span> },
                  ...workflowDetailColumns.map((label): Column<WorkflowDetailRow> => ({
                    key: label,
                    header: label,
                    cell: (r) => r.answers[label]
                      ? <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{r.answers[label]}</span>
                      : <span className="text-[var(--text-muted)] italic text-xs">—</span>,
                  })),
                ];
                return (
                  <DataTable
                    bare
                    resizable
                    paginated
                    columns={columns}
                    rows={workflowDetailRows}
                    rowKey={(r) => r.leadId}
                  />
                );
              })()
            ) : (() => {
              type QueueRow = { leadId: string; lead: Lead };
              const queueRows: QueueRow[] = selectedTask.leadIds
                .map((leadId) => ({ leadId, lead: leadsDatabase.find((l) => l.id === leadId) }))
                .filter((r): r is QueueRow => !!r.lead);

              const columns: Column<QueueRow>[] = [
                {
                  key: 'contact',
                  header: 'Lead Contact',
                  cell: (row) => (
                    <div className="space-y-0.5">
                      <p className="font-bold text-[var(--text-primary)]">{row.lead.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">{row.lead.phone}</p>
                    </div>
                  ),
                },
                {
                  key: 'value',
                  header: 'Value',
                  cell: (row) => (
                    <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {row.lead.amountRequested ? `$${row.lead.amountRequested.toLocaleString()}` : '—'}
                    </span>
                  ),
                },
                {
                  key: 'surveyStatus',
                  header: 'Survey Status',
                  cell: (row) => {
                    const result = selectedTask.callResults[row.leadId];
                    const isCallingActive = activeLead?.id === row.leadId && (callState === 'dialing' || callState === 'connected');
                    return (
                      <>
                        {isCallingActive ? (
                          <Badge color="blue" className="animate-pulse">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                            Call Active
                          </Badge>
                        ) : result ? (
                          <>
                            <Badge color={
                              result.status === 'Completed' ? 'green'
                                : result.status === 'Skipped' ? 'slate'
                                : result.status === 'Callback Scheduled' ? 'amber'
                                : 'slate'
                            }>
                              {result.status === 'Callback Scheduled' ? 'Upcoming' : result.status}
                            </Badge>
                            {result.status === 'Callback Scheduled' && (
                              <p className="text-[9px] text-amber-700 mt-1">
                                {result.callbackTime
                                  ? `Callback: ${new Date(result.callbackTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                                  : 'Callback time not specified — will retry soon'}
                              </p>
                            )}
                            {/* Picked up but never actually engaged — still
                                "Completed" (someone answered, wasn't a
                                machine, no callback asked for) but not a
                                real conversation. See callFinalizer.js. */}
                            {result.status === 'Completed' && result.callAnswered === false && (
                              <Badge color="rose" className="mt-1 w-fit">Not Answered</Badge>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2 py-0.5 rounded-md">
                            Pending Dial
                          </span>
                        )}
                        {(() => {
                          const retry = retryStatuses[normalizePhone(row.lead.phone)];
                          if (!retry || isCallingActive) return null;
                          if (retry.retryStatus === 'exhausted') {
                            return (
                              <p className="text-[9px] text-[var(--text-muted)] mt-1">
                                Auto-redial gave up after {retry.attemptNumber} attempt{retry.attemptNumber !== 1 ? 's' : ''}
                              </p>
                            );
                          }
                          if (retry.retryStatus === 'pending' && retry.nextRetryAt) {
                            const mins = Math.max(0, Math.round((new Date(retry.nextRetryAt).getTime() - Date.now()) / 60000));
                            const label = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                            return (
                              <p className="text-[9px] text-blue-500 mt-1">
                                Auto-redial {retry.attemptNumber} · next in {label}
                              </p>
                            );
                          }
                          if (retry.retryStatus === 'retrying') {
                            return <p className="text-[9px] text-blue-500 mt-1 animate-pulse">Auto-redialing…</p>;
                          }
                          return null;
                        })()}
                      </>
                    );
                  },
                },
                {
                  key: 'sentiment',
                  header: 'AI Sentiment',
                  cell: (row) => {
                    const result = selectedTask.callResults[row.leadId];
                    return result?.sentiment ? (
                      <span className={`text-[10px] font-semibold ${
                        result.sentiment === 'Positive'
                          ? 'text-emerald-600'
                          : result.sentiment === 'Negative'
                          ? 'text-rose-600'
                          : 'text-[var(--text-muted)]'
                      }`}>
                        {result.sentiment}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]">—</span>
                    );
                  },
                },
                {
                  key: 'outcome',
                  header: 'Survey Outcome',
                  align: 'right',
                  cell: (row) => {
                    const result = selectedTask.callResults[row.leadId];
                    const dialing = callState === 'dialing' || callState === 'connected';
                    return (
                      <div className="flex items-center justify-end gap-1.5">
                        {!result ? (
                          <>
                            <Button variant="ghost" size="xs" onClick={() => handleSkipLead(row.leadId)} disabled={dialing}>
                              Skip
                            </Button>
                            <Button
                              variant="primary"
                              size="xs"
                              icon={PhoneCall}
                              disabled={dialing}
                              onClick={() => { setActiveLead(row.lead); setCallState('idle'); }}
                            >
                              Dial
                            </Button>
                          </>
                        ) : result.status === 'Completed' ? (
                          <Button variant="secondary" size="xs" icon={Eye} onClick={() => handleOpenTapePlayer(row.leadId)}>
                            View
                          </Button>
                        ) : (
                          <Button variant="ghost" size="xs" onClick={() => { setActiveLead(row.lead); setCallState('idle'); }}>
                            Redial
                          </Button>
                        )}
                      </div>
                    );
                  },
                },
              ];

              return (
                <DataTable
                  bare
                  resizable
                  paginated
                  columns={columns}
                  rows={queueRows}
                  rowKey={(r) => r.leadId}
                  emptyMessage="No leads loaded in this list yet."
                  rowClassName={(r) => (activeLead?.id === r.leadId && (callState === 'dialing' || callState === 'connected') ? 'bg-blue-50/30' : '')}
                />
              );
            })()}
            </div>
          </div>
          )}
        </Widget>
      </div>

      {/* AI Call Simulator Screen removed — that manual/local fake-call UI
          (dial timer, REC indicator, call-state card) is gone; real calls
          go through the actual telephony providers now. The Active
          Dialogue Feed that used to sit next to it is kept below, unwired
          (gated behind `false`, not deleted) since it is slated for reuse
          in a future standalone simulator environment. */}
      {false && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* Live Active Transcript / Simulation Speech Feed */}
        <Widget
          colSpan={6}
          className="h-full"
          icon={MessageSquare}
          title="Active Dialogue Feed"
          padding="none"
          bodyClassName="flex flex-col h-full min-h-[400px] p-0"
          action={
            <div className="flex items-center space-x-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">AUDIO STREAM PARSING</span>
            </div>
          }
        >
          {/* Transcript bubbles */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {transcript.length > 0 ? (
              transcript.map((line, idx) => {
                const isAI = line.speaker === 'AI';
                return (
                  <div key={idx} className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}>
                    <span className="text-[9px] text-[var(--text-muted)] font-mono mb-1">{line.speaker} • {line.timestamp}</span>
                    <div
                      className={`rounded-2xl px-4 py-2 text-xs font-sans leading-relaxed ${
                        isAI
                          ? 'bg-blue-600 text-white rounded-tl-none'
                          : 'bg-slate-100 dark:bg-[var(--bg-subtle)] text-[var(--text-primary)] rounded-tr-none border border-slate-300 dark:border-[var(--border)]'
                      }`}
                    >
                      {line.text}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] space-y-2">
                <Mic className="h-8 w-8 text-slate-300 dark:text-slate-800 dark:text-[var(--text-primary)] dark:text-[var(--text-secondary)] animate-pulse" />
                <p className="text-xs text-[var(--text-muted)]">Awaiting telephone call connection to parse audio waves...</p>
              </div>
            )}

            {isAiResponding && (
              <div className="flex flex-col items-start">
                <span className="text-[9px] text-[var(--text-muted)] font-mono mb-1">AI {agentDisplayName} • Thinking</span>
                <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/40 text-blue-600 dark:text-blue-300 rounded-2xl rounded-tl-none px-4 py-2 flex items-center space-x-2 text-xs">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>AI Agent {agentDisplayName} is evaluating customer utterance...</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef}></div>
          </div>

          {/* Caller Interactive Speech Simulation pad */}
          {callState === 'connected' && (
            <div className="p-3 border-t border-slate-100 dark:border-[var(--border)] space-y-2.5">
              {/* Quick simulation helper response chips */}
              <div className="flex flex-wrap gap-1.5">
                {getSuggestionsForActiveQuestion().map((suggestion, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => {
                      setCustomerUtterance(suggestion);
                      handleSendUtterance(suggestion);
                    }}
                    className="flex items-center gap-1 text-[10px] bg-slate-100 dark:bg-[var(--bg-subtle)] hover:bg-blue-600 hover:text-white text-[var(--text-secondary)] border border-slate-300 dark:border-[var(--border)] rounded px-2.5 py-1 transition-all cursor-pointer"
                  >
                    <Mic className="h-2.5 w-2.5" /> Say: "{suggestion}"
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendUtterance(customerUtterance);
                }}
                className="flex items-center space-x-2"
              >
                <input
                  type="text"
                  value={customerUtterance}
                  onChange={(e) => setCustomerUtterance(e.target.value)}
                  placeholder="Type customer reply here..."
                  className="flex-1 rounded-xl px-3.5 py-2.5 text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-[var(--bg-surface)] border border-slate-300 dark:border-[var(--border)] text-[var(--text-primary)]"
                />
                <Button type="submit" variant="primary" size="md" className="!px-2.5">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          )}
        </Widget>
        </div>
        </div>
        </>
      ) : (
        /* REAL INBOUND CALL HISTORY */
        <>
        <div className="grid grid-cols-3 gap-4">
          <KpiCard colSpan={1} label="Calls Received" value={realInboundCallLogs.length} icon={PhoneIncoming} iconPosition="right" iconBg="var(--bg-subtle)" iconColor="var(--text-muted)" className="!rounded-xl !min-h-0 !p-3.5" />
          <KpiCard
            colSpan={1}
            label="Avg. Duration"
            value={`${realInboundCallLogs.length > 0
              ? Math.round(realInboundCallLogs.reduce((acc, l) => acc + l.duration, 0) / realInboundCallLogs.length)
              : 0}s`}
            icon={Clock}
            iconPosition="right"
            iconBg="var(--bg-subtle)"
            iconColor="var(--text-muted)"
            className="!rounded-xl !min-h-0 !p-3.5"
          />
          <KpiCard
            colSpan={1}
            label="Positive Rate"
            value={`${realInboundCallLogs.length > 0
              ? Math.round((realInboundCallLogs.filter(l => l.sentiment === 'Positive').length / realInboundCallLogs.length) * 100)
              : 0}%`}
            icon={Smile}
            iconPosition="right"
            iconBg="var(--bg-subtle)"
            iconColor="#059669"
            className="!rounded-xl !min-h-0 !p-3.5"
          />
        </div>

        <div className="grid grid-cols-12 gap-6 items-stretch">
          {/* LEFT COLUMN: numbers that receive inbound calls */}
          <div className="col-span-12 lg:col-span-4 flex flex-col h-full space-y-6">
            <Widget
              className="flex-1 min-h-[60vh]"
              title="Inbound numbers"
              icon={PhoneForwarded}
              action={
                <Badge color="blue" className="font-mono">{activeVirtualNumbers.length} Online</Badge>
              }
            >
              <div className="space-y-4">
                <p className="text-xs text-[var(--text-muted)]">Virtual lines that accept incoming calls. Outbound campaigns use different caller IDs from Agent Studio.</p>
                <div className="space-y-3.5">
                {activeVirtualNumbers.map((vNum) => (
                  <div
                    key={vNum.id}
                    className="w-full p-4 rounded-xl text-left border border-[var(--border)] flex flex-col space-y-2"
                  >
                    <div className="flex justify-between items-start w-full gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)] font-mono">{vNum.number}</span>
                      <span className="text-[8px] font-mono font-bold bg-emerald-700 text-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                        {vNum.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] font-medium truncate">{vNum.friendlyName}</div>
                    <div className="flex justify-between text-[9px] font-mono text-[var(--text-muted)] border-t border-[var(--border)] pt-1.5">
                      <span>Inbound Logs: {vNum.incomingCallCount}</span>
                      <span>Carrier: {vNum.provider}</span>
                    </div>
                  </div>
                ))}
                {activeVirtualNumbers.length === 0 && (
                  <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-subtle)]/50 space-y-2">
                    <PhoneForwarded className="h-6 w-6 text-slate-300 mx-auto" />
                    <p className="text-[11px] text-[var(--text-muted)]">No inbound numbers yet. Add a virtual number under Administration to receive calls here.</p>
                  </div>
                )}
                </div>
              </div>
            </Widget>
          </div>

          {/* RIGHT COLUMN: inbound call history (parallel to outbound campaign queue) */}
          <div className="col-span-12 lg:col-span-8 flex flex-col h-full space-y-6">
            <Widget showHeader={false} className="h-full min-h-[60vh]" bodyClassName="flex flex-col h-full">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between shrink-0 border-b border-[var(--border)] pb-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                      <PhoneIncoming className="h-5 w-5 text-blue-600 shrink-0" />
                      Call history
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Recorded inbound conversations with summaries, sentiment, and extracted answers (same analysis panel as outbound campaigns).</p>
                  </div>
                </div>

                {/* Logs list */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 mt-4">
                  {realInboundCallLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 border border-[var(--border)] rounded-xl bg-[var(--bg-subtle)]/50 hover:bg-[var(--bg-subtle)] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                    >
                      <div className="space-y-1.5 max-w-lg">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[var(--text-primary)] font-mono">{log.leadName}</span>
                          <span className="text-[9px] font-mono text-[var(--text-muted)]">•</span>
                          <span className="text-[9px] font-mono text-[var(--text-muted)]">{new Date(log.createdAt).toLocaleString()}</span>
                        </div>

                        <p className="text-[11px] italic font-medium leading-relaxed font-sans line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          "{log.summary}"
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Badge color={log.sentiment === 'Positive' ? 'green' : log.sentiment === 'Negative' ? 'rose' : 'slate'} className="font-mono">
                            {log.sentiment}
                          </Badge>
                          <Badge color="blue" className="font-mono">
                            {log.status}
                          </Badge>
                          <span className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded-full">
                            Duration: {log.duration}s
                          </span>
                          <span className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded-full">
                            {formatInr(callCostInr(log.duration))}
                          </span>
                          {log.status === 'Completed' && log.callAnswered === false && (
                            <Badge color="rose">Not Answered</Badge>
                          )}
                        </div>
                      </div>

                      <Button variant="secondary" size="sm" icon={Eye} onClick={() => handleOpenTapePlayer(log.id, 'inbound')} className="shrink-0">
                        View
                      </Button>
                    </div>
                  ))}

                  {realInboundCallLogs.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-subtle)]/50 space-y-2">
                      <Inbox className="h-8 w-8 text-[var(--text-muted)] mx-auto" />
                      <p className="text-xs text-[var(--text-muted)] font-medium">No inbound calls logged yet.</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Real calls to a connected virtual number will appear here automatically as they happen.</p>
                    </div>
                  )}
                </div>
              </div>
            </Widget>
          </div>
        </div>
        </>
      )}
      </div>
      )}
      {/* CREATE PAGE: Assign New Dialing Task — dedicated page, not an overlay */}
      {taskPage && (() => {
        const workflowsWithQuestions = flows.filter(f => (f.variables ?? []).length > 0 && f.active);
        const agentsWithOutbound = wizardAgents.filter(a => a.outboundNumber && (a.active ?? true));
        const selectedWorkflow = flows.find(f => f.id === wizardWorkflowId);
        const selectedAgent = wizardAgents.find(a => a.id === wizardAgentId);
        const totalContacts = wizardSelectedLeadIds.length + wizardNewContacts.length;
        const matchesWizardContactFilter = (lead: Lead) => {
          const q = wizardContactSearch.toLowerCase();
          const matchesSearch = lead.name.toLowerCase().includes(q) || lead.phone.includes(q) || (lead.source || '').toLowerCase().includes(q);
          const matchesGroup = wizardGroupFilter === 'All'
            || (wizardGroupFilter === NO_GROUP_FILTER ? (lead.groupIds || []).length === 0 : (lead.groupIds || []).includes(wizardGroupFilter));
          return matchesSearch && matchesGroup;
        };

        const WizardFrame: any = AwsCreateLayout;
        const frameProps: any = {
          breadcrumb: 'Campaign / New outbound campaign',
          title: 'New outbound campaign',
          description: 'Pick a call script from Workflow Builder, assign an outbound agent, and choose contacts. This creates a new campaign run with its own queue and scheduled callbacks.',
          steps: [{ label: 'Configure' }, { label: 'Review' }],
          activeStep: wizardStep,
          action: (
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setShowAssignTask(false)}>
              Back to Voice Simulator
            </Button>
          ),
        };

        return (
          <WizardFrame {...frameProps}>
            {wizardStep === 1 && (
              <div className="space-y-6">

            {/* ── Step 1: Select Workflow ───────────────────────────────────── */}
                          <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Call script (workflow)</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">The script defines what the agent asks. Each campaign run reuses a workflow; runs are listed separately under Outbound Campaigns.</p>
                </div>

                {workflowsWithQuestions.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-subtle)]/50 space-y-2">
                    <HelpCircle className="h-7 w-7 text-[var(--text-muted)] mx-auto" />
                    <p className="text-xs font-semibold text-[var(--text-muted)]">No active workflows with questions found.</p>
                    <p className="text-[11px] text-[var(--text-muted)]">Go to Workflows, create a workflow, add question variables, and mark it active — then come back here.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {workflowsWithQuestions.map(flow => {
                      const qCount = (flow.variables ?? []).length;
                      const isSelected = wizardWorkflowId === flow.id;
                      return (
                        <button
                          key={flow.id}
                          type="button"
                          onClick={() => setWizardWorkflowId(flow.id)}
                          className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-[var(--bg-subtle)] shadow-sm'
                              : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-blue-300 hover:bg-[var(--bg-subtle)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{flow.name}</p>
                              {flow.description && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{flow.description}</p>
                              )}
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {(flow.variables ?? []).slice(0, 3).map((v, i) => (
                                  <span key={i} className="text-[10px] bg-[var(--bg-subtle)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[var(--text-muted)]">
                                    {v.questionText ? `Q${i+1}: ${v.questionText.slice(0, 40)}${v.questionText.length > 40 ? '…' : ''}` : v.name}
                                  </span>
                                ))}
                                {qCount > 3 && (
                                  <span className="text-[10px] text-[var(--text-muted)]">+{qCount - 3} more</span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <Badge color="blue">{qCount} question{qCount !== 1 ? 's' : ''}</Badge>
                              {flow.active && <Badge color="green">Active</Badge>}
                              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-[var(--border)]'}`}>
                                {isSelected && <Check className="h-3 w-3 text-white" />}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

              </div>

            <div className="h-px bg-[var(--border)]" />

            {/* ── Step 2: Select Agent ──────────────────────────────────────── */}
                          <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Outbound Agent</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Only active agents with an outbound number assigned are shown — configure and enable agents in Agent Studio.</p>
                </div>

                {wizardAgentsLoading ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-muted)]">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Loading agents…</span>
                  </div>
                ) : agentsWithOutbound.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-subtle)]/50 space-y-2">
                    <HelpCircle className="h-7 w-7 text-[var(--text-muted)] mx-auto" />
                    <p className="text-xs font-semibold text-[var(--text-muted)]">No active agents with outbound support found.</p>
                    <p className="text-[11px] text-[var(--text-muted)]">In Agent Studio, open an agent, assign an outbound caller number, and make sure it's enabled.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {agentsWithOutbound.map(agent => {
                      const isSelected = wizardAgentId === agent.id;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => setWizardAgentId(agent.id)}
                          className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-[var(--bg-subtle)] shadow-sm'
                              : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-blue-300 hover:bg-[var(--bg-subtle)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'}`}>
                                {agent.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{agent.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <PhoneCall className="h-3 w-3 text-emerald-500 shrink-0" />
                                  <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate">{agent.outboundNumber?.number}</span>
                                  {agent.activeVoice && (
                                    <>
                                      <span className="text-[var(--text-muted)] text-[10px]">•</span>
                                      <span className="text-[10px] text-[var(--text-muted)]">{agent.activeVoice}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-[var(--border)]'}`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

              </div>

            <div className="h-px bg-[var(--border)]" />

            {/* ── Step 3: Add Contacts ──────────────────────────────────────── */}
                          <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Contacts <span className="text-blue-600">({totalContacts} selected)</span></h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Select from your contact database or add new contacts manually. You can mix both.</p>
                </div>

                {/* Tab switcher */}
                <div className="flex gap-1 p-1 bg-[var(--bg-subtle)] rounded-xl w-fit">
                  {(['existing', 'new'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setWizardContactTab(tab)}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer capitalize ${wizardContactTab === tab ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                    >
                      {tab === 'existing' ? `From Database (${leadsDatabase.length})` : 'Add New'}
                    </button>
                  ))}
                </div>

                {wizardContactTab === 'existing' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <SearchInput
                        value={wizardContactSearch}
                        onChange={setWizardContactSearch}
                        placeholder="Search by name, phone or source…"
                      />
                      <select
                        value={wizardGroupFilter}
                        onChange={(e) => setWizardGroupFilter(e.target.value)}
                        className="shrink-0 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none cursor-pointer"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        <option value="All">All Groups</option>
                        <option value={NO_GROUP_FILTER}>No Group</option>
                        {wizardContactGroups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const ids = leadsDatabase.filter(matchesWizardContactFilter).map(l => l.id);
                          setWizardSelectedLeadIds(prev => Array.from(new Set([...prev, ...ids])));
                        }}
                        className="text-[10px] text-blue-600 font-semibold hover:underline cursor-pointer whitespace-nowrap"
                      >
                        {wizardGroupFilter === 'All' ? 'Select All' : 'Select All in Group'}
                      </button>
                      <span className="text-[var(--text-muted)] text-xs">|</span>
                      <button
                        type="button"
                        onClick={() => setWizardSelectedLeadIds([])}
                        className="text-[10px] text-[var(--text-muted)] font-semibold hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto bg-[var(--bg-subtle)] p-2.5 rounded-xl border border-[var(--border)]">
                      {leadsDatabase.filter(matchesWizardContactFilter).map(lead => {
                        const checked = wizardSelectedLeadIds.includes(lead.id);
                        return (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => setWizardSelectedLeadIds(prev =>
                              checked ? prev.filter(id => id !== lead.id) : [...prev, lead.id]
                            )}
                            className={`p-2.5 rounded-lg text-left border transition-all flex items-center justify-between cursor-pointer ${
                              checked ? 'border-blue-500 bg-[var(--bg-subtle)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[var(--text-primary)] truncate">{lead.name}</p>
                              <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">{lead.phone}</p>
                            </div>
                            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'border-blue-600 bg-blue-600' : 'border-[var(--border)]'}`}>
                              {checked && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                          </button>
                        );
                      })}
                      {leadsDatabase.filter(matchesWizardContactFilter).length === 0 && (
                        <p className="col-span-2 text-xs text-[var(--text-muted)] italic text-center py-4">No contacts match your search.</p>
                      )}
                    </div>
                  </div>
                )}

                {wizardContactTab === 'new' && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-subtle)]/50 p-6 text-center">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                        <Plus className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Add a new contact</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">Use the standard contact overlay so the task flow stays focused and uncluttered.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={Plus}
                        onClick={() => setShowWizardContactModal(true)}
                      >
                        Add Contact
                      </Button>
                    </div>

                    {wizardNewContacts.length > 0 && (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto bg-[var(--bg-subtle)] p-2.5 rounded-xl border border-[var(--border)]">
                        {wizardNewContacts.map((c, i) => (
                          <div key={i} className="flex items-center justify-between bg-[var(--bg-surface)] px-3 py-2 rounded-lg border border-[var(--border)]">
                            <div>
                              <p className="text-xs font-bold text-[var(--text-primary)]">{c.name}</p>
                              <p className="text-[10px] text-[var(--text-muted)] font-mono">{c.phone}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setWizardNewContacts(prev => prev.filter((_, idx) => idx !== i))}
                              className="text-rose-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

            <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Retry unanswered calls</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Automatically retry No Answer / Answering Machine calls. Caller-requested callbacks are handled separately.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={wizardRetryConfig.enabled}
                  onClick={() => setWizardRetryConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative h-6 w-11 rounded-full transition-colors ${wizardRetryConfig.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${wizardRetryConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {wizardRetryConfig.enabled && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Retry pattern</span>
                      <select
                        value={wizardRetryConfig.strategy}
                        onChange={e => setWizardRetryConfig(prev => ({ ...prev, strategy: e.target.value as RetryConfig['strategy'] }))}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                      >
                        <option value="exponential">Gradual — 2h, 4h, 8h…</option>
                        <option value="fixed">Same interval each time</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">First retry after</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0.25}
                          max={24}
                          step={0.25}
                          value={wizardRetryConfig.intervalMinutes / 60}
                          onChange={e => setWizardRetryConfig(prev => ({ ...prev, intervalMinutes: Math.max(15, Number(e.target.value || 2) * 60) }))}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                        />
                        <span className="text-xs text-[var(--text-muted)] shrink-0">hours</span>
                      </div>
                    </label>

                    <label className="block">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Maximum retries</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={1}
                        value={wizardRetryConfig.maxRetries}
                        onChange={e => setWizardRetryConfig(prev => ({ ...prev, maxRetries: Math.max(0, Math.min(10, Number(e.target.value || 0))) }))}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                      />
                    </label>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2.5">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-amber-800 dark:text-amber-200">
                      <span className="font-semibold">Quiet hours: 9:00 PM–8:00 AM.</span> Automatic retries are delayed until 8:00 AM in the contact's local timezone, so the campaign will not call people late at night.
                    </div>
                  </div>

                  <p className="text-[11px] text-[var(--text-muted)]">
                    {wizardRetryConfig.strategy === 'exponential'
                      ? `With ${wizardRetryConfig.intervalMinutes / 60}h as the base, retries increase gradually: ${wizardRetryConfig.intervalMinutes / 60}h → ${wizardRetryConfig.intervalMinutes / 30}h → ${wizardRetryConfig.intervalMinutes / 15}h…`
                      : `Each retry waits ${wizardRetryConfig.intervalMinutes / 60}h.`}
                    {' '}The initial call is not counted as a retry.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
              <p className="text-[11px] text-[var(--text-muted)]">
                {wizardWorkflowId && wizardAgentId && totalContacts > 0
                  ? `${totalContacts} contact${totalContacts !== 1 ? 's' : ''} ready to review`
                  : 'Select a call script, agent, and at least one contact to continue.'}
              </p>
              <Button
                variant="primary"
                size="md"
                disabled={!wizardWorkflowId || !wizardAgentId || totalContacts === 0}
                onClick={() => setWizardStep(2)}
              >
                Next: Review & Create
              </Button>
            </div>
              </div>
            )}

            {wizardStep === 2 && selectedWorkflow && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Review & Create</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Confirm the campaign details below, then create the run.</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Campaign name</label>
                  <div className="mt-1 w-full px-3 py-2 text-sm border border-[var(--border)] rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] font-mono">
                    {selectedWorkflow.name}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Defaults to the call script name. This run starts at <span className="font-semibold">{new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span> — each run is a separate campaign so callbacks and results stay tied to this run, even when you reuse the same script later.
                  </p>
                </div>

                <div className="space-y-3 bg-[var(--bg-subtle)] rounded-xl p-4 border border-[var(--border)]">
                  {/* Call script summary */}
                  <div className="flex items-start gap-3 pb-3 border-b border-[var(--border)]">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <GitBranch className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Call script</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{selectedWorkflow.name}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{(selectedWorkflow.variables ?? []).length} questions</p>
                      <div className="flex flex-col gap-1 mt-1.5">
                        {(selectedWorkflow.variables ?? []).map((v, i) => (
                          <p key={i} className="text-[11px] text-[var(--text-secondary)]">
                            <span className="font-mono text-[var(--text-muted)]">Q{i+1}</span> {v.questionText || v.name}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Agent summary */}
                  <div className="flex items-start gap-3 pb-3 border-b border-[var(--border)]">
                    <div className="h-8 w-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-[var(--text-primary)]">{selectedAgent?.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Agent</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{selectedAgent?.name ?? '—'}</p>
                      {selectedAgent?.outboundNumber && (
                        <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">{selectedAgent.outboundNumber.number}</p>
                      )}
                    </div>
                  </div>

                  {/* Contacts summary */}
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="h-4 w-4 text-slate-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Contacts</p>
                      <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{totalContacts} contact{totalContacts !== 1 ? 's' : ''} to dial</p>
                      {wizardSelectedLeadIds.length > 0 && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{wizardSelectedLeadIds.length} from database</p>
                      )}
                      {wizardNewContacts.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {wizardNewContacts.map((c, i) => (
                            <p key={i} className="text-[11px] text-[var(--text-secondary)]">{c.name} — {c.phone}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                  <Button
                    variant="secondary"
                    size="md"
                    icon={ArrowLeft}
                    onClick={() => setWizardStep(1)}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={!wizardWorkflowId || !wizardAgentId || totalContacts === 0}
                    onClick={handleCreateTask}
                    icon={PhoneCall}
                    className="shadow-md"
                  >
                    Create campaign
                  </Button>
                </div>
              </div>
            )}
          </WizardFrame>
        );
      })()}

      {showWizardContactModal && (
        <Modal
          open
          onClose={() => setShowWizardContactModal(false)}
          title="Add New Contact"
          subtitle="Create a contact using the same focused overlay used throughout the CRM."
          maxWidth="max-w-xl"
        >
          <form
            className="p-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!wizardNewName.trim() || !wizardNewPhone.trim()) return;
              setWizardNewContacts(prev => [
                ...prev,
                { name: wizardNewName.trim(), phone: wizardNewPhone.trim() }
              ]);
              setWizardNewName('');
              setWizardNewPhone('');
              setShowWizardContactModal(false);
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Contact Name *</label>
                <input
                  autoFocus
                  required
                  value={wizardNewName}
                  onChange={e => setWizardNewName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Phone Number *</label>
                <input
                  required
                  type="tel"
                  value={wizardNewPhone}
                  onChange={e => setWizardNewPhone(e.target.value)}
                  placeholder="+1 555 012 3456"
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowWizardContactModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm" icon={Check}>Add Contact</Button>
            </div>
          </form>
        </Modal>
      )}

      <SlideOver
        open={tapeSlideOverOpen}
        onClose={() => {
          setPlayingTapeId(null);
          setIsTapePlaying(false);
        }}
        title={tapeDisplayTitle}
        subtitle={tapeDisplaySubtitle}
        maxWidth="max-w-2xl"
      >
        {tapeDetailContent}
      </SlideOver>

    </PageShell>
  );
}
