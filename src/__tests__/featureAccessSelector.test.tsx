import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import FeatureAccessSelector from '../components/ui/FeatureAccessSelector';

const allowed = [
  'executive_desk',
  'contact_directory',
  'ai_campaigns',
  'dialer',
  'call_logs',
  'reports',
  'unified_inbox',
];

function ControlledAccess({ keys = allowed, initial = [] }: { keys?: string[]; initial?: string[] }) {
  const [granted, setGranted] = useState(initial);
  return (
    <div data-testid="clipped-parent" style={{ overflow: 'hidden', maxHeight: 110 }}>
      <FeatureAccessSelector
        availableKeys={keys}
        value={granted}
        onChange={setGranted}
      />
      <output data-testid="grants">{granted.join(',')}</output>
    </div>
  );
}

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /feature access.*select feature/i }));
  return screen.getByRole('dialog', { name: 'Feature Access options' });
}

describe('shared FeatureAccessSelector dropdown', () => {
  it('opens a searchable portal with groups above individual features', () => {
    render(<ControlledAccess />);
    const panel = openPicker();
    expect(document.body.contains(panel)).toBe(true);
    expect(within(screen.getByTestId('clipped-parent')).queryByRole('dialog')).toBeNull();
    expect(within(panel).getByRole('searchbox', { name: /search feature groups and permissions/i })).toBeTruthy();
    const groupHeading = within(panel).getByText('Feature groups');
    const featureHeading = within(panel).getByText('Individual features');
    expect(groupHeading.compareDocumentPosition(featureHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'View permissions in Sales Team' })).toBeTruthy();
  });

  it('lets group information reveal permissions without changing grants', () => {
    const onChange = vi.fn();
    render(<FeatureAccessSelector availableKeys={allowed} value={[]} onChange={onChange} />);
    const panel = openPicker();
    const detailsButton = within(panel).getByRole('button', { name: 'View permissions in Sales Team' });
    fireEvent.click(detailsButton);
    expect(detailsButton.getAttribute('aria-expanded')).toBe('true');
    const detailId = detailsButton.getAttribute('aria-controls');
    const details = detailId && document.getElementById(detailId);
    expect(details).toBeTruthy();
    expect(within(details as HTMLElement).getByText('Contact Directory')).toBeTruthy();
    expect(within(details as HTMLElement).getByText('AI Campaigns')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(detailsButton);
    expect(detailsButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('applies a group, lets a specific permission be removed, and then removes the group', () => {
    render(<ControlledAccess />);
    const panel = openPicker();
    fireEvent.click(within(panel).getByRole('button', { name: 'Select Sales Team group' }));
    expect(screen.getByTestId('grants').textContent).toContain('ai_campaigns');
    expect(screen.getByTestId('grants').textContent).toContain('executive_desk');
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove AI Campaigns feature' }));
    expect(screen.getByTestId('grants').textContent).not.toContain('ai_campaigns');
    fireEvent.click(within(panel).getByRole('button', { name: 'Select Sales Team group' }));
    expect(screen.getByTestId('grants').textContent).toContain('ai_campaigns');
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove Sales Team group' }));
    expect(screen.getByTestId('grants').textContent).toBe('');
  });

  it('filters both group and individual permission options by search', () => {
    render(<ControlledAccess />);
    const panel = openPicker();
    const search = within(panel).getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'unified inbox' } });
    expect(within(panel).getByRole('button', { name: 'Select Unified Inbox feature' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'View permissions in Support Team' })).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'View permissions in Sales Team' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Select Reports feature' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Clear permission search' }));
    expect(within(panel).getByRole('button', { name: 'View permissions in Sales Team' })).toBeTruthy();
  });

  it('does not expose unavailable permissions in group information or grant them', () => {
    render(<ControlledAccess keys={['executive_desk', 'reports']} />);
    const panel = openPicker();
    const group = within(panel).getByRole('button', { name: 'Select Sales Team group' });
    fireEvent.click(within(panel).getByRole('button', { name: 'View permissions in Sales Team' }));
    expect(within(panel).queryByRole('button', { name: /AI Campaigns feature/ })).toBeNull();
    fireEvent.click(group);
    expect(screen.getByTestId('grants').textContent).toBe('executive_desk,reports');
  });

  it('closes with Escape without forwarding Escape to a parent dialog', () => {
    const parentEscape = vi.fn();
    document.addEventListener('keydown', parentEscape);
    render(<ControlledAccess />);
    const panel = openPicker();
    fireEvent.keyDown(within(panel).getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Feature Access options' })).toBeNull();
    expect(parentEscape).not.toHaveBeenCalled();
    document.removeEventListener('keydown', parentEscape);
  });
});
