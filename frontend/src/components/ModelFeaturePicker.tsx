import type { Experiment, FeatureKind, ModelSpec } from '../types/api';
import { fmtInt, fmtPct } from '../utils/format';
import { FieldCard, Select } from './ui/Form';

export const FEATURE_NAMES: Record<FeatureKind, string> = { tfidf: 'TF-IDF', bow: 'Bag of Words', char: 'Character n-grams', combo: 'TF-IDF words + characters' };

type Props = {
  /** The four usable (deployed) runs. */
  usable: Experiment[];
  catalog: ModelSpec[];
  modelType: string;
  onChange: (modelType: string) => void;
  disabled?: boolean;
};

/**
 * "Model" and "Feature representation" cards from the Stitch Classify workspace.
 * TextIQ has exactly four usable models; each one's feature representation was fixed
 * when it was trained, so it is shown rather than chosen.
 */
export function ModelFeaturePicker({ usable, catalog, modelType, onChange, disabled }: Props) {
  const run = usable.find((r) => r.model_type === modelType) ?? null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
      <FieldCard label="Model" hint={run?.metrics ? `${fmtPct(run.metrics.accuracy)} test accuracy` : undefined}>
        <Select value={modelType} disabled={disabled} aria-label="Model" onChange={(e) => onChange(e.target.value)}>
          {catalog.map((m) => {
            const r = usable.find((x) => x.model_type === m.type);
            return (
              <option key={m.type} value={m.type} disabled={!r}>
                {m.name}
                {!r ? ' — not trained' : r.is_active ? '  (default)' : ''}
              </option>
            );
          })}
        </Select>
      </FieldCard>
      <FieldCard label="Feature representation" hint={run?.metrics ? `${fmtInt(run.metrics.n_features)} features` : undefined}>
        <div className="py-1.5 px-space-md rounded bg-surface-container/60 font-body-sm text-body-sm text-on-surface truncate" title="Fixed when this model was trained. Train and deploy another run on the Models page to change it.">
          {run ? run.feature_label : '—'}
        </div>
      </FieldCard>
    </div>
  );
}
