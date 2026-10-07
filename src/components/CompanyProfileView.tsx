import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  Building2,
  Globe,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Plus,
  X,
  Percent,
  Award,
  ArrowRight,
  RefreshCw,
  Search,
  Building
} from 'lucide-react';
import { OrganizationSettings } from '../types';
import { motion } from 'motion/react';
import PageShell from './ui/PageShell';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Widget from './ui/Widget';

interface CompanyProfileFieldConfig {
  key: string;
  label: string;
  hint: string;
  placeholder: string;
  default: string[];
}

interface CompanyProfileConfig {
  taxIdLabel: string;
  taxIdPlaceholder: string;
  license: { key: string; label: string; placeholder: string };
  rate: { key: string; label: string } | null;
  risk: { key: string } | null;
  bioPlaceholder: string;
  sectors: CompanyProfileFieldConfig;
  jurisdictions: CompanyProfileFieldConfig;
}

// Lending fallback shown until the real per-industry config loads from
// GET /api/settings/org/profile-config (services/industryPacks.js's
// getCompanyProfileConfig on the backend) — matches its lending entry
// so there's no visible flash of different field labels on load.
const DEFAULT_PROFILE_CONFIG: CompanyProfileConfig = {
  taxIdLabel: 'EIN / Tax Identification Number',
  taxIdPlaceholder: 'XX-XXXXXXX',
  license: { key: 'nmlsId', label: 'NMLS License Identifier', placeholder: 'NMLS-XXXXXX' },
  rate: { key: 'defaultInterestRate', label: 'Default Loan Portfolio APR (%)' },
  risk: { key: 'riskProfile' },
  bioPlaceholder: "Describe your lending company's market niche and credit guidelines...",
  sectors: {
    key: 'primaryLendingSectors', label: 'Primary Loan Financing Sectors',
    hint: 'Manage which product classes your organization is authorized to underwrite.',
    placeholder: 'e.g. Small Business Loans',
    default: ['Personal Loans', 'Mortgages', 'Auto Refinancing']
  },
  jurisdictions: {
    key: 'regulatoryJurisdictions', label: 'Licensed Operational Jurisdictions',
    hint: 'Lending operates only within states that match your active regulatory clearances.',
    placeholder: 'e.g. New York, Arizona',
    default: ['California', 'Texas', 'Florida', 'New York']
  }
};

// Cache the last-fetched config across mounts so switching away from and
// back to this view doesn't flash the lending default before the real
// per-industry config re-fetches.
let cachedProfileConfig: CompanyProfileConfig | null = null;

interface CompanyProfileViewProps {
  orgSettings: OrganizationSettings;
  setOrgSettings: React.Dispatch<React.SetStateAction<OrganizationSettings>>;
  activeSubTab?: 'profile' | 'legal' | 'channels' | 'compliance';
  setActiveSubTab?: (sub: string) => void;
}

