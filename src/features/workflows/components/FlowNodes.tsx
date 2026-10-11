import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { HelpCircle, Play, Square } from 'lucide-react';
import { QuestionFlowNode, QuestionOption } from '../types';

type NodeData = QuestionFlowNode & { selected?: boolean };

const handleStyle = {
  width: 10,
  height: 10,
  background: '#3b82f6',
  border: '2px solid white',
};

export function StartNode({ data }: NodeProps) {
  return (
    <div className="bg-emerald-500 text-white rounded-2xl px-5 py-3 shadow-lg min-w-[140px] text-center">
      <div className="flex items-center justify-center gap-2">
        <Play className="h-4 w-4" />
        <span className="text-sm font-bold">{(data as any).label || 'Start'}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
}

export function QuestionNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const options: QuestionOption[] = d.options || [];

  return (
    <div className="bg-white border border-blue-200 rounded-2xl shadow-sm min-w-[240px] max-w-[300px]">
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">Question</span>
        </div>
        <p className="text-sm font-semibold text-slate-800 leading-snug">{d.questionText || d.label}</p>
      </div>
      {options.length > 0 && (
        <div className="px-4 py-2 space-y-1">
          {options.map(opt => (
            <div key={opt.id} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-xs text-slate-600 truncate">{opt.text}</span>
              {opt.terminateFlow && (
                <span className="text-[9px] bg-rose-100 text-rose-600 px-1 rounded ml-auto shrink-0">end</span>
              )}
              {opt.goToNodeId && (
                <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded ml-auto shrink-0">jump</span>
              )}
            </div>
          ))}
        </div>
      )}
      {options.map((opt, i) => (
        <Handle
          key={opt.id}
          type="source"
          position={Position.Bottom}
          id={opt.id}
          style={{
            ...handleStyle,
            left: `${((i + 1) / (options.length + 1)) * 100}%`,
            background: opt.terminateFlow ? '#f43f5e' : '#3b82f6',
          }}
        />
      ))}
      {options.length === 0 && (
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
      )}
    </div>
  );
}

export function EndNode({ data }: NodeProps) {
  return (
    <div className="bg-slate-700 text-white rounded-2xl px-5 py-3 shadow-lg min-w-[140px] text-center">
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: '#94a3b8' }} />
      <div className="flex items-center justify-center gap-2">
        <Square className="h-4 w-4" />
        <span className="text-sm font-bold">{(data as any).label || 'End'}</span>
      </div>
    </div>
  );
}

export const nodeTypes = {
  start: StartNode,
  question: QuestionNode,
  end: EndNode,
};
