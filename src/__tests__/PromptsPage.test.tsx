import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PromptsPage from '../admin/PromptsPage';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

const validPrompt = [
  '{{agent_name}}', '{{company_name}}', '{{industry}}', '{{language}}',
  '{{dialect}}', '{{dialect_profile}}', '{{dialect_examples}}', '{{business_context}}',
].join(' ');

const voice = [
  { callType: 'INBOUND', prompt: validPrompt, defaultPrompt: validPrompt, isCustomized: false },
  { callType: 'OUTBOUND', prompt: validPrompt + ' Outbound', defaultPrompt: validPrompt + ' Outbound', isCustomized: false },
];
const system = [
  { id: 'sentiment', name: 'Sentiment analyst', description: 'Classifies calls', model: 'gemini', systemPrompt: 'Analyze calls. {transcript} {workflowAnswers}', defaultSystemPrompt: 'Analyze calls. {transcript} {workflowAnswers}', isCustomized: false, tools: [], runsOn: 'After a call' },
  { id: 'summary', name: 'Summary agent', description: 'Writes notes', model: 'gemini', systemPrompt: 'Summarize.', defaultSystemPrompt: 'Summarize.', isCustomized: false, tools: [], runsOn: 'After a call' },
];
const catalog = {
  languages: [
    { id: 'english', language: 'English', prompt: 'Use {{language}}.' },
    { id: 'hindi', language: 'Hindi', prompt: 'Speak Hindi.' },
  ],
  dialectsByLanguage: {
    English: [{ id: 'standard', dialect: 'Standard', prompt: 'Use English.', examples: ['Hello'] }],
    Hindi: [],
  } as Record<string, { id: string; dialect: string; prompt: string; examples: string[] }[]>,
};

const response = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockImplementation(async (path: string, options?: { method?: string; body?: string }) => {
    if (path === '/api/platform/prompts/languages-dialects') return response(catalog);
    if (path.startsWith('/api/platform/prompts/voice/') && options?.method === 'PUT') {
      const callType = path.split('/').pop();
      const original = voice.find(item => item.callType === callType)!;
      const body = JSON.parse(options.body || '{}');
      return response({ ...original, prompt: body.prompt || original.defaultPrompt, isCustomized: Boolean(body.prompt) });
    }
    if (path.startsWith('/api/platform/prompts/system/') && options?.method === 'PUT') {
      const id = path.split('/').pop();
      const original = system.find(item => item.id === id)!;
      const body = JSON.parse(options.body || '{}');
      return response({ ...original, systemPrompt: body.systemPrompt || original.defaultSystemPrompt, isCustomized: Boolean(body.systemPrompt) });
    }
    return response({ voice, system });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Platform Admin prompt library', () => {
  it('organizes prompts into one category at a time with a themed editor', async () => {
    render(<PromptsPage />);
    expect(await screen.findByRole('navigation', { name: 'Prompt categories' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Voice templates/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('textbox', { name: 'Prompt instructions' })).toBeInTheDocument();
    expect(screen.getByText('8/8 present')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Language prompt' })).not.toBeInTheDocument();
  });

  it('prevents saving a voice template that removes required variables', async () => {
    render(<PromptsPage />);
    const editor = await screen.findByRole('textbox', { name: 'Prompt instructions' });
    fireEvent.change(editor, { target: { value: 'Invalid prompt' } });
    expect(screen.getByText('0/8 present')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save voice prompt' })).toBeDisabled();
    expect(screen.getByText(/Restore the missing variables/i)).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: validPrompt + ' Please be polite.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save voice prompt' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/platform/prompts/voice/INBOUND',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ prompt: validPrompt + ' Please be polite.' }) }),
    ));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('warns before discarding edits when changing categories', async () => {
    render(<PromptsPage />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Prompt instructions' }), { target: { value: validPrompt + ' draft' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: /System agents/ }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved prompt changes'));
    expect(screen.getByRole('textbox', { name: 'Prompt instructions' })).toBeInTheDocument();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /System agents/ }));
    expect(screen.getByRole('textbox', { name: 'System instructions' })).toHaveValue('Analyze calls. {transcript} {workflowAnswers}');
  });

  it('uses a searchable system-agent list without affecting saved instructions', async () => {
    render(<PromptsPage />);
    await screen.findByRole('navigation', { name: 'Prompt categories' });
    fireEvent.click(screen.getByRole('button', { name: /System agents/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search system agents' }), { target: { value: 'summary' } });
    expect(screen.getByRole('button', { name: /Summary agent/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sentiment analyst/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Summary agent/i }));
    expect(screen.getByRole('textbox', { name: 'System instructions' })).toHaveValue('Summarize.');
  });

  it('prevents system prompt saves when post-call variables are missing', async () => {
    render(<PromptsPage />);
    await screen.findByRole('navigation', { name: 'Prompt categories' });
    fireEvent.click(screen.getByRole('button', { name: /System agents/ }));
    const editor = screen.getByRole('textbox', { name: 'System instructions' });
    expect(screen.getByText('2/2 present')).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: 'Analyze calls without input.' } });
    expect(screen.getByText('0/2 present')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save system prompt' })).toBeDisabled();
    expect(screen.getByText(/Restore missing variables/)).toBeInTheDocument();
  });

  it('adds languages in an inline form, not a browser prompt', async () => {
    mocks.apiFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/api/platform/prompts/languages' && options?.method === 'POST') {
        return response({ ...catalog, languages: [...catalog.languages, { id: 'french', language: 'French', prompt: 'Speak French.' }], dialectsByLanguage: { ...catalog.dialectsByLanguage, French: [] } });
      }
      return path === '/api/platform/prompts/languages-dialects' ? response(catalog) : response({ voice, system });
    });
    render(<PromptsPage />);
    await screen.findByRole('navigation', { name: 'Prompt categories' });
    fireEvent.click(screen.getByRole('button', { name: /Languages & dialects/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add language' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New language name' }), { target: { value: 'French' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create language' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/platform/prompts/languages', {
      method: 'POST', body: JSON.stringify({ language: 'French' }),
    }));
    expect(await screen.findByText('French language guidance')).toBeInTheDocument();
  });

  it('keeps the save flow for edited dialect examples', async () => {
    mocks.apiFetch.mockImplementation(async (path: string, options?: { method?: string; body?: string }) => {
      if (path.endsWith('/dialects/Standard') && options?.method === 'PUT') {
        const body = JSON.parse(options.body || '{}');
        return response({ ...catalog, dialectsByLanguage: { ...catalog.dialectsByLanguage, English: [{ ...catalog.dialectsByLanguage.English[0], prompt: body.prompt, examples: body.examples }] } });
      }
      return path === '/api/platform/prompts/languages-dialects' ? response(catalog) : response({ voice, system });
    });
    render(<PromptsPage />);
    await screen.findByRole('navigation', { name: 'Prompt categories' });
    fireEvent.click(screen.getByRole('button', { name: /Languages & dialects/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Natural phrasing examples' }), { target: { value: 'Hello\nGood morning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save dialect' }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/platform/prompts/languages/English/dialects/Standard',
      { method: 'PUT', body: JSON.stringify({ prompt: 'Use English.', examples: ['Hello', 'Good morning'] }) },
    ));
  });
});
