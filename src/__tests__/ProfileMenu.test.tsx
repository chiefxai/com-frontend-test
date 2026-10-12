import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ProfileMenu from '../components/ProfileMenu';

const mocks = vi.hoisted(() => ({ setMode: vi.fn(), logout: vi.fn() }));
vi.mock('../shared/theme/ThemeContext', () => ({
  useTheme: () => ({ mode: 'light', resolved: 'light', setMode: mocks.setMode }),
}));

const user = { name: 'Alex Rivera', email: 'alex.rivera@example.com', role: 'Member' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('shared sidebar profile trigger', () => {
  it('refreshes on opening and updates the visible role without reopening', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<ProfileMenu kcUser={user} dbRole="Member" logout={mocks.logout} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    expect(onOpen).toHaveBeenCalledOnce();
    rerender(<ProfileMenu kcUser={user} dbRole="Manager" logout={mocks.logout} onOpen={onOpen} />);
    const dialog = screen.getByRole('dialog', { name: 'Account menu' });
    expect(within(dialog).getByText('Manager')).toBeInTheDocument();
    expect(within(dialog).queryByText('Member')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('opens the same dropdown when the expanded user name is clicked', () => {
    render(<ProfileMenu kcUser={user} dbRole="Workspace Admin" logout={mocks.logout}
      placement="top-start" showIdentity />);
    const trigger = screen.getByRole('button', { name: 'Open account menu' });
    expect(within(trigger).getByText('Alex Rivera')).toBeInTheDocument();
    expect(within(trigger).getByText('alex.rivera@example.com')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(within(trigger).getByText('Alex Rivera'));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('dialog', { name: 'Account menu' });
    expect(menu).toHaveAttribute('id', trigger.getAttribute('aria-controls'));
    expect(within(menu).getByText('Workspace Admin')).toBeInTheDocument();
  });

  it('opens from email, toggles closed from the same row, and opens from avatar', () => {
    render(<ProfileMenu kcUser={user} dbRole="Member" logout={mocks.logout} showIdentity />);
    const trigger = screen.getByRole('button', { name: 'Open account menu' });
    fireEvent.click(within(trigger).getByText('alex.rivera@example.com'));
    expect(screen.getByRole('dialog', { name: 'Account menu' })).toBeInTheDocument();

    fireEvent.click(within(trigger).getByText('alex.rivera@example.com'));
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).not.toBeInTheDocument();

    fireEvent.click(within(trigger).getByText('AR'));
    expect(screen.getByRole('dialog', { name: 'Account menu' })).toBeInTheDocument();
  });

  it('remains avatar-only when collapsed but still opens the account options', () => {
    render(<ProfileMenu kcUser={user} dbRole="Member" logout={mocks.logout}
      placement="top-start" showIdentity compact />);
    const trigger = screen.getByRole('button', { name: 'Open account menu' });
    expect(trigger).toHaveClass('h-11');
    expect(within(trigger).queryByText('Alex Rivera')).not.toBeInTheDocument();
    expect(within(trigger).queryByText('alex.rivera@example.com')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const menu = screen.getByRole('dialog', { name: 'Account menu' });
    expect(within(menu).getByText('Alex Rivera')).toBeInTheDocument();
    expect(within(menu).getByText('alex.rivera@example.com')).toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the account row', () => {
    render(<ProfileMenu kcUser={user} dbRole="Member" logout={mocks.logout} showIdentity />);
    const trigger = screen.getByRole('button', { name: 'Open account menu' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on outside clicks without logging out', () => {
    render(<div>
      <button type="button">Outside</button>
      <ProfileMenu kcUser={user} dbRole="Member" logout={mocks.logout} showIdentity />
    </div>);
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).not.toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('preserves appearance controls and sign-out behavior', () => {
    render(<ProfileMenu kcUser={user} dbRole="Member" logout={mocks.logout} showIdentity />);
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Account menu' });
    const light = within(dialog).getByRole('button', { name: 'Light' });
    expect(light).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dark' }));
    expect(mocks.setMode).toHaveBeenCalledWith('dark');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).not.toBeInTheDocument();
  });
});
