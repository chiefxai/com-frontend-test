import React, { act, lazy } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Button from '../components/ui/Button';
import { LoadingBoundary, LoadingIcon, LoadingState } from '../components/ui/LoadingIndicator';

describe('shared Chief Connect loading indicator', () => {
  it('shows an accessible live status with a useful message on full-page loading', () => {
    render(<LoadingState variant="page" label="Verifying workspace access…" description="Checking your permissions." />);
    const status = screen.getByRole('status');
    expect(status).toHaveClass('cv-loading-state--page');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(within(status).getByText('Verifying workspace access…')).toBeInTheDocument();
    expect(within(status).getByText('Checking your permissions.')).toBeInTheDocument();
    expect(within(status).getByTestId('loading-icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the same common component for sections and compact loading', () => {
    const { rerender } = render(<LoadingState variant="section" label="Opening Reports…" />);
    expect(screen.getByRole('status')).toHaveClass('cv-loading-state--section');
    rerender(<LoadingState variant="inline" label="Saving" description="hidden in compact mode" />);
    expect(screen.getByRole('status')).toHaveClass('cv-loading-state--inline');
    expect(screen.getByText('Saving')).toBeInTheDocument();
    expect(screen.queryByText('hidden in compact mode')).not.toBeInTheDocument();
  });

  it('provides decorative compact icons for buttons', () => {
    render(<LoadingIcon size="xs" tone="current" />);
    const icon = screen.getByTestId('loading-icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('data-tone', 'current');
    expect(icon).toHaveAttribute('width', '18');
  });

  it('keeps action buttons disabled and busy while using the shared icon', () => {
    render(<Button loading variant="primary">Save changes</Button>);
    const button = screen.getByRole('button', { name: 'Save changes' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(within(button).getByTestId('loading-icon')).toHaveAttribute('data-tone', 'current');
  });

  it('shows the loader only while a lazy page is pending', async () => {
    let finish!: (value: { default: React.ComponentType }) => void;
    const LazyPage = lazy(() => new Promise<{ default: React.ComponentType }>(resolve => { finish = resolve; }));
    render(
      <LoadingBoundary variant="section" label="Opening Campaigns…">
        <LazyPage />
      </LoadingBoundary>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Opening Campaigns…');
    await act(async () => { finish({ default: () => <h1>Campaigns loaded</h1> }); });
    expect(screen.getByRole('heading', { name: 'Campaigns loaded' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
