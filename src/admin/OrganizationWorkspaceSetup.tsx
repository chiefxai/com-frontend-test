import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { INDUSTRY_PROFILES } from '../lib/industry/registry';
import WorkspacePolicyEditor from '../components/WorkspacePolicyEditor';
import { emptyWorkspacePolicy, monthlyPreview, serializedPolicy, WorkspacePolicyDraft } from '../lib/workspacePolicy';

export default function OrganizationWorkspaceSetup({orgId}:{orgId:string}) {
  const [setup,setSetup]=useState<{policy:WorkspacePolicyDraft & {primaryIndustry:string};workspaces:{id:string;name:string;industry:string}[];currentQuote:{totalMonthlyInr:number}|null}|null>(null);
  const [policy,setPolicy]=useState<WorkspacePolicyDraft>(emptyWorkspacePolicy);
  const [branch,setBranch]=useState({name:'',industry:''});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const load=useCallback(async()=>{
    const response=await apiFetch(`/api/platform/organizations/${orgId}/workspace-setup`);
    const body=await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load organization workspaces.');
    setSetup(body);
    setPolicy({mode:body.policy.mode,pricing:body.policy.pricing || emptyWorkspacePolicy.pricing});
    setBranch(current=>({...current,industry:body.policy.primaryIndustry}));
  },[orgId]);
  useEffect(()=>{let active=true; load().catch(error=>{if(active)setMessage(error.message);}); return()=>{active=false;};},[load]);
  async function save(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await apiFetch(`/api/platform/organizations/${orgId}/workspace-setup`,{method:'PUT',body:JSON.stringify(serializedPolicy(policy))});
      const body=await response.json();if(!response.ok)throw new Error(body.error || 'Could not save workspace setup.');
      await load();setMessage('Workspace structure and monthly prices saved.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not save.');}finally{setBusy(false);}
  }
  async function create(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await apiFetch(`/api/platform/organizations/${orgId}/workspaces`,{method:'POST',body:JSON.stringify(branch)});
      const body=await response.json();if(!response.ok)throw new Error(body.error || 'Could not create workspace.');
      setBranch(current=>({...current,name:''}));await load();setMessage('Workspace created and assigned to an organization administrator.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not create workspace.');}finally{setBusy(false);}
  }
  if(!setup)return <p className="text-xs text-slate-500">{message || 'Loading workspace setup…'}</p>;
  const unsaved=JSON.stringify({mode:setup.policy.mode,pricing:setup.policy.pricing || emptyWorkspacePolicy.pricing})!==JSON.stringify(policy);
  const next=monthlyPreview(policy,setup.policy.primaryIndustry,[...setup.workspaces,{industry:policy.mode==='mixed_industry'?branch.industry:setup.policy.primaryIndustry}]);
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <h4 className="text-sm font-semibold text-slate-800">Workspace structure and pricing</h4>
    <p className="text-xs text-slate-500">Primary industry: {setup.policy.primaryIndustry.replaceAll('_',' ')}. This organization keeps the plan price snapshot from creation; platform plan defaults are managed in Admin → Plans &amp; Pricing.</p>
    <ul className="space-y-1 text-xs text-slate-600">{setup.workspaces.map(workspace=><li key={workspace.id}>{workspace.name} · {workspace.industry.replaceAll('_',' ')}</li>)}</ul>
    {message && <p role="status" className="text-xs text-amber-700">{message}</p>}
    <form onSubmit={save} className="space-y-3">
      <WorkspacePolicyEditor value={policy} onChange={value=>{setPolicy(value);if(value.mode!==policy.mode)setBranch(current=>({...current,industry:setup.policy.primaryIndustry}));}} primaryIndustry={setup.policy.primaryIndustry} workspaces={setup.workspaces} showPricingFields={false} />
      <button disabled={busy} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save workspace setup</button>
    </form>
    <form onSubmit={create} className="space-y-3 border-t border-slate-200 pt-4">
      <p className="text-xs text-slate-500">Save setup and pricing before adding a workspace. Different industries require mixed-industry mode.</p>
      <input required maxLength={120} value={branch.name} placeholder="New workspace / branch name" onChange={event=>setBranch(current=>({...current,name:event.target.value}))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <select aria-label="New workspace industry" value={policy.mode==='mixed_industry'?branch.industry:setup.policy.primaryIndustry} disabled={policy.mode!=='mixed_industry'} onChange={event=>setBranch(current=>({...current,industry:event.target.value}))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
        {Object.values(INDUSTRY_PROFILES).map(industry=><option key={industry.key} value={industry.key}>{industry.label}</option>)}
      </select>
      {next!==null && <p className="text-xs text-slate-600">Fixed monthly estimate after adding: ₹{next.toFixed(2)}, plus usage and applicable taxes.</p>}
      <button disabled={busy || unsaved || !setup.currentQuote} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Create workspace</button>
    </form>
  </section>;
}
