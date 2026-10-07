import React from 'react';

interface SidebarFrameProps {
  collapsed: boolean;
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
    </aside>
  );
}
