import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Widget from '../components/ui/Widget';
import DataTable from '../components/ui/DataTable';

describe('shared page containers', () => {
  it('uses the page background in both themes instead of a white or elevated surface', () => {
    const { container } = render(<Widget showHeader={false}>Content</Widget>);
    const widget = container.querySelector('[data-grid-span]');
    expect(widget).toHaveClass('bg-transparent', 'dark:bg-[var(--bg-base)]');
    expect(widget).not.toHaveClass('bg-white', 'dark:bg-[var(--bg-surface)]');
  });

  it('keeps table chrome and pagination aligned with the page background', () => {
    const { container } = render(
      <DataTable
        columns={[{ key: 'name', header: 'Name', cell: (row: { id: string; name: string }) => row.name }]}
        rows={[{ id: '1', name: 'Test contact' }]}
        rowKey={(row) => row.id}
        paginated
        defaultPageSize={1}
      />,
    );
    expect(container.firstElementChild).toHaveClass('bg-transparent', 'dark:bg-[var(--bg-base)]');
    expect(container.querySelector('thead')).toHaveStyle('background: var(--bg-base)');
    expect(screen.getByText('Rows per page').closest('.border-t')).toHaveClass(
      'bg-transparent',
      'dark:bg-[var(--bg-base)]',
    );
  });
});
