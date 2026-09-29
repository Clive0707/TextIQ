import { useEffect, useState, type ReactNode } from 'react';
import { FileDrop } from '../components/FileDrop';
import { ModelSelect } from '../components/ModelSelect';
import { DistributionRow } from '../components/ui/Bars';
import { Button, ButtonLink } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Disclosure } from '../components/ui/Disclosure';
import { Field, Select } from '../components/ui/Form';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { EmptyState, ErrorNotice, Skeleton, Spinner } from '../components/ui/States';
import { NumTd, TBody, THead, Table, Td, Th, Tr } from '../components/ui/Table';
import { useTrainedModels } from '../hooks/useTrainedModels';
import { ApiError, api } from '../services/api';
import type { BatchJob, BatchUpload } from '../types/api';
import { fmtInt, fmtPct } from '../utils/format';

const PAGE = 50;

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-space-md">
      <span className={`w-6 h-6 shrink-0 rounded flex items-center justify-center font-label-sm text-label-sm ${done ? 'bg-primary-container/15 text-primary' : 'bg-surface-container text-outline'}`}>
        {done ? <Icon name="check" size={14} /> : n}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-space-sm">
        <span className="font-label-lg text-label-lg text-on-surface pt-0.5">{title}</span>
        {children}
      </div>
    </div>
  );
}

