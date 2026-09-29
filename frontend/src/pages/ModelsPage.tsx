import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RunConfig } from '../components/RunConfig';
import { RunStatus } from '../components/RunStatus';
import { TrainForm } from '../components/TrainForm';
import { Button, ButtonLink } from '../components/ui/Button';
import { Chip, StatusDot } from '../components/ui/Chip';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Disclosure, Tabs } from '../components/ui/Disclosure';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { Caption, Panel } from '../components/ui/Panel';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState, ErrorNotice, LoadingRows, Notice } from '../components/ui/States';
import { NumTd, TBody, THead, Table, Td, Th, Tr } from '../components/ui/Table';
import { useAction, useAsync, useInterval } from '../hooks/useAsync';
import { api } from '../services/api';
import type { Experiment, ModelSpec } from '../types/api';
import { fmtDateTime, fmtInt, fmtPct, fmtScore } from '../utils/format';

type View = 'inuse' | 'train';

function PdfLink({ modelId, label = 'PDF report' }: { modelId?: number; label?: string }) {
  return (
    <a href={api.reportUrl(modelId)} download className="inline-flex items-center gap-1.5 px-space-md py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm transition-colors">
      <Icon name="picture_as_pdf" size={16} className="text-outline" /> {label}
    </a>
  );
}

/** One of the four usable model slots. */
function ModelCard({ spec, run, selected, onSelect, onMakeDefault, pending, onTrain }: { spec: ModelSpec; run: Experiment | null; selected: boolean; onSelect: () => void; onMakeDefault: () => void; pending: boolean; onTrain: () => void }) {
  const m = run?.metrics;
  return (
    <Panel className={`flex flex-col gap-space-md transition-colors ${selected ? 'border-primary-container/50' : ''}`}>
      <div className="flex items-start justify-between gap-space-sm">
        <div className="min-w-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{spec.name}</h2>
          <p className="font-label-sm text-label-sm text-outline truncate">{run ? run.feature_label : spec.estimator}</p>
        </div>
        {run?.is_active ? <Chip tone="primary">Default</Chip> : run ? <Chip>In use</Chip> : <Chip tone="warning">Not trained</Chip>}
      </div>
      {run && m ? (
        <>
          <div className="grid grid-cols-2 gap-space-md">
            <div>
              <Caption>Accuracy</Caption>
              <p className="font-headline-md text-headline-md text-on-surface tabular">{fmtPct(m.accuracy)}</p>
            </div>
            <div>
              <Caption>Macro F1</Caption>
              <p className="font-headline-md text-headline-md text-on-surface tabular">{fmtScore(m.f1_macro)}</p>
            </div>
          </div>
          <p className="font-label-sm text-label-sm text-outline">
            Run #{run.id} · {fmtInt(m.n_train)} train / {fmtInt(m.n_test)} test docs · {fmtDateTime(run.completed_at)}
          </p>
          <div className="flex flex-wrap gap-space-sm mt-auto">
            <Button variant={selected ? 'secondary' : 'subtle'} icon="info" onClick={onSelect}>
              Details
            </Button>
            {!run.is_active && (
              <Button variant="subtle" icon="check_circle" loading={pending} onClick={onMakeDefault}>
                Make default
              </Button>
            )}
            <PdfLink modelId={run.id} />
          </div>
        </>
      ) : (
        <EmptyState icon="model_training" title="No trained run yet" action={<Button variant="primary" icon="model_training" onClick={onTrain}>Train {spec.short_name}</Button>} />
      )}
    </Panel>
  );
}

