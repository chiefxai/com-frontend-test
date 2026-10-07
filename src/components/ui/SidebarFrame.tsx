import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarFrameProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  expandedWidth: string;
  collapsedWidth: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

/** Shared fixed-height sidebar frame; callers provide their own header, nav, and footer. */
export default function SidebarFrame({
  collapsed,
  onToggleCollapse,
  expandedWidth,
  collapsedWidth,
  children,
  className = '',
  style,
  id,
}: SidebarFrameProps) {
  return (
    <aside
      id={id}
      className={`relative flex h-dvh min-h-0 flex-col shrink-0 ${collapsed ? collapsedWidth : expandedWidth} ${className}`}
      style={style}
    >
      {children}
      <button
        type="button"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-16 z-20 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-all duration-150 hover:border-blue-300 hover:text-blue-600"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
