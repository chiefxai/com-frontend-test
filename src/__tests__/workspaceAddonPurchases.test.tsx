import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import userEvent from '@testing-library/user-event';
import WorkspaceAddonPurchases from '../components/billing/WorkspaceAddonPurchases';
import WorkspaceManagement from '../components/WorkspaceManagement';

const mocks = vi.hoisted(()=>({apiFetch:vi.fn(),submit:vi.fn(),can:vi.fn(()=>true)}));
vi.mock('../lib/api',()=>({apiFetch:mocks.apiFetch}));
vi.mock('../lib/authorization',()=>({useAuthorization:()=>({can:mocks.can})}));
vi.mock('../lib/billing/client',()=>({billingClient:{submitPaymentWithProof:mocks.submit},newBillingIdempotencyKey:()=>crypto.randomUUID()}));
vi.mock('../components/ui/Modal',()=>({default:({open,children}:{open:boolean;children:React.ReactNode})=>open?<div role="dialog">{children}</div>:null}));
vi.mock('../components/ui/Widget',()=>({default:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('../components/ui/DataTable',()=>({default:()=>null}));
vi.mock('../components/ui/FilterBar',()=>({default:({actions}:{actions:React.ReactNode})=><div>{actions}</div>}));
vi.mock('../components/ui/IconButton',()=>({default:({label,onClick}:{label:string;onClick:()=>void})=><button onClick={onClick}>{label}</button>}));
const amount={asset:'INR',units:'5000',scale:2};
const addon={id:'addon-1',name:'Mumbai',status:'pending',workspaceId:null,monthlyAmount:amount,autoRenew:true,periodEndsAt:null,graceEndsAt:null,
  invoice:{id:'invoice-1',status:'open',paymentAmount:amount,dueAt:'2026-10-11T00:00:00Z',paymentStatus:null,paymentRequestId:null}};
const response=(data:unknown)=>({ok:true,json:async()=>data});
beforeEach(()=>{vi.clearAllMocks();mocks.can.mockReturnValue(true);mocks.apiFetch.mockResolvedValue(response({purchasesAvailable:true,rows:[addon]}));mocks.submit.mockResolvedValue({id:'payment-1'});});
afterEach(()=>{cleanup();});

describe('workspace add-on purchase UI',()=>{
  it('submits the server invoice amount and receipt without spending usage credits',async()=>{
    render(<WorkspaceAddonPurchases canSubmit/>);
    fireEvent.click(await screen.findByRole('button',{name:'Submit payment'}));
    expect(screen.getByText(/No usage credits are deducted/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bank or UPI transaction reference'),{target:{value:'UTR-123'}});
    const receipt=new File(['%PDF-proof'],'receipt.pdf',{type:'application/pdf'});
    await userEvent.upload(screen.getByLabelText(/Payment receipt/),receipt);
    fireEvent.submit(screen.getByRole('button',{name:'Submit for verification'}).closest('form')!);
    await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith({purpose:'invoice',invoiceId:'invoice-1',expectedAmount:amount,paymentReference:'UTR-123'},receipt,expect.objectContaining({idempotencyKey:expect.any(String)})));
    expect(await screen.findByText(/Payment submitted for verification/)).toBeInTheDocument();
  });
  it('offers no payment or cancellation action while a receipt is under review',async()=>{
    mocks.apiFetch.mockResolvedValue(response({purchasesAvailable:true,rows:[{...addon,invoice:{...addon.invoice,paymentStatus:'pending_verification'}}]}));
    render(<WorkspaceAddonPurchases canSubmit/>);
    await screen.findByText('Payment awaiting platform verification');
    expect(screen.queryByRole('button',{name:'Submit payment'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Cancel purchase'})).toBeDisabled();
  });
  it('keeps read-only billing viewers from submitting or changing a purchase',async()=>{
    render(<WorkspaceAddonPurchases/>);
    await screen.findByText(/Mumbai/);
    expect(screen.queryByRole('button',{name:'Submit payment'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Cancel purchase'})).not.toBeInTheDocument();
  });
  it('redeems unallocated paid top-up credits to create an extra workspace immediately',async()=>{
  const workspaces=Array.from({length:5},(_,i)=>({id:`w-${i}`,name:`Workspace ${i}`,status:'Active',industry:'lending'}));
  const setup={policy:{mode:'same_industry',primaryIndustry:'lending',pricing:{includedWorkspaces:5,maxWorkspaces:10}},
    purchasesAvailable:true,workspaces,currentQuote:{totalMonthlyInr:1000},
    addBranchQuote:{totalMonthlyInr:1050,paymentRequired:true,monthlyAddonInr:50,token:'server-token'}};
  mocks.apiFetch.mockImplementation(async(path:string,opts?:{method?:string})=>{
    if(path==='/api/settings/workspaces')return response(workspaces);
    if(path==='/api/settings/workspace-policy')return response(setup);
    if(path==='/api/billing/workspace-addons')return response({
      purchasesAvailable:true,topupPaymentAvailable:true,
      unallocatedTopupCredits:{asset:'INR',units:'6000',scale:2},rows:[]});
    if(path==='/api/billing/workspace-addons/pay-with-topup' && opts?.method==='POST')
      return response({status:'active',workspaceId:'workspace-new',paymentSource:'topup_credits'});
    return response({});
  });
  render(<WorkspaceManagement enabled onWorkspaceCreated={async()=>{}}/>);
  await waitFor(()=>expect(mocks.apiFetch).toHaveBeenCalledWith('/api/billing/workspace-addons'));
  fireEvent.click(screen.getByRole('button',{name:'Create Workspace'}));
  expect(await screen.findByRole('radio',{name:/Pay now with unallocated top-up credits/})).toBeChecked();
  fireEvent.change(screen.getByLabelText('Workspace name'),{target:{value:'Mumbai'}});
  fireEvent.click(screen.getByRole('button',{name:'Pay credits & create workspace'}));
  await waitFor(()=>expect(mocks.apiFetch).toHaveBeenCalledWith(
    '/api/billing/workspace-addons/pay-with-topup',expect.objectContaining({method:'POST'})));
  expect(await screen.findByText(/Workspace created immediately/)).toBeInTheDocument();
});

it('prepares an invoice for workspace six instead of calling immediate workspace creation',async()=>{
    const workspaces=Array.from({length:5},(_,i)=>({id:`w-${i}`,name:`Workspace ${i}`,status:'Active',industry:'lending'}));
    const setup={policy:{mode:'same_industry',primaryIndustry:'lending',pricing:{includedWorkspaces:5,maxWorkspaces:10}},purchasesAvailable:true,
      workspaces,currentQuote:{totalMonthlyInr:1000},addBranchQuote:{totalMonthlyInr:1050,paymentRequired:true,monthlyAddonInr:50,token:'server-token'}};
    mocks.apiFetch.mockImplementation(async(path:string)=>response(path==='/api/settings/workspaces'?workspaces:path==='/api/settings/workspace-policy'?setup:path==='/api/billing/workspace-addons'?{purchasesAvailable:true,rows:[]}:{}));
    render(<WorkspaceManagement enabled onWorkspaceCreated={async()=>{}}/>);
    await waitFor(()=>expect(mocks.apiFetch).toHaveBeenCalledWith('/api/settings/workspace-policy'));
    fireEvent.click(screen.getByRole('button',{name:'Create Workspace'}));
    await screen.findByText(/Workspace add-on: ₹50.00/);
    fireEvent.change(screen.getByLabelText('Workspace name'),{target:{value:'Mumbai'}});
    fireEvent.click(screen.getByRole('button',{name:'Prepare payment invoice'}));
    await waitFor(()=>expect(mocks.apiFetch).toHaveBeenCalledWith('/api/billing/workspace-addons',expect.objectContaining({method:'POST',body:JSON.stringify({name:'Mumbai',industry:'lending',branchName:null,pricingAcceptanceToken:'server-token'})})));
    expect(mocks.apiFetch.mock.calls.some(([path,init])=>path==='/api/settings/workspaces'&&init?.method==='POST')).toBe(false);
  });
});