function RunDetail({ run, onDeploy, onDelete, deploying }: { run: Experiment; onDeploy: () => void; onDelete: () => void; deploying: boolean }) {
  const m = run.metrics;
  return (
    <Panel className="flex flex-col gap-space-md animate-fade-up" aria-label="Run detail">
      <div className="flex flex-wrap items-start justify-between gap-space-md">
        <div className="min-w-0">
          <h2 className="font-headline-md text-headline-md text-on-surface truncate">{run.name}</h2>
          <p className="font-label-sm text-label-sm text-outline">
            Run #{run.id} · {run.dataset_name} · {run.is_deployed ? 'one of the four models in use' : 'history only — not used for classification'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {run.status === 'completed' && !run.is_deployed && (
            <Button variant="primary" icon="swap_horiz" loading={deploying} onClick={onDeploy}>
              Use as {run.model_name}
            </Button>
          )}
          {run.status === 'completed' && (
            <ButtonLink to={`/analytics?model=${run.id}`} variant="secondary" icon="analytics">
              Analytics
            </ButtonLink>
          )}
          {run.status === 'completed' && <PdfLink modelId={run.id} />}
          <Button variant="subtle" icon="delete" onClick={onDelete} disabled={run.status === 'running' || run.status === 'queued'}>
            Delete
          </Button>
        </div>
      </div>
      {run.status === 'failed' && run.error && <ErrorNotice error={{ message: run.error }} title="Training failed." />}
      {(run.status === 'running' || run.status === 'queued') && <RunStatus run={run} />}
      {m && (
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-space-md">
          <StatCard label="Accuracy" value={fmtPct(m.accuracy)} meta={`${fmtInt(m.n_test)} test docs`} />
          <StatCard label="Precision" value={fmtScore(m.precision_macro)} meta="macro" />
          <StatCard label="Recall" value={fmtScore(m.recall_macro)} meta="macro" />
          <StatCard label="F1 score" value={fmtScore(m.f1_macro)} meta={m.tuning ? `CV ${fmtScore(m.tuning.best_cv_score)}` : 'macro'} metaTone="primary" />
        </section>
      )}
      <Disclosure title="Full configuration" summary={`${run.feature_label} · ${Math.round(run.test_size * 100)}% test`}>
        <RunConfig run={run} />
      </Disclosure>
    </Panel>
  );
}

