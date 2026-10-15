import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManualWorkspaceAllocation, {
  formatCreditAmount, unitsFromInput,
} from '../components/billing/ManualWorkspaceAllocation';

const mocks=vi.hoisted(()=>({
  manualAllocationOverview:vi.fn(),
  manualAllocationPreview:vi.fn(),
  confirmManualAllocation:vi.fn(),
}));
vi.mock('../lib/billing/client',()=>({
  BillingApiError: class extends Error { refreshRequired = false; },
  billingClient:{
    manualAllocationOverview:mocks.manualAllocationOverview,
    manualAllocationPreview:mocks.manualAllocationPreview,
    confirmManualAllocation:mocks.confirmManualAllocation,
  },
  createBillingMutation:(send: (options: { idempotencyKey: string; expectedVersion?: number }) => Promise<unknown>, expectedVersion?:number) =>
    ({ execute: () => send({idempotencyKey:'fixed-test-key',expectedVersion}) }),
}));

const snapshot={
  uninitialized:false,writable:true,transfersEnabled:false,
  workspaces:[{id:'ws-1',name:'Operations',status:'Active'},
    {id:'ws-2',name:'Inactive',status:'Suspended'}],
  balances:[{ownerType:'organization',ownerId:'org-1',kind:'subscription',
    available:{asset:'INR',units:'9000',scale:2},held:{asset:'INR',units:'1000',scale:2}},
    {ownerType:'workspace',ownerId:'ws-1',kind:'subscription',
    available:{asset:'INR',units:'500',scale:2},held:{asset:'INR',units:'0',scale:2}}],
  grants:[{id:'grant-1',kind:'subscription',expiresAt:'2026-11-01T00:00:00.000Z',
    available:{asset:'INR',units:'9000',scale:2},held:{asset:'INR',units:'1000',scale:2},
    positionVersion:4}],
  history:[{id:'entry-1',grantId:'grant-1',workspaceId:'ws-1',workspaceName:'Operations',
    amount:{asset:'INR',units:'300',scale:2},createdAt:'2026-10-10T12:00:00.000Z',actorId:'admin-1'}],
};
const preview={
  grantId:'grant-1',workspaceId:'ws-1',workspaceName:'Operations',kind:'subscription',
  amount:{asset:'INR',units:'2500',scale:2},remaining:{asset:'INR',units:'6500',scale:2},
  expiresAt:'2026-11-01T00:00:00.000Z',expectedPositionVersion:4,transfersEnabled:false,
};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.manualAllocationOverview.mockResolvedValue(snapshot);
  mocks.manualAllocationPreview.mockResolvedValue(preview);
  mocks.confirmManualAllocation.mockResolvedValue({journalId:'journal-3',grantId:'grant-1'});
});
afterEach(cleanup);

