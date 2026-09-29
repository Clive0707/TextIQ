import type { FeatureConfig, PreprocessConfig } from '../types/api';

/** Human-readable label for a feature configuration; mirrors backend feature_label(). */
export function featureLabel(f: FeatureConfig) {
  const range = f.ngram_min === f.ngram_max ? `${f.ngram_min}-gram` : `${f.ngram_min},${f.ngram_max}-gram`;
  if (f.kind === 'char') return `Char n-grams (${f.ngram_min}–${f.ngram_max})`;
  if (f.kind === 'bow') return `Bag of Words (${range})`;
  if (f.kind === 'combo') return `TF-IDF words (${range}) + characters (2–5)`;
  return `TF-IDF (${range}${f.sublinear_tf ? ', sublinear' : ''})`;
}

export function preprocessSummary(p: PreprocessConfig) {
  const parts: string[] = [];
  if (p.lowercase) parts.push('lowercase');
  if (p.remove_punctuation) parts.push('strip punctuation');
  if (p.remove_stopwords) parts.push('stop words removed');
  if (p.stemming) parts.push('Porter stemming');
  return parts.length ? parts.join(' · ') : 'raw tokens';
}

export const DEFAULT_FEATURE: FeatureConfig = {
  kind: 'tfidf',
  ngram_min: 1,
  ngram_max: 2,
  max_features: 150000,
  sublinear_tf: true,
  min_df: 1,
};

export const DEFAULT_PREPROCESS: PreprocessConfig = {
  lowercase: true,
  remove_punctuation: true,
  remove_stopwords: true,
  stemming: false,
};