export default function ModelsPage() {
  const [params, setParams] = useSearchParams();
  const runs = useAsync(() => api.models());
  const catalog = useAsync(() => api.modelCatalog());
  const datasets = useAsync(() => api.datasets());
  const [view, setView] = useState<View>(params.get('tab') === 'train' ? 'train' : 'inuse');
  const [confirmDelete, setConfirmDelete] = useState<Experiment | null>(null);
  const [trainType, setTrainType] = useState<string | null>(null);

  const busy = (runs.data ?? []).some((r) => r.status === 'queued' || r.status === 'running');
  useInterval(() => void runs.reload(), 1500, busy);

  const selectedId = Number(params.get('id')) || null;
  const selected = useMemo(() => (runs.data ?? []).find((r) => r.id === selectedId) ?? null, [runs.data, selectedId]);
  const inUse = useMemo(() => (runs.data ?? []).filter((r) => r.is_deployed), [runs.data]);
  const history = useMemo(() => (runs.data ?? []).filter((r) => !r.is_deployed), [runs.data]);

  const activate = useAction(async (id: number) => {
    await api.activateModel(id);
    await runs.reload();
  });
  const deploy = useAction(async (id: number) => {
    await api.deployModel(id);
    await runs.reload();
  });
  const remove = useAction(async (id: number) => {
    await api.deleteModel(id);
    setConfirmDelete(null);
    setParams({});
    await runs.reload();
  });

  const select = (id: number) => setParams({ id: String(id) });
  const openTrain = (type: string | null) => {
    setTrainType(type);
    setView('train');
  };

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <PageHeader
        title="Models"
        description="TextIQ uses exactly four models. Train them, compare their scores and choose the default."
        divider={false}
        actions={
          view === 'inuse' && (
            <div className="flex flex-wrap gap-space-sm">
              {inUse.length > 0 && <PdfLink label="PDF report (all 4)" />}
              <Button variant="primary" icon="add" onClick={() => openTrain(null)}>
                Train new model
              </Button>
            </div>
          )
        }
      />
      <Tabs
        value={view}
        onChange={setView}
        tabs={[
          { value: 'inuse', label: 'Models in use', hint: `${inUse.length}/4` },
          { value: 'train', label: 'Train new model' },
        ]}
      />

      {view === 'train' ? (
        datasets.data && catalog.data ? (
          <TrainForm
            key={trainType ?? 'default'}
            datasets={datasets.data}
            catalog={catalog.data}
            initialModelType={trainType ?? undefined}
            onCreated={(run) => {
              setView('inuse');
              void runs.reload();
              select(run.id);
            }}
          />
        ) : datasets.error || catalog.error ? (
          <ErrorNotice error={(datasets.error ?? catalog.error)!} title="Unable to load training options." />
        ) : (
          <Panel>
            <LoadingRows rows={6} />
          </Panel>
        )
      ) : (
        <>
          {runs.error && <ErrorNotice error={runs.error} title="Unable to load models." onRetry={runs.reload} />}
          {(runs.loading && !runs.data) || !catalog.data ? (
            <Panel>
              <LoadingRows rows={5} />
            </Panel>
          ) : (
            <section className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-space-lg">
              {catalog.data.map((spec) => (
                <ModelCard
                  key={spec.type}
                  spec={spec}
                  run={inUse.find((r) => r.model_type === spec.type) ?? null}
                  selected={!!selected && selected.model_type === spec.type && selected.is_deployed}
                  onSelect={() => {
                    const r = inUse.find((x) => x.model_type === spec.type);
                    if (r) select(r.id);
                  }}
                  onMakeDefault={() => {
                    const r = inUse.find((x) => x.model_type === spec.type);
                    if (r) void activate.run(r.id);
                  }}
                  pending={activate.pending}
                  onTrain={() => openTrain(spec.type)}
                />
              ))}
            </section>
          )}
          {(activate.error || deploy.error) && <ErrorNotice error={(activate.error ?? deploy.error)!} title="The change could not be saved." />}
          {selected && <RunDetail run={selected} deploying={deploy.pending} onDeploy={() => deploy.run(selected.id)} onDelete={() => setConfirmDelete(selected)} />}

          <Panel className="py-space-sm">
            <Disclosure title="All training runs" summary={`${history.length} earlier or alternative runs — history only`} defaultOpen={busy}>
              <div className="flex flex-col gap-space-sm">
                <Notice>Only the four models above are used for classification. Open a run to compare it or to use it instead of the current run of that model.</Notice>
                {history.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">No other runs.</p>
                ) : (
                  <Table>
                    <THead>
                      <Th>Run</Th>
                      <Th>Dataset</Th>
                      <Th align="right">Accuracy</Th>
                      <Th align="right">Macro F1</Th>
                      <Th>Status</Th>
                    </THead>
                    <TBody>
                      {history.map((r) => (
                        <Tr key={r.id} onClick={() => select(r.id)} className={`cursor-pointer ${r.id === selectedId ? 'bg-surface-container/60' : ''}`}>
                          <Td className="text-on-surface">
                            <span className="flex items-start gap-2">
                              <span className="mt-1.5">
                                <StatusDot />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate max-w-[320px]">{r.name}</span>
                                <span className="block font-label-sm text-label-sm text-outline">
                                  #{r.id} · {r.model_name}
                                </span>
                              </span>
                            </span>
                          </Td>
                          <Td className="text-on-surface-variant font-label-sm text-label-sm whitespace-nowrap">{r.dataset_name}</Td>
                          <NumTd>{r.metrics ? fmtPct(r.metrics.accuracy) : '—'}</NumTd>
                          <NumTd>{r.metrics ? fmtScore(r.metrics.f1_macro) : '—'}</NumTd>
                          <Td>
                            <RunStatus run={r} />
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>
            </Disclosure>
          </Panel>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete run?"
        confirmLabel="Delete run"
        danger
        pending={remove.pending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.run(confirmDelete.id)}
      >
        <p>
          “{confirmDelete?.name}” (run #{confirmDelete?.id}) and its saved files will be removed.
          {confirmDelete?.is_deployed ? ` It is the ${confirmDelete.model_name} in use; the newest other ${confirmDelete.model_name} run takes its place (if there is one).` : ''}
        </p>
        {remove.error && (
          <div className="mt-space-sm">
            <ErrorNotice error={remove.error} />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
