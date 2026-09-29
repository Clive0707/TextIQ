import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../services/api';
import type { Dataset, Experiment, FeatureConfig, FeatureKind, ModelSpec, PreprocessConfig } from '../types/api';
import { DEFAULT_FEATURE, DEFAULT_PREPROCESS, featureLabel } from '../utils/labels';
import { Button, ButtonLink } from './ui/Button';
import { Disclosure, InfoTip } from './ui/Disclosure';
import { Checkbox, Field, Segmented, Select, TextInput } from './ui/Form';
import { Panel } from './ui/Panel';
import { EmptyState, ErrorNotice, Notice } from './ui/States';

type Props = { datasets: Dataset[]; catalog: ModelSpec[]; onCreated: (run: Experiment) => void; initialModelType?: string };

const WORD_RANGES: [number, number][] = [
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 2],
  [2, 3],
];
const CHAR_RANGES: [number, number][] = [
  [2, 4],
  [3, 5],
  [3, 6],
  [4, 6],
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-space-sm">
      <p className="font-label-sm text-label-sm text-outline">{title}</p>
      {children}
    </div>
  );
}

export function TrainForm({ datasets, catalog, onCreated, initialModelType }: Props) {
  const ready = datasets.filter((d) => d.status === 'ready');
  const [datasetId, setDatasetId] = useState<number | ''>('');
  const [modelType, setModelType] = useState(initialModelType ?? 'linear_svm');
  const [feature, setFeature] = useState<FeatureConfig>(DEFAULT_FEATURE);
  const [prep, setPrep] = useState<PreprocessConfig>(DEFAULT_PREPROCESS);
  const [hyper, setHyper] = useState<Record<string, string | boolean>>({});
  const [testSize, setTestSize] = useState('0.2');
  const [cvFolds, setCvFolds] = useState('0');
  const [seed, setSeed] = useState('42');
  const [cap, setCap] = useState('');
  const [name, setName] = useState('');
  const [tune, setTune] = useState(true);
  const [balance, setBalance] = useState<'none' | 'oversample'>('none');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const spec = useMemo(() => catalog.find((m) => m.type === modelType), [catalog, modelType]);

  useEffect(() => {
    if (datasetId === '' && ready.length) setDatasetId(ready[0].id);
  }, [ready, datasetId]);

  useEffect(() => {
    if (spec) setHyper(Object.fromEntries(spec.hyperparameters.map((h) => [h.name, h.type === 'bool' ? Boolean(h.default) : String(h.default)])));
  }, [spec]);

  const setKind = (kind: FeatureKind) =>
    setFeature((f) => ({ ...f, kind, ngram_min: kind === 'char' ? 3 : 1, ngram_max: kind === 'char' ? 5 : kind === 'bow' ? 1 : 2, sublinear_tf: kind !== 'bow' }));

  const ranges = feature.kind === 'char' ? CHAR_RANGES : WORD_RANGES;
  const rangeKey = `${feature.ngram_min}-${feature.ngram_max}`;

  const submit = async () => {
    if (datasetId === '' || !spec) return;
    setPending(true);
    setError(null);
    const hp: Record<string, number | boolean> = {};
    for (const h of spec.hyperparameters) {
      const raw = hyper[h.name];
      if (h.type === 'bool') {
        hp[h.name] = Boolean(raw);
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        setError(new ApiError('invalid_field', `${h.label} must be a number.`));
        setPending(false);
        return;
      }
      hp[h.name] = v;
    }
    try {
      const run = await api.train({
        name: name.trim() || undefined,
        dataset_id: datasetId,
        model_type: spec.type,
        feature: { ...feature, max_features: feature.max_features || null },
        preprocessing: prep,
        hyperparameters: hp,
        test_size: Number(testSize),
        cv_folds: Number(cvFolds),
        random_state: Number(seed) || 0,
        max_train_samples: cap.trim() ? Number(cap) : null,
        tune,
        train_balance: balance,
      });
      onCreated(run);
      setName('');
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setPending(false);
    }
  };

  if (!ready.length) {
    return (
      <Panel>
        <EmptyState icon="database" title="No dataset ready for training" action={<ButtonLink to="/dataset" variant="primary" icon="database">Open Dataset</ButtonLink>}>
          Load a built-in dataset or upload a labelled CSV first.
        </EmptyState>
      </Panel>
    );
  }

  const numberParams = spec?.hyperparameters.filter((h) => h.type !== 'bool') ?? [];
  const boolParams = spec?.hyperparameters.filter((h) => h.type === 'bool') ?? [];

  return (
    <Panel className="flex flex-col gap-space-lg max-w-3xl">
      {/* Basic configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <Field label="Dataset">
          <Select value={datasetId} onChange={(e) => setDatasetId(Number(e.target.value))} aria-label="Dataset">
            {ready.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {(d.validation?.usable_rows ?? d.n_rows).toLocaleString()} docs
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={
            <span className="inline-flex items-center gap-1">
              Model {spec && <InfoTip>{spec.description} Confidence: {spec.probability_method}.</InfoTip>}
            </span>
          }
        >
          <Select value={modelType} onChange={(e) => setModelType(e.target.value)} aria-label="Model">
            {catalog.map((m) => (
              <option key={m.type} value={m.type}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Feature extraction">
          <Segmented
            value={feature.kind}
            onChange={setKind}
            options={[
              { value: 'tfidf', label: 'TF-IDF' },
              { value: 'combo', label: 'Words + chars' },
              { value: 'bow', label: 'Bag of Words' },
              { value: 'char', label: 'Characters' },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-space-md">
          <Field label={feature.kind === 'char' ? 'Character n-grams' : 'Word n-grams'}>
            <Select
              value={rangeKey}
              onChange={(e) => {
                const [a, b] = e.target.value.split('-').map(Number);
                setFeature((f) => ({ ...f, ngram_min: a, ngram_max: b }));
              }}
              aria-label="N-gram range"
            >
              {ranges.map(([a, b]) => (
                <option key={`${a}-${b}`} value={`${a}-${b}`}>
                  {a === b ? `${a} only` : `${a} to ${b}`}
                </option>
              ))}
              {!ranges.some(([a, b]) => `${a}-${b}` === rangeKey) && <option value={rangeKey}>{`${feature.ngram_min} to ${feature.ngram_max}`}</option>}
            </Select>
          </Field>
          <Field label="Test split">
            <Select value={testSize} onChange={(e) => setTestSize(e.target.value)} aria-label="Test split">
              {['0.1', '0.2', '0.25', '0.3'].map((v) => (
                <option key={v} value={v}>
                  {Math.round(Number(v) * 100)}% held out
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-space-sm gap-y-1">
        <Checkbox label="Tune hyperparameters" checked={tune} onChange={setTune} />
        <span className="font-label-sm text-label-sm text-outline">
          {spec && Object.keys(spec.grid).length
            ? `3-fold cross-validation on the training split only · tries ${Object.entries(spec.grid).map(([k, v]) => `${k} ∈ {${v.map((x) => (k === 'gamma' && !x ? 'scale' : x)).join(', ')}}`).join(', ')}`
            : ''}
        </span>
      </div>

      {spec?.cost_note && (
        <Notice icon="schedule" tone="warning">
          {spec.cost_note}
        </Notice>
      )}

      {/* Advanced configuration */}
      <Disclosure title="Advanced settings" summary={`${featureLabel(feature)} · ${numberParams.map((h) => `${h.name}=${hyper[h.name]}`).join(', ')}`}>
        <div className="flex flex-col gap-space-lg pl-space-lg border-l border-outline-variant/20">
          {spec && spec.hyperparameters.length > 0 && (
            <Group title="Model parameters">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-space-sm">
                {numberParams.map((h) => (
                  <Field key={h.name} label={h.label}>
                    <TextInput type="number" step={h.step} min={h.min} max={h.max} value={String(hyper[h.name] ?? '')} title={`${h.help} Range ${h.min}–${h.max}.`} onChange={(e) => setHyper((v) => ({ ...v, [h.name]: e.target.value }))} />
                  </Field>
                ))}
              </div>
              {boolParams.map((h) => (
                <Checkbox key={h.name} label={h.label} title={h.help} checked={Boolean(hyper[h.name])} onChange={(v) => setHyper((p) => ({ ...p, [h.name]: v }))} />
              ))}
              {spec.type.endsWith('svm') || spec.type === 'cnb' ? <p className="font-label-sm text-label-sm text-outline">Probabilities are calibrated with CalibratedClassifierCV (sigmoid, 3-fold).</p> : null}
            </Group>
          )}

          <Group title="Features">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-space-sm">
              <Field label="Max features" hint="blank = all">
                <TextInput type="number" min={100} value={feature.max_features ?? ''} onChange={(e) => setFeature((f) => ({ ...f, max_features: e.target.value ? Number(e.target.value) : null }))} />
              </Field>
              <Field label="Min doc freq.">
                <TextInput type="number" min={1} max={50} value={feature.min_df} onChange={(e) => setFeature((f) => ({ ...f, min_df: Number(e.target.value) || 1 }))} />
              </Field>
            </div>
            {feature.kind !== 'bow' && <Checkbox label="Sublinear TF scaling (1 + log tf)" checked={feature.sublinear_tf} onChange={(v) => setFeature((f) => ({ ...f, sublinear_tf: v }))} />}
          </Group>

          <Group title="Preprocessing">
            <div className="grid grid-cols-2 gap-y-space-sm gap-x-space-md">
              <Checkbox label="Lowercase" checked={prep.lowercase} onChange={(v) => setPrep((p) => ({ ...p, lowercase: v }))} />
              <Checkbox label="Remove punctuation" checked={prep.remove_punctuation} onChange={(v) => setPrep((p) => ({ ...p, remove_punctuation: v }))} />
              <Checkbox label="Remove stop words" checked={prep.remove_stopwords} onChange={(v) => setPrep((p) => ({ ...p, remove_stopwords: v }))} />
              <Checkbox label="Porter stemming" checked={prep.stemming} onChange={(v) => setPrep((p) => ({ ...p, stemming: v }))} />
            </div>
          </Group>

          <Group title="Training balance">
            <Select value={balance} onChange={(e) => setBalance(e.target.value as 'none' | 'oversample')} aria-label="Training balance">
              <option value="none">None — train on unique documents as they are</option>
              <option value="oversample">Oversample smaller categories (training split only)</option>
            </Select>
            <p className="font-label-sm text-label-sm text-outline">Duplicates are always removed before the split. Oversampling repeats training documents only after tuning, so no copy reaches the test set or a CV fold.</p>
          </Group>

          <Group title="Evaluation & run">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm">
              <Field label="Cross-validation">
                <Select value={cvFolds} onChange={(e) => setCvFolds(e.target.value)}>
                  <option value="0">None</option>
                  {['3', '5', '10'].map((v) => (
                    <option key={v} value={v}>
                      {v}-fold
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Random seed">
                <TextInput type="number" min={0} value={seed} onChange={(e) => setSeed(e.target.value)} />
              </Field>
              <Field label="Max training docs" hint="optional">
                <TextInput type="number" min={50} placeholder="all" value={cap} onChange={(e) => setCap(e.target.value)} />
              </Field>
              <Field label="Run name" hint="optional">
                <TextInput maxLength={120} placeholder={spec ? spec.short_name : ''} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
          </Group>
        </div>
      </Disclosure>

      {error && <ErrorNotice error={error} title="The run could not be started." />}
      <div className="flex items-center justify-between gap-space-md pt-space-sm border-t border-outline-variant/15">
        <span className="font-label-sm text-label-sm text-outline truncate">
          {spec?.name} · {featureLabel(feature)} · {Math.round(Number(testSize) * 100)}% test{tune ? ' · tuned' : ''}
        </span>
        <Button variant="primary-lg" icon="model_training" loading={pending} onClick={submit}>
          Start training
        </Button>
      </div>
    </Panel>
  );
}
