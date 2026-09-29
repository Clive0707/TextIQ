import type { Experiment } from '../types/api';
import { fmtDateTime, fmtInt, fmtSeconds } from '../utils/format';
import { preprocessSummary } from '../utils/labels';

/** Definition list of a run's full configuration (what was actually trained). */
export function RunConfig({ run }: { run: Experiment }) {
  const m = run.metrics;
  const hp = Object.entries(run.hyperparameters)
    .map(([k, v]) => `${k}=${k === 'gamma' && !v ? 'scale' : v}`)
    .join(', ');
  const rows: [string, string][] = [
    ['Dataset', run.dataset_name],
    ['Classifier', run.model_name],
    ['Hyperparameters', hp || '—'],
    ['Tuning', run.tune ? (m?.tuning ? `${m.tuning.folds}-fold CV on ${fmtInt(m.tuning.n_docs)} training docs · best CV F1 ${m.tuning.best_cv_score.toFixed(3)}` : 'on') : 'off'],
    ['Duplicates removed before split', m?.n_duplicates_removed != null ? `${fmtInt(m.n_duplicates_removed)} + ${fmtInt(m.n_conflicting_removed ?? 0)} conflicting` : '—'],
    ['Training balance', run.train_balance === 'oversample' ? `oversampled (training only) to ${fmtInt(m?.n_train_fit)} docs` : 'none'],
    ['Features', run.feature_label],
    ['Max features / min df', `${run.feature.max_features ? fmtInt(run.feature.max_features) : 'no limit'} / ${run.feature.min_df}`],
    ['Preprocessing', preprocessSummary(run.preprocessing)],
    ['Split', `${Math.round((1 - run.test_size) * 100)}/${Math.round(run.test_size * 100)} stratified · seed ${run.random_state}`],
    ['Cross-validation', run.cv_folds ? `${run.cv_folds}-fold on train split` : 'not run'],
    ['Training docs', m ? `${fmtInt(m.n_train)}${run.max_train_samples ? ` (capped at ${fmtInt(run.max_train_samples)})` : ''}` : run.max_train_samples ? `cap ${fmtInt(run.max_train_samples)}` : 'all'],
    ['Test docs', m ? fmtInt(m.n_test) : '—'],
    ['Vocabulary size', m ? fmtInt(m.n_features) : '—'],
    ['Fit time / predict time', m ? `${fmtSeconds(m.train_seconds)} / ${fmtSeconds(m.eval_seconds)}` : '—'],
    ['Started', fmtDateTime(run.created_at)],
    ['Completed', fmtDateTime(run.completed_at)],
  ];
  if (m?.excluded_classes?.length) rows.push(['Excluded classes', `${m.excluded_classes.join(', ')} (fewer than 2 examples)`]);
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-space-xl gap-y-space-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-space-md border-b border-outline-variant/15 pb-1.5 min-w-0">
          <dt className="font-label-sm text-label-sm text-outline shrink-0">{k}</dt>
          <dd className="font-body-sm text-body-sm text-on-surface text-right truncate" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
