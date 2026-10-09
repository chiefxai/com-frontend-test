import React, { useEffect, useState } from 'react';
import { Database, HardDrive, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import { INDUSTRY_PROFILES } from '../lib/industry/registry';
import FeatureAccessSelector from '../components/ui/FeatureAccessSelector';
import WorkspacePolicyEditor from '../components/WorkspacePolicyEditor';
import { emptyWorkspacePolicy, serializedPolicy, WorkspacePlan, WorkspacePlanCatalog } from '../lib/workspacePolicy';
import { readableBackup, readableRetention, type RetentionPolicyCatalog } from '../lib/retentionPolicies';

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
  billingMethod: 'pay_as_you_go' | 'recharge_based';
  chargeScope: 'ai_only' | 'ai_and_call_provider';
  initialRechargeAmountInr: string;
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
    billingMethod: 'pay_as_you_go',
    chargeScope: 'ai_only',
    initialRechargeAmountInr: '',
  });
  const [workspacePolicy, setWorkspacePolicy] = useState(emptyWorkspacePolicy);
  const [workspacePlans, setWorkspacePlans] = useState<WorkspacePlan[]>([]);
  const [workspacePlanVersion, setWorkspacePlanVersion] = useState(0);
  const [loadingWorkspacePlans, setLoadingWorkspacePlans] = useState(true);
  const [retentionCatalog, setRetentionCatalog] = useState<RetentionPolicyCatalog | null>(null);
  const [selectedRetentionPolicyId, setSelectedRetentionPolicyId] = useState('');
  const [loadingRetentionPolicies, setLoadingRetentionPolicies] = useState(true);
  const [retentionLoadError, setRetentionLoadError] = useState('');
  const [firstBranchName, setFirstBranchName] = useState('');
  const [initialWorkspaces, setInitialWorkspaces] = useState<{name:string;industry:string;branchName:string}[]>([]);
  const [selectedFlags, setSelectedFlags] = useState<string[]>(() => defaultFeatureFlagsForIndustry('lending'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const availableFeatureKeys = defaultFeatureFlagsForIndustry(workspacePolicy.mode==='mixed_industry'?'lending':form.industry);
  const selectedWorkspacePlan = workspacePlans.find(plan => plan.id === form.subscriptionPlan && plan.active) || null;
  const selectedRetentionPolicy = retentionCatalog?.policies.find(policy => policy.id === selectedRetentionPolicyId) || null;

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
          setWorkspacePolicy({ mode: first.defaultMode, pricing: { ...first.pricing } });
        }
      })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load workspace plan defaults.'); })
      .finally(() => { if (active) setLoadingWorkspacePlans(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingRetentionPolicies(true);
    apiFetch('/api/platform/data-retention/policies')
      .then(async response => {
        const body = await response.json().catch(() => null) as RetentionPolicyCatalog & { error?: string } | null;
        if (!response.ok) throw new Error(body?.error || 'Could not load data retention and backup policies.');
        if (!body || !Array.isArray(body.policies) || !body.policies.length || !body.defaultPolicyId)
          throw new Error('No valid retention and backup policies are configured.');
        if (!active) return;
        setRetentionCatalog(body);
        setSelectedRetentionPolicyId(body.defaultPolicyId);
        setRetentionLoadError('');
      })
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
      setError('Choose a configured data retention and backup policy before creating an organization.');
      return;
    }
    if (selectedRetentionPolicy.backup.enabled && !form.adminEmail.trim()) {
      setError('An organization admin email is required for a policy with automated backups.');
      return;
    }
    if (selectedWorkspacePlan.pricing.baseMonthlyInr == null || selectedWorkspacePlan.pricing.extraWorkspaceMonthlyInr == null || selectedWorkspacePlan.pricing.additionalIndustryMonthlyInr == null) {
      setError('Configure all monthly prices for this plan in Admin → Workspace Plans before creating an organization. Enter 0 for any price that does not apply.');
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
          workspacePolicy: { ...serializedPolicy(workspacePolicy), planId: selectedWorkspacePlan?.id, planVersion: workspacePlanVersion },
          firstBranchName: firstBranchName.trim() || null,
          initialWorkspaces: workspacePolicy.mode==='single' ? [] : initialWorkspaces.map(branch=>({...branch,industry:workspacePolicy.mode==='same_industry'?form.industry:branch.industry})),
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
          billingMethod: form.billingMethod,
          chargeScope: form.chargeScope,
          initialRechargeAmountInr: form.billingMethod === 'recharge_based' ? Number(form.initialRechargeAmountInr || 0) : 0,
          retentionPolicyId: selectedRetentionPolicy.id,
          retentionPolicyVersion: retentionCatalog?.version,
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
        <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 text-sm text-rose-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Organization Identity</h2>
            <p className="mt-1 text-[11px] text-slate-500">Set the organization name and let the workspace slug generate automatically.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
          <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Organization Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="Acme Corp" required className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-slate-500">Workspace Slug *</label>
            <span className="text-[10px] font-medium text-slate-400">Auto-generated</span>
          </div>
          <input
            value={form.workspaceName}
            readOnly
            placeholder="acme-corp"
            required
            className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-600 cursor-not-allowed focus:outline-none"
          />
          <p className="text-[10px] text-slate-400 mt-1">Generated automatically from the organization name.</p>
          </div>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Industry</label>
            <select
              value={form.industry}
              onChange={(e) => {
                const industry = e.target.value;
                setForm(f => ({ ...f, industry }));
                setSelectedFlags(defaultFeatureFlagsForIndustry(workspacePolicy.mode==='mixed_industry'?'lending':industry));
              }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Plan</label>
            <select value={form.subscriptionPlan} onChange={event=>{
              const plan=workspacePlans.find(item=>item.id===event.target.value);
              setForm(current=>({...current,subscriptionPlan:event.target.value}));
              if(plan)setWorkspacePolicy({mode:plan.defaultMode,pricing:{...plan.pricing}});
            }} disabled={loadingWorkspacePlans || !workspacePlans.length} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-slate-100">
              {workspacePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Workspace structure and plan pricing</h2>
          {loadingWorkspacePlans && <p className="text-xs text-slate-500">Loading plan defaults…</p>}
          {selectedWorkspacePlan && <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{selectedWorkspacePlan.name} default pricing</p>
            <p className="mt-1">Organization plan: ₹{selectedWorkspacePlan.pricing.baseMonthlyInr?.toFixed(2) ?? 'Not configured'} / month · Each additional workspace: ₹{selectedWorkspacePlan.pricing.extraWorkspaceMonthlyInr?.toFixed(2) ?? 'Not configured'} / month</p>
            {workspacePolicy.mode==='mixed_industry' && <p>Additional distinct industry: ₹{selectedWorkspacePlan.pricing.additionalIndustryMonthlyInr?.toFixed(2) ?? 'Not configured'} / month</p>}
            <p className="mt-1 text-[10px] text-slate-500">Plan defaults are managed separately in Admin → Plans &amp; Pricing. This organization receives a pricing snapshot when created.</p>
          </div>}
          <WorkspacePolicyEditor value={workspacePolicy} onChange={value=>{setWorkspacePolicy(value);if(value.mode!==workspacePolicy.mode)setSelectedFlags(defaultFeatureFlagsForIndustry(value.mode==='mixed_industry'?'lending':form.industry));}} primaryIndustry={form.industry} workspaces={[{industry:form.industry},...(workspacePolicy.mode==='single'?[]:initialWorkspaces.map(branch=>({industry:workspacePolicy.mode==='same_industry'?form.industry:branch.industry})))]} showPricingFields={false} />
          <label className="block text-xs text-slate-500">First workspace / branch name
            <input maxLength={120} value={firstBranchName} onChange={event=>setFirstBranchName(event.target.value)} placeholder="Head office" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          {workspacePolicy.mode!=='single' && <div className="space-y-3">
            {initialWorkspaces.map((branch,index)=><div key={index} className="grid gap-2 sm:grid-cols-3">
              <input aria-label={`Workspace ${index+2} name`} required maxLength={120} placeholder="Branch workspace name" value={branch.name} onChange={event=>setInitialWorkspaces(rows=>rows.map((row,i)=>i===index?{...row,name:event.target.value}:row))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {workspacePolicy.mode==='mixed_industry'?<select aria-label={`Workspace ${index+2} industry`} value={branch.industry} onChange={event=>setInitialWorkspaces(rows=>rows.map((row,i)=>i===index?{...row,industry:event.target.value}:row))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{INDUSTRIES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:<span className="p-2 text-sm text-slate-500">{INDUSTRIES.find(option=>option.value===form.industry)?.label}</span>}
              <button type="button" onClick={()=>setInitialWorkspaces(rows=>rows.filter((_,i)=>i!==index))} className="text-sm text-rose-600">Remove workspace</button>
            </div>)}
            <button type="button" onClick={()=>setInitialWorkspaces(rows=>[...rows,{name:'',industry:form.industry,branchName:''}])} className="text-sm font-semibold text-amber-700">+ Add initial workspace</button>
            <p className="text-xs text-slate-500">The initial organization administrator receives access to every initial workspace. More branches can be added later.</p>
          </div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <p className="text-xs font-bold text-slate-700">Billing</p>
            <p className="text-[11px] text-slate-500 mt-1">Choose how this organization pays for voice usage.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={`rounded-xl border p-3 cursor-pointer ${form.billingMethod === 'pay_as_you_go' ? 'border-amber-400 ring-1 ring-amber-100' : 'border-slate-200'}`}>
              <input type="radio" className="sr-only" checked={form.billingMethod === 'pay_as_you_go'} onChange={() => setForm(f => ({ ...f, billingMethod: 'pay_as_you_go' }))} />
              <p className="text-xs font-semibold text-slate-700">Pay as you go</p>
              <p className="text-[10px] text-slate-500 mt-1">Calls are billed from actual usage.</p>
            </label>
            <label className={`rounded-xl border p-3 cursor-pointer ${form.billingMethod === 'recharge_based' ? 'border-amber-400 ring-1 ring-amber-100' : 'border-slate-200'}`}>
              <input type="radio" className="sr-only" checked={form.billingMethod === 'recharge_based'} onChange={() => setForm(f => ({ ...f, billingMethod: 'recharge_based' }))} />
              <p className="text-xs font-semibold text-slate-700">Recharge based</p>
              <p className="text-[10px] text-slate-500 mt-1">New calls are blocked when credits are insufficient.</p>
            </label>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-500 mb-1">Charge Scope *</label>
            <select value={form.chargeScope} onChange={set('chargeScope')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="ai_only">AI only</option>
              <option value="ai_and_call_provider">AI + Call Provider</option>
            </select>
          </div>
          {form.billingMethod === 'recharge_based' && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">Initial Recharge (INR)</label>
              <input type="number" min="0" step="0.01" value={form.initialRechargeAmountInr} onChange={set('initialRechargeAmountInr')} placeholder="0" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            </div>
          )}
        </section>



        {form.chargeScope === 'ai_and_call_provider' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <p className="text-xs font-bold text-slate-700">Call Provider Setup</p>
              <p className="text-[11px] text-slate-500 mt-1">Only required when Charge Scope is AI + Call Provider.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
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
                  Apply a reusable platform policy. No organization-specific retention or backup setup is required.
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
              <label className="block max-w-lg text-xs font-semibold text-[var(--text-secondary)]">
                Policy to apply *
                <select required value={selectedRetentionPolicyId} disabled={loading}
                  onChange={event => setSelectedRetentionPolicyId(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  {retentionCatalog?.policies.map(policy => (
                    <option key={policy.id} value={policy.id}>
                      {policy.name}{policy.id === retentionCatalog.defaultPolicyId ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              </label>
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
                The selected retention and backup settings are saved with this organization at creation.
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
