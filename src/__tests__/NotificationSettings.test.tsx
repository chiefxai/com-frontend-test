import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationSettingsPage from '../notifications/NotificationSettingsPage';
import { PageHeaderProvider, usePageHeaderContext } from '../lib/PageHeaderContext';

const mock = vi.hoisted(() => ({
  preferences: vi.fn(),
  setPreferences: vi.fn(),
}));
vi.mock('../notifications/api', () => ({
  notificationClient: mock,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('unified notification preferences', () => {
  it('keeps bulk actions in the common header while removing redundant explanatory text', async () => {
    mock.preferences.mockResolvedValue([{ key:'campaign.completed', category:'Campaigns', label:'Campaign completed', defaults:{ browser:false, email:false } }]);
    function Header() {
      const ctx = usePageHeaderContext();
      React.useEffect(() => { ctx?.setHeader({ title:'Notification Settings' }); }, [ctx?.setHeader]);
      return <header aria-label="Shared page header">{ctx?.header?.title}{ctx?.header?.action}</header>;
    }
    render(
      <PageHeaderProvider>
        <Header />
        <NotificationSettingsPage audience="organization" />
      </PageHeaderProvider>
    );
    expect(await screen.findByRole('checkbox',{name:'Campaign completed In-app'})).not.toBeChecked();
    expect(screen.queryByText('Choose which business events you receive in-app and by email.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Transport connection messages are never notifications/)).not.toBeInTheDocument();
    const header = screen.getByRole('banner',{ name:'Shared page header' });
    fireEvent.click(await waitFor(() => {
      const button = header.querySelector('button');
      expect(button).not.toBeNull();
      return screen.getByRole('button',{name:'Enable all'});
    }));
    expect(screen.getByRole('checkbox',{name:'Campaign completed In-app'})).toBeChecked();
    expect(screen.getByRole('checkbox',{name:'Campaign completed Email'})).toBeChecked();
    fireEvent.click(screen.getByRole('button',{name:'Disable all'}));
    expect(screen.getByRole('checkbox',{name:'Campaign completed Email'})).not.toBeChecked();
  });

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
