import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDrop } from '../components/FileDrop';
import { DistributionRow } from '../components/ui/Bars';
import { Button, ButtonLink } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ConfirmDialog, Modal } from '../components/ui/Dialog';
import { Disclosure } from '../components/ui/Disclosure';
import { Field, Select, TextInput } from '../components/ui/Form';
import { Icon } from '../components/ui/Icon';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { EmptyState, ErrorNotice, LoadingRows, Notice } from '../components/ui/States';
import { TBody, THead, Table, Td, Th, Tr } from '../components/ui/Table';
import { useAction, useAsync } from '../hooks/useAsync';
import { api } from '../services/api';
import type { Dataset, QualityReport, TextIQReport } from '../types/api';
import { fmtInt, fmtPct } from '../utils/format';

const PREVIEW = 15;

/* ------------------------------------------------------------------ add dataset */

function AddDataset({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (d: Dataset) => void }) {
  const builtins = useAsync(() => api.builtinDatasets(), [open]);
  const [name, setName] = useState('');
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const builtin = useAction(async (key: string) => {
    setLoadingKey(key);
    try {
      onAdded(await api.loadBuiltin(key));
    } finally {
      setLoadingKey(null);
    }
  });
  const upload = useAction(async (file: File) => {
    const d = await api.uploadDataset(file, name.trim());
    setName('');
    onAdded(d);
  });

  return (
    <Modal open={open} onClose={onClose} title="Add a dataset" wide>
      <div className="flex flex-col gap-space-xl">
        <div className="flex flex-col gap-space-sm">
          <p className="font-label-lg text-label-lg text-on-surface">Built-in datasets</p>
          {builtins.loading && !builtins.data ? (
            <LoadingRows rows={2} />
          ) : (
            builtins.data?.map((b) => (
              <div key={b.key} className="flex items-start justify-between gap-space-md p-space-md rounded bg-surface-container-lowest">
                <div className="min-w-0">
                  <p className="font-body-md text-body-md text-on-surface">{b.name}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{b.description}</p>
                </div>
                {b.dataset_id ? (
                  <Chip tone="primary">Loaded</Chip>
                ) : (
                  <Button variant="secondary" icon="cloud_download" loading={loadingKey === b.key} disabled={!!loadingKey} onClick={() => builtin.run(b.key)}>
                    {loadingKey === b.key ? 'Preparing…' : 'Load'}
                  </Button>
                )}
              </div>
            ))
          )}
          {builtin.error && <ErrorNotice error={builtin.error} title="The dataset could not be loaded." />}
        </div>
        <div className="flex flex-col gap-space-sm">
          <p className="font-label-lg text-label-lg text-on-surface">Upload your own CSV</p>
          <Field label="Name" hint="optional">
            <TextInput value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the file name" />
          </Field>
          <FileDrop onFile={(f) => upload.run(f)} busy={upload.pending} hint="Needs a header row, one text column and one label column · up to 50 MB" />
          {upload.error && <ErrorNotice error={upload.error} title="The file could not be imported." />}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ sections */

function Summary({ ds }: { ds: Dataset }) {
  const v = ds.validation;
  const items: [string, string][] = [
    ['Documents', fmtInt(ds.n_rows)],
    ['Unique documents', v?.unique_rows != null ? fmtInt(v.unique_rows) : '—'],
    ['Categories', ds.n_classes != null ? String(ds.n_classes) : '—'],
    ['Text column', ds.text_column ?? '—'],
    ['Label column', ds.label_column ?? '—'],
    ['Missing values', v ? fmtInt(v.empty_text_rows + v.missing_label_rows) : '—'],
    ['Duplicates', v ? fmtInt(v.duplicate_rows) : '—'],
  ];
  return (
    <Panel>
      <dl className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-space-lg">
        {items.map(([k, val]) => (
          <div key={k} className="min-w-0">
            <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{k}</dt>
            <dd className="mt-1 font-headline-sm text-headline-sm text-on-surface truncate tabular" title={val}>
              {val}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function ColumnSetup({ ds, onSaved }: { ds: Dataset; onSaved: (d: Dataset) => void }) {
  const [text, setText] = useState(ds.text_column ?? '');
  const [label, setLabel] = useState(ds.label_column ?? '');
  useEffect(() => {
    setText(ds.text_column ?? '');
    setLabel(ds.label_column ?? '');
  }, [ds.id, ds.text_column, ds.label_column]);
  const save = useAction(async () => onSaved(await api.setDatasetColumns(ds.id, text, label)));
  const dirty = text !== (ds.text_column ?? '') || label !== (ds.label_column ?? '');
  const columnSelect = (value: string, set: (v: string) => void, aria: string) => (
    <Select value={value} onChange={(e) => set(e.target.value)} aria-label={aria}>
      <option value="">Select…</option>
      {ds.columns.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        <Field label="Text column">{columnSelect(text, setText, 'Text column')}</Field>
        <Field label="Label column">{columnSelect(label, setLabel, 'Label column')}</Field>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" icon="rule" onClick={() => save.run()} loading={save.pending} disabled={!text || !label || (!dirty && ds.status !== 'needs_columns')}>
          Save & validate
        </Button>
      </div>
      {save.error && <ErrorNotice error={save.error} title="Validation could not run." />}
    </div>
  );
}

function QualityTable({ q }: { q: QualityReport }) {
  const rows: [string, number, string?][] = [
    ['Source records', q.source_records],
    ['Excluded — other sections', -q.excluded_other_sections, `${q.excluded_sections} sections not in the 8 topics`],
    ['Mapped to the 8 topics', q.mapped_records],
    ['Removed — empty text', -q.empty_text],
    ['Removed — shorter than 5 words', -q.too_short],
    ['Removed — conflicting duplicates', -q.conflicting_duplicates, 'same text, different topics'],
    ['Removed — duplicate texts', -q.duplicate_texts],
    ['Final records', q.final_records],
  ];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-xl">
      <table className="w-full border-collapse font-body-sm text-body-sm">
        <tbody className="divide-y divide-outline-variant/15">
          {rows.map(([k, n, note]) => (
            <tr key={k}>
              <td className={`py-1.5 pr-space-md ${k === 'Final records' ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                {k}
                {note && <span className="block font-label-sm text-label-sm text-outline">{note}</span>}
              </td>
              <td className={`py-1.5 text-right font-label-md text-label-md tabular ${n < 0 ? 'text-outline' : 'text-on-surface'}`}>{n < 0 ? `−${fmtInt(-n)}` : fmtInt(n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-space-sm">
        <table className="w-full border-collapse font-body-sm text-body-sm">
          <thead>
            <tr className="font-label-sm text-label-sm text-outline uppercase tracking-wider border-b border-outline-variant/25">
              <th className="py-1.5 text-left font-normal">Topic</th>
              <th className="py-1.5 text-left font-normal">HuffPost sections</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15">
            {q.mapping.map((m) => (
              <tr key={m.topic}>
                <td className="py-1.5 pr-space-md text-on-surface">{m.topic}</td>
                <td className="py-1.5 font-label-sm text-label-sm text-on-surface-variant">{m.sources.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-label-sm text-label-sm text-outline">
          {fmtInt(q.headline_only_records)} records have a headline but no description · {fmtInt(q.repeated_headlines_kept)} repeated headlines kept (their descriptions differ) · dates {q.date_range[0]} to {q.date_range[1]}.
        </p>
      </div>
    </div>
  );
}

const isTextIQ = (q: Dataset['quality']): q is TextIQReport => !!q && 'kind' in q && q.kind === 'textiq';

function TextIQQuality({ q }: { q: TextIQReport }) {
  const checks: [string, string][] = [
    ['Rows', fmtInt(q.rows)],
    ['Missing text / category', `${fmtInt(q.missing_text)} / ${fmtInt(q.missing_category)}`],
    ['Duplicate ids', fmtInt(q.duplicate_ids)],
    ['Rows repeating another row’s text', fmtInt(q.duplicate_texts)],
    [`Exact copies (same ${q.exact_copy_columns.join(', ')})`, fmtInt(q.exact_copies)],
    ['Rows whose text has conflicting categories', fmtInt(q.conflicting_rows)],
    ['Unique, unambiguous documents', fmtInt(q.unique_documents)],
    ['Texts under 3 words', fmtInt(q.short_texts)],
    ['Length (words)', `min ${q.words.min} · median ${q.words.median} · mean ${q.words.mean} · max ${q.words.max}`],
    ['Dates', q.date_range ? `${q.date_range[0]} to ${q.date_range[1]}` : '—'],
  ];
  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-xl">
        <table className="w-full border-collapse font-body-sm text-body-sm">
          <tbody className="divide-y divide-outline-variant/15">
            {checks.map(([k, val]) => (
              <tr key={k}>
                <td className="py-1.5 pr-space-md text-on-surface-variant">{k}</td>
                <td className="py-1.5 text-right font-label-md text-label-md tabular text-on-surface">{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full border-collapse font-body-sm text-body-sm self-start">
          <thead>
            <tr className="font-label-sm text-label-sm text-outline uppercase tracking-wider border-b border-outline-variant/25">
              <th className="py-1.5 text-left font-normal">Source topic</th>
              <th className="py-1.5 text-left font-normal">Category</th>
              <th className="py-1.5 text-right font-normal">Rows</th>
              <th className="py-1.5 text-right font-normal">Unique</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15">
            {q.source_mapping.map((m) => (
              <tr key={m.source}>
                <td className="py-1.5 font-mono text-[12px] text-on-surface-variant">{m.source}</td>
                <td className={`py-1.5 ${m.source.toLowerCase() !== m.category.toLowerCase() ? 'text-primary' : 'text-on-surface'}`}>{m.category}</td>
                <td className="py-1.5 text-right font-label-md text-label-md tabular">{fmtInt(m.rows)}</td>
                <td className="py-1.5 text-right font-label-md text-label-md tabular text-on-surface-variant">{fmtInt(q.categories.find((c) => c.label === m.category)?.unique ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1.5">
        {q.source_mapping.filter((m) => m.source.toLowerCase() !== m.category.toLowerCase()).map((m) => (
          <Notice key={m.source}>
            The source topic <span className="font-mono">{m.source}</span> is presented as <span className="text-on-surface">{m.category}</span>.
          </Notice>
        ))}
        <Notice tone="warning">
          The file was balanced to {fmtInt(Math.max(...q.categories.map((c) => c.rows)))} rows per category by repeating records
          {q.oversampled_flag_rows != null ? ` (its “oversampled” flag is set on ${fmtInt(q.oversampled_flag_rows)} rows)` : ''}. Only {fmtInt(q.unique_documents)} documents are unique, so TextIQ removes duplicates before the train/test split — otherwise copies of the same headline would be scored as “unseen” test data.
        </Notice>
      </div>
    </div>
  );
}

function Preview({ ds }: { ds: Dataset }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [ds.id]);
  const { data, error, loading } = useAsync(() => api.datasetPreview(ds.id, offset, PREVIEW), [ds.id, offset]);
  const cols = data ? [ds.text_column, ds.label_column].filter((c): c is string => !!c && data.columns.includes(c)) : [];
  const shown = cols.length === 2 ? cols : data?.columns ?? [];
  return (
    <Panel className="min-w-0">
      <PanelHeader title="Preview" meta={data ? `Rows ${fmtInt(offset + 1)}–${fmtInt(offset + data.rows.length)} of ${fmtInt(data.total)}` : undefined} />
      {error && <ErrorNotice error={error} />}
      {loading && !data ? (
        <LoadingRows rows={6} />
      ) : (
        data && (
          <div className={`mt-space-sm ${loading ? 'opacity-60' : ''}`}>
            <Table>
              <THead>
                {shown.map((c) => (
                  <Th key={c}>{c}</Th>
                ))}
              </THead>
              <TBody>
                {data.rows.map((r, i) => (
                  <Tr key={offset + i}>
                    {shown.map((c) => (
                      <Td key={c} className={c === ds.text_column ? 'text-on-surface max-w-xl' : 'text-on-surface-variant'}>
                        {c === ds.label_column && r[c] ? <Chip>{r[c]}</Chip> : <span className="line-clamp-2">{r[c] || <span className="text-outline">empty</span>}</span>}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </TBody>
            </Table>
            <div className="mt-space-md pt-space-sm border-t border-outline-variant/15 flex items-center justify-between gap-space-sm">
              <span className="font-label-sm text-label-sm text-outline">{cols.length === 2 && data.columns.length > 2 ? `${data.columns.length - 2} other columns hidden` : ''}</span>
              <div className="flex gap-space-sm">
                <Button variant="subtle" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PREVIEW))}>
                  Previous
                </Button>
                <Button variant="subtle" disabled={offset + PREVIEW >= data.total || loading} onClick={() => setOffset(offset + PREVIEW)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------- page */

export default function DatasetPage() {
  const [params, setParams] = useSearchParams();
  const list = useAsync(() => api.datasets());
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Dataset | null>(null);

  const datasets = list.data ?? [];
  const selectedId = Number(params.get('id')) || datasets[0]?.id || null;
  const ds = datasets.find((d) => d.id === selectedId) ?? null;

  const replace = (d: Dataset) => {
    list.setData([d, ...datasets.filter((x) => x.id !== d.id)]);
    setParams({ id: String(d.id) });
  };
  const remove = useAction(async (id: number) => {
    await api.deleteDataset(id);
    setConfirm(null);
    setParams({});
    await list.reload();
  });

  const dist = ds?.class_distribution ?? [];
  const total = dist.reduce((a, b) => a + b.count, 0);
  const v = ds?.validation;

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <PageHeader
        title="Dataset"
        description="The labelled text your models learn from."
        divider={false}
        actions={
          <Button variant="primary" icon="add" onClick={() => setAdding(true)}>
            Add dataset
          </Button>
        }
      />
      {list.error && <ErrorNotice error={list.error} onRetry={list.reload} />}

      {list.loading && !list.data ? (
        <Panel>
          <LoadingRows rows={4} />
        </Panel>
      ) : !ds ? (
        <Panel>
          <EmptyState icon="database" title="No dataset yet" action={<Button variant="primary" icon="add" onClick={() => setAdding(true)}>Add dataset</Button>}>
            Load the built-in TextIQ 120K News Dataset or upload a CSV with a text column and a label column.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md min-w-0">
              {datasets.length > 1 ? (
                <div className="w-80 max-w-full">
                  <Select value={ds.id} onChange={(e) => setParams({ id: e.target.value })} aria-label="Dataset">
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <h2 className="font-headline-md text-headline-md text-on-surface truncate">{ds.name}</h2>
              )}
              {ds.status === 'ready' ? <Chip tone="primary">Ready</Chip> : ds.status === 'invalid' ? <Chip tone="error">Needs attention</Chip> : <Chip tone="warning">Choose columns</Chip>}
            </div>
            <div className="flex items-center gap-space-sm">
              {ds.status === 'ready' && (
                <ButtonLink to="/models?tab=train" variant="secondary" icon="model_training">
                  Train on this dataset
                </ButtonLink>
              )}
              <Button variant="subtle" icon="delete" onClick={() => setConfirm(ds)}>
                Delete
              </Button>
            </div>
          </div>

          {ds.description && <p className="-mt-space-sm font-body-sm text-body-sm text-on-surface-variant">{ds.description}</p>}

          <Summary ds={ds} />

          {(ds.status !== 'ready' || (v && v.errors.length > 0)) && (
            <Panel className="flex flex-col gap-space-md">
              <PanelHeader title="Choose the text and label columns" />
              {v?.errors.map((e) => (
                <div key={e} className="flex items-start gap-2 font-body-sm text-body-sm text-error">
                  <Icon name="error" size={16} className="mt-px" /> {e}
                </div>
              ))}
              <ColumnSetup ds={ds} onSaved={replace} />
            </Panel>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
            <Panel className="lg:col-span-4">
              <PanelHeader title="Category distribution" meta={dist.length ? `largest/smallest ${(Math.max(...dist.map((d) => d.count)) / Math.max(1, Math.min(...dist.map((d) => d.count)))).toFixed(2)}×` : undefined} />
              {dist.length ? (
                <div className="space-y-space-md mt-space-md max-h-[520px] overflow-y-auto pr-1">
                  {dist.map((c, i) => (
                    <DistributionRow key={c.label} label={c.label} share={c.count / total} count={c.count} tone={1 - Math.min(i, 5) * 0.08} unit={c.unique != null ? `rows · ${fmtInt(c.unique)} unique` : 'rows'} />
                  ))}
                </div>
              ) : (
                <EmptyState icon="bar_chart" title="No label column yet" />
              )}
            </Panel>
            <div className="lg:col-span-8 min-w-0">
              <Preview ds={ds} />
            </div>
          </div>

          <Panel className="flex flex-col divide-y divide-outline-variant/15 py-space-sm">
            {ds.quality && isTextIQ(ds.quality) && (
              <Disclosure className="py-space-sm" title="Quality report" defaultOpen summary={`${fmtInt(ds.quality.rows)} rows → ${fmtInt(ds.quality.unique_documents)} unique documents`}>
                <TextIQQuality q={ds.quality} />
              </Disclosure>
            )}
            {ds.quality && !isTextIQ(ds.quality) && (
              <Disclosure className="py-space-sm" title="Quality report" summary={`${fmtInt(ds.quality.source_records)} source records → ${fmtInt(ds.quality.final_records)} kept`}>
                <QualityTable q={ds.quality} />
              </Disclosure>
            )}
            {v && v.warnings.length > 0 && (
              <Disclosure className="py-space-sm" title="Validation notes" summary={`${v.warnings.length} note${v.warnings.length === 1 ? '' : 's'}`}>
                <ul className="flex flex-col gap-1.5">
                  {v.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface-variant">
                      <Icon name="warning" size={16} className="mt-px text-tertiary" /> {w}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {ds.status === 'ready' && (
              <Disclosure className="py-space-sm" title="Column settings" summary={`text: ${ds.text_column} · label: ${ds.label_column}`}>
                <ColumnSetup ds={ds} onSaved={replace} />
              </Disclosure>
            )}
            <Disclosure className="py-space-sm" title="File details" summary={`${fmtInt(ds.n_rows)} rows · ${ds.columns.length} columns`}>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-space-xl gap-y-space-sm font-body-sm text-body-sm">
                {[
                  ['Source', ds.source === 'builtin' ? `Built-in · ${ds.filename}` : `Uploaded file · ${ds.filename}`],
                  ['All rows', fmtInt(ds.n_rows)],
                  ['Usable rows', v ? `${fmtInt(v.usable_rows)} (${fmtPct(v.usable_rows / ds.n_rows)})` : '—'],
                  ['Columns', ds.columns.join(', ')],
                ].map(([k, val]) => (
                  <div key={k} className="flex items-baseline justify-between gap-space-md border-b border-outline-variant/15 pb-1.5 min-w-0">
                    <dt className="font-label-sm text-label-sm text-outline shrink-0">{k}</dt>
                    <dd className="text-on-surface text-right truncate" title={val}>
                      {val}
                    </dd>
                  </div>
                ))}
              </dl>
              {ds.quality && !isTextIQ(ds.quality) && (
                <p className="mt-space-sm font-label-sm text-label-sm text-outline">
                  Source: <a className="text-primary hover:underline" href={ds.quality.source_url} target="_blank" rel="noreferrer">News Category Dataset v3</a> by Rishabh Misra (2022), licensed CC BY 4.0.
                </p>
              )}
            </Disclosure>
          </Panel>
          <Notice>Datasets are stored in the project’s data/ folder and never leave this machine.</Notice>
        </>
      )}

      <AddDataset
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(d) => {
          setAdding(false);
          replace(d);
        }}
      />
      <ConfirmDialog open={!!confirm} title="Delete dataset?" confirmLabel="Delete dataset" danger pending={remove.pending} onClose={() => setConfirm(null)} onConfirm={() => confirm && remove.run(confirm.id)}>
        <p>“{confirm?.name}” and its stored CSV will be removed. Models already trained on it keep working.</p>
        {remove.error && (
          <div className="mt-space-sm">
            <ErrorNotice error={remove.error} />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
