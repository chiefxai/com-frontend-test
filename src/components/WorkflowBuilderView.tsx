import React, { useState } from 'react';
import {
  GitBranch,
  Play,
  HelpCircle,
  FileText,
  Trash2,
  Plus,
  Compass,
  ArrowRight,
  Settings,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Layers,
  Save,
  CheckCircle2
} from 'lucide-react';
import { Workflow, WorkflowNode, WorkflowEdge, NodeType, Lead } from '../types';
import FilterBar from './ui/FilterBar';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';

interface WorkflowBuilderViewProps {
  workflows: Workflow[];
  setWorkflows: React.Dispatch<React.SetStateAction<Workflow[]>>;
  leads: Lead[];
}

interface WorkflowRunLogEntry {
  nodeId: string;
  type: string;
  label: string;
  result: string;
  timestamp: string;
}

interface WorkflowRun {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'needs_review';
  log: WorkflowRunLogEntry[];
}

const templates = [
  {
    name: 'Personal Loan Qualification',
    desc: 'Automates outbound dial verification for personal loans, asks interest questions, and distributes assignments.',
    nodes: [
      { id: 'n-1', type: 'trigger', label: 'Inbound Web Lead Trigger', config: { triggerType: 'new_lead' }, position: { x: 50, y: 50 } },
      { id: 'n-2', type: 'call', label: 'Outbound Dial & Employer Validation', config: { prompt: 'Verify they are interested and get employer name.' }, position: { x: 50, y: 150 } },
      { id: 'n-3', type: 'question', label: 'Ask Interest Question', config: { questionText: 'Are you interested in completing the application?', branches: [{ condition: 'YES', targetId: 'n-4' }, { condition: 'NO', targetId: 'n-5' }] }, position: { x: 50, y: 250 } },
      { id: 'n-4', type: 'action', label: 'Assign Loan Officer', config: { actionType: 'assign_agent' }, position: { x: 50, y: 350 } },
      { id: 'n-5', type: 'action', label: 'Tag Unqualified', config: { actionType: 'close_lead' }, position: { x: 220, y: 350 } }
    ] as WorkflowNode[],
    edges: [
      { id: 'e-1', source: 'n-1', target: 'n-2' },
      { id: 'e-2', source: 'n-2', target: 'n-3' },
      { id: 'e-3', source: 'n-3', target: 'n-4', label: 'YES' },
      { id: 'e-4', source: 'n-3', target: 'n-5', label: 'NO' }
    ] as WorkflowEdge[]
  },
  {
    name: 'EMI Repayment Reminder',
    desc: 'Triggered 3 days prior to EMI due date. AI calls to verify bank auto-draft or sends collection payment portal.',
    nodes: [
      { id: 'n-1', type: 'trigger', label: 'EMI Bill Due - 3 Days Trigger', config: { triggerType: 'manual' }, position: { x: 50, y: 50 } },
      { id: 'n-2', type: 'call', label: 'Call Client & State EMI Due', config: { prompt: 'Politely remind them of the upcoming payment and ask if auto-pay is set up.' }, position: { x: 50, y: 150 } },
      { id: 'n-3', type: 'question', label: 'Is Payment Ready?', config: { questionText: 'Will the funds be available for auto-draft?', branches: [{ condition: 'YES', targetId: 'n-4' }, { condition: 'NO', targetId: 'n-5' }] }, position: { x: 50, y: 250 } },
      { id: 'n-4', type: 'action', label: 'Send Confirmation SMS', config: { actionType: 'send_sms' }, position: { x: 50, y: 350 } },
      { id: 'n-5', type: 'action', label: 'Escalate to Collection Team', config: { actionType: 'assign_agent' }, position: { x: 220, y: 350 } }
    ] as WorkflowNode[],
    edges: [
      { id: 'e-1', source: 'n-1', target: 'n-2' },
      { id: 'e-2', source: 'n-2', target: 'n-3' },
      { id: 'e-3', source: 'n-3', target: 'n-4', label: 'YES' },
      { id: 'e-4', source: 'n-3', target: 'n-5', label: 'NO' }
    ] as WorkflowEdge[]
  }
];

