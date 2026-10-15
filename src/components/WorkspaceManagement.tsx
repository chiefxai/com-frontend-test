import React, { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuthorization } from '../lib/authorization';
import Widget from './ui/Widget';
import DataTable, { Column } from './ui/DataTable';
import FilterBar from './ui/FilterBar';
import Modal from './ui/Modal';
import IconButton from './ui/IconButton';
import { newBillingIdempotencyKey } from '../lib/billing/client';

interface WorkspaceSetup { policy: {mode:string;primaryIndustry:string;pricing?:{includedWorkspaces:number;maxWorkspaces:number|null}}; currentQuote: {totalMonthlyInr:number} | null; purchasesAvailable?:boolean;pendingWorkspacePurchases?:number;addBranchQuote: {totalMonthlyInr:number;upgradesToMultipleBranches:boolean;token:string;paymentRequired:boolean;monthlyAddonInr:number} | null }
interface IndustryOption { key: string; label: string }
interface TopupFunding { topupPaymentAvailable?: boolean; unallocatedTopupCredits?: {asset:string;units:string;scale:number} }
interface WorkspaceRow { id: string; name: string; industry: string; branchName?: string | null; status: string }

export default function WorkspaceManagement({
  enabled,
  onWorkspaceCreated,
  onSelectWorkspace,
  memberCounts = {},
  numberCounts = {},
  numberCountsAvailable = false,
}: {
  enabled: boolean;
  onWorkspaceCreated: () => Promise<void>;
  onSelectWorkspace?: (workspace: { id: string; name: string; status: string; industry: string; branchName?: string | null }) => void;
  memberCounts?: Record<string, number>;
  numberCounts?: Record<string, number>;
  numberCountsAvailable?: boolean;
}) {
  const { can } = useAuthorization();
  const canManage = can('organization.manage');
  const canRead = can('organization.read');
  const [search, setSearch] = useState('');
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [setup, setSetup] = useState<WorkspaceSetup | null>(null);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [industryOptions, setIndustryOptions] = useState<IndustryOption[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [purchaseKey,setPurchaseKey] = useState(newBillingIdempotencyKey);
  const [topupFunding,setTopupFunding] = useState<TopupFunding | null>(null);
  const [paymentMethod,setPaymentMethod] = useState<'topup' | 'invoice'>('invoice');
  const canPay = can('billing.payment.submit');
  const paymentRequired = setup?.addBranchQuote?.paymentRequired === true;
  const chargeUnits = BigInt(Math.round((setup?.addBranchQuote?.monthlyAddonInr || 0) * 100));
  const fundedTopupUnits = BigInt(topupFunding?.unallocatedTopupCredits?.units || '0');
  const canUseTopup = topupFunding?.topupPaymentAvailable === true && fundedTopupUnits >= chargeUnits && chargeUnits > 0n;
  const redeemTopup = paymentRequired && paymentMethod === 'topup';
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!enabled || !canRead) return;
    let cancelled = false;
    Promise.all([
      apiFetch('/api/settings/workspaces').then(async response => {
        const body = await response.json().catch(() => []);
        if (!response.ok) throw new Error(body.error || 'Could not load workspaces');
        return body as WorkspaceRow[];
      }),
      apiFetch('/api/settings/workspace-policy').then(async response => {
        const body=await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load workspace policy');
        return body as WorkspaceSetup;
      }),
      apiFetch('/api/billing/workspace-addons').then(async response => response.ok ? await response.json() as TopupFunding : null).catch(() => null),
      apiFetch('/api/auth/industries').then(async response => {
        const body = await response.json().catch(() => []);
        if (!response.ok) throw new Error(body.error || 'Could not load industries');
        return body as IndustryOption[];
      }),
    ]).then(([rows, options, funding, industries]) => {
      if (cancelled) return;
      setWorkspaces(Array.isArray(rows) ? rows : []);
      setSetup(options);
      setTopupFunding(funding);
      setIndustryOptions(Array.isArray(industries) ? industries : []);
      if (funding?.topupPaymentAvailable && BigInt(funding.unallocatedTopupCredits?.units || '0') >= BigInt(Math.round((options.addBranchQuote?.monthlyAddonInr || 0) * 100))) setPaymentMethod('topup');
      else setPaymentMethod('invoice');
      setIndustry(options.policy.primaryIndustry);
    }).catch(error => {
      if (!cancelled) setMessage({ type: 'error', text: error.message || 'Could not load workspace setup.' });
    }).finally(() => { if (!cancelled) setLoading(false); });
    setLoading(true);
    return () => { cancelled = true; };
  }, [enabled, canRead]);

  if (!enabled || !canRead) return null;

  const changeIndustry = async (nextIndustry: string) => {
    setIndustry(nextIndustry);
    setPurchaseKey(newBillingIdempotencyKey());
    setQuoteLoading(true);
    setSetup(current => current ? { ...current, addBranchQuote: null } : current);
    setMessage(null);
    try {
      const response = await apiFetch('/api/settings/workspace-policy?industry=' + encodeURIComponent(nextIndustry));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not refresh workspace pricing');
      setSetup(body as WorkspaceSetup);
      const amount = Math.round((body.addBranchQuote?.monthlyAddonInr || 0) * 100);
      if (topupFunding?.topupPaymentAvailable && BigInt(topupFunding.unallocatedTopupCredits?.units || '0') >= BigInt(amount) && amount > 0) setPaymentMethod('topup');
      else setPaymentMethod('invoice');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Could not refresh workspace pricing.' });
    } finally {
      setQuoteLoading(false);
    }
  };

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!setup?.addBranchQuote) return;
    setSaving(true);
    setMessage(null);
    try {
      if (redeemTopup && !canUseTopup) throw new Error('Insufficient unallocated top-up credits. Choose invoice payment or add more credits.');
      const response = await apiFetch(paymentRequired ? (redeemTopup ? '/api/billing/workspace-addons/pay-with-topup' : '/api/billing/workspace-addons') : '/api/settings/workspaces', {
        method: 'POST',
        ...(paymentRequired ? {headers:{'Idempotency-Key':purchaseKey}} : {}),
        body: JSON.stringify({ name: name.trim(), industry, branchName: branchName.trim() || null, pricingAcceptanceToken:setup.addBranchQuote.token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create workspace');
      if (!paymentRequired || redeemTopup) {
        if (redeemTopup) setWorkspaces(current => [...current, {id:body.workspaceId,name:name.trim(),industry,branchName:branchName.trim() || null,status:'Active'}]);
        else setWorkspaces(current => [...current, body as WorkspaceRow]);
      }
      setPurchaseKey(newBillingIdempotencyKey());
      setName('');
      setBranchName('');
      setShowCreateWorkspace(false);
      setMessage({ type: 'success', text: redeemTopup ? 'Workspace created immediately. The first month was charged to your unallocated top-up credits; renewal invoices are still paid separately.' : paymentRequired ? 'Workspace reserved. Submit the payment receipt under Billing & Usage → Payments; it will be created after approval.' : 'Workspace created and assigned to you as Workspace Admin.' });
      // A secondary refresh failure must never make a successful create look
      // unsuccessful (or encourage a duplicate workspace submission).
      try {
        const policyResponse = await apiFetch('/api/settings/workspace-policy');
        if (policyResponse.ok) { const refreshed=await policyResponse.json(); setSetup(refreshed); setIndustry(refreshed.policy.primaryIndustry); if (Array.isArray(refreshed.workspaces)) setWorkspaces(refreshed.workspaces); }
        if (redeemTopup) { const fundingResponse=await apiFetch('/api/billing/workspace-addons'); if (fundingResponse.ok) setTopupFunding(await fundingResponse.json()); }
        await onWorkspaceCreated();
      } catch {
        setMessage({ type: 'success', text: redeemTopup ? 'Workspace created and top-up credits charged. Refresh if your credit balance has not updated.' : paymentRequired ? 'Purchase recorded. Refresh to see its payment invoice.' : 'Workspace created. Refresh the page if related workspace data has not updated yet.' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Could not create workspace.' });
      const refreshed=await apiFetch('/api/settings/workspace-policy').catch(()=>null);
      if(refreshed?.ok) { const value=await refreshed.json(); setSetup(value); setWorkspaces(value.workspaces); }
    } finally {
      setSaving(false);
    }
  };

  const filteredWorkspaces = workspaces.filter(workspace =>
    !search.trim() || `${workspace.name} ${workspace.branchName || ''} ${workspace.industry}`
      .toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <Widget showHeader={false} padding="none">
      {message && <div role="status" className={`m-4 rounded-lg border px-3 py-2 text-xs ${message.type === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.text}</div>}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search workspace or branch' }}
          hasActiveFilters={Boolean(search.trim())}
          onClear={() => setSearch('')}
          resultCount={{ filtered: filteredWorkspaces.length, total: workspaces.length, label: 'workspaces' }}
          actions={canManage
            ? <IconButton icon={Plus} label="Create Workspace" onClick={() => setShowCreateWorkspace(true)} />
            : undefined}
        />
      </div>
      <DataTable
        bare
        paginated
        resizable
        loading={loading}
        emptyMessage={workspaces.length ? 'No workspaces match this search.' : 'No workspaces available.'}
        columns={[
          { key: 'workspace', header: 'Workspace', cell: (workspace: WorkspaceRow) =>
            <button type="button" disabled={workspace.status !== 'Active'} onClick={() => onSelectWorkspace?.(workspace)}
              className="text-left font-semibold text-[var(--accent)] hover:underline"
              aria-label={`View workspace ${workspace.name}`}>{workspace.name}</button> },
          { key: 'branch', header: 'Branch / Industry', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{workspace.branchName || workspace.industry.replaceAll('_', ' ')}</span> },
          { key: 'members', header: 'Members', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{memberCounts[workspace.id] ?? '—'}</span> },
          { key: 'numbers', header: 'Phone Numbers', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{numberCountsAvailable ? (numberCounts[workspace.id] ?? 0) : '—'}</span> },
          { key: 'status', header: 'Status', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{workspace.status}</span> },
        ] as Column<WorkspaceRow>[]}
        rows={filteredWorkspaces}
        rowKey={workspace => workspace.id}
      />
      {canManage && <Modal
        open={showCreateWorkspace}
        onClose={() => { if (!saving) setShowCreateWorkspace(false); }}
        title="Create Workspace"
        subtitle="Included workspaces are free. Extra workspaces can be created with eligible top-up credits or a verified invoice."
        maxWidth="max-w-lg"
      >
        <form onSubmit={createWorkspace} className="space-y-4">
          <label className="block space-y-1 text-xs font-medium text-[var(--text-secondary)]">
            <span>Workspace name</span>
            <input required maxLength={120} autoFocus value={name} onChange={event => {setName(event.target.value);setPurchaseKey(newBillingIdempotencyKey());}}
              placeholder="Sales - Mumbai"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)]" />
          </label>
          <label className="block space-y-1 text-xs font-medium text-[var(--text-secondary)]">
            <span>Industry</span>
            {setup?.policy.mode === 'mixed_industry'
              ? <select value={industry} onChange={event => { void changeIndustry(event.target.value); }} disabled={quoteLoading || saving}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)]">
                  {industryOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              : <input readOnly value={industryOptions.find(option => option.key === industry)?.label || industry.replaceAll('_', ' ')}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs text-[var(--text-primary)]" />}
          </label>
          <label className="block space-y-1 text-xs font-medium text-[var(--text-secondary)]">
            <span>Branch (optional)</span>
            <input maxLength={160} value={branchName} onChange={event => {setBranchName(event.target.value);setPurchaseKey(newBillingIdempotencyKey());}}
              placeholder="Mumbai"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)]" />
          </label>
          <p className="text-xs text-[var(--text-muted)]">{setup?.policy.mode === 'mixed_industry'
            ? 'Choose the industry for this workspace. Pricing updates to include any additional industry fee.'
            : 'This subscription allows workspaces in the organization’s primary industry only.'}</p>
          {setup?.addBranchQuote
            ? <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
                Workspace {workspaces.length + 1}: {workspaces.length + 1 <= (setup.policy.pricing?.includedWorkspaces ?? 1) ? 'within the included allowance' : 'priced as a workspace add-on'}. Total monthly organization estimate across subscription and add-on invoices: ₹{setup.addBranchQuote.totalMonthlyInr.toFixed(2)}. Usage charges and applicable taxes are additional.
              </p>
            : <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {setup?.policy.pricing && setup.policy.pricing.maxWorkspaces !== null && workspaces.length >= setup.policy.pricing.maxWorkspaces
                  ? `This subscription allows up to ${setup.policy.pricing.maxWorkspaces} workspace${setup.policy.pricing.maxWorkspaces === 1 ? '' : 's'}. Upgrade the subscription to add another workspace.`
                  : 'Ask a platform administrator to configure branch pricing before adding another workspace.'}
              </p>}
          {paymentRequired && <div className="space-y-2 text-xs text-[var(--text-secondary)]">
            <p>Workspace add-on: ₹{setup?.addBranchQuote?.monthlyAddonInr.toFixed(2)} for the first month, then monthly renewal invoices.</p>
            {topupFunding?.topupPaymentAvailable && <div className="space-y-2 rounded-lg border border-[var(--border)] p-3" role="group" aria-label="Workspace payment method">
              <label className="flex items-center gap-2"><input type="radio" name="workspace-funding" checked={paymentMethod === 'topup'} onChange={() => { setPaymentMethod('topup'); setPurchaseKey(newBillingIdempotencyKey()); }} disabled={!canUseTopup} /> Pay now with unallocated top-up credits (₹{(Number(fundedTopupUnits)/100).toFixed(2)} available)</label>
              <label className="flex items-center gap-2"><input type="radio" name="workspace-funding" checked={paymentMethod === 'invoice'} onChange={() => { setPaymentMethod('invoice'); setPurchaseKey(newBillingIdempotencyKey()); }} /> Submit invoice for approval</label>
              {!canUseTopup && <p role="status">Not enough unallocated top-up credits to cover ₹{setup?.addBranchQuote?.monthlyAddonInr.toFixed(2)}. Allocate fewer credits to workspaces or purchase more top-up credits first.</p>}
              {redeemTopup && <p>Confirming will deduct the full first-month charge immediately. Credits already allocated to another workspace and subscription credits will not be used. Renewals still require a separate invoice payment.</p>}
            </div>}
            {!topupFunding?.topupPaymentAvailable && <p>The first month starts only after invoice payment approval. Renewal invoices follow.</p>}
          </div>}
          {paymentRequired && (!canPay || (redeemTopup ? !canUseTopup : !setup?.purchasesAvailable)) && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{!canPay ? 'An organization billing administrator must purchase this add-on.' : redeemTopup ? 'Top-up payment is unavailable or the balance is insufficient.' : 'Workspace invoice payments are currently unavailable. Contact your platform administrator.'}</p>}
          <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button type="button" disabled={saving} onClick={() => setShowCreateWorkspace(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || loading || quoteLoading || !setup?.addBranchQuote || !name.trim() || (paymentRequired && (!canPay || (redeemTopup ? !canUseTopup : !setup?.purchasesAvailable)))}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {saving ? 'Preparing…' : redeemTopup ? 'Pay credits & create workspace' : paymentRequired ? 'Prepare payment invoice' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </Modal>}
    </Widget>
  );
}
