import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeaderProvider, usePageHeaderContext } from '../lib/PageHeaderContext';
import PageHeaderBar from '../components/ui/PageHeaderBar';
import PageShell from '../components/ui/PageShell';

function PublishHeader() {
  const context = usePageHeaderContext();
  React.useEffect(() => {
    context?.setHeader({
      title: 'Contact Directory',
      toolbar: <button type="button">Filters</button>,
      action: <button type="button">Add Contact</button>,
    });
  }, [context?.setHeader]);
  return null;
}

describe('shared page header backgrounds', () => {
  it.each([true, false])('matches the page background in integrated=%s mode', (integrated) => {
    render(
      <PageHeaderProvider>
        <PublishHeader />
        <PageHeaderBar integrated={integrated} />
      </PageHeaderProvider>,
    );

    const header = screen.getByRole('heading', { name: 'Contact Directory' }).closest('.h-16');
    const toolbar = screen.getByRole('button', { name: 'Filters' }).parentElement;
    for (const surface of [header, toolbar]) {
      expect(surface).toHaveClass('bg-transparent', 'dark:bg-[var(--bg-base)]');
      expect(surface).not.toHaveClass('bg-[var(--bg-surface)]', 'bg-[var(--bg-subtle)]');
    }
    expect(screen.getByRole('button', { name: 'Add Contact' })).toBeInTheDocument();
    if (!integrated) {
      expect(header).toHaveClass('border-b');
      expect(toolbar).toHaveClass('border-b');
    }
  });

  it('uses the same styling for standalone PageShell headers and toolbars', () => {
    render(
      <PageShell
        title="Pipeline"
        toolbar={<button type="button">Filters</button>}
        action={<button type="button">Export CSV</button>}
      >
        <p>Pipeline content</p>
      </PageShell>,
    );
    const header = screen.getByRole('heading', { name: 'Pipeline' }).closest('.h-16');
    const toolbar = screen.getByRole('button', { name: 'Filters' }).parentElement;
    expect(header).toHaveClass('bg-transparent', 'dark:bg-[var(--bg-base)]');
    expect(toolbar).toHaveClass('bg-transparent', 'dark:bg-[var(--bg-base)]');
    expect(header).toHaveClass('border-b');
    expect(toolbar).toHaveClass('border-b');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });
});
