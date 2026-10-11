import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Megaphone } from 'lucide-react';
import CollectionNavigator from '../components/ui/CollectionNavigator';

const defaults = {
  title: 'Campaigns',
  description: 'Browse your outbound campaigns.',
  icon: Megaphone,
  sectionLabel: 'All campaigns',
  itemLabel: 'runs',
  emptyTitle: 'No campaigns yet',
  emptyDescription: 'Create a campaign to get started.',
};

describe('CollectionNavigator', () => {
  it('shows a balanced empty state when the collection has no items', () => {
    render(<CollectionNavigator {...defaults} totalCount={0} visibleCount={0}><div>Never shown</div></CollectionNavigator>);
    expect(screen.getByRole('region', { name: 'Campaigns navigator' })).toBeTruthy();
    expect(screen.getByText('No campaigns yet')).toBeTruthy();
    expect(screen.getByText('0 runs')).toBeTruthy();
    expect(screen.queryByText('Never shown')).toBeNull();
  });

  it('renders a filterable list and announces how many items match', () => {
    const onChange = vi.fn();
    render(
      <CollectionNavigator
        {...defaults}
        totalCount={3}
        visibleCount={1}
        search={{ value: 'support', onChange, placeholder: 'Search campaigns...' }}
      >
        <button type="button">Support campaign</button>
      </CollectionNavigator>
    );
    expect(screen.getByRole('searchbox', { name: 'Search campaigns...' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('1 of 3 runs');
    expect(screen.getByRole('button', { name: 'Support campaign' })).toBeTruthy();
  });

  it('distinguishes search misses from an empty collection and allows clearing', () => {
    const onChange = vi.fn();
    render(
      <CollectionNavigator
        {...defaults}
        totalCount={5}
        visibleCount={0}
        search={{ value: 'missing', onChange, placeholder: 'Search campaigns...' }}
      >
        <p>Hidden item</p>
      </CollectionNavigator>
    );
    expect(screen.getByText('No matches found')).toBeTruthy();
    expect(screen.queryByText('No campaigns yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
