import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkspaceAllocatedBilling from '../components/billing/WorkspaceAllocatedBilling';
const mocks=vi.hoisted(()=>({workspaceOverview:vi.fn()}));
vi.mock('../lib/billing/client',()=>({billingClient:{workspaceOverview:mocks.workspaceOverview}}));
const snapshot=(workspaceId='ws-1')=>({orgId:'org-1',workspaceId,workspaceName:workspaceId,status:'active',uninitialized:false,balances:[]});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe('workspace allocations',()=>{
  it('shows empty allocations clearly and refreshes only the selected workspace',async()=>{
    mocks.workspaceOverview.mockResolvedValue(snapshot());
    render(<WorkspaceAllocatedBilling workspaceId="ws-1" />);
    expect(await screen.findByText('No subscription credits allocated.')).toBeInTheDocument();
    expect(screen.getByText('No top-up credits allocated.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
    await waitFor(()=>expect(mocks.workspaceOverview).toHaveBeenCalledTimes(2));
    expect(mocks.workspaceOverview).toHaveBeenLastCalledWith('ws-1');
  });
  it('rejects a billing response belonging to another workspace',async()=>{
    mocks.workspaceOverview.mockResolvedValue(snapshot('ws-2'));
    render(<WorkspaceAllocatedBilling workspaceId="ws-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('another workspace');
    expect(screen.queryByText('Allocated subscription credits')).not.toBeInTheDocument();
  });
  it('ignores a late response after switching workspaces',async()=>{
    let finish:(value:unknown)=>void=()=>{};
    mocks.workspaceOverview.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}))
      .mockResolvedValueOnce(snapshot('ws-2'));
    const {rerender}=render(<WorkspaceAllocatedBilling workspaceId="ws-1" />);
    rerender(<WorkspaceAllocatedBilling workspaceId="ws-2" />);
    expect(await screen.findByText('ws-2')).toBeInTheDocument();
    finish(snapshot());
    await waitFor(()=>expect(screen.queryByText('ws-1')).not.toBeInTheDocument());
  });
  it('reports pending ledger setup without inventing zero balances',async()=>{
    mocks.workspaceOverview.mockResolvedValue({...snapshot(),uninitialized:true});
    render(<WorkspaceAllocatedBilling workspaceId="ws-1" />);
    expect(await screen.findByText(/Billing setup is pending/)).toBeInTheDocument();
    expect(screen.queryByText('Allocated subscription credits')).not.toBeInTheDocument();
  });
});
