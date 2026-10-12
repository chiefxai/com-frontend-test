import React from 'react';
import { AlertTriangle, Plus, Save, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Card, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

type TaxApplicability = 'subscription' | 'additional_workspace' | 'additional_industry' | 'additional_seat';
type PostpaidMode = 'limited' | 'unlimited';
type ExpiryMode = 'suspend' | 'grace' | 'continue_postpaid';
interface TaxRule { code: string; rateBps: number | ''; appliesTo: TaxApplicability[]; inclusive: boolean }
interface SubscriptionTermsPolicy {
  includedDistinctIndustries: number | '';
  maxDistinctIndustries: number | null | '';
  taxes: TaxRule[];
  postpaid: { eligible: boolean; workspaceModes: PostpaidMode[]; organizationExposureLimit: { asset: 'INR'; units: string; scale: 2 } | null };
  serviceAfterExpiry: { mode: ExpiryMode | ''; graceSeconds: number | '' };
}
interface PolicyEnvelope { configured: boolean; version: number; policy: SubscriptionTermsPolicy | null; updatedAt?: string; updatedBy?: string }

const emptyPolicy = (): SubscriptionTermsPolicy => ({
  includedDistinctIndustries: '', maxDistinctIndustries: '', taxes: [],
  postpaid: { eligible: false, workspaceModes: [], organizationExposureLimit: null },
  serviceAfterExpiry: { mode: '', graceSeconds: '' },
});
const inputClass = 'mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-[var(--text-secondary)]';
const helpClass = 'mt-1 block text-[11px] font-normal leading-relaxed text-[var(--text-muted)]';
const TAX_APPLICABILITY: { value: TaxApplicability; label: string }[] = [
  { value: 'subscription', label: 'Subscription fee' },
  { value: 'additional_workspace', label: 'Additional workspace' },
  { value: 'additional_industry', label: 'Additional industry' },
  { value: 'additional_seat', label: 'Additional seat' },
];

function parseInrAmount(value: string): { asset: 'INR'; units: string; scale: 2 } | null | undefined {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ''] = value.split('.');
  return { asset: 'INR', units: `${BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))}`, scale: 2 };
}
function amountToInput(value: SubscriptionTermsPolicy['postpaid']['organizationExposureLimit']): string {
  if (!value || value.asset !== 'INR' || !/^\d+$/.test(value.units) || value.scale !== 2) return '';
  const units = BigInt(value.units);
  return `${units / 100n}.${(units % 100n).toString().padStart(2, '0')}`;
}
function validPolicy(policy: SubscriptionTermsPolicy, emptyTaxesConfirmed: boolean): string {
  if (!Number.isInteger(policy.includedDistinctIndustries) || Number(policy.includedDistinctIndustries) < 1) return 'Set the number of included distinct industries.';
  if (policy.maxDistinctIndustries !== null && policy.maxDistinctIndustries !== '' && (!Number.isInteger(policy.maxDistinctIndustries) || Number(policy.maxDistinctIndustries) < Number(policy.includedDistinctIndustries))) return 'Maximum distinct industries must be at least the included amount, or choose no maximum.';
  if (!policy.taxes.length && !emptyTaxesConfirmed) return 'Confirm explicitly if this policy has no tax rules.';
  for (const [index, tax] of policy.taxes.entries()) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(tax.code.trim())) return `Tax rule ${index + 1} needs a valid stable code.`;
    if (!Number.isInteger(tax.rateBps) || Number(tax.rateBps) < 0 || Number(tax.rateBps) > 10000) return `Tax rule ${index + 1} needs a rate from 0 to 10,000 basis points.`;
    if (!tax.appliesTo.length) return `Choose at least one taxable item for tax rule ${index + 1}.`;
  }
  if (policy.postpaid.eligible && !policy.postpaid.workspaceModes.length) return 'Choose at least one workspace mode for postpaid eligibility.';
  if (!policy.postpaid.eligible && policy.postpaid.workspaceModes.length) return 'Postpaid modes must be empty when postpaid is disabled.';
  if (!policy.serviceAfterExpiry.mode) return 'Choose the service policy after subscription expiry.';
  if (policy.serviceAfterExpiry.mode === 'grace' && (!Number.isInteger(policy.serviceAfterExpiry.graceSeconds) || Number(policy.serviceAfterExpiry.graceSeconds) < 1 || Number(policy.serviceAfterExpiry.graceSeconds) > 2678400)) return 'Set a grace duration from 1 to 31 days in seconds.';
  if (policy.serviceAfterExpiry.mode === 'continue_postpaid' && !policy.postpaid.eligible) return 'Continuing after expiry on postpaid requires postpaid eligibility.';
  return '';
}

