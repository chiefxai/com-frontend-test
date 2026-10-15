import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CostPage from '../admin/CostPage';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

const call = {
  key: 'vobiz', kind: 'call', label: 'Vobiz', active: true,
  rateUnit: 'minute', rateAmount: 2, taxPercent: 18,
};
const live = {
  key: 'gemini', kind: 'ai', label: 'Gemini Live Voice', active: true,
  pricingMode: 'time', timeRateAmount: 1.5, timeUnit: 'minute', tokenUnit: 1000, taxPercent: 18,
};
const post = {
  key: 'gemini-postcall', kind: 'ai', label: 'Gemini Post-Call', active: true,
  pricingMode: 'time', timeRateAmount: 0.5, timeUnit: 'minute', tokenUnit: 1000, taxPercent: 18,
};
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockImplementation(async (url: string, options?: { method?: string; body?: string }) => {
    if (url === '/api/platform/cost-providers' && !options) return response([call, live, post]);
    if (url.startsWith('/api/platform/cost-providers/') && options?.method === 'PUT') {
      return response(JSON.parse(options.body || '{}'));
    }
    throw new Error('Unexpected pricing request: ' + url);
  });
});

describe('Platform Admin Providers & Pricing cards', () => {
  it('shows separately grouped provider cards and summary KPIs', async () => {
    render(<CostPage />);
    expect(await screen.findByRole('region', { name: 'Call provider pricing' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'AI provider pricing' })).toBeInTheDocument();
    expect(screen.queryByText(/Browse the same compact cards used in Agent Studio/)).not.toBeInTheDocument();
    expect(screen.getByText('Vobiz')).toBeInTheDocument();
    expect(screen.getByText('Gemini AI')).toBeInTheDocument();
    expect(screen.getByText('Provider rate entries')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Vobiz' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Gemini AI' })).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Vobiz' })).getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Vobiz' })).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('saves an edited call-provider rate using the existing endpoint', async () => {
    render(<CostPage />);
    const card = await screen.findByRole('article', { name: 'Vobiz' });
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    const rate = screen.getByRole('spinbutton', { name: 'Rate (INR)' });
    fireEvent.change(rate, { target: { value: '3.75' } });
    expect(screen.getByText(/unsaved configuration/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/platform/cost-providers/vobiz',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"rateAmount":3.75') }),
    ));
  });

  it('saves both Gemini model rates via their existing sequential endpoints', async () => {
    render(<CostPage />);
    const card = await screen.findByRole('article', { name: 'Gemini AI' });
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    const input = screen.getByRole('spinbutton', { name: 'Gemini Live Voice price (INR)' });
    fireEvent.change(input, { target: { value: '2.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Gemini' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/platform/cost-providers/gemini-postcall',
      expect.objectContaining({ method: 'PUT' }),
    ));
    const writes = mocks.apiFetch.mock.calls.filter((args: unknown[]) => (
      (args[1] as { method?: string } | undefined)?.method === 'PUT'
    ));
    expect(writes.map((args: unknown[]) => args[0])).toEqual([
      '/api/platform/cost-providers/gemini',
      '/api/platform/cost-providers/gemini-postcall',
    ]);
  });

  it('opens full read-only provider details from View and lets users switch to Edit', async () => {
    render(<CostPage />);
    const card = await screen.findByRole('article', { name: 'Vobiz' });
    fireEvent.click(within(card).getByRole('button', { name: 'View' }));
    expect(screen.getByText('Provider details')).toBeInTheDocument();
    expect(screen.getByText('Provider key')).toBeInTheDocument();
    expect(screen.getByText('Effective rate')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit pricing' }));
    expect(screen.getByRole('spinbutton', { name: 'Rate (INR)' })).toBeInTheDocument();
  });

  it('asks before discarding unsaved pricing changes in the editor', async () => {
    render(<CostPage />);
    const card = await screen.findByRole('article', { name: 'Vobiz' });
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    const input = screen.getByRole('spinbutton', { name: 'Rate (INR)' });
    fireEvent.change(input, { target: { value: '9.25' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved provider pricing changes?');
    expect(screen.getByRole('spinbutton', { name: 'Rate (INR)' })).toHaveValue(9.25);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Edit provider pricing')).not.toBeInTheDocument();
    expect(within(card).getByText('₹2.36')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('shows both Gemini rate details in View without exposing editing inputs', async () => {
    render(<CostPage />);
    const card = await screen.findByRole('article', { name: 'Gemini AI' });
    fireEvent.click(within(card).getByRole('button', { name: 'View' }));
    expect(screen.getByText('Shared settings')).toBeInTheDocument();
    expect(screen.getByText('Post-Call Agents')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('can retry failed provider rate loading', async () => {
    mocks.apiFetch.mockReset();
    mocks.apiFetch.mockRejectedValueOnce(new Error('Rate service unavailable'))
      .mockResolvedValue(response([call, live, post]));
    render(<CostPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('Rate service unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'Call provider pricing' })).toBeInTheDocument();
  });
});
