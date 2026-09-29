import React from 'react';
import { useNavigate } from 'react-router-dom';

interface BreadcrumbTitleProps {
  /** The sidebar group's own label, e.g. "Campaign", "Administration". */
  group: string;
  /** The active sub-item's label, e.g. "Outbound Campaigns". */
  page: string;
}

// Page-header title for a page that lives under a sidebar group with
// sub-items (see Sidebar.tsx's SIDEBAR_GROUPS) — renders "Group / Page"
// with the group half deliberately lighter and smaller, and the active
// sub-page half carrying the full page-title weight — since the sub-page
// is the thing actually being looked at, it should read as the headline,
// with the group name as its (de-emphasized) context.
const GROUP_ROUTES: Record<string, string> = {
  Dashboard: '/',
  Campaign: '/campaign',
  'Company Profile': '/company-profile',
  Administration: '/administration',
};

export default function BreadcrumbTitle({ group, page }: BreadcrumbTitleProps) {
  const navigate = useNavigate();
  const groupRoute = GROUP_ROUTES[group];

  return (
    <div className="flex items-center min-w-0">
      {groupRoute ? (
        <button
          type="button"
          onClick={() => navigate(groupRoute)}
          className="font-medium text-sm text-slate-400 hover:text-slate-700 dark:text-[var(--text-muted)] dark:hover:text-[var(--text-primary)] transition-colors truncate shrink-0"
          title="Go to parent page"
        >
          {group}
        </button>
      ) : (
        <span className="font-medium text-sm text-slate-400 dark:text-[var(--text-muted)] truncate shrink-0">{group}</span>
      )}
      <span className="mx-1.5 font-normal text-slate-300 dark:text-slate-600 shrink-0">/</span>
      <span className="text-lg font-semibold text-slate-900 dark:text-[var(--text-primary)] truncate">{page}</span>
    </div>
  );
}
