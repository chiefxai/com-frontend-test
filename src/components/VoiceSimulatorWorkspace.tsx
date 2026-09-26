import React from 'react';

interface VoiceSimulatorWorkspaceProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared full-height workspace shell used by both Outbound and Inbound
 * Voice Simulator views. Keeping the height/grid surface here prevents
 * collapse/expand behavior from changing the overall container height.
 */
export default function VoiceSimulatorWorkspace({
  children,
  className = '',
}: VoiceSimulatorWorkspaceProps) {
  return (
    <div
      className={`grid grid-cols-12 gap-3 xl:gap-4 items-stretch rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-2 lg:p-3 shadow-sm h-full min-h-0 ${className}`}
    >
      {children}
    </div>
  );
}