export default function CompanyProfileView({
  orgSettings,
  setOrgSettings,
  activeSubTab: activeSubTabProp,
  setActiveSubTab: setActiveSubTabProp,
}: CompanyProfileViewProps) {
  // Which fields/labels/tag-lists to show — differs per org industry.
  // formData keeps generic internal field names (`nmlsId`, `defaultInterestRate`,
  // `riskProfile`) regardless of industry so the Compliance tab (untouched,
  // lending-only logic) keeps working; only the *label* shown to the user
  // and the *storage key* used when saving to orgSettings vary by industry.
  const [config, setConfig] = useState<CompanyProfileConfig>(cachedProfileConfig || DEFAULT_PROFILE_CONFIG);

  // Local state copy of all settings to allow saving
  const [formData, setFormData] = useState({
    name: orgSettings.name || '',
    workspaceName: orgSettings.workspaceName || '',
    taxId: orgSettings.taxId || '',
    nmlsId: (orgSettings as any)[(cachedProfileConfig || DEFAULT_PROFILE_CONFIG).license.key] || '',
    foundedYear: orgSettings.foundedYear || '',
    headquarters: orgSettings.headquarters || '',
    website: orgSettings.website || '',
    contactEmail: orgSettings.contactEmail || '',
    supportPhone: orgSettings.supportPhone || '',
    complianceOfficer: orgSettings.complianceOfficer || '',
    businessType: orgSettings.businessType || 'LLC',
    defaultInterestRate: orgSettings.defaultInterestRate || 8.5,
    riskProfile: orgSettings.riskProfile || 'Moderate',
    companyBio: orgSettings.companyBio || '',
    verificationStatus: orgSettings.verificationStatus || 'Verified'
  });

  const [jurisdictions, setJurisdictions] = useState<string[]>(
    (orgSettings as any)[(cachedProfileConfig || DEFAULT_PROFILE_CONFIG).jurisdictions.key] || (cachedProfileConfig || DEFAULT_PROFILE_CONFIG).jurisdictions.default
  );
  const [sectors, setSectors] = useState<string[]>(
    (orgSettings as any)[(cachedProfileConfig || DEFAULT_PROFILE_CONFIG).sectors.key] || (cachedProfileConfig || DEFAULT_PROFILE_CONFIG).sectors.default
  );

  // Fetch the real per-industry config, then re-derive form values from
  // orgSettings under THAT industry's actual storage keys (a non-lending
  // org's license number lives at e.g. orgSettings.realEstateLicenseId,
  // not orgSettings.nmlsId).
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/settings/workspace/profile-config')
      .then((r) => r.json())
      .then((cfg: CompanyProfileConfig) => {
        if (cancelled || !cfg || !cfg.license) return;
        cachedProfileConfig = cfg;
        setConfig(cfg);
        setFormData((prev) => ({
          ...prev,
          nmlsId: (orgSettings as any)[cfg.license.key] || '',
          defaultInterestRate: cfg.rate ? ((orgSettings as any)[cfg.rate.key] ?? 8.5) : prev.defaultInterestRate,
          riskProfile: cfg.risk ? ((orgSettings as any)[cfg.risk.key] || 'Moderate') : prev.riskProfile
        }));
        setSectors((orgSettings as any)[cfg.sectors.key] || cfg.sectors.default);
        setJurisdictions((orgSettings as any)[cfg.jurisdictions.key] || cfg.jurisdictions.default);
      })
      .catch((err) => console.warn('Failed to load company profile config:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSettings.industry]);

  const [newJurisdiction, setNewJurisdiction] = useState('');
  const [newSector, setNewSector] = useState('');

  // UI state
  // Use prop-controlled sub-tab when provided (driven by sidebar), fall back to internal state.
  const [_internalSubTab, _setInternalSubTab] = useState<'profile' | 'legal' | 'channels' | 'compliance'>('profile');
  const activeSubTab = (activeSubTabProp as 'profile' | 'legal' | 'channels' | 'compliance') || _internalSubTab;
  const setActiveSubTab = (v: string) => {
    _setInternalSubTab(v as 'profile' | 'legal' | 'channels' | 'compliance');
    setActiveSubTabProp?.(v);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Verification simulator state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationLogs, setVerificationLogs] = useState<string[]>([]);
  const [verificationResult, setVerificationResult] = useState<{
    score: number;
    issues: string[];
    passed: boolean;
  } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'defaultInterestRate' ? parseFloat(value) || 0 : value
    }));
  };

  const handleAddJurisdiction = (e: React.FormEvent) => {
    e.preventDefault();
    if (newJurisdiction.trim() && !jurisdictions.includes(newJurisdiction.trim())) {
      setJurisdictions([...jurisdictions, newJurisdiction.trim()]);
      setNewJurisdiction('');
    }
  };

  const handleRemoveJurisdiction = (item: string) => {
    setJurisdictions(jurisdictions.filter((j) => j !== item));
  };

  const handleAddSector = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSector.trim() && !sectors.includes(newSector.trim())) {
      setSectors([...sectors, newSector.trim()]);
      setNewSector('');
    }
  };

  const handleRemoveSector = (item: string) => {
    setSectors(sectors.filter((s) => s !== item));
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);

    // Brief UX delay before showing the success banner — the actual
    // persistence happens for real via App.tsx's effect that POSTs
    // orgSettings to /api/settings/org whenever it changes.
    setTimeout(() => {
      setOrgSettings((prev) => ({
        ...prev,
        name: formData.name,
        workspaceName: formData.workspaceName,
        taxId: formData.taxId,
        [config.license.key]: formData.nmlsId,
        foundedYear: formData.foundedYear,
        headquarters: formData.headquarters,
        website: formData.website,
        contactEmail: formData.contactEmail,
        supportPhone: formData.supportPhone,
        complianceOfficer: formData.complianceOfficer,
        businessType: formData.businessType,
        ...(config.rate ? { [config.rate.key]: formData.defaultInterestRate } : {}),
        ...(config.risk ? { [config.risk.key]: formData.riskProfile as any } : {}),
        companyBio: formData.companyBio,
        verificationStatus: formData.verificationStatus as any,
        [config.jurisdictions.key]: jurisdictions,
        [config.sectors.key]: sectors
      }));

      setIsSaving(false);
      setSaveMessage({ type: 'success', text: 'Company profile successfully saved and deployed.' });
      setTimeout(() => setSaveMessage(null), 4000);
    }, 800);
  };

  // Run dynamic regulatory check & verification
  const runComplianceVerification = () => {
    setIsVerifying(true);
    setVerificationResult(null);
    setVerificationLogs([]);

    const logs: string[] = [];
    const addLog = (text: string, delay: number) => {
      setTimeout(() => {
        setVerificationLogs((prev) => [...prev, text]);
      }, delay);
    };

    addLog('Establishing secure connection to NMLS (National Multistate Licensing System)...', 200);
    addLog(`Verify Business Registration Name: "${formData.name}" against federal database...`, 800);
    addLog(`Checking EIN Tax Identification: "${formData.taxId}"...`, 1400);
    addLog(`Checking NMLS Registry License: "${formData.nmlsId}"...`, 2000);
    addLog('Analyzing primary lending sectors and cross-referencing states...', 2600);
    addLog('Evaluating compliance officer assignment and corporate risk model...', 3200);

    setTimeout(() => {
      const issues: string[] = [];
      let score = 100;

      // Rule checks
      if (!formData.name) {
        issues.push('Corporate entity name is blank.');
        score -= 20;
      }
      if (!formData.taxId || !/^\d{2}-\d{7}$/.test(formData.taxId)) {
        issues.push('EIN tax ID is missing or not in standard XX-XXXXXXX format.');
        score -= 15;
      }
      if (!formData.nmlsId || !/^NMLS-\d+$/.test(formData.nmlsId)) {
        issues.push('NMLS Identifier is missing or should be in format "NMLS-123456".');
        score -= 15;
      }
      if (jurisdictions.length === 0) {
        issues.push('No licensed regulatory jurisdictions selected.');
        score -= 10;
      }
      if (!formData.complianceOfficer) {
        issues.push('No compliance officer designated.');
        score -= 10;
      }
      if (!formData.website) {
        issues.push('Corporate website url is missing.');
        score -= 5;
      }

      const passed = score >= 70;
      setVerificationResult({
        score,
        issues,
        passed
      });
      setIsVerifying(false);

      if (passed) {
        setFormData((prev) => ({ ...prev, verificationStatus: 'Verified' }));
        setOrgSettings((prev) => ({ ...prev, verificationStatus: 'Verified' }));
      } else {
        setFormData((prev) => ({ ...prev, verificationStatus: 'Unverified' }));
        setOrgSettings((prev) => ({ ...prev, verificationStatus: 'Unverified' }));
      }
    }, 3800);
  };

  return (
    <PageShell
      title={<BreadcrumbTitle group="Company Profile" page={
        activeSubTab === 'profile' ? 'Organization Profile'
        : activeSubTab === 'legal' ? 'Legal & Registration'
        : activeSubTab === 'channels' ? 'Communication Channels'
        : 'Compliance'
      } />}
      subtitle={`Configure your organization identity, legal registrations, operating ${config.sectors.label.toLowerCase()}, and verify compliance criteria.`}
      layout="fill"
      action={
        <div className="flex items-center space-x-3">
          {saveMessage && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center ${
                saveMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {saveMessage.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />}
              {saveMessage.text}
            </motion.div>
          )}
          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-blue-500/10 cursor-pointer flex items-center space-x-1.5"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Deploying...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Save & Proceed</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="overflow-y-auto space-y-6">

      {/* Quick Stats Bento bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Org name */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Legal Name</span>
            <span className="text-sm font-semibold text-slate-800 truncate block max-w-[160px]">{formData.name || 'Not Configured'}</span>
          </div>
          <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        {/* Card 2: License Id */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{config.license.label}</span>
            <span className="text-sm font-semibold font-mono text-slate-800">{formData.nmlsId || 'None Provided'}</span>
          </div>
          <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <Award className="h-5 w-5" />
          </div>
        </div>

        {/* Card 3: Jurisdictions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{config.jurisdictions.label}</span>
            <span className="text-sm font-semibold text-slate-800">{jurisdictions.length} configured</span>
          </div>
          <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <MapPin className="h-5 w-5" />
          </div>
        </div>

        {/* Card 4: Verification status badge */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Compliance Status</span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className={`h-2 w-2 rounded-full ${
                formData.verificationStatus === 'Verified' ? 'bg-emerald-500' : formData.verificationStatus === 'Pending' ? 'bg-amber-500' : 'bg-slate-300'
              }`}></span>
              <span className={`text-xs font-bold uppercase tracking-wide ${
                formData.verificationStatus === 'Verified' ? 'text-emerald-700' : formData.verificationStatus === 'Pending' ? 'text-amber-700' : 'text-slate-500'
              }`}>
                {formData.verificationStatus || 'Unverified'}
              </span>
            </div>
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
            formData.verificationStatus === 'Verified' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'
          }`}>
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Form — navigation handled by sidebar */}
      <Widget
        padding="md"
        title={
          activeSubTab === 'profile' ? 'Identity & Commercial Branding'
          : activeSubTab === 'legal' ? 'Regulatory Filings & Licensing'
          : activeSubTab === 'channels' ? 'Communication Channels & Support Routing'
          : 'Compliance Verification Suite'
        }
        subtitle={
          activeSubTab === 'profile' ? 'Configure user-facing commercial credentials and portfolio limits.'
          : activeSubTab === 'legal' ? 'Provide government-issued identifiers, licenses, and tax records.'
          : activeSubTab === 'channels' ? 'Set up email, phone, and support contact routing.'
          : 'Review and verify your organization\'s compliance criteria.'
        }
        icon={
          activeSubTab === 'profile' ? Building2
          : activeSubTab === 'legal' ? ShieldCheck
          : activeSubTab === 'channels' ? Globe
          : Award
        }
        accent={
          activeSubTab === 'profile' ? '#2563eb'
          : activeSubTab === 'legal' ? '#7c3aed'
          : activeSubTab === 'channels' ? '#0891b2'
          : '#059669'
        }
      >
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* SUBTAB 1: Profile & Identity */}
            {activeSubTab === 'profile' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Legal Business Name</label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="e.g. Chief Capital LLC"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Workspace Identifier Subdomain</label>
                    <div className="flex rounded-xl overflow-hidden border border-slate-200">
                      <input
                        type="text"
                        name="workspaceName"
                        required
                        value={formData.workspaceName}
                        onChange={handleInputChange}
                        placeholder="subdomain"
                        className="flex-1 bg-slate-50 px-3 py-2 text-xs focus:outline-none"
                      />
                      <span className="bg-slate-100 text-slate-500 px-3 py-2 text-xs border-l border-slate-200 font-mono">.chief.ai</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Business Type / Structure</label>
                    <select
                      name="businessType"
                      value={formData.businessType}
                      onChange={handleInputChange}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="LLC">Limited Liability Company (LLC)</option>
                      <option value="C-Corp">C-Corporation (C-Corp)</option>
                      <option value="S-Corp">S-Corporation (S-Corp)</option>
                      <option value="Partnership">General Partnership</option>
                      <option value="Sole">Sole Proprietorship</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Year Incorporated</label>
                    <div className="relative">
                      <input
                        type="number"
                        name="foundedYear"
                        value={formData.foundedYear}
                        onChange={handleInputChange}
                        placeholder="e.g. 2019"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </div>

                  {config.rate && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center justify-between">
                        <span>{config.rate.label}</span>
                        <span className="text-[10px] text-blue-600 font-mono">Platform Standard</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          name="defaultInterestRate"
                          value={formData.defaultInterestRate}
                          onChange={handleInputChange}
                          placeholder="e.g. 7.99"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                        <Percent className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      </div>
                    </div>
                  )}

                  {config.risk && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Underwriting Risk Appetite</label>
                      <div className="relative">
                        <select
                          name="riskProfile"
                          value={formData.riskProfile}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                        >
                          <option value="Conservative">Conservative (Lower Default, Lower Return)</option>
                          <option value="Moderate">Moderate (Standard Balanced Model)</option>
                          <option value="Aggressive">Aggressive (High Yield, Sub-Prime Tolerance)</option>
                        </select>
                        <TrendingUp className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bio text */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Corporate Bio & Core Mandate</label>
                  <textarea
                    name="companyBio"
                    value={formData.companyBio}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder={config.bioPlaceholder}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Sectors Sub-section (per-industry: lending sectors, property types, product categories, etc.) */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{config.sectors.label}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">{config.sectors.hint}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {sectors.map((s) => (
                      <span key={s} className="inline-flex items-center bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-xl border border-blue-100">
                        {s}
                        <button
                          type="button"
                          onClick={() => handleRemoveSector(s)}
                          className="ml-1.5 text-blue-400 hover:text-blue-600 focus:outline-none"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex max-w-sm gap-2">
                    <input
                      type="text"
                      placeholder={config.sectors.placeholder}
                      value={newSector}
                      onChange={(e) => setNewSector(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddSector}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 rounded-xl transition-all"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

              </motion.div>
            )}

            {/* SUBTAB 2: Legal & Licenses */}
            {activeSubTab === 'legal' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{config.taxIdLabel}</label>
                    <input
                      type="text"
                      name="taxId"
                      value={formData.taxId}
                      onChange={handleInputChange}
                      placeholder={config.taxIdPlaceholder}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{config.license.label}</label>
                    <input
                      type="text"
                      name="nmlsId"
                      value={formData.nmlsId}
                      onChange={handleInputChange}
                      placeholder={config.license.placeholder}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Designated Compliance Officer</label>
                    <input
                      type="text"
                      name="complianceOfficer"
                      value={formData.complianceOfficer}
                      onChange={handleInputChange}
                      placeholder="Full Name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Headquarters Registered Address</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="headquarters"
                        value={formData.headquarters}
                        onChange={handleInputChange}
                        placeholder="Street, City, State, ZIP"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <MapPin className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* Jurisdictions / Service Areas List (label & storage key vary per industry) */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{config.jurisdictions.label}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">{config.jurisdictions.hint}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {jurisdictions.map((j) => (
                      <span key={j} className="inline-flex items-center bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-xl border border-indigo-100">
                        {j}
                        <button
                          type="button"
                          onClick={() => handleRemoveJurisdiction(j)}
                          className="ml-1.5 text-indigo-400 hover:text-indigo-600 focus:outline-none"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex max-w-sm gap-2">
                    <input
                      type="text"
                      placeholder={config.jurisdictions.placeholder}
                      value={newJurisdiction}
                      onChange={(e) => setNewJurisdiction(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddJurisdiction}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 rounded-xl transition-all"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

              </motion.div>
            )}

            {/* SUBTAB 3: Support Channels */}
            {activeSubTab === 'channels' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Corporate Website Domain</label>
                    <div className="relative">
                      <input
                        type="url"
                        name="website"
                        value={formData.website}
                        onChange={handleInputChange}
                        placeholder="https://chiefcapital.ai"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                      <Globe className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer Support Email</label>
                    <div className="relative">
                      <input
                        type="email"
                        name="contactEmail"
                        value={formData.contactEmail}
                        onChange={handleInputChange}
                        placeholder="support@chiefcapital.ai"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                      <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Inbound Corporate Hotline</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="supportPhone"
                        value={formData.supportPhone}
                        onChange={handleInputChange}
                        placeholder="+1 (800) 555-0199"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                      <Phone className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start space-x-3 text-xs text-blue-800">
                  <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Dynamic Lead CRM Alignment</p>
                    <p className="text-blue-700/85">
                      Changing support channels automatically routes outbound customer callbacks, auto-responses, and generated documents to use these contact credentials dynamically.
                    </p>
                  </div>
                </div>

              </motion.div>
            )}

            {/* SUBTAB 4: Compliance Suite Verification */}
            {activeSubTab === 'compliance' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Main Suite Panel */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <div className="md:col-span-4 space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Licensing Registry</span>
                      <strong className="text-slate-800 text-sm font-semibold font-display">State-Level NMLS & SEC</strong>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        To activate AI campaigns and disbursements, ChiefVoice requires a passing rating of <strong>70%</strong> based on valid identifiers.
                      </p>
                      <button
                        type="button"
                        onClick={runComplianceVerification}
                        disabled={isVerifying}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-center space-x-2 shadow-sm shadow-indigo-600/10"
                      >
                        <RefreshCw className={`h-4 w-4 ${isVerifying ? 'animate-spin' : ''}`} />
                        <span>{isVerifying ? 'Analyzing Licenses...' : 'Run Registry Audit'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Terminal Log Console */}
                  <div className="md:col-span-8 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-indigo-400 space-y-2.5 h-64 overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[10px] text-slate-500 uppercase tracking-widest">
                      <span>Verification Audit Log</span>
                      <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    </div>

                    {verificationLogs.length === 0 ? (
                      <p className="text-slate-500 italic text-center pt-16">Click "Run Registry Audit" to check credentials in real-time...</p>
                    ) : (
                      <div className="space-y-1">
                        {verificationLogs.map((log, idx) => (
                          <p key={idx} className="text-slate-300">
                            <span className="text-indigo-500 mr-1.5">&gt;</span>
                            {log}
                          </p>
                        ))}
                        {isVerifying && (
                          <div className="flex items-center space-x-1.5 text-indigo-400 font-bold animate-pulse mt-2">
                            <span className="h-1.5 w-1.5 bg-indigo-400 rounded-full"></span>
                            <span>Parsing state laws...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Result Card */}
                    {verificationResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`p-4 rounded-xl border mt-4 text-xs font-sans ${
                          verificationResult.passed
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                            : 'bg-rose-950/40 border-rose-800 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-emerald-800/40 pb-2 mb-2">
                          <span className="font-bold flex items-center">
                            {verificationResult.passed ? (
                              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 mr-2" />
                            ) : (
                              <AlertTriangle className="h-4.5 w-4.5 text-rose-400 mr-2" />
                            )}
                            {verificationResult.passed ? 'COMPLIANCE AUDIT PASSED' : 'COMPLIANCE AUDIT REJECTED'}
                          </span>
                          <strong className="font-mono text-base">{verificationResult.score} / 100</strong>
                        </div>

                        {verificationResult.issues.length > 0 ? (
                          <div className="space-y-1">
                            <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Identified Compliance Deficiencies:</p>
                            <ul className="list-disc pl-5 space-y-1">
                              {verificationResult.issues.map((issue, idx) => (
                                <li key={idx}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-emerald-400 font-semibold">Perfect registration profile matching. Your corporate license credentials are 100% compliant with FINRA, FinCEN, and federal guidelines.</p>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>

              </motion.div>
            )}

            {/* Bottom Form Actions */}
            <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                Last Configured: 2026-07-10
              </span>

              {activeSubTab !== 'compliance' && (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center space-x-1 cursor-pointer"
                >
                  {isSaving ? (
                    <span>Deploying changes...</span>
                  ) : (
                    <>
                      <span>Save Progress</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>

          </form>
      </Widget>
      </div>
    </PageShell>
  );
}
