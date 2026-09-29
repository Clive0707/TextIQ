// Shapes returned by the Flask API. Every endpoint responds with ApiEnvelope<T>.

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: string[] } };

export type LabelCount = { label: string; count: number; unique?: number };

export type DatasetStatus = 'needs_columns' | 'ready' | 'invalid';

export type DatasetValidation = {
  errors: string[];
  warnings: string[];
  empty_text_rows: number;
  missing_label_rows: number;
  duplicate_rows: number;
  usable_rows: number;
  conflicting_rows?: number;
  duplicate_ids?: number | null;
  unique_rows?: number;
  short_rows?: number;
  words?: { min: number; median: number; mean: number; max: number } | null;
};

export type Dataset = {
  id: number;
  name: string;
  source: 'builtin' | 'upload';
  filename: string;
  n_rows: number;
  columns: string[];
  text_column: string | null;
  label_column: string | null;
  n_classes: number | null;
  class_distribution: LabelCount[] | null;
  status: DatasetStatus;
  validation: DatasetValidation | null;
  description: string | null;
  quality: QualityReport | TextIQReport | null;
  created_at: string;
};

/** Cleaning report produced when a built-in dataset is prepared (all values measured). */
export type QualityReport = {
  source: string;
  source_url: string;
  source_records: number;
  excluded_other_sections: number;
  excluded_sections: number;
  mapped_records: number;
  empty_text: number;
  too_short: number;
  min_words: number;
  conflicting_duplicates: number;
  duplicate_texts: number;
  repeated_headlines_kept: number;
  headline_only_records: number;
  final_records: number;
  categories: LabelCount[];
  mapping: { topic: string; sources: string[]; count: number }[];
  imbalance_ratio: number;
  date_range: [string, string];
};

/** Quality report of the provided TextIQ 120K file (all values measured by the backend). */
export type TextIQReport = {
  kind: 'textiq';
  rows: number;
  categories: { label: string; rows: number; unique: number }[];
  missing_text: number;
  missing_category: number;
  duplicate_ids: number;
  duplicate_texts: number;
  exact_copies: number;
  exact_copy_columns: string[];
  conflicting_rows: number;
  unique_documents: number;
  short_texts: number;
  words: { min: number; median: number; mean: number; max: number };
  source_mapping: { source: string; category: string; rows: number }[];
  oversampled_flag_rows: number | null;
  date_range: [string, string] | null;
  metadata_columns: string[];
};

export type BuiltinDataset = { key: string; name: string; description: string; dataset_id: number | null };

export type DatasetPreview = {
  columns: string[];
  rows: Record<string, string>[];
  total: number;
  offset: number;
};

export type FeatureKind = 'tfidf' | 'bow' | 'char' | 'combo';

export type FeatureConfig = {
  kind: FeatureKind;
  ngram_min: number;
  ngram_max: number;
  max_features: number | null;
  sublinear_tf: boolean;
  min_df: number;
};

export type PreprocessConfig = {
  lowercase: boolean;
  remove_punctuation: boolean;
  remove_stopwords: boolean;
  stemming: boolean;
};

export type ModelType = 'linear_svm' | 'rbf_svm' | 'mnb' | 'cnb' | 'logreg';

export type HyperparameterSpec = {
  name: string;
  label: string;
  type: 'float' | 'int' | 'bool';
  default: number | boolean;
  min: number;
  max: number;
  step: number;
  help: string;
};

export type ModelSpec = {
  type: ModelType;
  name: string;
  short_name: string;
  estimator: string;
  description: string;
  probability_method: string;
  explanation: 'coefficients' | 'naive_bayes' | 'none';
  explanation_note: string;
  hyperparameters: HyperparameterSpec[];
  cost_note: string | null;
  grid: Record<string, number[]>;
};

export type TuningInfo = {
  scoring: string;
  folds: number;
  n_docs: number;
  best_params: Record<string, number | boolean>;
  best_cv_score: number;
  results: { params: Record<string, number>; mean: number; std: number }[];
};

