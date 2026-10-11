import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Bot, Eye, Pencil } from 'lucide-react';
import StudioEntityCard from '../components/ui/StudioEntityCard';

describe('shared Agent Studio entity card', () => {
  it('renders the same identity, status, summary and action slots for agents and providers', () => {
    const onView = vi.fn();
    const onEdit = vi.fn();
    render(
      <StudioEntityCard
        title="Example Provider"
        subtitle="provider-id"
        icon={Bot}
        badge={<span>Active</span>}
        actions={<span>Options</span>}
        footer={
          <>
            <button type="button" onClick={onView}><Eye aria-hidden="true" />View</button>
            <button type="button" onClick={onEdit}><Pencil aria-hidden="true" />Edit</button>
          </>
        }
      >
        <p>Rates and billing units</p>
      </StudioEntityCard>
    );
    const card = screen.getByRole('article', { name: 'Example Provider' });
    expect(within(card).getByText('provider-id')).toBeInTheDocument();
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText('Rates and billing units')).toBeInTheDocument();
    expect(card.querySelector('.bg-gradient-to-r')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'View' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    expect(onView).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('renders a header-only action menu without any footer, as Agent Studio does', () => {
    render(
      <StudioEntityCard title="Call Agent" subtitle="Voice: Priya" icon={Bot} actions={<button type="button">Options</button>}>
        <p>Emotion 70</p>
      </StudioEntityCard>
    );
    const card = screen.getByRole('article', { name: 'Call Agent' });
    expect(within(card).getByRole('button', { name: 'Options' })).toBeInTheDocument();
    expect(within(card).getByText('Emotion 70')).toBeInTheDocument();
  });
});
