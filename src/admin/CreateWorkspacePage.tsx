import React, { useEffect, useState } from 'react';
import { Database, HardDrive, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import { INDUSTRY_PROFILES } from '../lib/industry/registry';
import FeatureAccessSelector from '../components/ui/FeatureAccessSelector';
import { WorkspacePlan, WorkspacePlanCatalog } from '../lib/workspacePolicy';
import { DEFAULT_BACKUP, DEFAULT_RETENTION, readableBackup, readableRetention, type RetentionPolicyCatalog } from '../lib/retentionPolicies';

const INDUSTRIES = Object.values(INDUSTRY_PROFILES).map(profile => ({
  value: profile.key,
  label: profile.label,
}));

function defaultFeatureFlagsForIndustry(industry: string): string[] {
  return FEATURE_REGISTRY
    .filter(feature => industry === 'lending' || feature.key !== 'loan_lifecycle')
    .map(feature => feature.key);
}

function generateWorkspaceSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

interface CreateOrgForm {
  name: string;
  workspaceName: string;
  industry: string;
  subscriptionPlan: string;
  adminEmail: string;
  adminName: string;
  gcpCredentialsJson: string;
  gcpLocation: string;
  callProvider: string;
  callAuthId: string;
  callAuthToken: string;
  callPhoneNumber: string;
  chargeScope: 'ai_only' | 'ai_and_call_provider';
}

export default function CreateWorkspacePage() {
  const [form, setForm] = useState<CreateOrgForm>({
    name: '',
    workspaceName: '',
    industry: 'lending',
    subscriptionPlan: 'Starter',
    adminEmail: '',
    adminName: '',
    gcpCredentialsJson: '',
    gcpLocation: 'us-central1',
    callProvider: 'vobiz',
    callAuthId: '',
    callAuthToken: '',
    callPhoneNumber: '',
    chargeScope: 'ai_only',
  });
  const [workspacePlans, setWorkspacePlans] = useState<WorkspacePlan[]>([]);
  const [workspacePlanVersion, setWorkspacePlanVersion] = useState(0);
  const [loadingWorkspacePlans, setLoadingWorkspacePlans] = useState(true);
  const [retentionCatalog, setRetentionCatalog] = useState<RetentionPolicyCatalog | null>(null);
  const [loadingRetentionPolicies, setLoadingRetentionPolicies] = useState(true);
  const [retentionLoadError, setRetentionLoadError] = useState('');
  const [legacyRetentionFallback, setLegacyRetentionFallback] = useState(false);
  const [selectedFlags, setSelectedFlags] = useState<string[]>(() => defaultFeatureFlagsForIndustry('lending'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const selectedWorkspacePlan = workspacePlans.find(plan => plan.id === form.subscriptionPlan && plan.active) || null;
  const planMode = selectedWorkspacePlan?.defaultMode || 'single';
  const availableFeatureKeys = defaultFeatureFlagsForIndustry(planMode === 'mixed_industry' ? 'lending' : form.industry);
  // Organization setup inherits the policy from its subscription plan.
  // Plans created before this capability use the platform policy default.
  const planRetentionPolicyId = selectedWorkspacePlan?.retentionPolicyId || retentionCatalog?.defaultPolicyId || '';
  const selectedRetentionPolicy = retentionCatalog?.policies.find(policy => policy.id === planRetentionPolicyId) || null;

  useEffect(() => {
    let active = true;
    apiFetch('/api/platform/billing/workspace-plans')
      .then(async response => {
        const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog;
        if (!response.ok) throw new Error((body as any)?.error || 'Could not load workspace plan defaults.');
        if (!active) return;
        const plans = Array.isArray(body.plans) ? body.plans.filter(plan => plan.active) : [];
        setWorkspacePlans(plans);
        setWorkspacePlanVersion(body.version);
        const first = plans.find(plan => plan.id === 'starter') || plans[0];
        if (first) {
          setForm(current => ({ ...current, subscriptionPlan: first.id }));
        }
      })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load workspace plan defaults.'); })
      .finally(() => { if (active) setLoadingWorkspacePlans(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingRetentionPolicies(true);
    (async () => {
      const response = await apiFetch('/api/platform/data-retention/policies');
      if (response.status === 404) {
        // The backend VM may be on an earlier release during deployment.
        // Keep organization creation working with its legacy platform default.
        const fallback = await apiFetch('/api/platform/data-retention/defaults');
        const defaults = await fallback.json().catch(() => null);
        if (!fallback.ok || !defaults || typeof defaults !== 'object') {
          throw new Error('Could not load platform retention defaults.');
        }
        const legacy: RetentionPolicyCatalog = {
          version: 0,
          defaultPolicyId: 'platform-default',
          policies: [{
            id: 'platform-default',
            name: 'Platform default',
            description: 'Existing platform retention settings. Policy templates require the updated backend.',
            retention: { ...DEFAULT_RETENTION, ...defaults },
            backup: { ...DEFAULT_BACKUP },
          }],
        };
        if (!active) return;
        setRetentionCatalog(legacy);
        setLegacyRetentionFallback(true);
        setRetentionLoadError('');
        return;
      }
      const body = await response.json().catch(() => null) as RetentionPolicyCatalog & { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || 'Could not load data retention and backup policies.');
      if (!body || !Array.isArray(body.policies) || !body.policies.length || !body.defaultPolicyId) {
        throw new Error('No valid retention and backup policies are configured.');
      }
      if (!active) return;
      setRetentionCatalog(body);
      setLegacyRetentionFallback(false);
      setRetentionLoadError('');
    })()
      .catch(error => {
        if (active) setRetentionLoadError(error instanceof Error ? error.message : 'Could not load retention policies.');
      })
      .finally(() => { if (active) setLoadingRetentionPolicies(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setForm(current => ({ ...current, workspaceName: generateWorkspaceSlug(current.name) }));
  }, [form.name]);

  const set = (field: keyof CreateOrgForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedWorkspacePlan) {
      setError('Choose an active workspace plan in the plan settings before creating an organization.');
      return;
    }
    if (!selectedRetentionPolicy) {
      setError('The subscription plan references a missing retention and backup policy. Update the subscription plan or reload policies.');
      return;
    }
    if (selectedRetentionPolicy.backup.enabled && !form.adminEmail.trim()) {
      setError('An organization admin email is required for a policy with automated backups.');
      return;
    }
    if (selectedWorkspacePlan.pricing.baseMonthlyInr == null || selectedWorkspacePlan.pricing.extraWorkspaceMonthlyInr == null
      || selectedWorkspacePlan.pricing.extraSeatMonthlyInr == null || selectedWorkspacePlan.pricing.additionalIndustryMonthlyInr == null) {
      setError('Configure the monthly prices for this plan in Admin → Workspace Plans before creating an organization. Enter 0 for any price that does not apply.');
      return;
    }
    setLoading(true);
    try {
      if (!form.gcpCredentialsJson.trim()) {
        setError('Service account credentials JSON is required.');
        return;
      }
      if (form.chargeScope === 'ai_and_call_provider' && (!form.callAuthId.trim() || !form.callAuthToken.trim() || !form.callPhoneNumber.trim())) {
        setError('Call provider credentials and phone number are required when Charge Scope is AI + Call Provider.');
        return;
      }

      let credentials: Record<string, unknown>;
      try {
        const parsed = JSON.parse(form.gcpCredentialsJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        credentials = parsed as Record<string, unknown>;
      } catch {
        setError('Service account credentials must be valid JSON.');
        return;
      }

      if (typeof credentials.project_id !== 'string' || !credentials.project_id.trim()) {
        setError('The service account JSON must contain a valid project_id.');
        return;
      }
      const res = await apiFetch('/api/platform/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          workspaceName: form.workspaceName,
          industry: form.industry,
          subscriptionPlan: form.subscriptionPlan,
          workspacePlanId: form.subscriptionPlan,
          workspacePlanVersion,
          adminEmail: form.adminEmail,
          adminName: form.adminName,
          featureFlags: selectedFlags,
          gcpProjectMode: 'existing',
          gcpProject: {
            credentials,
            location: form.gcpLocation,
          },
          ...(form.chargeScope === 'ai_and_call_provider' ? {
            callProvider: {
              provider: form.callProvider,
              authId: form.callAuthId.trim(),
              authToken: form.callAuthToken.trim(),
              phoneNumber: form.callPhoneNumber.trim(),
            },
          } : {}),
          chargeScope: form.chargeScope,
          billingMethod: 'pay_as_you_go',
          ...(legacyRetentionFallback
            ? {
                dataRetentionMode: 'default',
                dataRetentionOverrides: {},
                backup: { ...DEFAULT_BACKUP, email: '' },
              }
            : {
                retentionPolicyId: selectedRetentionPolicy.id,
                retentionPolicyVersion: retentionCatalog?.version,
              }),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to create workspace');
        return;
      }
      navigate('/admin/organizations');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl">
      {loading && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Validating Google Cloud project and configuring Vertex AI…
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Organization Identity</h2>
            <p className="mt-1 text-[11px] text-slate-500">The default workspace is created automatically from the organization name.</p>
          </div>
          <div className="max-w-xl">
            <label className="block text-xs font-medium text-slate-500 mb-1">Organization Name *</label>
            <input value={form.name} onChange={set('name')} placeholder="Acme Corp" required className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <p className="text-xs font-bold text-slate-700">Google Cloud Project Setup</p>
            <p className="text-[11px] text-slate-500 mt-1">Use an existing Google Cloud project for this workspace.</p>
          </div>
          <div className="rounded-xl border border-amber-400 bg-white px-3 py-3 ring-1 ring-amber-100 mb-4">
            <p className="text-xs font-semibold text-slate-700">Use an existing Google Cloud project <span className="text-rose-500">(required)</span></p>
            <p className="text-[10px] text-slate-500 mt-0.5">Paste the service-account JSON and select the Vertex AI region. The project ID is extracted automatically from the JSON.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Google Cloud Service Account JSON *</label>
              <textarea value={form.gcpCredentialsJson} onChange={set('gcpCredentialsJson')} placeholder="Paste the service account JSON here" required rows={7} autoComplete="off" spellCheck={false} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 resize-y" />
              <p className="text-[10px] text-slate-400 mt-1">The project_id is read automatically from this service-account JSON.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Region / Location *</label>
              <select value={form.gcpLocation} onChange={set('gcpLocation')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                {['asia-south1', 'us-central1', 'us-east4', 'europe-west1', 'europe-west4', 'asia-southeast1'].map(region => <option key={region} value={region}>{region}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Subscription plan</h2>
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">The selected plan sets workspace and seat allowances, monthly pricing, industry modules, and the retention and backup policy.</p>
          </div>
            <select value={form.subscriptionPlan} onChange={event=>{
              const plan=workspacePlans.find(item=>item.id===event.target.value);
              setForm(current=>({...current,subscriptionPlan:event.target.value}));
              if(plan) {
                setSelectedFlags(defaultFeatureFlagsForIndustry(plan.defaultMode==='mixed_industry'?'lending':form.industry));
              }
            }} aria-label="Workspace plan" disabled={loadingWorkspacePlans || !workspacePlans.length} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-60">
              {workspacePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
            {selectedWorkspacePlan && <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
              <p className="font-semibold text-[var(--text-primary)]">{selectedWorkspacePlan.name} plan details</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div className="flex justify-between gap-3"><dt>Workspace setup</dt><dd className="font-medium text-[var(--text-primary)]">{planMode === 'single' ? 'Single workspace' : planMode === 'same_industry' ? 'Multiple workspaces · same industry' : 'Multiple workspaces · mixed industries'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Included workspaces</dt><dd className="font-medium text-[var(--text-primary)]">{planMode === 'single' ? 1 : selectedWorkspacePlan.pricing.includedWorkspaces}</dd></div>
                {planMode !== 'single' && <div className="flex justify-between gap-3"><dt>Additional workspace / month</dt><dd className="font-medium text-[var(--text-primary)]">₹{selectedWorkspacePlan.pricing.extraWorkspaceMonthlyInr?.toFixed(2) ?? 'Not configured'}</dd></div>}
                <div className="flex justify-between gap-3"><dt>Included seats</dt><dd className="font-medium text-[var(--text-primary)]">{selectedWorkspacePlan.pricing.includedSeats}</dd></div>
                <div className="flex justify-between gap-3"><dt>Additional seat / month</dt><dd className="font-medium text-[var(--text-primary)]">₹{selectedWorkspacePlan.pricing.extraSeatMonthlyInr?.toFixed(2) ?? 'Not configured'}</dd></div>
                <div className="flex justify-between gap-3"><dt>Monthly subscription</dt><dd className="font-medium text-[var(--text-primary)]">₹{selectedWorkspacePlan.pricing.baseMonthlyInr?.toFixed(2) ?? 'Not configured'}</dd></div>
                {planMode === 'mixed_industry' && <div className="flex justify-between gap-3"><dt>Additional industry / month</dt><dd className="font-medium text-[var(--text-primary)]">₹{selectedWorkspacePlan.pricing.additionalIndustryMonthlyInr?.toFixed(2) ?? 'Not configured'}</dd></div>}
                {selectedWorkspacePlan.pricing.monthlySubscriptionCreditsInr != null && <div className="flex justify-between gap-3"><dt>Monthly usage credits</dt><dd className="font-medium text-[var(--text-primary)]">₹{selectedWorkspacePlan.pricing.monthlySubscriptionCreditsInr.toFixed(2)}</dd></div>}
              </dl>
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">Workspace setup and prices come from Admin → Subscription Plans. They cannot be changed here.</p>
            </div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-800">Organization industry</h2>
            <label className="block text-xs font-medium text-slate-600" htmlFor="primary-industry">Primary industry</label>
            <p className="mt-1 text-[11px] text-slate-500">Sets the default industry for this organization and its first workspace.</p>
            <select
              id="primary-industry"
              value={form.industry}
              onChange={(e) => {
                const industry = e.target.value;
                setForm(f => ({ ...f, industry }));
                setSelectedFlags(defaultFeatureFlagsForIndustry(planMode==='mixed_industry'?'lending':industry));
              }}
              className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-500">The organization name generates its default workspace. The subscription plan determines whether more workspaces can be added later.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <p className="text-xs font-bold text-slate-700">Voice usage</p>
            <p className="text-[11px] text-slate-500 mt-1">The selected plan sets the monthly subscription price. New organizations use pay-as-you-go for voice usage; choose whether call-provider charges are included.</p>
          </div>
          <label className="block text-xs font-medium text-slate-500">Charge scope
            <select value={form.chargeScope} onChange={set('chargeScope')} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="ai_only">AI usage</option>
              <option value="ai_and_call_provider">AI and call-provider usage</option>
            </select>
          </label>
        </section>



        {form.chargeScope === 'ai_and_call_provider' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <p className="text-xs font-bold text-slate-700">Call Provider Setup</p>
              <p className="text-[11px] text-slate-500 mt-1">Only required when Charge Scope is AI + Call Provider.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 dark:bg-[var(--bg-subtle)]">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Call Provider *</label>
                <select value={form.callProvider} onChange={set('callProvider')} className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="vobiz">Vobiz.ai</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Auth ID *</label>
                  <input value={form.callAuthId} onChange={set('callAuthId')} placeholder="Vobiz Auth ID" required autoComplete="off" className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Auth Token *</label>
                  <input type="password" value={form.callAuthToken} onChange={set('callAuthToken')} placeholder="Vobiz Auth Token" required autoComplete="new-password" className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Provider Phone Number *</label>
                <input value={form.callPhoneNumber} onChange={set('callPhoneNumber')} placeholder="+14155550123" required autoComplete="off" className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-400 mb-3">Admin member (optional) — they'll be linked automatically on first login</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Admin Email</label>
              <input type="email" value={form.adminEmail} onChange={set('adminEmail')} placeholder="admin@acme.com" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Admin Name</label>
              <input value={form.adminName} onChange={set('adminName')} placeholder="Jane Smith" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
          </div>
        </section>

        <FeatureAccessSelector
          label="Feature Access"
          description="Choose the CRM modules this organization can use. Staff access can be refined later from Administration → Staff & Teams."
          availableKeys={availableFeatureKeys}
          value={selectedFlags}
          onChange={setSelectedFlags}
          disabled={loading}
        />

        <section aria-label="Data Retention & Backup" className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Data Retention & Backup</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  Retention and backup settings are included with the selected subscription plan. No manual configuration is required.
                </p>
              </div>
            </div>
            <Link to="/admin/data-retention"
              className="text-xs font-semibold text-[var(--accent)] hover:underline">Manage policies</Link>
          </div>
          {loadingRetentionPolicies ? (
            <p role="status" className="text-xs text-[var(--text-muted)]">Loading available policies…</p>
          ) : retentionLoadError ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {retentionLoadError}. Open Data Retention & Backup to review your policies.
            </p>
          ) : (
            <>
              {legacyRetentionFallback && (
                <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  Using the existing platform default. Named retention and backup templates become available when the backend service is updated.
                </p>
              )}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Policy included with {selectedWorkspacePlan?.name || 'this subscription plan'}
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {selectedRetentionPolicy?.name || 'No matching retention & backup policy'}
                  {selectedRetentionPolicy?.id === retentionCatalog?.defaultPolicyId && (
                    <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">(Platform default)</span>
                  )}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  The policy is assigned in Subscription Plans. Change the plan to use another policy.
                </p>
                {!selectedRetentionPolicy && (
                  <Link to="/admin/workspace-plans"
                    className="mt-2 inline-flex text-xs font-semibold text-[var(--accent)] hover:underline">
                    Fix the subscription plan policy
                  </Link>
                )}
              </div>
              {selectedRetentionPolicy && (
                <div className="grid gap-3 rounded-xl bg-[var(--bg-subtle)] p-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <Database className="h-4 w-4 text-[var(--accent)]" /> Data retention
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      Call recordings: {readableRetention(selectedRetentionPolicy.retention.call_recordings)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Transcripts: {readableRetention(selectedRetentionPolicy.retention.transcripts)}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Plus six additional retention settings included in the policy.
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <HardDrive className="h-4 w-4 text-[var(--accent)]" /> Automated backup
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      {readableBackup(selectedRetentionPolicy)}
                    </p>
                    {selectedRetentionPolicy.backup.enabled && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {form.adminEmail.trim()
                          ? 'Backup links will be sent to ' + form.adminEmail.trim()
                          : 'Enter an admin email above to enable backup delivery.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                The subscription plan's retention and backup settings are saved with this organization at creation.
                Future changes to the platform template do not automatically change its configuration.
              </p>
            </>
          )}
        </section>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => navigate('/admin/organizations')} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          <button type="submit" disabled={loading || loadingRetentionPolicies || !selectedRetentionPolicy} className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Validating…' : 'Create Workspace'}
          </button>
        </div>
      </form>
    </div>
  );
}
