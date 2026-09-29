import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart } from '../charts/BarChart';
import { ConfusionMatrix } from '../charts/ConfusionMatrix';
import { MetricBar } from '../components/ui/Bars';
import { ButtonLink } from '../components/ui/Button';
import { StatusDot } from '../components/ui/Chip';
import { InfoTip, Tabs } from '../components/ui/Disclosure';
import { Select } from '../components/ui/Form';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState, ErrorNotice, LoadingRows, Notice } from '../components/ui/States';
import { NumTd, TBody, THead, Table, Td, Th, Tr } from '../components/ui/Table';
import { useAsync } from '../hooks/useAsync';
import { api } from '../services/api';
import type { Dataset, Experiment, Metrics, ModelSpec, PerClassMetric, TextIQReport } from '../types/api';
import { fmtDateTime, fmtInt, fmtPct, fmtScore } from '../utils/format';

type View = 'comparison' | 'confusion' | 'perclass' | 'dataset' | 'experiments';

const METRICS: { key: keyof Metrics; label: string; help: string }[] = [
  { key: 'accuracy', label: 'Accuracy', help: 'Share of test documents classified correctly.' },
  { key: 'precision_macro', label: 'Precision (macro)', help: 'Of the documents predicted as a category, how many belonged to it — averaged equally over categories.' },
  { key: 'recall_macro', label: 'Recall (macro)', help: 'Of the documents in a category, how many were found — averaged equally over categories.' },
  { key: 'f1_macro', label: 'F1 (macro)', help: 'Harmonic mean of precision and recall, averaged equally over categories.' },
];

const PCT_TICKS = [0, 0.25, 0.5, 0.75, 1];
const fmtTick = (v: number) => `${Math.round(v * 100)}%`;

/** The four usable (deployed) models, in catalogue order. */
function usableModels(runs: Experiment[], catalog: ModelSpec[]) {
  return catalog.map((spec) => runs.find((r) => r.model_type === spec.type && r.is_deployed && r.metrics)).filter((r): r is Experiment => !!r);
}

function hpText(r: Experiment) {
  return Object.entries(r.hyperparameters)
    .filter(([k, v]) => !(k === 'balanced' && !v))
    .map(([k, v]) => `${k}=${k === 'gamma' && !v ? 'scale' : v}`)
    .join(', ');
}

/* ---------------------------------------------------------------- comparison */

