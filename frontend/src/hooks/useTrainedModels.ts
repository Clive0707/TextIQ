import { useMemo } from 'react';
import { api } from '../services/api';
import type { ModelSpec } from '../types/api';
import { useAsync } from './useAsync';

/** Completed model runs, the four usable (deployed) ones, and the classifier catalogue. */
export function useTrainedModels() {
  const runs = useAsync(() => api.models());
  const catalog = useAsync(() => api.modelCatalog());
  const completed = useMemo(() => (runs.data ?? []).filter((r) => r.status === 'completed' && r.has_artifact), [runs.data]);
  const usable = useMemo(() => completed.filter((r) => r.is_deployed), [completed]);
  const active = usable.find((r) => r.is_active) ?? null;
  return {
    completed,
    usable,
    active,
    catalog: catalog.data ?? ([] as ModelSpec[]),
    loading: runs.loading || catalog.loading,
    error: runs.error ?? catalog.error,
    reload: runs.reload,
  };
}
