import React from 'react';
import { Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';

interface SidebarBrandProps {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  homeTo?: string;
  navId: string;
}

/**
 * Shared header for organization and Platform Admin navigation.
 * The logo is the collapse/expand control: hovering or focusing swaps it
 * for the panel icon, while touch users can simply tap the logo.
 */
export default function SidebarBrand({
  collapsed, onToggle, title, subtitle, homeTo, navId,
}: SidebarBrandProps) {
  const actionLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const titleBlock = (
    <span className="min-w-0">
      <span className="block truncate text-sm font-bold leading-tight text-[var(--text-primary)]">{title}</span>
      <span className="mt-0.5 block truncate text-[10px] font-semibold text-[var(--text-muted)]"
        title={subtitle}>{subtitle}</span>
    </span>
  );

  return (
    <div className={`flex h-[72px] shrink-0 items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={actionLabel}
        aria-expanded={!collapsed}
        aria-controls={navId}
        title={actionLabel}
        className="group/brand relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <img
          src={chiefVoiceLogo}
          alt=""
          aria-hidden="true"
          className="h-8 w-8 object-contain transition-opacity duration-150 group-hover/brand:opacity-0 group-focus-visible/brand:opacity-0"
        />
        {collapsed
          ? <PanelLeftOpen aria-hidden="true" className="pointer-events-none absolute h-5 w-5 text-[var(--text-primary)] opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100" />
          : <PanelLeftClose aria-hidden="true" className="pointer-events-none absolute h-5 w-5 text-[var(--text-primary)] opacity-0 transition-opacity duration-150 group-hover/brand:opacity-100 group-focus-visible/brand:opacity-100" />
        }
      </button>
      {!collapsed && (
        homeTo
          ? <Link to={homeTo}
              className="min-w-0 flex-1 rounded-lg py-2 pr-2 transition-colors hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              aria-label={title + ' home'}>{titleBlock}</Link>
          : <div className="min-w-0 flex-1">{titleBlock}</div>
      )}
    </div>
  );
}
