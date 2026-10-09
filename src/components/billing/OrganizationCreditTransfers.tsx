import React from 'react';
import { billingClient } from '../../lib/billing/client';
import ManualCreditTransfer from './ManualCreditTransfer';

/** Resolve organization identity from authenticated billing context, not user input. */
export default function OrganizationCreditTransfers() {
  const [orgId, setOrgId] = React.useState('');
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let active = true;
    billingClient.organizationOverview().then(data => {
      if (active) setOrgId(data.orgId);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load organization billing.');
    });
    return () => { active = false; };
  }, []);
  if (error) return <p role="alert" className="text-xs text-rose-600">{error}</p>;
  if (!orgId) return <p className="text-xs text-slate-500">Loading organization credit transfers…</p>;
  return <ManualCreditTransfer orgId={orgId} />;
}