export type PerClassMetric = {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

export type Metrics = {
  accuracy: number;
  precision_macro: number;
  recall_macro: number;
  f1_macro: number;
  precision_weighted: number;
  recall_weighted: number;
  f1_weighted: number;
  cv_folds: number;
  cv_f1_macro_mean: number | null;
  cv_f1_macro_std: number | null;
  n_train: number;
  n_test: number;
  n_features: number;
  train_seconds: number;
  eval_seconds: number;
  per_class: PerClassMetric[];
  confusion_matrix: { labels: string[]; matrix: number[][] };
  excluded_classes?: string[];
  n_source_rows?: number;
  n_duplicates_removed?: number;
  n_conflicting_removed?: number;
  n_train_fit?: number;
  split_counts?: Record<string, { train: number; test: number }>;
  tuning?: TuningInfo | null;
};

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type Experiment = {
  id: number;
  name: string;
  dataset_id: number;
  dataset_name: string;
  model_type: ModelType;
  model_name: string;
  feature: FeatureConfig;
  feature_label: string;
  preprocessing: PreprocessConfig;
  hyperparameters: Record<string, number | boolean>;
  test_size: number;
  cv_folds: number;
  random_state: number;
  max_train_samples: number | null;
  tune: boolean;
  train_balance: 'none' | 'oversample';
  status: RunStatus;
  stage: string | null;
  progress: number;
  error: string | null;
  metrics: Metrics | null;
  labels: string[] | null;
  has_artifact: boolean;
  is_active: boolean;
  /** One of the four usable models (one deployed run per model type). */
  is_deployed: boolean;
  created_at: string;
  completed_at: string | null;
};

export type TrainRequest = {
  name?: string;
  dataset_id: number;
  model_type: ModelType;
  feature: FeatureConfig;
  preprocessing: PreprocessConfig;
  hyperparameters: Record<string, number | boolean>;
  test_size: number;
  cv_folds: number;
  random_state: number;
  max_train_samples: number | null;
  tune: boolean;
  train_balance: 'none' | 'oversample';
};

export type PreprocessTrace = {
  original: string;
  cleaned: string;
  tokens: string[];
  removed_stopwords: string[];
  filtered_tokens: string[];
  final: string;
  config: PreprocessConfig;
};

export type FeatureContribution = {
  feature: string;
  value: number;
  weight: number;
  contribution: number;
};

export type Explanation = {
  available: boolean;
  method: string | null;
  note: string;
  target_label: string | null;
  supporting: FeatureContribution[];
  opposing: FeatureContribution[];
};

export type ClassifyResult = {
  classification_id: number;
  model: { id: number; name: string; model_type: ModelType; model_name: string; feature_label: string };
  predicted_label: string;
  confidence: number;
  probability_method: string;
  probabilities: { label: string; probability: number }[];
  decision_scores: { label: string; score: number }[] | null;
  preprocessing: PreprocessTrace;
  vector: { n_nonzero: number; n_features: number; n_tokens: number; n_in_vocabulary: number; kind: FeatureKind; top_terms: { term: string; weight: number }[] };
  explanation: Explanation;
};

export type SimilarDocument = {
  index: number;
  snippet: string;
  label: string;
  similarity: number;
};

export type SimilarityResult = {
  method: string;
  space: string;
  model_id: number;
  corpus_size: number;
  results: SimilarDocument[];
};

export type ClassificationRecord = {
  id: number;
  excerpt: string;
  predicted_label: string;
  confidence: number;
  model_id: number | null;
  model_name: string;
  created_at: string;
};

export type OverviewData = {
  active_model: Experiment | null;
  dataset: Dataset | null;
  benchmark: Experiment[];
  recent: ClassificationRecord[];
  totals: { classifications: number; batch_documents: number; datasets: number; trained_models: number };
  distribution_stats: { entropy_bits: number; max_entropy_bits: number; imbalance_ratio: number } | null;
};

export type AnalyticsData = {
  model: Experiment | null;
  comparison: Experiment[];
  prediction_distribution: LabelCount[];
  history_count: number;
};

export type BatchUpload = {
  upload_id: string;
  filename: string;
  columns: string[];
  n_rows: number;
  preview: Record<string, string>[];
  suggested_text_column: string | null;
};

export type BatchRow = {
  row: number;
  text: string;
  predicted_label: string | null;
  confidence: number | null;
  status: 'ok' | 'skipped';
  note: string | null;
};

export type BatchJob = {
  job_id: string;
  filename: string;
  text_column: string;
  model: { id: number; name: string; feature_label: string };
  n_rows: number;
  n_classified: number;
  n_skipped: number;
  summary: LabelCount[];
  rows: BatchRow[];
  total_rows: number;
  offset: number;
  created_at: string;
};

export type DeployedSlot = { type: ModelType; name: string; run: Experiment | null };

export type Settings = {
  active_model_id: number | null;
  similar_documents_k: number;
  store_history: boolean;
};

export type SearchResults = {
  datasets: { id: number; name: string; n_rows: number }[];
  models: { id: number; name: string; model_name: string; feature_label: string; status: RunStatus }[];
  classifications: { id: number; excerpt: string; predicted_label: string; created_at: string }[];
};

export type Health = {
  status: string;
  versions: Record<string, string>;
};
