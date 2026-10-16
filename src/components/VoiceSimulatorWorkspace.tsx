import React from 'react';

interface VoiceSimulatorWorkspaceProps {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
}

/**
 * Shared full-height workspace shell used by both Outbound and Inbound
 * Voice Simulator views.
 *
 * The simulator page does not currently provide a fixed-height ancestor,
 * so h-full alone cannot resolve to the viewport height. The workspace
 * therefore establishes its own viewport-relative height while preserving
 * h-full/min-h-0 for nested grid and collapse behavior.
 */
export default function VoiceSimulatorWorkspace({
  children,
  className = '',
  header,
}: VoiceSimulatorWorkspaceProps) {
  return (
    <div
      className={`grid grid-cols-12 gap-3 xl:gap-4 items-stretch h-full min-h-0 min-h-[calc(100dvh-11rem)] lg:min-h-[calc(100dvh-10rem)] ${header ? 'grid-rows-[auto_minmax(0,1fr)]' : ''} ${className}`}
    >
      {header ? <div className="col-span-12">{header}</div> : null}
      {children}
    </div>
  );
}
