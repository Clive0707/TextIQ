import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RunStatus } from '../components/RunStatus';
import { MetricBar } from '../components/ui/Bars';
import { ButtonLink } from '../components/ui/Button';
import { Select } from '../components/ui/Form';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorNotice, LoadingRows, Notice } from '../components/ui/States';
import { NumTd, TBody, THead, Table, Td, Th, Tr } from '../components/ui/Table';
import { useAsync, useInterval } from '../hooks/useAsync';
import { api } from '../services/api';
import type { Experiment, Metrics } from '../types/api';
import { fmtDateTime, fmtPct, fmtScore, fmtSeconds } from '../utils/format';
import { preprocessSummary } from '../utils/labels';

const MAX_COMPARE = 4;

const METRICS: { key: keyof Metrics; label: string; pct?: boolean }[] = [
  { key: 'accuracy', label: 'Accuracy', pct: true },
  { key: 'precision_macro', label: 'Precision (macro)' },
  { key: 'recall_macro', label: 'Recall (macro)' },
  { key: 'f1_macro', label: 'F1 (macro)' },
  { key: 'f1_weighted', label: 'F1 (weighted)' },
];

function hp(run: Experiment) {
  return Object.entries(run.hyperparameters)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

function Comparison({ runs }: { runs: Experiment[] }) {
  const configRows: [string, (r: Experiment) => string][] = [
    ['Classifier', (r) => r.model_name],
    ['Features', (r) => r.feature_label],
    ['Hyperparameters', (r) => hp(r) || '—'],
    ['Preprocessing', (r) => preprocessSummary(r.preprocessing)],
    ['Dataset', (r) => r.dataset_name],
    ['Split / seed', (r) => `${Math.round(r.test_size * 100)}% test · seed ${r.random_state}`],
    ['Training docs', (r) => (r.metrics ? r.metrics.n_train.toLocaleString() : '—')],
    ['Vocabulary', (r) => (r.metrics ? r.metrics.n_features.toLocaleString() : '—')],
    ['Fit time', (r) => fmtSeconds(r.metrics?.train_seconds)],
    ['CV macro F1', (r) => (r.metrics?.cv_f1_macro_mean != null ? `${fmtScore(r.metrics.cv_f1_macro_mean)} ± ${fmtScore(r.metrics.cv_f1_macro_std)}` : 'not run')],
  ];
  const sameData = new Set(runs.map((r) => r.dataset_id)).size === 1 && new Set(runs.map((r) => `${r.test_size}:${r.random_state}`)).size === 1;

  return (
    <Panel className="animate-fade-up">
      <PanelHeader title="Comparison" meta={`${runs.length} runs`} description="Metrics from each run's held-out test split. Differences in configuration are listed below the metrics." />
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[560px]">
          <thead>
            <tr className="border-b border-outline-variant/25 font-label-sm text-label-sm text-outline uppercase tracking-wider">
              <th className="py-2 pr-3 font-normal w-40">Metric</th>
              {runs.map((r) => (
                <th key={r.id} className="py-2 px-3 font-normal normal-case tracking-normal">
                  <Link to={`/models?id=${r.id}`} className="text-on-surface hover:text-primary font-body-sm text-body-sm block truncate max-w-[180px]">
                    #{r.id} {r.model_name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15 font-body-sm text-body-sm">
            {METRICS.map(({ key, label, pct }) => {
              const values = runs.map((r) => (r.metrics ? (r.metrics[key] as number) : null));
              const best = Math.max(...values.map((v) => v ?? -1));
              return (
                <tr key={key}>
                  <td className="py-2.5 pr-3 font-label-sm text-label-sm text-on-surface-variant">{label}</td>
                  {values.map((v, i) => (
                    <td key={runs[i].id} className="py-2.5 px-3">
                      <div className="flex flex-col gap-1">
                        <span className={`font-label-md text-label-md tabular ${v === best ? 'text-primary' : 'text-on-surface'}`}>{v == null ? '—' : pct ? fmtPct(v) : fmtScore(v)}</span>
                        {v != null && <MetricBar value={v} best={v === best} />}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
            {configRows.map(([label, get]) => {
              const vals = runs.map(get);
              const differs = new Set(vals).size > 1;
              return (
                <tr key={label}>
                  <td className="py-2 pr-3 font-label-sm text-label-sm text-outline">{label}</td>
                  {vals.map((v, i) => (
                    <td key={runs[i].id} className={`py-2 px-3 font-label-sm text-label-sm ${differs ? 'text-on-surface' : 'text-outline'}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!sameData && (
        <div className="mt-space-md">
          <Notice tone="warning">These runs use different datasets, test splits or seeds, so their scores were measured on different documents and are not directly comparable.</Notice>
        </div>
      )}
    </Panel>
  );
}

export default function ExperimentsPage() {
  const runs = useAsync(() => api.experiments());
  const [selected, setSelected] = useState<number[]>([]);
  const [datasetFilter, setDatasetFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const busy = (runs.data ?? []).some((r) => r.status === 'queued' || r.status === 'running');
  useInterval(() => void runs.reload(), 2000, busy);

  const datasets = useMemo(() => [...new Map((runs.data ?? []).map((r) => [r.dataset_id, r.dataset_name])).entries()], [runs.data]);
  const visible = (runs.data ?? []).filter((r) => (datasetFilter === 'all' || String(r.dataset_id) === datasetFilter) && (statusFilter === 'all' || r.status === statusFilter));
  const compared = (runs.data ?? []).filter((r) => selected.includes(r.id));

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_COMPARE ? s : [...s, id]));

  return (
    <div className="flex flex-col w-full gap-space-xl">
      <PageHeader
        title="Experiments"
        description="Every training run is saved here. Tick two or more runs to compare them."
        divider={false}
        actions={
          <ButtonLink to="/models?tab=train" variant="primary" icon="add">
            New experiment
          </ButtonLink>
        }
      />

      {compared.length >= 2 && <Comparison runs={compared} />}

      <Panel>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md pb-space-sm border-b border-outline-variant/15 mb-space-sm">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Runs{' '}
            {compared.length > 0 && (
              <span className="font-label-sm text-label-sm text-outline font-normal">
                · {compared.length} selected{compared.length === 1 ? ' — select one more to compare' : ''}
              </span>
            )}
          </h2>
          <div className="flex gap-space-sm">
            <div className="w-48">
              <Select value={datasetFilter} onChange={(e) => setDatasetFilter(e.target.value)} aria-label="Filter by dataset">
                <option value="all">All datasets</option>
                {datasets.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="completed">Completed</option>
                <option value="running">Running</option>
                <option value="failed">Failed</option>
              </Select>
            </div>
          </div>
        </div>

        {runs.error && <ErrorNotice error={runs.error} title="Unable to load experiments." onRetry={runs.reload} />}
        {runs.loading && !runs.data ? (
          <LoadingRows rows={6} />
        ) : visible.length === 0 ? (
          <EmptyState icon="science" title={runs.data?.length ? 'No runs match these filters' : 'No experiments yet'} action={!runs.data?.length ? <ButtonLink to="/models?tab=train" variant="primary" icon="model_training">Train a model</ButtonLink> : undefined}>
            {runs.data?.length ? 'Change the dataset or status filter.' : 'Each training run you start is stored here.'}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <Th className="w-8">
                <span className="sr-only">Compare</span>
              </Th>
              <Th>Run</Th>
              <Th>Features</Th>
              <Th align="right">Accuracy</Th>
              <Th align="right">Macro F1</Th>
              <Th>Status</Th>
              <Th align="right">Date</Th>
              <Th className="w-8">
                <span className="sr-only">Details</span>
              </Th>
            </THead>
            <TBody>
              {visible.map((r) => {
                const m = r.metrics;
                const checked = selected.includes(r.id);
                const canSelect = r.status === 'completed' && (checked || selected.length < MAX_COMPARE);
                const open = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <Tr className={checked ? 'bg-surface-container/50' : ''}>
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Compare run ${r.id}`}
                          checked={checked}
                          disabled={!canSelect}
                          onChange={() => toggle(r.id)}
                          className="w-3.5 h-3.5 accent-primary-container cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </Td>
                      <Td className="text-on-surface">
                        <Link to={`/models?id=${r.id}`} className="block hover:text-primary transition-colors truncate max-w-[260px]">
                          {r.name}
                        </Link>
                        <span className="block font-label-sm text-label-sm text-outline">
                          #{r.id} · {r.dataset_name}
                        </span>
                      </Td>
                      <Td className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">{r.feature_label}</Td>
                      <NumTd>{m ? fmtPct(m.accuracy) : '—'}</NumTd>
                      <NumTd>{m ? fmtScore(m.f1_macro) : '—'}</NumTd>
                      <Td>
                        <RunStatus run={r} />
                      </Td>
                      <Td align="right" className="font-label-sm text-label-sm text-outline whitespace-nowrap">
                        {fmtDateTime(r.created_at)}
                      </Td>
                      <Td>
                        <button onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open} aria-label={`Details for run ${r.id}`} className="text-outline hover:text-on-surface transition-colors inline-flex">
                          <Icon name="expand_more" size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                      </Td>
                    </Tr>
                    {open && (
                      <tr className="bg-surface-container-lowest/40">
                        <td colSpan={8} className="px-space-md py-space-md">
                          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-space-xl gap-y-space-sm animate-fade-in">
                            {[
                              ['Precision (macro)', m ? fmtScore(m.precision_macro) : '—'],
                              ['Recall (macro)', m ? fmtScore(m.recall_macro) : '—'],
                              ['F1 (weighted)', m ? fmtScore(m.f1_weighted) : '—'],
                              ['CV macro F1', m?.cv_f1_macro_mean != null ? `${fmtScore(m.cv_f1_macro_mean)} ± ${fmtScore(m.cv_f1_macro_std)}` : 'not run'],
                              ['Parameters', hp(r) || '—'],
                              ['Split', `${Math.round(r.test_size * 100)}% test · seed ${r.random_state}`],
                              ['Train / test docs', m ? `${m.n_train.toLocaleString()} / ${m.n_test.toLocaleString()}` : '—'],
                              ['Preprocessing', preprocessSummary(r.preprocessing)],
                              ['Tuning', r.tune ? (m?.tuning ? `${m.tuning.folds}-fold CV · best CV F1 ${fmtScore(m.tuning.best_cv_score)}` : 'on') : 'off'],
                              ['Training balance', r.train_balance === 'oversample' ? `oversampled to ${m?.n_train_fit?.toLocaleString() ?? '—'} docs` : 'none'],
                              ['Duplicates removed', m?.n_duplicates_removed != null ? `${m.n_duplicates_removed.toLocaleString()} (+${(m.n_conflicting_removed ?? 0).toLocaleString()} conflicting)` : '—'],
                              ['Dataset', r.dataset_name],
                            ].map(([k, v]) => (
                              <div key={k} className="min-w-0">
                                <dt className="font-label-sm text-label-sm text-outline">{k}</dt>
                                <dd className="font-body-sm text-body-sm text-on-surface truncate" title={v}>
                                  {v}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {r.error && <p className="mt-space-sm font-body-sm text-body-sm text-error">{r.error}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}