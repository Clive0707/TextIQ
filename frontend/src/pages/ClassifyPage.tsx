import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FEATURE_NAMES, ModelFeaturePicker } from '../components/ModelFeaturePicker';
import { FeatureWeightRow, ProbabilityRow } from '../components/ui/Bars';
import { Button, ButtonLink } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { InfoTip, Tabs } from '../components/ui/Disclosure';
import { Segmented } from '../components/ui/Form';
import { Icon } from '../components/ui/Icon';
import { SectionHeader } from '../components/ui/PageHeader';
import { Caption, Panel } from '../components/ui/Panel';
import { EmptyState, ErrorNotice, LoadingRows, Notice, Skeleton, Spinner } from '../components/ui/States';
import { useTrainedModels } from '../hooks/useTrainedModels';
import { ApiError, api } from '../services/api';
import type { ClassifyResult, Experiment, SimilarityResult } from '../types/api';
import { downloadBlob, fmtInt, fmtPct, fmtScore, fmtSigned } from '../utils/format';
import { preprocessSummary } from '../utils/labels';

const TOP_N = 3;

type AnalysisTab = 'nlp' | 'probabilities' | 'features' | 'similar' | 'details';
type SimilarState = { loading: boolean; data: SimilarityResult | null; error: ApiError | null };

/** Probability wording that is honest about where the number comes from. */
function confidenceLabel(method: string) {
  const m = method.toLowerCase();
  if (m.includes('uncalibrated')) return 'Probability (uncalibrated)';
  return m.includes('calibrated') ? 'Calibrated probability' : 'Probability';
}

/* ------------------------------------------------------------ processing checklist */

function ProcessingSteps({ result, pending, modelName }: { result: ClassifyResult | null; pending: boolean; modelName: string }) {
  if (!pending && !result) return null;
  const p = result?.preprocessing;
  const featureName = result ? FEATURE_NAMES[result.vector.kind] ?? result.model.feature_label : 'features';
  const steps: [string, string | null][] = [
    ['Text cleaned', p ? [p.config.lowercase && 'lowercased', p.config.remove_punctuation && 'punctuation removed', 'whitespace normalised'].filter(Boolean).join(', ') : null],
    ['Tokens generated', p ? `${p.tokens.length} tokens` : null],
    ['Stop words handled', p ? (p.config.remove_stopwords ? `${p.removed_stopwords.length} removed, ${p.filtered_tokens.length} kept` : 'kept (not removed by this model)') : null],
    [`${featureName} features generated`, result ? `${result.vector.n_nonzero} non-zero of ${fmtInt(result.vector.n_features)} dimensions` : null],
    ['Model prediction completed', result ? result.model.model_name : null],
  ];
  return (
    <Panel variant="plain" className="py-space-md animate-fade-in" aria-live="polite">
      <ol className="flex flex-col gap-1.5">
        {steps.map(([title, detail]) => (
          <li key={title} className="flex items-center gap-space-sm font-body-sm text-body-sm">
            {pending ? <Spinner size={14} className="text-primary" /> : <Icon name="check_circle" size={16} className="text-primary" filled />}
            <span className={pending ? 'text-on-surface-variant' : 'text-on-surface'}>{title}</span>
            {detail && <span className="font-label-sm text-label-sm text-outline truncate">— {detail}</span>}
          </li>
        ))}
      </ol>
      {pending && <p className="mt-space-sm font-label-sm text-label-sm text-outline">Running the saved {modelName} pipeline…</p>}
    </Panel>
  );
}

/* ------------------------------------------------------------------ result card */

