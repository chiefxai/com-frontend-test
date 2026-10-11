import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
  ReactFlowInstance,
  PanOnScrollMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Trash2, HelpCircle, Square, Copy } from 'lucide-react';
import { QuestionFlow, QuestionFlowNode, QuestionFlowEdge, WorkflowVariable } from './types';
import { nodeTypes } from './components/FlowNodes';
import NodeEditor from './components/NodeEditor';

// ── Auto-layout from variables ────────────────────────────────────────────────

const LEVEL_H = 150;
const BRANCH_OFFSET_X = 320;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function layoutVariables(
  variables: WorkflowVariable[],
  spineX: number,
  startY: number,
  enterNodeId: string,
  exitNodeId: string | null,
): { nodes: QuestionFlowNode[]; edges: QuestionFlowEdge[]; height: number } {
  const nodes: QuestionFlowNode[] = [];
  const edges: QuestionFlowEdge[] = [];
  if (variables.length === 0) return { nodes, edges, height: startY };

  let currentY = startY;
  let prevNodeId = enterNodeId;

  variables.forEach((v, vIdx) => {
    const nodeId = `n-${v.id}`;
    nodes.push({
      id: nodeId,
      type: 'question',
      label: v.name || `Question ${vIdx + 1}`,
      questionText: v.questionText,
      position: { x: spineX, y: currentY },
    });
    edges.push({ id: uid('e'), source: prevNodeId, target: nodeId });

    const branches = v.branches ?? [];
    if (branches.length === 0) {
      currentY += LEVEL_H;
    } else {
      const branchStartY = currentY + LEVEL_H;
      const totalWidth = (branches.length - 1) * BRANCH_OFFSET_X;
      const leftmostX = spineX - totalWidth / 2;
      let maxBranchY = branchStartY;

      branches.forEach((branch, bIdx) => {
        const bX = leftmostX + bIdx * BRANCH_OFFSET_X;
        const nextVarId = variables[vIdx + 1]?.id;
        const nextNodeId = nextVarId ? `n-${nextVarId}` : exitNodeId;

        if (branch.variables.length > 0) {
          const sub = layoutVariables(branch.variables, bX, branchStartY, nodeId, nextNodeId);
          if (sub.edges.length > 0) {
            sub.edges[0] = { ...sub.edges[0], source: nodeId, label: branch.condition || `Branch ${bIdx + 1}` };
          }
          nodes.push(...sub.nodes);
          edges.push(...sub.edges);
          const lastSub = sub.nodes[sub.nodes.length - 1];
          if (lastSub && nextNodeId && !sub.edges.some(e => e.source === lastSub.id && e.target === nextNodeId)) {
            edges.push({ id: uid('e'), source: lastSub.id, target: nextNodeId });
          }
          maxBranchY = Math.max(maxBranchY, sub.height);
        } else if (nextNodeId) {
          edges.push({ id: uid('e'), source: nodeId, target: nextNodeId, label: branch.condition || `Branch ${bIdx + 1}` });
        }
      });

      currentY = maxBranchY + LEVEL_H;
    }

    prevNodeId = nodeId;
  });

  return { nodes, edges, height: currentY };
}

function variablesToNodes(variables: WorkflowVariable[]): { nodes: QuestionFlowNode[]; edges: QuestionFlowEdge[] } {
  const startId = 'auto-start';
  const endId = 'auto-end';
  if (variables.length === 0) {
    return {
      nodes: [
        { id: startId, type: 'start', label: 'Start', position: { x: 250, y: 50 } },
        { id: endId, type: 'end', label: 'End', position: { x: 250, y: 220 } },
      ],
      edges: [{ id: 'e-start-end', source: startId, target: endId }],
    };
  }

  const { nodes: qNodes, edges: qEdges, height } = layoutVariables(variables, 250, 180, startId, endId);
  const lastQ = qNodes.slice().reverse().find(n => n.type === 'question') ?? qNodes[qNodes.length - 1];
  const extraEdges: QuestionFlowEdge[] = [];
  if (lastQ && !qEdges.some(e => e.source === lastQ.id && e.target === endId)) {
    extraEdges.push({ id: uid('e'), source: lastQ.id, target: endId });
  }

  return {
    nodes: [
      { id: startId, type: 'start', label: 'Start', position: { x: 250, y: 50 } },
      ...qNodes,
      { id: endId, type: 'end', label: 'End', position: { x: 250, y: height + 40 } },
    ],
    edges: [...qEdges, ...extraEdges],
  };
}