export default function SubscriptionTermsPolicyEditor() {
  const { showToast } = useToast();
  const [envelope, setEnvelope] = React.useState<PolicyEnvelope | null>(null);
  const [draft, setDraft] = React.useState<SubscriptionTermsPolicy>(emptyPolicy);
  const [limitInput, setLimitInput] = React.useState('');
  const [unlimitedExposure, setUnlimitedExposure] = React.useState(false);
  const [postpaidEligibilityConfirmed, setPostpaidEligibilityConfirmed] = React.useState(false);
  const [emptyTaxesConfirmed, setEmptyTaxesConfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await apiFetch('/api/platform/billing/subscription-terms-policy');
      const body = await response.json().catch(() => null) as (PolicyEnvelope & { error?: string }) | null;
      if (!response.ok) throw new Error(body?.error || 'Could not load subscription financial terms.');
      if (!body || typeof body.configured !== 'boolean' || !Number.isInteger(body.version)) throw new Error('The platform returned an invalid subscription terms policy.');
      setEnvelope(body);
      const policy = body.policy ? {
        ...body.policy,
        maxDistinctIndustries: body.policy.maxDistinctIndustries ?? '',
        taxes: body.policy.taxes.map(tax => ({ ...tax, rateBps: tax.rateBps })),
        postpaid: { ...body.policy.postpaid, workspaceModes: [...body.policy.postpaid.workspaceModes] },
        serviceAfterExpiry: { ...body.policy.serviceAfterExpiry },
      } : emptyPolicy();
      setDraft(policy);
      setPostpaidEligibilityConfirmed(body.configured);
      setLimitInput(amountToInput(policy.postpaid.organizationExposureLimit));
      setUnlimitedExposure(body.configured && policy.postpaid.eligible && policy.postpaid.organizationExposureLimit === null);
      setEmptyTaxesConfirmed(body.configured && policy.taxes.length === 0);
    } catch (cause) { setEnvelope(null); setError(cause instanceof Error ? cause.message : 'Could not load subscription financial terms.'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const update = (change: Partial<SubscriptionTermsPolicy>) => setDraft(current => ({ ...current, ...change }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!envelope || saving) return;
    const problem = validPolicy(draft, emptyTaxesConfirmed);
    if (problem) { setError(problem); return; }
    if (!postpaidEligibilityConfirmed) { setError('Choose explicitly whether postpaid usage is eligible.'); return; }
    if (draft.postpaid.eligible && unlimitedExposure === false && !limitInput.trim()) { setError('Set an organization exposure limit or explicitly confirm there is no limit.'); return; }
    const exposure = draft.postpaid.eligible && unlimitedExposure ? null : parseInrAmount(limitInput);
    if (exposure === undefined) { setError('Enter the organization postpaid limit in INR with up to two decimal places.'); return; }
    const policy: SubscriptionTermsPolicy = {
      ...draft,
      maxDistinctIndustries: draft.maxDistinctIndustries === '' ? null : draft.maxDistinctIndustries,
      taxes: draft.taxes.map(tax => ({ ...tax, code: tax.code.trim(), rateBps: Number(tax.rateBps) })),
      postpaid: { ...draft.postpaid, organizationExposureLimit: exposure },
      serviceAfterExpiry: { ...draft.serviceAfterExpiry, graceSeconds: draft.serviceAfterExpiry.mode === 'grace' ? Number(draft.serviceAfterExpiry.graceSeconds) : 0 },
    };
    setSaving(true); setError('');
    try {
      const response = await apiFetch('/api/platform/billing/subscription-terms-policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: envelope.version, policy }),
      });
      const body = await response.json().catch(() => null) as (PolicyEnvelope & { error?: string }) | null;
      if (!response.ok) throw new Error(body?.error || (response.status === 409 ? 'Subscription financial terms changed elsewhere. Reload and review before saving.' : 'Could not save subscription financial terms.'));
      if (!body || !body.configured || !body.policy || !Number.isInteger(body.version)) throw new Error('The saved subscription financial terms response was incomplete. Reload to verify the policy.');
      setEnvelope(body); setDraft({ ...body.policy, maxDistinctIndustries: body.policy.maxDistinctIndustries ?? '' }); setLimitInput(amountToInput(body.policy.postpaid.organizationExposureLimit));
      setPostpaidEligibilityConfirmed(true);
      setUnlimitedExposure(body.policy.postpaid.eligible && body.policy.postpaid.organizationExposureLimit === null);
      setEmptyTaxesConfirmed(body.policy.taxes.length === 0);
      showToast('Subscription financial terms saved.', 'success');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save subscription financial terms.'); }
    finally { setSaving(false); }
  };

  const addTax = () => { update({ taxes: [...draft.taxes, { code: '', rateBps: '', appliesTo: [], inclusive: false }] }); setEmptyTaxesConfirmed(false); };
  const updateTax = (index: number, tax: TaxRule) => update({ taxes: draft.taxes.map((current, i) => i === index ? tax : current) });
  const togglePostpaidMode = (mode: PostpaidMode) => update({ postpaid: { ...draft.postpaid, workspaceModes: draft.postpaid.workspaceModes.includes(mode) ? draft.postpaid.workspaceModes.filter(item => item !== mode) : [...draft.postpaid.workspaceModes, mode] } });

  return <Card padding="sm" className="sm:!p-5">
    <CardHeader title="Subscription financial terms" subtitle="Explicit terms copied into versioned plan quotes. These settings do not change existing purchased periods." icon={AlertTriangle} />
    {error && <p role="alert" className="mb-3 rounded-lg border border-rose-300/60 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</p>}
    {loading ? <p role="status" className="text-xs text-[var(--text-muted)]">Loading financial terms…</p> : !envelope ? <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">Financial policy status is unknown because settings could not be loaded.</p>
      <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>
    </div> : <>
      <div className={`mb-4 rounded-lg border p-3 text-xs ${envelope.configured ? 'border-emerald-300/60 bg-emerald-500/5 text-[var(--text-secondary)]' : 'border-amber-300/60 bg-amber-500/5 text-amber-800 dark:text-amber-300'}`}>
        <p className="font-semibold">{envelope.configured ? `Configured · version ${envelope.version}` : 'Not configured'}</p>
        <p className="mt-1">{envelope.configured ? 'This policy is saved for future versioned quotes.' : 'No financial terms are approved or active. Set every field explicitly before subscription quotes can be generated.'}</p>
        {envelope.updatedAt && <p className="mt-1 text-[11px]">Last updated {new Date(envelope.updatedAt).toLocaleString()}{envelope.updatedBy ? ` by ${envelope.updatedBy}` : ''}.</p>}
      </div>
      <form onSubmit={save} className="space-y-5">
        <section className="space-y-3" aria-label="Industry allowances">
          <h3 className="text-sm font-semibold">Industry allowances</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Included distinct industries
              <input className={inputClass} type="number" min="1" step="1" required disabled={saving} value={draft.includedDistinctIndustries} onChange={event => update({ includedDistinctIndustries: event.target.value === '' ? '' : Number(event.target.value) })} />
            </label>
            <label className={labelClass}>Maximum distinct industries
              <input className={inputClass} type="number" min={draft.includedDistinctIndustries || 1} step="1" disabled={saving} value={draft.maxDistinctIndustries} placeholder="No maximum" onChange={event => update({ maxDistinctIndustries: event.target.value === '' ? '' : Number(event.target.value) })} />
              <span className={helpClass}>Leave empty for no maximum.</span>
            </label>
          </div>
        </section>

        <section className="space-y-3" aria-label="Tax rules">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Tax rules</h3><p className={helpClass}>No tax rule means the quote applies no tax. Confirm that choice deliberately.</p></div>
            <Button type="button" size="sm" variant="secondary" icon={Plus} disabled={saving} onClick={addTax}>Add tax rule</Button></div>
          {draft.taxes.map((tax, index) => <div key={index} className="grid gap-3 rounded-lg border border-[var(--border)] p-3 md:grid-cols-2" aria-label={`Tax rule ${index + 1}`}>
            <label className={labelClass}>Stable tax code<input className={inputClass} maxLength={64} required disabled={saving} value={tax.code} onChange={event => updateTax(index, { ...tax, code: event.target.value })} placeholder="e.g. GST" /></label>
            <label className={labelClass}>Rate (basis points)<input className={inputClass} type="number" min="0" max="10000" step="1" required disabled={saving} value={tax.rateBps} onChange={event => updateTax(index, { ...tax, rateBps: event.target.value === '' ? '' : Number(event.target.value) })} /><span className={helpClass}>100 basis points = 1%.</span></label>
            <fieldset className="space-y-2"><legend className={labelClass}>Applies to</legend>{TAX_APPLICABILITY.map(option => <label key={option.value} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" disabled={saving} checked={tax.appliesTo.includes(option.value)} onChange={event => updateTax(index, { ...tax, appliesTo: event.target.checked ? [...tax.appliesTo, option.value] : tax.appliesTo.filter(item => item !== option.value) })} />{option.label}</label>)}</fieldset>
            <div className="flex items-end justify-between gap-3"><label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" disabled={saving} checked={tax.inclusive} onChange={event => updateTax(index, { ...tax, inclusive: event.target.checked })} />Tax inclusive</label><Button type="button" size="sm" variant="secondary" icon={Trash2} disabled={saving} onClick={() => update({ taxes: draft.taxes.filter((_, i) => i !== index) })}>Remove</Button></div>
          </div>)}
          {!draft.taxes.length && <label className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]"><input type="checkbox" className="mt-0.5" disabled={saving} checked={emptyTaxesConfirmed} onChange={event => setEmptyTaxesConfirmed(event.target.checked)} /><span><strong className="text-[var(--text-primary)]">I confirm there are no applicable tax rules.</strong> This is an explicit financial configuration, not an assumed default.</span></label>}
        </section>

        <section className="space-y-3" aria-label="Postpaid eligibility">
          <h3 className="text-sm font-semibold">Postpaid eligibility</h3>
          <label className={labelClass}>Postpaid eligibility
            <select className={inputClass} required disabled={saving} value={postpaidEligibilityConfirmed ? (draft.postpaid.eligible ? 'eligible' : 'ineligible') : ''} onChange={event => { const eligible = event.target.value === 'eligible'; setPostpaidEligibilityConfirmed(Boolean(event.target.value)); update({ postpaid: { ...draft.postpaid, eligible, workspaceModes: eligible ? draft.postpaid.workspaceModes : [] } }); }}>
              <option value="">Choose explicitly</option><option value="eligible">Eligible</option><option value="ineligible">Not eligible</option>
            </select>
          </label>
          {draft.postpaid.eligible && <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="space-y-2"><legend className={labelClass}>Eligible workspace modes</legend>{(['limited', 'unlimited'] as const).map(mode => <label key={mode} className="flex items-center gap-2 text-xs capitalize text-[var(--text-secondary)]"><input type="checkbox" disabled={saving} checked={draft.postpaid.workspaceModes.includes(mode)} onChange={() => togglePostpaidMode(mode)} />{mode}</label>)}</fieldset>
            <div><label className={labelClass}>Organization exposure limit (₹)
              <input className={inputClass} type="number" min="0" step="0.01" disabled={saving || unlimitedExposure} value={limitInput} onChange={event => setLimitInput(event.target.value)} placeholder="Enter limit" />
              <span className={helpClass}>A finite limit is required unless unlimited exposure is deliberately selected.</span>
            </label><label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" disabled={saving} checked={unlimitedExposure} onChange={event => { setUnlimitedExposure(event.target.checked); if (event.target.checked) setLimitInput(''); }} />No organization exposure limit (unlimited)</label></div>
          </div>}
        </section>

        <section className="space-y-3" aria-label="Service after expiry">
          <h3 className="text-sm font-semibold">Service after subscription expiry</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Policy
              <select className={inputClass} required disabled={saving} value={draft.serviceAfterExpiry.mode} onChange={event => update({ serviceAfterExpiry: { mode: event.target.value as ExpiryMode | '', graceSeconds: event.target.value === 'grace' ? (draft.serviceAfterExpiry.graceSeconds || 604800) : 0 } })}>
                <option value="">Choose explicitly</option><option value="suspend">Suspend at expiry</option><option value="grace">Continue for a defined grace duration</option><option value="continue_postpaid">Continue on postpaid</option>
              </select>
            </label>
            {draft.serviceAfterExpiry.mode === 'grace' && <label className={labelClass}>Grace duration (seconds)
              <input className={inputClass} type="number" required min="1" max="2678400" step="1" disabled={saving} value={draft.serviceAfterExpiry.graceSeconds} onChange={event => update({ serviceAfterExpiry: { ...draft.serviceAfterExpiry, graceSeconds: event.target.value === '' ? '' : Number(event.target.value) } })} />
              <span className={helpClass}>Must be explicitly configured from 1 second to 31 days.</span>
            </label>}
          </div>
          {draft.serviceAfterExpiry.mode === 'continue_postpaid' && <p className="text-[11px] text-amber-700">This mode requires postpaid eligibility and an eligible workspace mode.</p>}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <p className="max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">Saving changes only the platform policy used for future plan quotes. It does not approve tax treatment, activate postpaid service, alter paid periods, or enable payment collection by itself.</p>
          <Button type="submit" variant="primary" size="sm" icon={Save} loading={saving} disabled={saving}>Save financial terms</Button>
        </div>
      </form>
    </>}
  </Card>;
}