export default function BatchPage() {
  const { usable, active, loading: modelsLoading, error: modelsError } = useTrainedModels();
  const [upload, setUpload] = useState<BatchUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [textColumn, setTextColumn] = useState('');
  const [modelId, setModelId] = useState<number | null>(null);
  const [job, setJob] = useState<BatchJob | null>(null);
  const [running, setRunning] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (modelId == null && (active || usable[0])) setModelId((active ?? usable[0]).id);
  }, [active, usable, modelId]);
  const run = usable.find((m) => m.id === modelId);

  const onFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setJob(null);
    try {
      const u = await api.batchUpload(file);
      setUpload(u);
      setTextColumn(u.suggested_text_column ?? u.columns[0]);
    } catch (e) {
      setUpload(null);
      setError(e as ApiError);
    } finally {
      setUploading(false);
    }
  };

  const runBatch = async () => {
    if (!upload || !run || !textColumn) return;
    setRunning(true);
    setError(null);
    try {
      setJob(await api.batchClassify(upload.upload_id, textColumn, run.id));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setRunning(false);
    }
  };

  const page = async (offset: number) => {
    if (!job) return;
    setPaging(true);
    try {
      setJob(await api.batchRows(job.job_id, offset, PAGE));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setPaging(false);
    }
  };

  const noModels = !modelsLoading && usable.length === 0;

  return (
    <div className="flex flex-col w-full gap-space-xl">
      <PageHeader title="Batch classification" description="Classify every row of a CSV file and download the results." divider={false} />
      {modelsError && <ErrorNotice error={modelsError} title="Unable to load trained models." />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
        <Panel className="lg:col-span-5 flex flex-col gap-space-xl min-w-0">
          <Step n={1} title="Upload a CSV file" done={!!upload}>
            <FileDrop onFile={onFile} busy={uploading} hint={upload ? `${upload.filename} · ${fmtInt(upload.n_rows)} rows — drop another file to replace` : 'CSV with a header row · up to 50 MB'} />
          </Step>
          <Step n={2} title="Choose the text column" done={!!upload && !!textColumn}>
            <Field label="Column with the documents">
              <Select value={textColumn} onChange={(e) => setTextColumn(e.target.value)} disabled={!upload} aria-label="Text column">
                {!upload && <option value="">Upload a file first</option>}
                {upload?.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </Step>
          <Step n={3} title="Choose a model" done={!!run}>
            {noModels ? (
              <EmptyState icon="account_tree" title="No trained model" action={<ButtonLink to="/models" variant="primary" icon="model_training">Train a model</ButtonLink>} />
            ) : modelsLoading ? (
              <Skeleton className="h-[62px]" />
            ) : (
              <ModelSelect models={usable} value={modelId} onChange={setModelId} disabled={running} />
            )}
          </Step>
          <div className="flex justify-end">
            <Button variant="primary-lg" icon="play_arrow" onClick={runBatch} loading={running} disabled={!upload || !run || !textColumn}>
              {running ? 'Classifying…' : 'Classify all rows'}
            </Button>
          </div>
          {error && <ErrorNotice error={error} title={error.code === 'invalid_csv' ? 'The file could not be read.' : 'Batch classification failed.'} />}
        </Panel>

        <div className="lg:col-span-7 flex flex-col gap-space-lg min-w-0">
          {running && (
            <Panel className="flex items-center gap-space-sm">
              <Spinner className="text-primary" />
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Classifying {fmtInt(upload?.n_rows)} rows with {run?.model_name}…
              </span>
            </Panel>
          )}

          {!job && !running && (
            <Panel>
              <PanelHeader title="File preview" meta={upload ? `First ${upload.preview.length} of ${fmtInt(upload.n_rows)} rows` : undefined} />
              {!upload ? (
                <EmptyState icon="table" title="No file uploaded">
                  Other columns are kept and returned in the downloaded results. Empty rows are skipped.
                </EmptyState>
              ) : (
                <div className="mt-space-md">
                  <Table>
                    <THead>
                      {upload.columns.map((c) => (
                        <Th key={c} className={c === textColumn ? 'text-primary' : ''}>
                          {c}
                        </Th>
                      ))}
                    </THead>
                    <TBody>
                      {upload.preview.map((r, i) => (
                        <Tr key={i}>
                          {upload.columns.map((c) => (
                            <Td key={c} className={`max-w-xs ${c === textColumn ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                              <span className="line-clamp-2">{r[c] || <span className="text-outline">empty</span>}</span>
                            </Td>
                          ))}
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </Panel>
          )}

          {job && !running && (
            <Panel className="flex flex-col gap-space-md animate-fade-up">
              <div className="flex flex-wrap items-start justify-between gap-space-md">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Results</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    {fmtInt(job.n_classified)} of {fmtInt(job.n_rows)} rows classified
                    {job.n_skipped > 0 && ` · ${fmtInt(job.n_skipped)} skipped (empty or too long)`} · {job.model.name}
                  </p>
                </div>
                <a
                  href={api.batchDownloadUrl(job.job_id)}
                  download
                  className="inline-flex items-center gap-1.5 px-space-md py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary font-body-sm text-body-sm font-medium transition-colors"
                >
                  <Icon name="download" size={16} /> Download CSV
                </a>
              </div>

              {job.summary.length > 0 && (
                <Disclosure title="Predicted category distribution" summary={job.summary.slice(0, 3).map((s) => `${s.label} ${fmtPct(s.count / job.n_classified, 0)}`).join(' · ')}>
                  <div className="space-y-space-sm">
                    {job.summary.map((s, i) => (
                      <DistributionRow key={s.label} label={s.label} share={s.count / job.n_classified} count={s.count} tone={1 - Math.min(i, 5) * 0.08} unit="rows" />
                    ))}
                  </div>
                </Disclosure>
              )}

              <div className={paging ? 'opacity-60 transition-opacity' : ''}>
                <Table>
                  <THead>
                    <Th>Row</Th>
                    <Th>Text</Th>
                    <Th>Category</Th>
                    <Th align="right">Confidence</Th>
                  </THead>
                  <TBody>
                    {job.rows.map((r) => (
                      <Tr key={r.row}>
                        <NumTd muted>{r.row}</NumTd>
                        <Td className="max-w-md text-on-surface">
                          <span className="line-clamp-1">{r.text || <span className="text-outline">empty</span>}</span>
                        </Td>
                        <Td>{r.status === 'ok' ? <Chip>{r.predicted_label}</Chip> : <Chip tone="warning">{r.note?.replace('skipped: ', 'skipped · ')}</Chip>}</Td>
                        <NumTd>{r.confidence != null ? fmtPct(r.confidence) : '—'}</NumTd>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
              <div className="pt-space-sm border-t border-outline-variant/15 flex items-center justify-between font-label-sm text-label-sm text-outline">
                <span>
                  Rows {fmtInt(job.offset + 1)}–{fmtInt(job.offset + job.rows.length)} of {fmtInt(job.total_rows)}
                </span>
                <div className="flex items-center gap-space-sm">
                  <Button variant="subtle" disabled={job.offset === 0 || paging} onClick={() => page(Math.max(0, job.offset - PAGE))}>
                    Previous
                  </Button>
                  <Button variant="subtle" disabled={job.offset + job.rows.length >= job.total_rows || paging} onClick={() => page(job.offset + PAGE)}>
                    Next
                  </Button>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
