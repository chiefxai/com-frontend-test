import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import FlagGroupPicker from '../components/ui/FlagGroupPicker';

const INDUSTRIES = [
  { value: 'lending', label: 'Lending' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'retail', label: 'Retail' },
  { value: 'education', label: 'Education' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'other', label: 'Other' },
];

const PLANS = ['Starter', 'Growth', 'Enterprise'];

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
  dataRetentionMode: 'default' | 'custom';
  dataRetentionOverrides: Record<string, number | null>;
  backupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupEmail: string;
  backupRetentionDays: string;
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
    dataRetentionMode: 'default',
    dataRetentionOverrides: {},
    backupEnabled: false,
    backupFrequency: 'monthly',
    backupEmail: '',
    backupRetentionDays: '365',
  });
  const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setForm(current => ({ ...current, workspaceName: generateWorkspaceSlug(current.name) }));
  }, [form.name]);

  const toggleFlag = (key: string) => {
    setSelectedFlags(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const set = (field: keyof CreateOrgForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
      if (form.backupEnabled && !form.backupEmail.trim()) {
        setError('Backup email is required when automated backups are enabled.');
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
          dataRetentionMode: form.dataRetentionMode,
          dataRetentionOverrides: form.dataRetentionMode === 'custom' ? form.dataRetentionOverrides : {},
          backup: {
            enabled: form.backupEnabled,
            frequency: form.backupFrequency,
            email: form.backupEmail.trim(),
            retentionDays: Number(form.backupRetentionDays || 365),
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to create workspace');
        return;
      }
      navigate('/admin/organizations');
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => navigate('/admin/organizations')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-800">
          ← Back to Organizations
        </button>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold text-amber-700">New Workspace</span>
      </div>
      {loading && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Validating Google Cloud project and configuring Vertex AI…
        </div>
      )}
      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 text-sm text-rose-600">
          Google Cloud project configuration failed: {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Workspace Identity</h2>
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
            <select value={form.industry} onChange={set('industry')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
              {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Plan</label>
            <select value={form.subscriptionPlan} onChange={set('subscriptionPlan')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <FlagGroupPicker
            availableKeys={FEATURE_REGISTRY.map(f => f.key)}
            value={selectedFlags}
            onApply={setSelectedFlags}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <p className="text-xs font-bold text-slate-700">Advanced · Data Retention &amp; Backup</p>
            <p className="text-[11px] text-slate-500 mt-1">Use the platform defaults or define a company-specific retention policy.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className={`rounded-xl border p-3 cursor-pointer ${form.dataRetentionMode === 'default' ? 'border-amber-400 ring-1 ring-amber-100' : 'border-slate-200'}`}>
              <input type="radio" className="sr-only" checked={form.dataRetentionMode === 'default'} onChange={() => setForm(f => ({ ...f, dataRetentionMode: 'default' }))} />
              <p className="text-xs font-semibold text-slate-700">Platform default</p>
              <p className="text-[10px] text-slate-500 mt-1">Inherits Super Admin retention settings.</p>
            </label>
            <label className={`rounded-xl border p-3 cursor-pointer ${form.dataRetentionMode === 'custom' ? 'border-amber-400 ring-1 ring-amber-100' : 'border-slate-200'}`}>
              <input type="radio" className="sr-only" checked={form.dataRetentionMode === 'custom'} onChange={() => setForm(f => ({ ...f, dataRetentionMode: 'custom' }))} />
              <p className="text-xs font-semibold text-slate-700">Custom policy</p>
              <p className="text-[10px] text-slate-500 mt-1">Set different retention for this company.</p>
            </label>
          </div>
          {form.dataRetentionMode === 'custom' && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                ['call_recordings', 'Call recordings'],
                ['transcripts', 'Transcripts'],
                ['ai_summaries', 'AI summaries'],
                ['call_logs', 'Call logs'],
                ['campaign_history', 'Campaign history'],
                ['audit_logs', 'Audit logs'],
                ['documents', 'Documents'],
                ['contacts', 'Contacts'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">{label}</label>
                  <select
                    value={form.dataRetentionOverrides[key] == null ? '' : String(form.dataRetentionOverrides[key])}
                    onChange={e => setForm(f => ({ ...f, dataRetentionOverrides: { ...f.dataRetentionOverrides, [key]: e.target.value === '' ? null : Number(e.target.value) } }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  >
                    <option value="">Never</option>
                    <option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option>
                    <option value="365">1 year</option><option value="730">2 years</option><option value="1095">3 years</option><option value="1825">5 years</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700">Automated backups</p>
                <p className="text-[10px] text-slate-500 mt-1">Creates a ZIP archive, stores it securely, and emails a temporary download link.</p>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, backupEnabled: !f.backupEnabled }))} className={`relative h-6 w-11 rounded-full transition ${form.backupEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${form.backupEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            {form.backupEnabled && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><label className="block text-[10px] font-semibold text-slate-500 mb-1">Backup email</label><input type="email" value={form.backupEmail} onChange={set('backupEmail')} placeholder="admin@company.com" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" /></div>
                <div><label className="block text-[10px] font-semibold text-slate-500 mb-1">Frequency</label><select value={form.backupFrequency} onChange={set('backupFrequency')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
                <div><label className="block text-[10px] font-semibold text-slate-500 mb-1">Backup retention</label><select value={form.backupRetentionDays} onChange={set('backupRetentionDays')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option><option value="730">2 years</option></select></div>
              </div>
            )}
          </div>
        </section>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button type="button" onClick={() => navigate('/admin/organizations')} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          <button type="submit" disabled={loading} className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-medium rounded-xl flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Validating…' : 'Create Workspace'}
          </button>
        </div>
      </form>
    </div>
  );
}
