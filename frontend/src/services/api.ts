import type {
  AnalyticsData,
  ApiEnvelope,
  BatchJob,
  BatchUpload,
  BuiltinDataset,
  ClassificationRecord,
  ClassifyResult,
  Dataset,
  DatasetPreview,
  DeployedSlot,
  Experiment,
  Health,
  ModelSpec,
  OverviewData,
  SearchResults,
  Settings,
  SimilarityResult,
  TrainRequest,
} from '../types/api';

/** Error carrying the API's user-facing message (never a stack trace). */
export class ApiError extends Error {
  code: string;
  details: string[];
  constructor(code: string, message: string, details: string[] = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('network', 'Cannot reach the TextIQ server. Make sure the backend is running.');
  }
  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError('bad_response', `The server returned an unexpected response (HTTP ${res.status}).`);
  }
  if (!body.ok) throw new ApiError(body.error.code, body.error.message, body.error.details ?? []);
  return body.data;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

const upload = (file: File, extra: Record<string, string> = {}): RequestInit => {
  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return { method: 'POST', body: form };
};

export const api = {
  health: () => request<Health>('/health'),

  // Datasets
  datasets: () => request<Dataset[]>('/datasets'),
  datasetPreview: (id: number, offset = 0, limit = 25) =>
    request<DatasetPreview>(`/datasets/${id}/preview?offset=${offset}&limit=${limit}`),
  uploadDataset: (file: File, name: string) => request<Dataset>('/datasets/upload', upload(file, { name })),
  builtinDatasets: () => request<BuiltinDataset[]>('/datasets/builtin'),
  loadBuiltin: (key: string) => request<Dataset>(`/datasets/builtin/${key}`, { method: 'POST' }),
  setDatasetColumns: (id: number, text_column: string, label_column: string) =>
    request<Dataset>(`/datasets/${id}`, json('PATCH', { text_column, label_column })),
  deleteDataset: (id: number) => request<{ deleted: number }>(`/datasets/${id}`, { method: 'DELETE' }),

  // Models / experiments
  modelCatalog: () => request<ModelSpec[]>('/models/catalog'),
  experiments: () => request<Experiment[]>('/experiments'),
  models: () => request<Experiment[]>('/models'),
  train: (body: TrainRequest) => request<Experiment>('/models/train', json('POST', body)),
  modelSample: (id: number) => request<{ text: string; label: string; dataset: string; n_samples: number }>(`/models/${id}/sample`),
  deployedModels: () => request<DeployedSlot[]>('/models/deployed'),
  deployModel: (id: number) => request<Experiment>(`/models/${id}/deploy`, { method: 'POST' }),
  reportUrl: (modelId?: number) => `/api/reports/evaluation.pdf${modelId ? `?model_id=${modelId}` : ''}`,
  activateModel: (id: number) => request<Experiment>(`/models/${id}/activate`, { method: 'POST' }),
  deleteModel: (id: number) => request<{ deleted: number }>(`/models/${id}`, { method: 'DELETE' }),

  // Classification
  classify: (text: string, model_id: number) => request<ClassifyResult>('/classify', json('POST', { text, model_id })),
  similarity: (text: string, model_id: number, k?: number) =>
    request<SimilarityResult>('/similarity', json('POST', { text, model_id, k })),
  classifications: (limit = 50) => request<ClassificationRecord[]>(`/classifications?limit=${limit}`),
  classification: (id: number) => request<ClassificationRecord & { text: string }>(`/classifications/${id}`),
  clearClassifications: () => request<{ deleted: number }>('/classifications', { method: 'DELETE' }),

  // Batch
  batchUpload: (file: File) => request<BatchUpload>('/batch/upload', upload(file)),
  batchClassify: (upload_id: string, text_column: string, model_id: number) =>
    request<BatchJob>('/batch/classify', json('POST', { upload_id, text_column, model_id })),
  batchRows: (job_id: string, offset: number, limit: number) =>
    request<BatchJob>(`/batch/${job_id}?offset=${offset}&limit=${limit}`),
  batchDownloadUrl: (job_id: string) => `/api/batch/${job_id}/download`,

  // Analytics & overview
  overview: () => request<OverviewData>('/analytics/overview'),
  analytics: (model_id?: number) => request<AnalyticsData>(`/analytics${model_id ? `?model_id=${model_id}` : ''}`),

  // Settings & search
  settings: () => request<Settings>('/settings'),
  updateSettings: (body: Partial<Settings>) => request<Settings>('/settings', json('PUT', body)),
  search: (q: string) => request<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
};
