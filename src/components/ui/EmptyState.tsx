import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  heading?: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({ icon: Icon = Inbox, heading = 'Nothing here yet', message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center gap-3 ${className}`}>
      <div className="h-12 w-12 rounded-[14px] bg-[var(--bg-subtle)] flex items-center justify-center">
        <Icon className="h-6 w-6 text-[var(--text-muted)]" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{heading}</p>
        {message && <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs">{message}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
