import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Manage provider rates')).toBeInTheDocument();
    expect(screen.getByText('Vobiz')).toBeInTheDocument();
    expect(screen.getByText('Gemini AI')).toBeInTheDocument();
    expect(screen.getByText('Provider rate entries')).toBeInTheDocument();
  });

  it('saves an edited call-provider rate using the existing endpoint', async () => {
    render(<CostPage />);
    const rate = await screen.findByRole('spinbutton', { name: 'Rate (INR)' });
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
    const input = await screen.findByRole('spinbutton', { name: 'Gemini Live Voice price (INR)' });
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
