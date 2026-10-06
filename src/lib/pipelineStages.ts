import { useEffect, useState } from 'react';
import { PipelineStageLabel } from '../types';
import { apiFetch } from './api';

// The universal contact -> campaign -> lead -> opportunity -> client
// progression, worded for this org's own industry (see backend's
// GET /api/settings/pipeline-stages / industryPacks.js's
// getPipelineStageLabels). Fetched once per mount and cached in state —
// cheap, small, rarely changes — rather than threading it through props
// from App.tsx, so any page that needs stage labels can just call this.
const FALLBACK_STAGES: PipelineStageLabel[] = [
  { key: 'contact', label: 'Contact' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'lead', label: 'Lead' },
  { key: 'opportunity', label: 'Opportunity' },
  { key: 'client', label: 'Client' },
];

export function usePipelineStages(): { stages: PipelineStageLabel[]; loading: boolean } {
  const [stages, setStages] = useState<PipelineStageLabel[]>(FALLBACK_STAGES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/settings/pipeline-stages')
      .then((r) => (r.ok ? r.json() : null))
      .then((result: { stages: PipelineStageLabel[] } | null) => {
        if (!cancelled && Array.isArray(result?.stages) && result.stages.length) setStages(result.stages);
      })
      .catch(() => { /* keep the fallback */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { stages, loading };
}

export function stageLabel(stages: PipelineStageLabel[], key?: string): string {
  return stages.find((s) => s.key === key)?.label || stages.find((s) => s.key === 'contact')?.label || 'Contact';
}