function ResultCard({ result, pending }: { result: ClassifyResult | null; pending: boolean }) {
  if (!result) {
    return (
      <Panel variant="plain">
        {pending ? (
          <div className="flex flex-col gap-space-md" aria-busy="true">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-1.5 w-full" />
            <LoadingRows rows={3} />
          </div>
        ) : (
          <EmptyState icon="category" title="No prediction yet">
            Enter some text, choose a model and select <span className="text-on-surface">Classify text</span>.
          </EmptyState>
        )}
      </Panel>
    );
  }
  const top = result.probabilities.slice(0, TOP_N);
  return (
    <Panel variant="plain" className={`flex flex-col gap-space-md animate-fade-up transition-opacity ${pending ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-space-md">
        <div className="flex flex-col min-w-0">
          <Caption className="mb-1">Predicted category</Caption>
          <span className="font-display-lg-mobile text-display-lg-mobile sm:font-display-lg sm:text-display-lg text-on-surface tracking-tight break-words">{result.predicted_label}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <Caption className="mb-1 flex items-center gap-1">
            {confidenceLabel(result.probability_method)}
            <InfoTip>
              {result.probability_method}. The model’s estimated probability that the text belongs to this category.
              {result.decision_scores ? ' Raw SVM margins are shown separately under Class Probabilities and are not probabilities.' : ''}
            </InfoTip>
          </Caption>
          <span className="font-headline-md text-headline-md text-primary font-medium tabular">{fmtPct(result.confidence)}</span>
        </div>
      </div>
      <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
        <div className="bg-primary-container h-full origin-left animate-bar-grow" style={{ width: `${result.confidence * 100}%` }} />
      </div>
      <div className="flex flex-col gap-space-sm pt-space-sm border-t border-outline-variant/15">
        <span className="font-label-sm text-label-sm text-outline">Top categories</span>
        {top.map((p, i) => (
          <ProbabilityRow key={p.label} label={p.label} value={p.probability} highlight={i === 0} />
        ))}
      </div>
      <p className="font-label-sm text-label-sm text-outline">
        {result.model.model_name} · {result.model.feature_label}
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ analysis tabs */

function Stage({ n, title, children, last }: { n: number; title: string; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-space-md pb-space-lg last:pb-0">
      {!last && <span aria-hidden className="absolute left-[11px] top-7 bottom-0 w-px bg-outline-variant/40" />}
      <span className="relative z-10 w-6 h-6 shrink-0 rounded bg-surface-container text-primary font-label-sm text-label-sm flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5 pt-0.5">
        <span className="font-label-lg text-label-lg text-on-surface">{title}</span>
        {children}
      </div>
    </li>
  );
}

function TokenList({ tokens, struck }: { tokens: string[]; struck?: Set<string> }) {
  const [all, setAll] = useState(false);
  const shown = all ? tokens : tokens.slice(0, 40);
  if (!tokens.length) return <span className="font-body-sm text-body-sm text-outline">No tokens.</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((t, i) => (
        <span key={i} className={`px-1.5 py-px rounded font-mono text-[11px] leading-4 ${struck?.has(t.toLowerCase()) ? 'text-outline line-through' : 'text-on-surface bg-surface-container'}`}>
          {t}
        </span>
      ))}
      {tokens.length > 40 && (
        <button onClick={() => setAll((v) => !v)} className="font-label-sm text-label-sm text-outline hover:text-on-surface px-1">
          {all ? 'Show fewer' : `+${tokens.length - 40} more`}
        </button>
      )}
    </div>
  );
}

function NlpTab({ result }: { result: ClassifyResult }) {
  const p = result.preprocessing;
  const v = result.vector;
  const removed = new Set(p.removed_stopwords.map((t) => t.toLowerCase()));
  const featureName = FEATURE_NAMES[v.kind] ?? result.model.feature_label;
  const maxW = Math.max(1e-9, ...v.top_terms.map((t) => t.weight));
  return (
    <ol className="flex flex-col">
      <Stage n={1} title="Original text">
        <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3">{p.original}</p>
      </Stage>
      <Stage n={2} title="Text cleaning">
        <p className="font-label-sm text-label-sm text-outline">{[p.config.lowercase && 'Lowercasing', p.config.remove_punctuation && 'punctuation removal', 'whitespace normalisation'].filter(Boolean).join(' · ')}</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3">{p.cleaned || '—'}</p>
      </Stage>
      <Stage n={3} title={`Tokenization — ${p.tokens.length} tokens`}>
        <TokenList tokens={p.tokens} />
      </Stage>
      <Stage n={4} title={p.config.remove_stopwords ? `Stop-word removal — ${p.removed_stopwords.length} removed, ${p.filtered_tokens.length} kept` : 'Stop-word removal — disabled for this model'}>
        <TokenList tokens={p.tokens} struck={p.config.remove_stopwords ? removed : undefined} />
      </Stage>
      <Stage n={5} title={`Normalized text${p.config.stemming ? ' (Porter-stemmed)' : ''}`}>
        <p className="font-mono text-[11px] leading-4 text-on-surface-variant break-words">{p.final || '—'}</p>
      </Stage>
      <Stage n={6} title={`${featureName} — ${result.model.feature_label}`}>
        {v.top_terms.length ? (
          <div className="flex flex-col gap-1.5 max-w-md">
            <span className="font-label-sm text-label-sm text-outline">Highest {featureName === 'Bag of Words' ? 'term counts' : 'TF-IDF weights'} in this text</span>
            {v.top_terms.map((t) => (
              <FeatureWeightRow key={t.term} feature={t.term} magnitude={t.weight / maxW} display={v.kind === 'bow' ? String(t.weight) : t.weight.toFixed(2)} />
            ))}
          </div>
        ) : (
          <span className="font-body-sm text-body-sm text-outline">No term of this text is in the model vocabulary.</span>
        )}
      </Stage>
      <Stage n={7} title="Numerical feature vector">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          A sparse vector of <span className="text-on-surface tabular">{fmtInt(v.n_features)}</span> dimensions, of which <span className="text-on-surface tabular">{v.n_nonzero}</span> are non-zero
          {v.kind !== 'char' && <> — {v.n_in_vocabulary} of {v.n_tokens} processed tokens are known to the model</>}.
        </p>
      </Stage>
      <Stage n={8} title="Model → prediction" last>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {result.model.model_name} maps the vector to <span className="text-on-surface">{result.predicted_label}</span> with {confidenceLabel(result.probability_method).toLowerCase()} {fmtPct(result.confidence)}.
        </p>
      </Stage>
    </ol>
  );
}

function ProbabilitiesTab({ result }: { result: ClassifyResult }) {
  const [view, setView] = useState<'probability' | 'margin'>('probability');
  const margins = result.decision_scores;
  const marginMax = margins ? Math.max(1e-9, ...margins.map((m) => Math.abs(m.score))) : 1;
  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between gap-2">
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {view === 'probability' ? `${result.probability_method} — sums to 100% across categories.` : 'Raw SVM margins (distance from each one-vs-rest hyperplane). These are not probabilities.'}
        </span>
        {margins && <Segmented value={view} onChange={setView} options={[{ value: 'probability', label: 'Probability' }, { value: 'margin', label: 'SVM margin' }]} />}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-space-xl gap-y-space-sm">
        {view === 'probability' || !margins
          ? result.probabilities.map((p, i) => <ProbabilityRow key={p.label} label={p.label} value={p.probability} highlight={i === 0} />)
          : margins.map((m, i) => <ProbabilityRow key={m.label} label={m.label} value={Math.max(0, m.score) / marginMax} highlight={i === 0} right={m.score.toFixed(3)} />)}
      </div>
    </div>
  );
}

function FeaturesTab({ result }: { result: ClassifyResult }) {
  const exp = result.explanation;
  if (!exp.available) return <Notice>{exp.note}</Notice>;
  const maxAbs = Math.max(1e-9, ...exp.supporting.map((f) => Math.abs(f.contribution)), ...exp.opposing.map((f) => Math.abs(f.contribution)));
  return (
    <div className="flex flex-col gap-space-md">
      <p className="font-body-sm text-body-sm text-on-surface-variant">Features associated with the model’s decision for “{exp.target_label}”. They show what the model weighed, not what caused the category.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-xl">
        <div className="flex flex-col gap-2">
          <span className="font-label-sm text-label-sm text-outline">Towards “{exp.target_label}”</span>
          {exp.supporting.length ? exp.supporting.map((f) => <FeatureWeightRow key={f.feature} feature={f.feature} magnitude={Math.abs(f.contribution) / maxAbs} display={fmtSigned(f.contribution)} />) : <span className="font-body-sm text-body-sm text-on-surface-variant">None.</span>}
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-label-sm text-label-sm text-outline">Against it</span>
          {exp.opposing.length ? exp.opposing.map((f) => <FeatureWeightRow key={f.feature} feature={f.feature} magnitude={Math.abs(f.contribution) / maxAbs} display={fmtSigned(f.contribution)} negative />) : <span className="font-body-sm text-body-sm text-on-surface-variant">None.</span>}
        </div>
      </div>
      <Notice>{exp.note}</Notice>
    </div>
  );
}

function SimilarTab({ state }: { state: SimilarState }) {
  if (state.loading) return <LoadingRows rows={3} />;
  if (state.error) return <ErrorNotice error={state.error} title="Unable to find similar documents." />;
  if (!state.data) return null;
  if (!state.data.results.length) return <p className="font-body-sm text-body-sm text-on-surface-variant">No training document shares any words with this text.</p>;
  return (
    <div className="flex flex-col gap-space-sm">
      <ul className="flex flex-col divide-y divide-outline-variant/15">
        {state.data.results.map((d) => (
          <li key={d.index} className="py-space-sm first:pt-0 flex gap-space-md">
            <span className="font-label-md text-label-md text-primary tabular w-12 shrink-0 text-right">{fmtPct(d.similarity, 0)}</span>
            <p className="min-w-0 flex-1 font-body-sm text-body-sm text-on-surface line-clamp-2">{d.snippet}</p>
            <Chip className="self-start">{d.label}</Chip>
          </li>
        ))}
      </ul>
      <Notice>
        Text → {state.data.space} vector → cosine similarity against {fmtInt(state.data.corpus_size)} training documents. Shown for context — it does not decide the prediction.
      </Notice>
    </div>
  );
}

function DetailsTab({ result, run, onExport, onCopy, copied }: { result: ClassifyResult; run: Experiment | undefined; onExport: () => void; onCopy: () => void; copied: boolean }) {
  const m = run?.metrics;
  const hp = run ? Object.entries(run.hyperparameters).map(([k, v]) => `${k}=${k === 'gamma' && !v ? 'scale' : v}`).join(', ') : '—';
  const rows: [string, string][] = [
    ['Model', `${result.model.model_name} (run #${result.model.id})`],
    ['Features', result.model.feature_label],
    ['Parameters', `${hp}${run?.tune ? ' · tuned by 3-fold CV' : ''}`],
    ['Preprocessing', preprocessSummary(result.preprocessing.config)],
    ['Confidence method', result.probability_method],
    ['Trained on', run && m ? `${run.dataset_name} · ${fmtInt(m.n_train)} unique documents` : '—'],
    ['Test accuracy', m ? `${fmtPct(m.accuracy)} · macro F1 ${fmtScore(m.f1_macro)} on ${fmtInt(m.n_test)} unseen documents` : '—'],
  ];
  return (
    <div className="flex flex-col gap-space-md">
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-space-xl gap-y-space-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-space-md border-b border-outline-variant/15 pb-1.5 min-w-0">
            <dt className="font-label-sm text-label-sm text-outline shrink-0">{k}</dt>
            <dd className="font-body-sm text-body-sm text-on-surface text-right truncate" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-space-lg">
        <Button variant="link" icon="data_object" onClick={onExport}>
          Export analysis (JSON)
        </Button>
        <Button variant="link" icon={copied ? 'check' : 'content_copy'} onClick={onCopy}>
          {copied ? 'Copied to clipboard' : 'Copy prediction summary'}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- page */

export default function ClassifyPage() {
  const { completed, usable, catalog, loading: modelsLoading, error: modelsError, reload: reloadModels } = useTrainedModels();
  const [params] = useSearchParams();
  const [text, setText] = useState('');
  const [modelType, setModelType] = useState('');
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState<AnalysisTab>('nlp');
  const [similar, setSimilar] = useState<SimilarState | null>(null);
  const [sampleNote, setSampleNote] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!modelType && usable.length) setModelType((usable.find((x) => x.is_active) ?? usable[0]).model_type);
  }, [usable, modelType]);

  const historyId = params.get('history');
  useEffect(() => {
    if (!historyId || !/^\d+$/.test(historyId)) return;
    api
      .classification(Number(historyId))
      .then((c) => {
        setText(c.text);
        setSampleNote(`From history — previously classified as ${c.predicted_label} by ${c.model_name}.`);
      })
      .catch((e: ApiError) => setError(e));
  }, [historyId]);

  const run = usable.find((r) => r.model_type === modelType) ?? null;

  useEffect(() => {
    if (tab !== 'similar' || !result || similar) return;
    setSimilar({ loading: true, data: null, error: null });
    api
      .similarity(text, result.model.id)
      .then((s) => setSimilar({ loading: false, data: s, error: null }))
      .catch((e: ApiError) => setSimilar({ loading: false, data: null, error: e }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, result, similar]);

  const classify = async () => {
    if (!run) return;
    if (!text.trim()) {
      setError(new ApiError('empty_text', 'Enter some text to classify.'));
      return;
    }
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const r = await api.classify(text, run.id);
      setResult(r);
      setSimilar(null);
    } catch (e) {
      setResult(null);
      setError(e as ApiError);
    } finally {
      setPending(false);
    }
  };

  const loadSample = async () => {
    if (!run) return;
    setSampling(true);
    try {
      const s = await api.modelSample(run.id);
      setText(s.text);
      setSampleNote(`Test document the model never saw · true category: ${s.label}`);
      setResult(null);
      setSimilar(null);
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setSampling(false);
    }
  };

  const clear = () => {
    setText('');
    setResult(null);
    setSimilar(null);
    setError(null);
    setSampleNote(null);
  };

  const exportJson = () => {
    if (!result) return;
    const payload = { input: text, result, similar_documents: similar?.data ?? null, exported_at: new Date().toISOString() };
    downloadBlob(`textiq-classification-${result.classification_id ?? 'result'}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const copySummary = async () => {
    if (!result) return;
    const terms = result.explanation.supporting.slice(0, 3).map((f) => `${f.feature} (${fmtSigned(f.contribution)})`).join(', ');
    const summary = [`Category: ${result.predicted_label} (${fmtPct(result.confidence)}, ${result.probability_method})`, `Model: ${result.model.model_name} · ${result.model.feature_label}`, terms ? `Associated features: ${terms}` : null]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(new ApiError('clipboard', 'The browser blocked clipboard access.'));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && run && !pending) {
        e.preventDefault();
        void classify();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const noModels = !modelsLoading && usable.length === 0;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col w-full gap-gutter-lg">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
        <div className="lg:col-span-7 flex flex-col gap-space-lg min-w-0">
          <SectionHeader as="h1" title="Classify text" description="Paste a news headline or article to predict its category." />
          {modelsError && <ErrorNotice error={modelsError} title="Unable to load trained models." onRetry={reloadModels} />}

          {noModels ? (
            <Panel variant="plain">
              <EmptyState icon="account_tree" title="No trained model yet" action={<ButtonLink to="/models?tab=train" variant="primary" icon="model_training">Train a model</ButtonLink>}>
                Classification needs at least one trained model.
              </EmptyState>
            </Panel>
          ) : (
            <>
              <Panel variant="plain" as="div" className="flex flex-col gap-space-sm">
                <div className="relative bg-surface-container-lowest rounded p-space-sm">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={7}
                    aria-label="Text to classify"
                    placeholder="e.g. “The company announced strong quarterly revenue growth.”"
                    className="w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none resize-y leading-relaxed min-h-[140px]"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 font-label-sm text-label-sm text-outline">
                  <span>
                    {fmtInt(words)} words · {fmtInt(text.length)} characters
                  </span>
                  <button onClick={loadSample} disabled={!run || sampling} className="inline-flex items-center gap-1 hover:text-on-surface transition-colors disabled:opacity-50">
                    <Icon name="shuffle" size={14} /> {sampling ? 'Loading…' : 'Load a test sample'}
                  </button>
                </div>
                {sampleNote && <p className="font-label-sm text-label-sm text-on-surface-variant">{sampleNote}</p>}
              </Panel>

              {modelsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                  <Skeleton className="h-[62px]" />
                  <Skeleton className="h-[62px]" />
                </div>
              ) : (
                <ModelFeaturePicker usable={usable} catalog={catalog} modelType={modelType} disabled={pending} onChange={setModelType} />
              )}

              <div className="flex items-center justify-between gap-space-sm">
                <Button variant="subtle" onClick={clear} disabled={!text && !result}>
                  Clear
                </Button>
                <Button variant="primary-lg" icon="play_arrow" loading={pending} disabled={!run} onClick={classify} title="Classify (Ctrl+Enter)">
                  {pending ? 'Classifying…' : 'Classify text'}
                </Button>
              </div>
              {error && <ErrorNotice error={error} title={error.code === 'empty_text' ? undefined : 'Unable to classify the text.'} />}
              <ProcessingSteps result={pending ? null : result} pending={pending} modelName={run?.model_name ?? 'model'} />
            </>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-space-lg min-w-0">
          <SectionHeader title="Result" description="The predicted category and how confident the model is." />
          <ResultCard result={result} pending={pending} />
        </div>
      </div>

      {result && (
        <Panel variant="plain" className="animate-fade-up">
          <div className="flex items-baseline justify-between gap-space-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Analysis</h2>
            <span className="font-label-sm text-label-sm text-outline">How the text became “{result.predicted_label}”</span>
          </div>
          <Tabs
            className="mt-space-sm"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'nlp', label: 'NLP Processing' },
              { value: 'probabilities', label: 'Class Probabilities' },
              { value: 'features', label: 'Important Features' },
              { value: 'similar', label: 'Similar Documents' },
              { value: 'details', label: 'Model Details' },
            ]}
          />
          <div className="pt-space-lg" role="tabpanel">
            {tab === 'nlp' && <NlpTab result={result} />}
            {tab === 'probabilities' && <ProbabilitiesTab result={result} />}
            {tab === 'features' && <FeaturesTab result={result} />}
            {tab === 'similar' && similar && <SimilarTab state={similar} />}
            {tab === 'details' && <DetailsTab result={result} run={completed.find((m) => m.id === result.model.id)} onExport={exportJson} onCopy={copySummary} copied={copied} />}
          </div>
        </Panel>
      )}
    </div>
  );
}