export default function WorkflowBuilderView({
  workflows,
  setWorkflows,
  leads
}: WorkflowBuilderViewProps) {
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>(workflows[0]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(workflows[0]?.nodes[0] || null);
  const [runLeadId, setRunLeadId] = useState('');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<WorkflowRun | null>(null);
  const [workflowSearch, setWorkflowSearch] = useState('');
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState('all');
  const [nodeTypeFilter, setNodeTypeFilter] = useState('all');

  const workflowStatusOptions = [
    { label: 'All statuses', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ];
  const nodeTypeOptions = [
    { label: 'All node types', value: 'all' },
    { label: 'Trigger', value: 'trigger' },
    { label: 'Call', value: 'call' },
    { label: 'Question', value: 'question' },
    { label: 'Action', value: 'action' },
  ];
  const filteredWorkflows = workflows.filter((workflow) => {
    const matchesSearch = workflow.name.toLowerCase().includes(workflowSearch.toLowerCase());
    const matchesStatus = workflowStatusFilter === 'all'
      || (workflowStatusFilter === 'active' ? workflow.active : !workflow.active);
    const matchesNodeType = nodeTypeFilter === 'all'
      || workflow.nodes.some((node) => node.type === nodeTypeFilter);
    return matchesSearch && matchesStatus && matchesNodeType;
  });
  const hasWorkflowFilters = workflowSearch.trim() !== '' || workflowStatusFilter !== 'all' || nodeTypeFilter !== 'all';
  const clearWorkflowFilters = () => {
    setWorkflowSearch('');
    setWorkflowStatusFilter('all');
    setNodeTypeFilter('all');
  };

  const handleRunWorkflow = async () => {
    if (!runLeadId) return;
    setRunning(true);
    setLastRun(null);
    try {
      const res = await apiFetch(`/api/workflows/${activeWorkflow.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ leadId: runLeadId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Workflow run failed');
        return;
      }
      setLastRun(data);
    } finally {
      setRunning(false);
    }
  };

  // Configuration editors
  const [editingLabel, setEditingLabel] = useState('');
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingQuestion, setEditingQuestion] = useState('');

  const handleSelectNode = (node: WorkflowNode) => {
    setSelectedNode(node);
    setEditingLabel(node.label);
    setEditingPrompt(node.config.prompt || '');
    setEditingQuestion(node.config.questionText || '');
  };

  // Node parameters updates
  const handleSaveNodeConfig = () => {
    if (!selectedNode) return;

    const updatedNodes = activeWorkflow.nodes.map((node) => {
      if (node.id === selectedNode.id) {
        return {
          ...node,
          label: editingLabel,
          config: {
            ...node.config,
            prompt: editingPrompt,
            questionText: editingQuestion
          }
        };
      }
      return node;
    });

    const updatedWorkflow = {
      ...activeWorkflow,
      nodes: updatedNodes
    };

    setActiveWorkflow(updatedWorkflow);
    setWorkflows(workflows.map((w) => (w.id === activeWorkflow.id ? updatedWorkflow : w)));
    alert('Node configurations saved safely to memory.');
  };

  // Apply visual builder templates
  const handleApplyTemplate = (tempIndex: number) => {
    const temp = templates[tempIndex];
    const loaded: Workflow = {
      id: `W-00${workflows.length + 1}`,
      name: temp.name,
      nodes: temp.nodes,
      edges: temp.edges,
      active: true,
      createdAt: new Date().toISOString()
    };

    setWorkflows([...workflows, loaded]);
    setActiveWorkflow(loaded);
    setSelectedNode(loaded.nodes[0]);
    setEditingLabel(loaded.nodes[0].label);
    setEditingPrompt(loaded.nodes[0].config.prompt || '');
    setEditingQuestion(loaded.nodes[0].config.questionText || '');
  };

  // Add a new node
  const handleAddNewNode = (type: NodeType) => {
    const nextId = `node-${activeWorkflow.nodes.length + 1}`;
    const newNode: WorkflowNode = {
      id: nextId,
      type,
      label: `New ${type.toUpperCase()}`,
      config: type === 'call' ? { prompt: 'AI Speech prompt instructions.' } : type === 'question' ? { questionText: 'Yes/No choice prompt' } : {},
      position: { x: 50, y: 100 * activeWorkflow.nodes.length + 50 }
    };

    const updatedNodes = [...activeWorkflow.nodes, newNode];
    // Edge connector
    const lastNode = activeWorkflow.nodes[activeWorkflow.nodes.length - 1];
    const newEdge: WorkflowEdge = {
      id: `edge-${activeWorkflow.edges.length + 1}`,
      source: lastNode ? lastNode.id : '',
      target: nextId
    };

    const updatedWorkflow = {
      ...activeWorkflow,
      nodes: updatedNodes,
      edges: lastNode ? [...activeWorkflow.edges, newEdge] : activeWorkflow.edges
    };

    setActiveWorkflow(updatedWorkflow);
    setWorkflows(workflows.map((w) => (w.id === activeWorkflow.id ? updatedWorkflow : w)));
  };

  return (
    <PageShell
      title="AI Calling Workflow Builder"
      subtitle="Design logical decision loops, write voice prompts, and trigger smart actions dynamically."
      layout="fill"
      action={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <FilterBar
            search={{ value: workflowSearch, onChange: setWorkflowSearch, placeholder: 'Search workflows…' }}
            selects={[
              { key: 'Status', label: 'Status', value: workflowStatusFilter, onChange: setWorkflowStatusFilter, options: workflowStatusOptions },
              { key: 'Node Type', label: 'Node Type', value: nodeTypeFilter, onChange: setNodeTypeFilter, options: nodeTypeOptions },
            ]}
            onClear={clearWorkflowFilters}
            hasActiveFilters={hasWorkflowFilters}
            resultCount={{ filtered: filteredWorkflows.length, total: workflows.length, label: 'workflows' }}
          />
          {filteredWorkflows.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setActiveWorkflow(w);
                setSelectedNode(w.nodes[0]);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                activeWorkflow.id === w.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {w.name}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-y-auto flex-1 px-8 pb-8 pt-6 space-y-6">

      {/* Manual run panel */}
      <Widget title="Run Workflow" icon={Play} accent="#6366f1" padding="md">
        <div className="flex items-center gap-3 flex-wrap">
          <Play className="h-4 w-4 text-indigo-600 shrink-0" />
          <span className="text-sm font-semibold text-slate-700">Run "{activeWorkflow?.name}" on a lead</span>
          <select
            value={runLeadId}
            onChange={(e) => setRunLeadId(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs min-w-[180px]"
          >
            <option value="">Select a lead…</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.status})</option>)}
          </select>
          <button
            onClick={handleRunWorkflow}
            disabled={!runLeadId || running}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg"
          >
            {running ? 'Running…' : 'Run'}
          </button>
          <span className="text-[11px] text-slate-400">Action/branch steps execute for real. Call/question steps are logged as needing a human, never auto-dialed.</span>
        </div>
        {lastRun && (
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                lastRun.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                : lastRun.status === 'needs_review' ? 'bg-amber-100 text-amber-700'
                : 'bg-rose-100 text-rose-700'
              }`}>{lastRun.status.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div className="space-y-1.5">
              {lastRun.log.map((entry, i) => (
                <div key={i} className="text-xs text-slate-600 flex gap-2">
                  <span className="font-mono text-slate-400 shrink-0">{entry.type}</span>
                  <span>{entry.result}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Widget>

      {/* Main Builder Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Visual Template Selector */}
        <div className="space-y-6">
          <Widget title="Prebuilt Flow Templates" icon={Compass} accent="#6366f1" padding="md">
            <p className="text-xs text-slate-400 mb-3">Instantly reload proven loan communication algorithms to your workspace.</p>
            <div className="space-y-3">
              {templates.map((temp, idx) => (
                <div key={idx} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-700">{temp.name}</h5>
                    <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">Preset</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{temp.desc}</p>
                  <button
                    onClick={() => handleApplyTemplate(idx)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 flex items-center pt-2 cursor-pointer"
                  >
                    Load Workflow <ArrowRight className="h-3 w-3 ml-1" />
                  </button>
                </div>
              ))}
            </div>
          </Widget>

          <Widget title="Toolbox Actions" icon={Layers} accent="#6366f1" padding="md">
            <p className="text-xs text-slate-400 mb-3">Inject additional operational nodes into the currently active loop.</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddNewNode('call')}
                className="flex items-center justify-center p-3 border border-slate-100 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <MessageSquare className="h-4 w-4 mr-2 text-indigo-500" /> Outbound Call
              </button>
              <button
                onClick={() => handleAddNewNode('question')}
                className="flex items-center justify-center p-3 border border-slate-100 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <HelpCircle className="h-4 w-4 mr-2 text-indigo-500" /> Add Question
              </button>
            </div>
          </Widget>
        </div>

        {/* Center column: Visual Pipeline Canvas */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Visual canvas list */}
          <div className="md:col-span-2 bg-slate-950 p-6 rounded-3xl border border-slate-900 shadow-inner space-y-6 min-h-[60vh] relative flex flex-col justify-start">
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest flex items-center">
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Pipeline Canvas Graph
              </span>
              <span className="text-[9px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded">
                Active Nodes: {activeWorkflow.nodes.length}
              </span>
            </div>

            {/* Render Nodes layout */}
            <div className="flex-1 flex flex-col items-center justify-start space-y-8 relative">
              {activeWorkflow.nodes.map((node, index) => {
                const isSelected = selectedNode?.id === node.id;
                return (
                  <div key={node.id} className="flex flex-col items-center w-full">
                    {/* SVG connector line from previous block */}
                    {index > 0 && (
                      <div className="h-8 w-0.5 bg-gradient-to-b from-indigo-500 to-indigo-600 relative">
                        {/* Branch Indicator label if applicable */}
                        {node.type === 'action' && (
                          <span className="absolute -left-6 top-1.5 font-mono text-[9px] text-indigo-400 bg-slate-950 px-1 border border-indigo-900 rounded">
                            BRANCH
                          </span>
                        )}
                      </div>
                    )}

                    {/* Node block */}
                    <button
                      id={`workflow-node-${node.id}`}
                      onClick={() => handleSelectNode(node)}
                      className={`w-full max-w-sm rounded-xl p-4 text-left border transition-all ${
                        isSelected
                          ? 'bg-slate-900 border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`p-1.5 rounded-lg text-white ${
                              node.type === 'trigger'
                                ? 'bg-amber-600'
                                : node.type === 'call'
                                ? 'bg-indigo-600'
                                : node.type === 'question'
                                ? 'bg-emerald-600'
                                : 'bg-slate-600'
                            }`}
                          >
                            {node.type === 'trigger' && <Play className="h-3.5 w-3.5" />}
                            {node.type === 'call' && <MessageSquare className="h-3.5 w-3.5" />}
                            {node.type === 'question' && <HelpCircle className="h-3.5 w-3.5" />}
                            {node.type === 'action' && <Settings className="h-3.5 w-3.5" />}
                          </span>
                          <span className="text-slate-400 font-mono text-[9px] uppercase tracking-wider">{node.type}</span>
                        </div>
                        {isSelected && <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />}
                      </div>

                      <h5 className="text-xs font-bold text-white mt-2 font-display">{node.label}</h5>

                      {/* Display minor prompt content preview */}
                      {node.config.prompt && (
                        <p className="text-[10px] text-slate-500 mt-1 truncate italic">Prompt: "{node.config.prompt}"</p>
                      )}
                      {node.config.questionText && (
                        <p className="text-[10px] text-slate-500 mt-1 truncate italic">Q: "{node.config.questionText}"</p>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: Node Inspector sidebar */}
          <Widget
            title="Node Inspector"
            icon={Settings}
            accent="#6366f1"
            padding="md"
            action={selectedNode ? (
              <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-bold">
                {selectedNode.id}
              </span>
            ) : undefined}
          >
            {selectedNode ? (
              <div className="flex flex-col justify-between space-y-4 h-full">
                <div className="space-y-4 flex-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Step Label</label>
                    <input
                      type="text"
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {selectedNode.type === 'call' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">AI Voice Prompt</label>
                      <textarea
                        rows={6}
                        value={editingPrompt}
                        onChange={(e) => setEditingPrompt(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                        placeholder="Write behavioral rules for the AI voice agent..."
                      />
                    </div>
                  )}

                  {selectedNode.type === 'question' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Question to Customers</label>
                      <input
                        type="text"
                        value={editingQuestion}
                        onChange={(e) => setEditingQuestion(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                      />
                      <div className="mt-4 space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Conditional Branches</label>
                        <div className="space-y-1.5">
                          {selectedNode.config.branches?.map((branch: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between bg-slate-50 px-2 py-1.5 rounded border border-slate-100 text-[10px] text-slate-600">
                              <span className="font-bold text-indigo-600">{branch.condition}</span>
                              <span>Target Node: {branch.targetId}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedNode.type === 'trigger' && (
                    <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-500 space-y-1">
                      <p><strong>Trigger Settings:</strong></p>
                      <p>Launches automatically whenever a new inbound lead is registered into CRM portfolio database.</p>
                    </div>
                  )}

                  {selectedNode.type === 'action' && (
                    <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-500 space-y-1">
                      <p><strong>Action Settings:</strong></p>
                      <p>Executes automated downstream workflows such as sending payment text links or pushing file details to physical human underwriters.</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSaveNodeConfig}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Save Node Settings
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center my-auto">Select any node on the left canvas to configure its trigger prompts and behaviors.</p>
            )}
          </Widget>
        </div>
      </div>
      </div>
    </PageShell>
  );
}