describe('manual organization credit allocation',()=>{
  it('omits the onboarding walkthrough and preserves the credit pool', async () => {
    render(<ManualWorkspaceAllocation />);
    expect(screen.queryByText('Give credits to your workspaces')).not.toBeInTheDocument();
    expect(screen.queryByText('Pick a workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose credits')).not.toBeInTheDocument();
    expect(screen.queryByText('Check and confirm')).not.toBeInTheDocument();
    await screen.findByText('Organization credit pool');
    expect(mocks.confirmManualAllocation).not.toHaveBeenCalled();
  });

  it('keeps exact amounts across large ledger balances and decimal values',()=>{
    expect(formatCreditAmount({asset:'INR',units:'900719925474099312345',scale:2}))
      .toBe('₹90,07,19,92,54,74,09,93,123.45');
    expect(formatCreditAmount({asset:'CREDIT',units:'123456',scale:0})).toBe('CREDIT 1,23,456');
    expect(unitsFromInput('25.5',2)).toBe('2550');
    expect(unitsFromInput('0.01',2)).toBe('1');
    expect(unitsFromInput('0',2)).toBeNull();
    expect(unitsFromInput('1.234',2)).toBeNull();
    expect(unitsFromInput('-1',2)).toBeNull();
    expect(unitsFromInput('1.2',0)).toBeNull();
  });

  it('shows organization-owned pool, workspaces and journal history without enabling transfers',async()=>{
    render(<ManualWorkspaceAllocation/>);
    expect(await screen.findByText('Organization credit pool')).toBeInTheDocument();
    expect(screen.getByText('₹90.00')).toBeInTheDocument();
    expect(screen.getByText('Workspace balances')).toBeInTheDocument();
    expect(screen.getByText('Allocation history')).toBeInTheDocument();
    expect(screen.getByText(/sending credits is not enabled yet/i)).toBeInTheDocument();
    expect(mocks.confirmManualAllocation).not.toHaveBeenCalled();
  });

  it('offers quick allocation amounts, disables unaffordable presets and still requires preview', async () => {
    const enough = { ...snapshot, grants: [{
      ...snapshot.grants[0], available: { asset: 'INR', units: '150000', scale: 2 },
    }] };
    mocks.manualAllocationOverview.mockResolvedValue(enough);
    render(<ManualWorkspaceAllocation />);
    await screen.findByText('Organization credit pool');
    fireEvent.change(screen.getByRole('combobox', { name: 'Destination workspace' }), { target: { value: 'ws-1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Credit source' }), { target: { value: 'grant-1' } });
    const quick = screen.getByRole('button', { name: 'Allocate ₹300' });
    fireEvent.click(quick);
    expect(screen.getByRole('textbox', { name: /Amount to allocate/i })).toHaveValue('300');
    expect(quick).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.confirmManualAllocation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview allocation' }));
    await waitFor(() => expect(mocks.manualAllocationPreview).toHaveBeenCalledWith(
      expect.objectContaining({ amountUnits: '30000' }),
    ));
  });

  it('previews the selected grant and workspace but cannot confirm while transfer flag is off', async()=>{
    render(<ManualWorkspaceAllocation/>);
    await screen.findByText('Organization credit pool');
    fireEvent.change(screen.getByRole('combobox',{name:'Destination workspace'}),{target:{value:'ws-1'}});
    fireEvent.change(screen.getByRole('combobox',{name:'Credit source'}),{target:{value:'grant-1'}});
    fireEvent.change(screen.getByRole('textbox',{name:/Amount to allocate/i}),{target:{value:'25.00'}});
    fireEvent.click(screen.getByRole('button',{name:'Preview allocation'}));
    await waitFor(()=>expect(mocks.manualAllocationPreview).toHaveBeenCalledWith({
      grantId:'grant-1',workspaceId:'ws-1',amountUnits:'2500',expectedPositionVersion:4,
    }));
    expect(await screen.findByText('Review allocation')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Confirm allocation'})).toBeDisabled();
    expect(mocks.confirmManualAllocation).not.toHaveBeenCalled();
  });

  it('uses idempotent backend ledger transfer after explicit preview when enabled',async()=>{
    mocks.manualAllocationOverview.mockResolvedValue({...snapshot,transfersEnabled:true});
    mocks.manualAllocationPreview.mockResolvedValue({...preview,transfersEnabled:true});
    render(<ManualWorkspaceAllocation/>);
    await screen.findByText('Organization credit pool');
    fireEvent.change(screen.getByRole('combobox',{name:'Destination workspace'}),{target:{value:'ws-1'}});
    fireEvent.change(screen.getByRole('combobox',{name:'Credit source'}),{target:{value:'grant-1'}});
    fireEvent.change(screen.getByRole('textbox',{name:/Amount to allocate/i}),{target:{value:'25'}});
    fireEvent.click(screen.getByRole('button',{name:'Preview allocation'}));
    fireEvent.click(await screen.findByRole('button',{name:'Confirm allocation'}));
    await waitFor(()=>expect(mocks.confirmManualAllocation).toHaveBeenCalledWith({
      grantId:'grant-1',workspaceId:'ws-1',amount:preview.amount,expectedPositionVersion:4,
    },{idempotencyKey:'fixed-test-key',expectedVersion:4}));
    expect(await screen.findByText(/Allocation recorded in the credit ledger/i)).toBeInTheDocument();
  });
});
