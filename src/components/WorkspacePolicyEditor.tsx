import React from 'react';

import { WorkspacePolicyDraft, monthlyPreview, workspaceModes } from '../lib/workspacePolicy';

export default function WorkspacePolicyEditor({value,onChange,primaryIndustry,workspaces}:{value:WorkspacePolicyDraft;onChange:(value:WorkspacePolicyDraft)=>void;primaryIndustry:string;workspaces:{industry:string}[]}) {
  const total=monthlyPreview(value,primaryIndustry,workspaces);
  const extraWorkspaces=Math.max(0,workspaces.length-value.pricing.includedWorkspaces);
  const additionalIndustries=new Set(workspaces.map(w=>w.industry).filter(i=>i!==primaryIndustry)).size;
  const inputClass='mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800';
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-3">{workspaceModes.map(option=><label key={option.value} className={`cursor-pointer rounded-xl border p-3 ${value.mode===option.value?'border-amber-500 bg-amber-50':'border-slate-200'}`}>
      <input type="radio" checked={value.mode===option.value} onChange={()=>onChange({...value,mode:option.value})} className="mr-2" />
      <span className="text-xs font-semibold text-slate-800">{option.label}</span>
      <p className="mt-2 text-xs text-slate-500">{option.description}</p>
    </label>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">
      {([
        ['baseMonthlyInr','Organization plan / month (INR)'],
        ['includedWorkspaces','Workspaces included in the plan'],
        ['extraWorkspaceMonthlyInr','Each additional workspace / month (INR)'],
        ...(value.mode==='mixed_industry'?[['additionalIndustryMonthlyInr','Each additional distinct industry / month (INR)']]:[]),
      ] as [keyof WorkspacePolicyDraft['pricing'],string][]).map(([key,label])=><label key={key} className="text-xs text-slate-500">{label}
        <input required type="number" min={key==='includedWorkspaces'?1:0} max={key==='includedWorkspaces'?1000:100000000} step={key==='includedWorkspaces'?1:'0.01'} value={value.pricing[key]??''} onChange={event=>onChange({...value,pricing:{...value.pricing,[key]:event.target.value===''?null:Number(event.target.value)}})} className={inputClass} />
      </label>)}
    </div>
    {total!==null && <dl className="space-y-1 rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
      <div className="flex justify-between"><dt>Organization plan · {value.pricing.includedWorkspaces} workspace(s) included</dt><dd>₹{value.pricing.baseMonthlyInr?.toFixed(2)}</dd></div>
      <div className="flex justify-between"><dt>{extraWorkspaces} additional workspace(s)</dt><dd>₹{(extraWorkspaces*(value.pricing.extraWorkspaceMonthlyInr || 0)).toFixed(2)}</dd></div>
      <div className="flex justify-between"><dt>{additionalIndustries} additional industry pack(s)</dt><dd>₹{(additionalIndustries*(value.pricing.additionalIndustryMonthlyInr || 0)).toFixed(2)}</dd></div>
    </dl>}
    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{total===null?'Set pricing to see the monthly estimate.':`Fixed monthly estimate: ₹${total.toFixed(2)} for ${workspaces.length} workspace(s).`}<span className="mt-1 block text-xs text-slate-500">Usage charges and applicable taxes are additional. Each extra industry is charged once, regardless of its branch count.</span></p>
  </div>;
}