// ── ReactFlow adapters ────────────────────────────────────────────────────────

function toRFNodes(nodes: QuestionFlowNode[]): Node[] {
  return nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n },
  }));
}

function toRFEdges(edges: QuestionFlowEdge[]): Edge[] {
  return edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.optionId,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    labelStyle: { fontSize: 11, fill: '#64748b', fontWeight: 600 },
  }));
}

function fromRFNodes(rfNodes: Node[]): QuestionFlowNode[] {
  return rfNodes.map(n => ({ ...(n.data as unknown as QuestionFlowNode), position: n.position }));
}

function fromRFEdges(rfEdges: Edge[]): QuestionFlowEdge[] {
  return rfEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    optionId: e.sourceHandle || undefined,
    label: e.label as string | undefined,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  flow: QuestionFlow;
  allFlows: QuestionFlow[];
  onChange: (updated: QuestionFlow) => void;
}

export default function QuestionFlowBuilder({ flow, allFlows, onChange }: Props) {
  // If nodes are empty (cleared by variables tab), auto-generate from variables
  const initialNodes = useMemo(() => {
    const src = flow.nodes.length > 0 ? flow.nodes : variablesToNodes(flow.variables ?? []).nodes;
    return toRFNodes(src);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initialEdges = useMemo(() => {
    const src = flow.nodes.length > 0 ? flow.edges : variablesToNodes(flow.variables ?? []).edges;
    return toRFEdges(src);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(initialNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const flowIdRef = useRef(flow.id);
  const isMounted = useRef(false);

  // Re-initialize when switching to a different flow
  useEffect(() => {
    if (flow.id !== flowIdRef.current) {
      flowIdRef.current = flow.id;
      isMounted.current = false;
      const src = flow.nodes.length > 0 ? { nodes: flow.nodes, edges: flow.edges } : variablesToNodes(flow.variables ?? []);
      setRfNodes(toRFNodes(src.nodes));
      setRfEdges(toRFEdges(src.edges));
    }
  }, [flow.id, flow.nodes, flow.edges, flow.variables, setRfNodes, setRfEdges]);

  // Live-sync diagram edits back to parent
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    onChangeRef.current({
      ...flow,
      nodes: fromRFNodes(rfNodes),
      edges: fromRFEdges(rfEdges),
      updatedAt: new Date().toISOString(),
    });
  }, [rfNodes, rfEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete selected node on keyboard Delete / Backspace
  useEffect(() => {
    if (!selectedNodeId) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)) {
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNode = rfNodes.find(n => n.id === selectedNodeId);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: Edge = {
        ...connection,
        id: uid('e'),
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      };
      setRfEdges(eds => addEdge(edge, eds));
    },
    [setRfEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setNodeMenu(null);
    setPaneMenu(null);
  }, []);

  const onMoveStart = useCallback(() => {
    setNodeMenu(null);
    setPaneMenu(null);
  }, []);

  // Right-click a node: menu to edit/duplicate/delete it, instead of the
  // browser's own context menu.
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setPaneMenu(null);
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    // Only opens the menu — NOT setSelectedNodeId, which would also pop
    // open the (much larger) NodeEditor panel right underneath it.
    setNodeMenu({ id: node.id, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  }, []);

  // Right-click empty canvas: menu to add a node at that exact spot,
  // instead of the browser's own context menu.
  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    setNodeMenu(null);
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }) ?? { x: 0, y: 0 };
    setPaneMenu({
      x: (event as MouseEvent).clientX - bounds.left,
      y: (event as MouseEvent).clientY - bounds.top,
      flowX: flowPos.x,
      flowY: flowPos.y,
    });
  }, []);

  const addNode = (type: QuestionFlowNode['type'], position?: { x: number; y: number }) => {
    const id = uid('n');
    const labels: Record<string, string> = { question: 'New Question', end: 'End', start: 'Start' };
    const newNode: QuestionFlowNode = {
      id,
      type,
      label: labels[type] ?? type,
      questionText: type === 'question' ? 'What would you like to ask?' : undefined,
      // No default answer options — left for the user to define in the
      // node editor, rather than assuming every question is yes/no.
      options: undefined,
      position: position ?? { x: 100 + rfNodes.length * 60, y: 100 + rfNodes.length * 40 },
    };
    setRfNodes(nds => [...nds, { id: newNode.id, type: newNode.type, position: newNode.position, data: { ...newNode } }]);
    return newNode.id;
  };

  const deleteNode = (id: string) => {
    setRfNodes(nds => nds.filter(n => n.id !== id));
    setRfEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  };

  const duplicateNode = (id: string) => {
    const source = rfNodes.find(n => n.id === id);
    if (!source) return;
    const data = source.data as unknown as QuestionFlowNode;
    const newId = uid('n');
    const duplicated: QuestionFlowNode = {
      ...data,
      id: newId,
      label: `${data.label} (copy)`,
      options: data.options?.map(o => ({ ...o, id: uid('opt') })),
      position: { x: source.position.x + 40, y: source.position.y + 40 },
    };
    setRfNodes(nds => [...nds, { id: newId, type: duplicated.type, position: duplicated.position, data: { ...duplicated } }]);
  };

  const onNodeEditorChange = (updated: QuestionFlowNode) => {
    setRfNodes(nds =>
      nds.map(n => (n.id === updated.id ? { ...n, data: { ...updated }, type: updated.type } : n))
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Canvas */}
      <div className="flex-1 relative" ref={canvasRef}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onMoveStart={onMoveStart}
          onInit={(instance) => { rfInstanceRef.current = instance; }}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode="Delete"
          // Two-finger trackpad drag pans the canvas (like a click-and-drag
          // pan) instead of zooming — pinch-to-zoom still zooms via
          // zoomOnPinch. Matches the feel of Figma/Miro-style canvases.
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnScroll={false}
          zoomOnPinch
          className="bg-slate-50"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls className="!bottom-4 !left-4" />
          <MiniMap nodeStrokeWidth={3} className="!bottom-4 !right-4 border border-slate-200 rounded-xl" />
        </ReactFlow>

        {/* Right-click context menu — on a node (edit/duplicate/delete) */}
        {nodeMenu && (
          <>
            <div className="absolute inset-0 z-40" onClick={() => setNodeMenu(null)} />
            <div
              className="absolute z-50 w-44 rounded-xl border shadow-xl overflow-hidden py-1"
              style={{ left: nodeMenu.x, top: nodeMenu.y, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <button
                onClick={() => { setSelectedNodeId(nodeMenu.id); setNodeMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-[var(--bg-subtle)] transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                <HelpCircle className="h-3.5 w-3.5" /> Edit node
              </button>
              <button
                onClick={() => { duplicateNode(nodeMenu.id); setNodeMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-[var(--bg-subtle)] transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </button>
              <button
                onClick={() => { deleteNode(nodeMenu.id); setNodeMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-rose-50 text-rose-600 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </>
        )}

        {/* Right-click context menu — on empty canvas (add a node here) */}
        {paneMenu && (
          <>
            <div className="absolute inset-0 z-40" onClick={() => setPaneMenu(null)} />
            <div
              className="absolute z-50 w-48 rounded-xl border shadow-xl overflow-hidden py-1"
              style={{ left: paneMenu.x, top: paneMenu.y, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <button
                onClick={() => { addNode('question', { x: paneMenu.flowX, y: paneMenu.flowY }); setPaneMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-[var(--bg-subtle)] transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                <HelpCircle className="h-3.5 w-3.5" /> Add question here
              </button>
              <button
                onClick={() => { addNode('end', { x: paneMenu.flowX, y: paneMenu.flowY }); setPaneMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-[var(--bg-subtle)] transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                <Square className="h-3.5 w-3.5" /> Add end node here
              </button>
            </div>
          </>
        )}

        {/* Node editor panel */}
        {selectedNode && (
          <>
            <div className="absolute inset-0 z-40" onClick={() => setSelectedNodeId(null)} />
            <NodeEditor
              node={selectedNode.data as unknown as QuestionFlowNode}
              allNodes={fromRFNodes(rfNodes)}
              onChange={onNodeEditorChange}
              onClose={() => setSelectedNodeId(null)}
            />
          </>
        )}
      </div>
    </div>
  );
}
