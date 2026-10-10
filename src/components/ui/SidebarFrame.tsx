import React from 'react';

interface SidebarFrameProps {
  collapsed: boolean;
  expandedWidth: string;
  collapsedWidth: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  ariaLabel?: string;
}

/** Shared fixed-height, borderless sidebar surface. Navigation owns its brand control. */
export default function SidebarFrame({
  collapsed,
  expandedWidth,
  collapsedWidth,
  children,
  className = '',
  style,
  id,
  ariaLabel = 'Application sidebar',
}: SidebarFrameProps) {
  return (
    <aside
      id={id}
      aria-label={ariaLabel}
      className={`relative z-30 flex h-dvh min-h-0 shrink-0 flex-col overflow-visible ${collapsed ? collapsedWidth : expandedWidth} ${className}`}
      style={style}
    >
      {children}
    </aside>
  );
}
