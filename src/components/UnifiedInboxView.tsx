import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Camera as InstagramIcon, Inbox, Loader2, MessageCircle, Send, Settings, Sparkles, User } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuthorization } from '../lib/authorization';
import type { Channel, Conversation, ChatMessage } from '../lib/inbox';
import PageShell from './ui/PageShell';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Badge from './ui/Badge';
import Widget from './ui/Widget';
import FilterBar from './ui/FilterBar';
import EmptyState from './ui/EmptyState';

const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

function ChannelIcon({ type, className = '' }: { type: string; className?: string }) {
  return type === 'whatsapp'
    ? <MessageCircle className={className} aria-hidden="true" />
    : <InstagramIcon className={className} aria-hidden="true" />;
}

function formattedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data && typeof data.error === 'string' ? data.error : fallback);
  }
  return data as T;
}

function ChannelSettingsModal({ channels, onClose, onSaved }: {
  channels: Channel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const whatsapp = channels.find(channel => channel.type === 'whatsapp');
  const instagram = channels.find(channel => channel.type === 'instagram');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waToken, setWaToken] = useState('');
  const [waAutoReply, setWaAutoReply] = useState(Boolean(whatsapp?.config?.aiAutoReply));
  const [igAccountId, setIgAccountId] = useState('');
  const [igToken, setIgToken] = useState('');
  const [igAutoReply, setIgAutoReply] = useState(Boolean(instagram?.config?.aiAutoReply));
  const [saving, setSaving] = useState<'whatsapp' | 'instagram' | null>(null);
  const [error, setError] = useState('');

  const saveChannel = async (type: 'whatsapp' | 'instagram') => {
    if (saving) return;
    const isWhatsapp = type === 'whatsapp';
    const identifier = (isWhatsapp ? waPhoneId : igAccountId).trim();
    const token = (isWhatsapp ? waToken : igToken).trim();
    if (!identifier || !token) {
      setError('Enter the account identifier and access token.');
      return;
    }
    setSaving(type);
    setError('');
    try {
      const response = await apiFetch(isWhatsapp ? '/api/channels/whatsapp' : '/api/channels/instagram', {
        method: 'POST',
        body: JSON.stringify(isWhatsapp
          ? { phoneNumberId: identifier, accessToken: token, aiAutoReply: waAutoReply }
          : { igBusinessAccountId: identifier, accessToken: token, aiAutoReply: igAutoReply }),
      });
      await readResponse<Channel>(response, 'Unable to save channel settings.');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save channel settings.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal open title="Connect Channels" subtitle="Configure WhatsApp and Instagram for your workspace."
      onClose={() => { if (!saving) onClose(); }} maxWidth="max-w-xl">
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
        <section aria-label="WhatsApp configuration" className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2">
            <ChannelIcon type="whatsapp" className="h-4 w-4 text-[var(--text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">WhatsApp Cloud API</h3>
            {whatsapp && <Badge color="green" className="ml-auto">Connected</Badge>}
          </div>
          <p className="text-xs text-[var(--text-muted)]">Find these credentials in Meta App Dashboard → WhatsApp → API Setup.</p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Phone number ID</span>
            <input className={inputClass} value={waPhoneId} onChange={event => setWaPhoneId(event.target.value)}
              placeholder={whatsapp ? 'Connected: ' + whatsapp.externalId : 'Phone number ID'} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Access token</span>
            <input className={inputClass} type="password" autoComplete="off" value={waToken}
              onChange={event => setWaToken(event.target.value)} placeholder="Enter access token" />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={waAutoReply} onChange={event => setWaAutoReply(event.target.checked)} />
            Let AI auto-reply to incoming messages
          </label>
          <Button type="button" variant="primary" size="sm" loading={saving === 'whatsapp'} disabled={Boolean(saving)}
            onClick={() => void saveChannel('whatsapp')}>Save WhatsApp</Button>
        </section>
        <section aria-label="Instagram configuration" className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2">
            <ChannelIcon type="instagram" className="h-4 w-4 text-[var(--text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Instagram Messaging</h3>
            {instagram && <Badge color="green" className="ml-auto">Connected</Badge>}
          </div>
          <p className="text-xs text-[var(--text-muted)]">Use the linked professional account from your Meta App Dashboard.</p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Instagram business account ID</span>
            <input className={inputClass} value={igAccountId} onChange={event => setIgAccountId(event.target.value)}
              placeholder={instagram ? 'Connected: ' + instagram.externalId : 'Business account ID'} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Access token</span>
            <input className={inputClass} type="password" autoComplete="off" value={igToken}
              onChange={event => setIgToken(event.target.value)} placeholder="Enter access token" />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={igAutoReply} onChange={event => setIgAutoReply(event.target.checked)} />
            Let AI auto-reply to incoming messages
          </label>
          <Button type="button" variant="primary" size="sm" loading={saving === 'instagram'} disabled={Boolean(saving)}
            onClick={() => void saveChannel('instagram')}>Save Instagram</Button>
        </section>
      </div>
    </Modal>
  );
}

export default function UnifiedInboxView() {
  const { can } = useAuthorization();
  const canManageChannels = can('workspace.settings.manage');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram'>('all');
  const messageListRef = useRef<HTMLDivElement>(null);
  const currentConversationId = useRef<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [channelResponse, conversationResponse] = await Promise.all([
        apiFetch('/api/channels'), apiFetch('/api/conversations'),
      ]);
      const [channelRows, conversationRows] = await Promise.all([
        readResponse<Channel[]>(channelResponse, 'Unable to load messaging channels.'),
        readResponse<Conversation[]>(conversationResponse, 'Unable to load conversations.'),
      ]);
      const nextConversations = Array.isArray(conversationRows) ? conversationRows : [];
      setChannels(Array.isArray(channelRows) ? channelRows : []);
      setConversations(nextConversations);
      setSelectedId(current => current && !nextConversations.some(conversation => conversation.id === current) ? null : current);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Unable to load the inbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const selectedConversation = conversations.find(conversation => conversation.id === selectedId) || null;

  useEffect(() => {
    currentConversationId.current = selectedId;
    setMessages([]);
    setMessagesError('');
    setSendError('');
    setAnalysisError('');
    setReplyText('');
    if (!selectedId) {
      setMessagesLoading(false);
      return;
    }
    let active = true;
    setMessagesLoading(true);
    apiFetch('/api/conversations/' + encodeURIComponent(selectedId) + '/messages')
      .then(response => readResponse<ChatMessage[]>(response, 'Unable to load messages.'))
      .then(rows => { if (active) setMessages(Array.isArray(rows) ? rows : []); })
      .catch(reason => { if (active) setMessagesError(reason instanceof Error ? reason.message : 'Unable to load messages.'); })
      .finally(() => { if (active) setMessagesLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!messagesLoading) messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight });
  }, [messages, messagesLoading, selectedId]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter(conversation => {
      const matchesChannel = channelFilter === 'all' || conversation.channelType === channelFilter;
      const matchesSearch = !term ||
        (conversation.contactName || '').toLowerCase().includes(term) ||
        conversation.contactExternalId.toLowerCase().includes(term);
      return matchesChannel && matchesSearch;
    });
  }, [conversations, search, channelFilter]);

  const connectedMessagingChannels = channels.filter(channel => channel.type === 'whatsapp' || channel.type === 'instagram');

  const handleSend = async () => {
    const text = replyText.trim();
    const conversationId = selectedId;
    if (!text || !conversationId || sending) return;
    setSending(true);
    setSendError('');
    try {
      const response = await apiFetch('/api/conversations/' + encodeURIComponent(conversationId) + '/messages', {
        method: 'POST', body: JSON.stringify({ text }),
      });
      const sent = await readResponse<ChatMessage>(response, 'Unable to send your message.');
      if (currentConversationId.current === conversationId) {
        setMessages(previous => [...previous, sent]);
        setReplyText(previous => previous.trim() === text ? '' : previous);
      }
    } catch (reason) {
      if (currentConversationId.current === conversationId) {
        setSendError(reason instanceof Error ? reason.message : 'Unable to send your message.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleAnalyze = async () => {
    const conversationId = selectedId;
    if (!conversationId || analyzing) return;
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const response = await apiFetch('/api/conversations/' + encodeURIComponent(conversationId) + '/analyze', { method: 'POST' });
      const result = await readResponse<Partial<Conversation>>(response, 'Unable to analyze conversation.');
      setConversations(previous => previous.map(conversation => conversation.id === conversationId
        ? { ...conversation, ...result }
        : conversation));
    } catch (reason) {
      if (currentConversationId.current === conversationId) {
        setAnalysisError(reason instanceof Error ? reason.message : 'Unable to analyze conversation.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <PageShell title="Unified Inbox" subtitle="WhatsApp and Instagram conversations in one place."
      layout="fill" onRefresh={loadAll}
      action={canManageChannels ? <Button type="button" icon={Settings} variant="secondary" size="sm"
        onClick={() => setShowSettings(true)}>Channels</Button> : undefined}>
      {loadError && <div role="alert" className="m-3 mb-0 flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
        <span>{loadError}</span>
        <Button type="button" size="xs" variant="secondary" onClick={() => { void loadAll(); }}>Retry</Button>
      </div>}
      {!loading && !loadError && connectedMessagingChannels.length === 0 && <div className="mx-3 mt-3 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]">
        {canManageChannels
          ? 'No messaging channels connected. Use Channels above to connect WhatsApp or Instagram.'
          : 'No messaging channels connected. Ask a workspace administrator to connect one.'}
      </div>}
      <div className="flex min-h-0 flex-1 gap-3 p-0 md:p-1">
        <Widget responsive={false} showHeader={false} padding="none" bodyOverflow="hidden"
          className={(selectedId ? 'hidden md:flex' : 'flex') + ' min-h-0 min-w-0 md:!w-[320px] md:!flex-none xl:!w-[360px]'}
          bodyClassName="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-[var(--border)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversations</h2>
              <span className="text-xs text-[var(--text-muted)]">{conversations.length}</span>
            </div>
            <FilterBar
              search={{ value: search, onChange: setSearch, placeholder: 'Search contacts…' }}
              selects={[{ key: 'channel', label: 'Channel', value: channelFilter, onChange: value => setChannelFilter(value as typeof channelFilter),
                options: [{ label: 'All channels', value: 'all' }, { label: 'WhatsApp', value: 'whatsapp' }, { label: 'Instagram', value: 'instagram' }] }]}
              hasActiveFilters={Boolean(search.trim() || channelFilter !== 'all')}
              onClear={() => { setSearch(''); setChannelFilter('all'); }}
              resultCount={{ filtered: filteredConversations.length, total: conversations.length, label: 'chats' }}
            />
          </div>
          <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto">
            {loading && conversations.length === 0
              ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…
                </div>
              : filteredConversations.length === 0
                ? <EmptyState icon={Inbox} heading={conversations.length ? 'No matching conversations' : 'No conversations yet'}
                    message={conversations.length ? 'Try clearing your search and channel filter.' : 'New WhatsApp and Instagram messages will appear here.'}
                    action={conversations.length && (search || channelFilter !== 'all')
                      ? <Button type="button" size="sm" onClick={() => { setSearch(''); setChannelFilter('all'); }}>Clear filters</Button>
                      : undefined} />
                : filteredConversations.map(conversation => {
                    const active = selectedId === conversation.id;
                    return <button type="button" key={conversation.id} onClick={() => setSelectedId(conversation.id)}
                      aria-current={active ? 'true' : undefined}
                      className={(active ? 'bg-[var(--bg-subtle)] border-l-[var(--accent)]' : 'border-l-transparent hover:bg-[var(--bg-subtle)]') +
                        ' flex w-full items-start gap-3 border-b border-b-[var(--border-subtle)] border-l-[3px] px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'}>
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                        <ChannelIcon type={conversation.channelType} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                          {conversation.contactName || conversation.contactExternalId}
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">
                          {conversation.channelType === 'whatsapp' ? 'WhatsApp' : 'Instagram'} · {formattedDate(conversation.lastMessageAt)}
                        </span>
                      </div>
                      {conversation.sentiment && <Badge color={conversation.sentiment === 'Positive' ? 'green' : conversation.sentiment === 'Negative' ? 'rose' : 'slate'}>
                        {conversation.sentiment}
                      </Badge>}
                    </button>;
                  })}
          </nav>
        </Widget>

        <Widget responsive={false} showHeader={false} padding="none" bodyOverflow="hidden"
          className={(selectedId ? 'flex' : 'hidden md:flex') + ' min-h-0 min-w-0 flex-1'}
          bodyClassName="flex min-h-0 flex-col">
          {!selectedConversation
            ? <div className="flex h-full items-center justify-center">
                <EmptyState icon={MessageCircle} heading="Select a conversation"
                  message="Choose a contact on the left to read and reply to messages." />
              </div>
            : <>
                <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] p-4">
                  <button type="button" onClick={() => setSelectedId(null)} aria-label="Back to conversations"
                    className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] md:hidden">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                    <ChannelIcon type={selectedConversation.channelType} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {selectedConversation.contactName || selectedConversation.contactExternalId}
                    </h2>
                    <p className="text-[11px] capitalize text-[var(--text-muted)]">{selectedConversation.channelType}</p>
                  </div>
                  <Button type="button" icon={Sparkles} variant="secondary" size="sm" loading={analyzing}
                    disabled={messagesLoading} onClick={() => { void handleAnalyze(); }}>AI Summary</Button>
                </div>
                {analysisError && <div role="alert" className="shrink-0 border-b border-rose-200 px-4 py-2 text-xs text-rose-600">{analysisError}</div>}
                {selectedConversation.summary && <div className="shrink-0 space-y-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">AI summary</span>
                    {selectedConversation.sentiment && <Badge color={selectedConversation.sentiment === 'Positive' ? 'green' : selectedConversation.sentiment === 'Negative' ? 'rose' : 'slate'}>
                      {selectedConversation.sentiment}
                    </Badge>}
                    <span className="min-w-0 flex-1">{selectedConversation.summary}</span>
                  </div>
                  {selectedConversation.nextAction && <p><strong className="text-[var(--text-primary)]">Next step:</strong> {selectedConversation.nextAction}</p>}
                </div>}
                <div ref={messageListRef} aria-label="Conversation messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--bg-base)] p-4 md:p-5">
                  {messagesLoading
                    ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-muted)]">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
                      </div>
                    : messagesError
                      ? <div role="alert" className="space-y-2 text-center text-xs text-rose-600">
                          <p>{messagesError}</p>
                          <Button size="sm" onClick={() => setSelectedId(null)}>Back to conversations</Button>
                        </div>
                      : messages.length === 0
                        ? <EmptyState icon={MessageCircle} heading="No messages yet" message="Messages in this conversation will appear here." />
                        : messages.map(message => {
                            const outbound = message.direction === 'outbound';
                            return <div key={message.id} className={'flex ' + (outbound ? 'justify-end' : 'justify-start')}>
                              <div className={(outbound
                                  ? 'bg-[var(--accent)] text-white'
                                  : 'border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)]') +
                                ' max-w-[90%] rounded-xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[75%]'}>
                                {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                                {!message.body && <p className="italic">Media message</p>}
                                <div className={'mt-1.5 flex items-center gap-1 text-[10px] ' + (outbound ? 'text-white/80' : 'text-[var(--text-muted)]')}>
                                  {message.sender === 'ai' && <Bot className="h-3 w-3" />}
                                  {message.sender === 'human' && <User className="h-3 w-3" />}
                                  <span>{formattedDate(message.createdAt)}</span>
                                </div>
                              </div>
                            </div>;
                          })}
                </div>
                <div className="shrink-0 space-y-2 border-t border-[var(--border)] bg-[var(--bg-surface)] p-3 md:p-4">
                  {sendError && <p role="alert" className="text-xs text-rose-600">{sendError}</p>}
                  <div className="flex items-end gap-2">
                    <textarea aria-label="Reply to conversation" rows={1} value={replyText}
                      onChange={event => setReplyText(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder="Type a reply…"
                      className={inputClass + ' max-h-28 min-h-[40px] flex-1 resize-y'} />
                    <Button type="button" variant="primary" icon={Send} size="md"
                      aria-label="Send message" loading={sending} disabled={!replyText.trim() || messagesLoading}
                      onClick={() => { void handleSend(); }} />
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)]">Enter to send · Shift+Enter for a new line</p>
                </div>
              </>}
        </Widget>
      </div>
      {showSettings && canManageChannels && <ChannelSettingsModal channels={connectedMessagingChannels}
        onClose={() => setShowSettings(false)}
        onSaved={() => { setShowSettings(false); void loadAll(); }} />}
    </PageShell>
  );
}
