import { useMemo } from 'react';
import type { Experiment } from '../types/api';
import { fmtPct } from '../utils/format';
import { FieldCard, Select } from './ui/Form';

/**
 * One dropdown of trained models ("Linear SVM · TF-IDF (1,2-gram)"), active model first.
 * Replaces the separate classifier + representation pickers: a trained model already
 * fixes both, so a single choice is simpler and can never be an untrained combination.
 */
export function ModelSelect({ models, value, onChange, disabled }: { models: Experiment[]; value: number | null; onChange: (id: number) => void; disabled?: boolean }) {
  const sorted = useMemo(
    () => [...models].sort((a, b) => Number(b.is_active) - Number(a.is_active) || (b.metrics?.f1_macro ?? 0) - (a.metrics?.f1_macro ?? 0)),
    [models],
  );
  const combos = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of models) n.set(`${m.model_type}|${m.feature_label}|${m.dataset_id}`, (n.get(`${m.model_type}|${m.feature_label}|${m.dataset_id}`) ?? 0) + 1);
    return n;
  }, [models]);
  const datasets = new Set(models.map((m) => m.dataset_id)).size;
  const selected = models.find((m) => m.id === value);

  const label = (m: Experiment) => {
    const dup = (combos.get(`${m.model_type}|${m.feature_label}|${m.dataset_id}`) ?? 0) > 1;
    return [m.model_name, m.feature_label, datasets > 1 ? m.dataset_name : null, dup ? `run #${m.id}` : null].filter(Boolean).join(' · ') + (m.is_active ? '  (active)' : '');
  };

  return (
    <FieldCard label="Model" hint={selected?.metrics ? `${fmtPct(selected.metrics.accuracy)} test accuracy` : undefined}>
      <Select value={value ?? ''} disabled={disabled || !models.length} onChange={(e) => onChange(Number(e.target.value))} aria-label="Model">
        {sorted.map((m) => (
          <option key={m.id} value={m.id}>
            {label(m)}
          </option>
        ))}
      </Select>
    </FieldCard>
  );
}
