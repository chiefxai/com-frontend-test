import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationSettingsPage from '../notifications/NotificationSettingsPage';

const mock = vi.hoisted(() => ({
  preferences: vi.fn(),
  setPreferences: vi.fn(),
}));
vi.mock('../notifications/api', () => ({
  notificationClient: mock,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('unified notification preferences', () => {
  it('fills the shared 12-column PageShell grid instead of collapsing to one column', async () => {
    mock.preferences.mockResolvedValue([]);
    render(<NotificationSettingsPage audience="organization" />);
    const container = screen.getByRole('region', { name: 'Notification settings' });
    expect(container).toHaveClass('col-span-12', 'min-w-0', 'w-full', 'max-w-4xl');
  });

  it('allows each user to switch browser and email notifications independently', async () => {
    const event = { key:'campaign.completed',category:'Campaigns',label:'Campaign completed',defaults:{browser:true,email:false} };
    mock.preferences.mockResolvedValue([event]);
    mock.setPreferences.mockResolvedValue([event]);
    render(<NotificationSettingsPage audience="organization" />);
    const browser = await screen.findByRole('checkbox', {name:'Campaign completed In-app'});
    const email = screen.getByRole('checkbox', {name:'Campaign completed Email'});
    expect(browser).toBeChecked();
    expect(email).not.toBeChecked();
    fireEvent.click(email);
    expect(email).toBeChecked();
    fireEvent.click(screen.getByRole('button',{name:'Save preferences'}));
    await waitFor(() => expect(mock.setPreferences).toHaveBeenCalledWith('organization',[
      {eventKey:'campaign.completed',channel:'browser',enabled:true},
      {eventKey:'campaign.completed',channel:'email',enabled:true},
    ]));
  });
});
