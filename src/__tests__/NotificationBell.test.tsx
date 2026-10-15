import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from '../components/NotificationBell';

const mock = vi.hoisted(() => ({ list: vi.fn(), markRead: vi.fn() }));
vi.mock('../notifications/api', () => ({
  notificationClient: mock,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('business-only notification bell', () => {
  it('shows only persisted events and no SSE connection status or billing 404 text', async () => {
    mock.list.mockResolvedValue([{
      id:'notification-1',eventKey:'campaign.completed',title:'Campaign completed',
      message:'All leads dialed.',actionPath:'/campaign',occurredAt:new Date().toISOString(),
      readAt:null,scopeType:'organization',scopeOwnerId:'org1',
    }]);
    render(<MemoryRouter><NotificationBell audience="organization" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
    expect(await screen.findByText('Campaign completed')).toBeInTheDocument();
    expect(screen.queryByText('Live event stream connected')).not.toBeInTheDocument();
    expect(screen.queryByText(/Billing alerts are not available/)).not.toBeInTheDocument();
  });
});
