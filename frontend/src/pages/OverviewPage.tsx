import { Link, useNavigate } from 'react-router-dom';
import { DistributionRow } from '../components/ui/Bars';
import { Button, ButtonLink } from '../components/ui/Button';
import { Chip, StatusDot } from '../components/ui/Chip';
import { InfoTip } from '../components/ui/Disclosure';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState, ErrorNotice, LoadingRows } from '../components/ui/States';
import { NumTd, TBody, THead, Table, Td, Th, Tr } from '../components/ui/Table';
import { useAsync } from '../hooks/useAsync';
import { api } from '../services/api';
import type { OverviewData } from '../types/api';
import { fmtInt, fmtPct, fmtRelative, fmtScore } from '../utils/format';

const MAX_BARS = 10;

function CategoryDistribution({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  const dataset = data?.dataset ?? null;
  const dist = dataset?.class_distribution ?? [];
  const total = dist.reduce((s, c) => s + c.count, 0);
  const shown = dist.length > MAX_BARS ? dist.slice(0, MAX_BARS - 1) : dist;
  const rest = dist.slice(shown.length);
  const restCount = rest.reduce((s, c) => s + c.count, 0);
  return (
    <Panel className="lg:col-span-5 flex flex-col">
      <PanelHeader title="Categories" meta={dataset ? `${fmtInt(total)} documents` : undefined} />
      <div className="mt-space-md flex-1">
        {loading ? (
          <LoadingRows rows={6} />
        ) : !dataset ? (
          <EmptyState icon="database" title="No dataset yet" action={<ButtonLink to="/dataset" variant="secondary" icon="database">Open Dataset</ButtonLink>}>
            Load a dataset to see how its documents are spread across categories.
          </EmptyState>
        ) : (
          <div className="space-y-space-md">
            {shown.map((c, i) => (
              <DistributionRow key={c.label} label={c.label} share={c.count / total} count={c.count} tone={1 - Math.min(i, 5) * 0.1} />
            ))}
            {rest.length > 0 && <DistributionRow label={`Other (${rest.length})`} share={restCount / total} count={restCount} muted />}
          </div>
        )}
      </div>
    </Panel>
  );
}

function ModelPerformance({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  const runs = data?.benchmark ?? [];
  return (
    <Panel className="lg:col-span-7 flex flex-col">
      <PanelHeader
        title="Model performance"
        meta={
          runs.length ? (
            <span className="inline-flex items-center gap-1">
              Best run per model
              <InfoTip>Scores come from each run’s held-out test split — documents the model never saw during training. Macro F1 averages the F1 score of every category equally, so small categories count as much as large ones.</InfoTip>
            </span>
          ) : undefined
        }
      />
      <div className="mt-space-sm flex-1">
        {loading ? (
          <LoadingRows rows={4} />
        ) : runs.length === 0 ? (
          <EmptyState icon="account_tree" title="No trained models yet" action={<ButtonLink to="/models" variant="primary" icon="model_training">Train a model</ButtonLink>}>
            Scores appear here once a model has been trained and evaluated.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Model</Th>
              <Th align="right">Accuracy</Th>
              <Th align="right">Macro F1</Th>
            </THead>
            <TBody>
              {runs.map((r) => (
                <Tr key={r.id}>
                  <Td className="text-on-surface">
                    <Link to={`/models?id=${r.id}`} className="flex items-start gap-2 hover:text-primary transition-colors">
                      <span className="mt-1.5">
                        <StatusDot active={r.is_active} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block ${r.is_active ? 'font-medium' : ''}`}>
                          {r.model_name}
                          {r.is_active && <span className="ml-2 font-label-sm text-label-sm text-primary">Active</span>}
                        </span>
                        <span className="block font-label-sm text-label-sm text-outline">{r.feature_label}</span>
                      </span>
                    </Link>
                  </Td>
                  <NumTd>{fmtPct(r.metrics!.accuracy)}</NumTd>
                  <NumTd>{fmtScore(r.metrics!.f1_macro)}</NumTd>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Panel>
  );
}

function RecentClassifications({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  const recent = data?.recent ?? [];
  return (
    <Panel>
      <PanelHeader title="Recent classifications" meta={data?.totals.classifications ? `${fmtInt(data.totals.classifications)} in total` : undefined} />
      <div className="mt-space-sm">
        {loading ? (
          <LoadingRows rows={4} />
        ) : recent.length === 0 ? (
          <EmptyState icon="spellcheck" title="Nothing classified yet" action={<ButtonLink to="/classify" variant="secondary" icon="edit_note">Classify text</ButtonLink>} />
        ) : (
          <Table>
            <THead>
              <Th>Text</Th>
              <Th>Category</Th>
              <Th align="right">Confidence</Th>
              <Th align="right">When</Th>
            </THead>
            <TBody>
              {recent.map((c) => (
                <Tr key={c.id}>
                  <Td className="py-3 pr-6 text-on-surface max-w-lg">
                    <Link to={`/classify?history=${c.id}`} className="line-clamp-1 hover:text-primary transition-colors" title={`${c.model_name} — open in Classify Text`}>
                      {c.excerpt}
                    </Link>
                  </Td>
                  <Td className="py-3">
                    <Chip>{c.predicted_label}</Chip>
                  </Td>
                  <NumTd className="py-3">{fmtPct(c.confidence)}</NumTd>
                  <Td align="right" className="py-3 font-label-sm text-label-sm text-outline whitespace-nowrap">
                    {fmtRelative(c.created_at)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
      {recent.length > 0 && (
        <div className="mt-space-md pt-space-sm border-t border-outline-variant/15 flex justify-end font-label-sm text-label-sm">
          <Link to="/analytics" className="text-on-surface-variant hover:text-on-surface transition-colors inline-flex items-center gap-1">
            View analytics <Icon name="arrow_forward" size={14} />
          </Link>
        </div>
      )}
    </Panel>
  );
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.overview());
  const ds = data?.dataset ?? null;
  const active = data?.active_model ?? null;
  const usable = ds?.validation?.usable_rows ?? ds?.n_rows;

  return (
    <div className="flex flex-col w-full gap-space-xl">
      <PageHeader
        breadcrumb={['Workspace', ds?.name ?? 'No dataset']}
        title="Text classification and NLP analysis"
        description="Your dataset, the model in use and how well it performs."
        actions={
          <>
            <Button variant="secondary" icon="upload_file" onClick={() => navigate('/dataset')}>
              Import dataset
            </Button>
            <Button variant="primary" icon="edit_note" onClick={() => navigate('/classify')}>
              Classify text
            </Button>
          </>
        }
      />

      {error && <ErrorNotice error={error} title="Unable to load the overview." onRetry={reload} />}

      <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
        <StatCard label="Documents" loading={loading} value={usable != null ? fmtInt(usable) : '—'} meta={ds?.name} />
        <StatCard label="Categories" loading={loading} value={ds?.n_classes ?? '—'} />
        <StatCard label="Active model" loading={loading} value={active ? active.model_name : 'None'} meta={active ? { tfidf: 'TF-IDF', bow: 'Bag of Words', char: 'Char n-grams', combo: 'Words + chars' }[active.feature.kind] : 'train a model'} />
        <StatCard label="Accuracy" loading={loading} value={active?.metrics ? fmtPct(active.metrics.accuracy) : '—'} meta={active?.metrics ? `macro F1 ${fmtScore(active.metrics.f1_macro)}` : undefined} metaTone="primary" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <CategoryDistribution data={data} loading={loading} />
        <ModelPerformance data={data} loading={loading} />
      </section>

      <RecentClassifications data={data} loading={loading} />
    </div>
  );
}