function ComparisonView({ best }: { best: Experiment[] }) {
  if (!best.length) return <EmptyState icon="leaderboard" title="No completed runs on this dataset" />;
  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-lg">
        {METRICS.map((m) => {
          const top = Math.max(...best.map((r) => r.metrics![m.key] as number));
          return (
            <Panel key={m.key}>
              <PanelHeader title={m.label} meta={<InfoTip>{m.help}</InfoTip>} />
              <div className="mt-space-md">
                <BarChart
                  ariaLabel={`${m.label} by model`}
                  max={1}
                  ticks={PCT_TICKS}
                  formatTick={fmtTick}
                  labelWidth={170}
                  data={best.map((r) => {
                    const v = r.metrics![m.key] as number;
                    return { key: String(r.id), label: r.model_name, value: v, display: fmtPct(v), emphasis: v === top, detail: `${r.feature_label} · run #${r.id}` };
                  })}
                />
              </div>
            </Panel>
          );
        })}
      </div>
      <Panel>
        <PanelHeader title="Results table" meta="The four models in use · held-out test split" />
        <div className="mt-space-sm">
          <Table>
            <THead>
              <Th>Model</Th>
              <Th align="right">Accuracy</Th>
              <Th align="right">Precision</Th>
              <Th align="right">Recall</Th>
              <Th align="right">F1</Th>
              <Th align="right">CV F1</Th>
              <Th>Parameters</Th>
            </THead>
            <TBody>
              {best.map((r) => {
                const m = r.metrics!;
                return (
                  <Tr key={r.id}>
                    <Td className="text-on-surface">
                      <Link to={`/models?id=${r.id}`} className="flex items-start gap-2 hover:text-primary">
                        <span className="mt-1.5">
                          <StatusDot active={r.is_active} />
                        </span>
                        <span>
                          <span className="block">{r.model_name}</span>
                          <span className="block font-label-sm text-label-sm text-outline">{r.feature_label}</span>
                        </span>
                      </Link>
                    </Td>
                    <NumTd>{fmtPct(m.accuracy)}</NumTd>
                    <NumTd>{fmtScore(m.precision_macro)}</NumTd>
                    <NumTd>{fmtScore(m.recall_macro)}</NumTd>
                    <NumTd>{fmtScore(m.f1_macro)}</NumTd>
                    <NumTd muted>{m.tuning ? fmtScore(m.tuning.best_cv_score) : m.cv_f1_macro_mean != null ? fmtScore(m.cv_f1_macro_mean) : '—'}</NumTd>
                    <Td className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">
                      {hpText(r)}
                      {r.tune && <span className="block text-outline">tuned, {m.tuning?.folds ?? 3}-fold CV</span>}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
        <div className="mt-space-md">
          <Notice>Precision, recall and F1 are macro-averaged. CV F1 is the tuning score on the training split; every other number is measured once on the unseen test split.</Notice>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- per class */

type SortKey = 'label' | 'f1' | 'precision' | 'recall' | 'support';

function PerClassView({ model }: { model: Experiment }) {
  const m = model.metrics!;
  const [sort, setSort] = useState<SortKey>('f1');
  const rows = [...m.per_class].sort((a, b) => (sort === 'label' ? a.label.localeCompare(b.label) : (b[sort] as number) - (a[sort] as number)));
  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <Th align={align}>
      <button onClick={() => setSort(key)} className={`uppercase tracking-wider ${sort === key ? 'text-on-surface' : 'hover:text-on-surface'}`}>
        {label}
        {sort === key ? ' ↓' : ''}
      </button>
    </Th>
  );
  const avg = (label: string, p: number, r: number, f: number) => (
    <Tr className="bg-surface-container-lowest/40">
      <Td className="text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">{label}</Td>
      <NumTd>{fmtScore(p)}</NumTd>
      <NumTd>{fmtScore(r)}</NumTd>
      <NumTd>{fmtScore(f)}</NumTd>
      <NumTd muted>{fmtInt(m.n_test)}</NumTd>
    </Tr>
  );
  const byF1: PerClassMetric[] = [...m.per_class].sort((a, b) => b.f1 - a.f1);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
      <Panel className="xl:col-span-5">
        <PanelHeader title="F1 by category" meta={model.model_name} />
        <div className="mt-space-md">
          <BarChart
            ariaLabel="F1 score by category"
            max={1}
            ticks={PCT_TICKS}
            formatTick={fmtTick}
            data={byF1.map((c, i) => ({ key: c.label, label: c.label, value: c.f1, display: fmtScore(c.f1, 2), emphasis: i === 0, detail: `precision ${fmtScore(c.precision, 2)} · recall ${fmtScore(c.recall, 2)} · ${fmtInt(c.support)} test docs` }))}
          />
        </div>
      </Panel>
      <Panel className="xl:col-span-7">
        <PanelHeader title="Per-class metrics" meta={<InfoTip>Overall accuracy can hide weak categories. Macro averages treat every category equally; weighted averages weight by test-set support.</InfoTip>} />
        <div className="mt-space-sm">
          <Table>
            <THead>
              {header('label', 'Category', 'left')}
              {header('precision', 'Precision')}
              {header('recall', 'Recall')}
              {header('f1', 'F1')}
              {header('support', 'Support')}
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.label}>
                  <Td className="text-on-surface whitespace-nowrap">{r.label}</Td>
                  <NumTd>{fmtScore(r.precision)}</NumTd>
                  <NumTd>{fmtScore(r.recall)}</NumTd>
                  <Td align="right" className="w-40">
                    <div className="flex items-center gap-space-sm justify-end">
                      <div className="w-20">
                        <MetricBar value={r.f1} best={r.f1 >= 0.85} />
                      </div>
                      <span className="font-label-md text-label-md text-on-surface tabular w-10 text-right">{fmtScore(r.f1, 2)}</span>
                    </div>
                  </Td>
                  <NumTd muted>{fmtInt(r.support)}</NumTd>
                </Tr>
              ))}
              {avg('Macro avg', m.precision_macro, m.recall_macro, m.f1_macro)}
              {avg('Weighted avg', m.precision_weighted, m.recall_weighted, m.f1_weighted)}
            </TBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- dataset */

function DatasetView({ dataset, model }: { dataset: Dataset | null; model: Experiment | null }) {
  if (!dataset) return <LoadingRows rows={6} />;
  const v = dataset.validation;
  const q = dataset.quality && 'kind' in dataset.quality && dataset.quality.kind === 'textiq' ? (dataset.quality as TextIQReport) : null;
  const dist = dataset.class_distribution ?? [];
  const maxRows = Math.max(1, ...dist.map((c) => c.count));
  const split = model?.metrics?.split_counts;
  return (
    <div className="flex flex-col gap-space-lg">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
        <StatCard label="Rows in file" value={fmtInt(dataset.n_rows)} meta={dataset.name} />
        <StatCard label="Unique documents" value={fmtInt(v?.unique_rows ?? dataset.n_rows)} meta="used for train + test" metaTone="primary" />
        <StatCard label="Categories" value={dataset.n_classes ?? '—'} />
        <StatCard label="Median length" value={v?.words ? `${v.words.median} words` : '—'} meta={v?.words ? `range ${v.words.min}–${v.words.max}` : undefined} />
      </section>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-lg items-start">
        <Panel>
          <PanelHeader title="Category distribution" meta="Rows in file" />
          <div className="mt-space-md">
            <BarChart
              ariaLabel="Rows per category"
              max={maxRows}
              ticks={[0, maxRows / 2, maxRows]}
              formatTick={(t) => fmtInt(Math.round(t))}
              data={dist.map((c) => ({ key: c.label, label: c.label, value: c.count, display: fmtInt(c.count), detail: c.unique != null ? `${fmtInt(c.unique)} unique documents` : undefined }))}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Unique documents per category" meta="After removing duplicates" />
          <div className="mt-space-md">
            <BarChart
              ariaLabel="Unique documents per category"
              max={maxRows}
              ticks={[0, maxRows / 2, maxRows]}
              formatTick={(t) => fmtInt(Math.round(t))}
              data={dist.map((c) => ({ key: c.label, label: c.label, value: c.unique ?? c.count, display: fmtInt(c.unique ?? c.count), detail: `${fmtPct((c.unique ?? c.count) / c.count, 0)} of ${fmtInt(c.count)} rows are unique` }))}
            />
          </div>
          <div className="mt-space-md">
            <Notice>Same axis as the left chart. The gap shows how many rows were repeated copies; only unique documents are split into training and test sets.</Notice>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-lg items-start">
        <Panel>
          <PanelHeader title="Quality checks" />
          <dl className="mt-space-md grid grid-cols-2 gap-x-space-xl gap-y-space-sm font-body-sm text-body-sm">
            {[
              ['Missing text', fmtInt(v?.empty_text_rows ?? 0)],
              ['Missing category', fmtInt(v?.missing_label_rows ?? 0)],
              ['Duplicate texts', fmtInt(v?.duplicate_rows ?? 0)],
              ['Exact copies (text, link, date)', q ? fmtInt(q.exact_copies) : '—'],
              ['Conflicting labels', fmtInt(v?.conflicting_rows ?? 0)],
              ['Duplicate ids', v?.duplicate_ids != null ? fmtInt(v.duplicate_ids) : '—'],
              ['Texts under 3 words', fmtInt(v?.short_rows ?? 0)],
              ['Mean length', v?.words ? `${v.words.mean} words` : '—'],
            ].map(([k, val]) => (
              <div key={k} className="flex items-baseline justify-between gap-space-md border-b border-outline-variant/15 pb-1.5">
                <dt className="font-label-sm text-label-sm text-outline">{k}</dt>
                <dd className="text-on-surface tabular">{val}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel>
          <PanelHeader title="Train / test split" meta={model ? `${model.model_name} · run #${model.id}` : undefined} />
          {split ? (
            <div className="mt-space-sm">
              <Table>
                <THead>
                  <Th>Category</Th>
                  <Th align="right">Train</Th>
                  <Th align="right">Test</Th>
                </THead>
                <TBody>
                  {Object.entries(split).map(([label, c]) => (
                    <Tr key={label}>
                      <Td className="text-on-surface">{label}</Td>
                      <NumTd>{fmtInt(c.train)}</NumTd>
                      <NumTd>{fmtInt(c.test)}</NumTd>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">Split counts are recorded for runs trained after the duplicate-aware pipeline was introduced.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- experiments */

function ExperimentsView({ runs }: { runs: Experiment[] }) {
  return (
    <Panel>
      <PanelHeader title="Experiment results" meta={<Link to="/experiments" className="hover:text-on-surface">Open Experiments →</Link>} />
      <div className="mt-space-sm">
        <Table>
          <THead>
            <Th>Run</Th>
            <Th>Features</Th>
            <Th>Parameters</Th>
            <Th align="right">Train / test</Th>
            <Th align="right">Accuracy</Th>
            <Th align="right">Precision</Th>
            <Th align="right">Recall</Th>
            <Th align="right">F1</Th>
            <Th align="right">Date</Th>
          </THead>
          <TBody>
            {runs.map((r) => {
              const m = r.metrics!;
              return (
                <Tr key={r.id}>
                  <Td className="text-on-surface">
                    <span className="block">{r.model_name}</span>
                    <span className="block font-label-sm text-label-sm text-outline">#{r.id}</span>
                  </Td>
                  <Td className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">{r.feature_label}</Td>
                  <Td className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">{hpText(r)}{r.tune ? ' · tuned' : ''}{r.train_balance === 'oversample' ? ' · oversampled' : ''}</Td>
                  <NumTd muted>
                    {fmtInt(m.n_train)} / {fmtInt(m.n_test)}
                  </NumTd>
                  <NumTd>{fmtPct(m.accuracy)}</NumTd>
                  <NumTd>{fmtScore(m.precision_macro)}</NumTd>
                  <NumTd>{fmtScore(m.recall_macro)}</NumTd>
                  <NumTd>{fmtScore(m.f1_macro)}</NumTd>
                  <Td align="right" className="font-label-sm text-label-sm text-outline whitespace-nowrap">
                    {fmtDateTime(r.completed_at)}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- page */

export default function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get('model')) || undefined;
  const models = useAsync(() => api.models());
  const catalog = useAsync(() => api.modelCatalog());
  const { data, error, loading, reload } = useAsync(() => api.analytics(requested), [requested]);
  const datasets = useAsync(() => api.datasets());
  const [view, setView] = useState<View>((params.get('view') as View) || 'comparison');

  const model = data?.model ?? null;
  const m = model?.metrics ?? null;
  const dataset = datasets.data?.find((d) => d.id === model?.dataset_id) ?? null;
  const sameDataset = useMemo(() => (models.data ?? []).filter((r) => r.status === 'completed' && r.metrics && r.dataset_id === model?.dataset_id), [models.data, model]);
  const best = useMemo(() => usableModels(sameDataset, catalog.data ?? []), [sameDataset, catalog.data]);

  if (!loading && !model && !error) {
    return (
      <div className="flex flex-col w-full gap-space-xl">
        <PageHeader title="Analytics" description="Model performance, per-category results and the dataset behind them." divider={false} />
        <Panel>
          <EmptyState icon="analytics" title="Nothing to analyse yet" action={<ButtonLink to="/models?tab=train" variant="primary" icon="model_training">Train a model</ButtonLink>}>
            Analytics come from real evaluation runs. Train a model to see its results here.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const needsModel = view === 'confusion' || view === 'perclass';

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <PageHeader
        breadcrumb={['Evaluation', dataset?.name ?? '…']}
        title="Analytics"
        description="Model performance, per-category results and the dataset behind them — all measured on the held-out test split."
        divider={false}
        actions={
          <div className="flex flex-wrap items-center gap-space-sm">
          <a href={api.reportUrl()} download className="inline-flex items-center gap-1.5 px-space-md py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary font-body-sm text-body-sm font-medium transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              picture_as_pdf
            </span>
            Download PDF report
          </a>
          <div className="w-80 max-w-full">
            <Select value={model?.id ?? ''} onChange={(e) => setParams({ model: e.target.value, view })} aria-label="Model to inspect" disabled={!best.length}>
              {(model && !best.some((b) => b.id === model.id) ? [...best, model] : best).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.model_name} · {r.feature_label}
                  {r.is_active ? ' (default)' : r.is_deployed ? '' : ` (history, run #${r.id})`}
                </option>
              ))}
            </Select>
          </div>
          </div>
        }
      />
      {error && <ErrorNotice error={error} title="Unable to load analytics." onRetry={reload} />}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
        <StatCard label="Accuracy" loading={loading} value={fmtPct(m?.accuracy)} meta={model?.model_name} />
        <StatCard label="Precision" loading={loading} value={fmtScore(m?.precision_macro)} meta="macro" />
        <StatCard label="Recall" loading={loading} value={fmtScore(m?.recall_macro)} meta="macro" />
        <StatCard label="F1 score" loading={loading} value={fmtScore(m?.f1_macro)} meta={m ? `${fmtInt(m.n_test)} test docs` : undefined} metaTone="primary" />
      </section>

      <Tabs
        value={view}
        onChange={(v) => {
          setView(v);
          setParams(model ? { model: String(model.id), view: v } : { view: v });
        }}
        tabs={[
          { value: 'comparison', label: 'Model comparison', hint: String(best.length) },
          { value: 'confusion', label: 'Confusion matrix' },
          { value: 'perclass', label: 'Per-class performance' },
          { value: 'dataset', label: 'Dataset' },
          { value: 'experiments', label: 'Experiments', hint: String(sameDataset.length) },
        ]}
      />
      {needsModel && model && <p className="-mt-space-sm font-label-sm text-label-sm text-outline">Showing {model.model_name} · {model.feature_label} — choose another model at the top right.</p>}

      <div role="tabpanel" className="animate-fade-in" key={view}>
        {loading && !data ? (
          <Panel>
            <LoadingRows rows={8} />
          </Panel>
        ) : (
          <>
            {view === 'comparison' && <ComparisonView best={best} />}
            {view === 'confusion' && m && (
              <Panel>
                <PanelHeader title="Confusion matrix" meta={`${model!.model_name} · ${fmtInt(m.n_test)} test documents`} description="Rows are the true category, columns the predicted one. Off-diagonal cells show which categories get confused." />
                <ConfusionMatrix labels={m.confusion_matrix.labels} matrix={m.confusion_matrix.matrix} />
              </Panel>
            )}
            {view === 'perclass' && model && m && <PerClassView model={model} />}
            {view === 'dataset' && <DatasetView dataset={dataset} model={model} />}
            {view === 'experiments' && <ExperimentsView runs={sameDataset} />}
          </>
        )}
      </div>
    </div>
  );
}
