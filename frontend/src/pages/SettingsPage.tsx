import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Checkbox, Field, Select, TextInput } from '../components/ui/Form';
import { PageHeader } from '../components/ui/PageHeader';
import { Panel, PanelHeader } from '../components/ui/Panel';
import { ErrorNotice, LoadingRows, Notice } from '../components/ui/States';
import { useAction, useAsync } from '../hooks/useAsync';
import { api } from '../services/api';
import { fmtPct } from '../utils/format';

export default function SettingsPage() {
  const settings = useAsync(() => api.settings());
  const models = useAsync(() => api.models());
  const health = useAsync(() => api.health());
  const [k, setK] = useState('5');
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  useEffect(() => {
    if (settings.data) setK(String(settings.data.similar_documents_k));
  }, [settings.data]);

  const update = useAction(async (body: Parameters<typeof api.updateSettings>[0], label: string) => {
    settings.setData(await api.updateSettings(body));
    setSaved(label);
    window.setTimeout(() => setSaved(null), 2000);
  });
  const clear = useAction(async () => {
    const r = await api.clearClassifications();
    setCleared(r.deleted);
    setConfirmClear(false);
  });

  const completed = (models.data ?? []).filter((m) => m.status === 'completed' && m.is_deployed);
  const s = settings.data;

  return (
    <div className="flex flex-col w-full gap-space-xl max-w-4xl">
      <PageHeader breadcrumb={['Workspace', 'Settings']} title="Settings" description="Defaults used by classification and the similarity search. Changes are saved immediately." />
      {settings.error && <ErrorNotice error={settings.error} title="Unable to load settings." onRetry={settings.reload} />}
      {update.error && <ErrorNotice error={update.error} title="The setting could not be saved." />}

      {!s ? (
        <Panel>
          <LoadingRows rows={4} />
        </Panel>
      ) : (
        <>
          <Panel className="flex flex-col gap-space-md">
            <PanelHeader title="Active model" meta={saved === 'model' ? 'Saved' : undefined} description="Used by default on Classify Text and Batch Classification, and highlighted on the Overview." />
            <Field label="Model">
              <Select
                value={s.active_model_id ?? ''}
                disabled={!completed.length || update.pending}
                onChange={(e) => update.run({ active_model_id: e.target.value ? Number(e.target.value) : null }, 'model')}
                aria-label="Active model"
              >
                {!completed.length && <option value="">No trained models</option>}
                {completed.map((m) => (
                  <option key={m.id} value={m.id}>
                    #{m.id} {m.model_name} · {m.feature_label} · acc {fmtPct(m.metrics?.accuracy)}
                  </option>
                ))}
              </Select>
            </Field>
          </Panel>

          <Panel className="flex flex-col gap-space-md">
            <PanelHeader title="Similar documents" meta={saved === 'k' ? 'Saved' : undefined} description="How many nearest training documents (by cosine similarity) to show after a classification." />
            <div className="flex items-end gap-space-sm">
              <div className="w-32">
                <Field label="Documents shown" hint="1–25">
                  <TextInput type="number" min={1} max={25} value={k} onChange={(e) => setK(e.target.value)} />
                </Field>
              </div>
              <Button variant="secondary" onClick={() => update.run({ similar_documents_k: Number(k) }, 'k')} disabled={Number(k) === s.similar_documents_k || update.pending}>
                Save
              </Button>
            </div>
          </Panel>

          <Panel className="flex flex-col gap-space-md">
            <PanelHeader title="Classification history" meta={saved === 'history' ? 'Saved' : undefined} description="Single-text classifications can be stored locally so they appear on the Overview and in Analytics." />
            <Checkbox label="Store classified texts in the local database" checked={s.store_history} onChange={(v) => update.run({ store_history: v }, 'history')} />
            <div className="flex items-center justify-between gap-space-md pt-space-sm border-t border-outline-variant/15">
              <span className="font-body-sm text-body-sm text-on-surface-variant">{cleared != null ? `Removed ${cleared} stored classification${cleared === 1 ? '' : 's'}.` : 'Remove every stored classification. Models and datasets are not affected.'}</span>
              <Button variant="danger" icon="delete_sweep" onClick={() => setConfirmClear(true)}>
                Clear history
              </Button>
            </div>
          </Panel>
        </>
      )}

      <Panel>
        <PanelHeader title="Environment" meta={health.data?.status === 'ok' ? 'API connected' : undefined} />
        {health.error ? (
          <ErrorNotice error={health.error} />
        ) : !health.data ? (
          <LoadingRows rows={3} />
        ) : (
          <dl className="mt-space-md grid grid-cols-2 sm:grid-cols-3 gap-space-md">
            {Object.entries(health.data.versions).map(([pkg, v]) => (
              <div key={pkg}>
                <dt className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{pkg}</dt>
                <dd className="font-label-md text-label-md text-on-surface">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>
      <Notice>All data, models and history are stored locally in the project folder (data/, trained_models/, experiments/).</Notice>

      <ConfirmDialog open={confirmClear} title="Clear classification history?" confirmLabel="Clear history" danger pending={clear.pending} onClose={() => setConfirmClear(false)} onConfirm={() => clear.run()}>
        <p>All stored single-text classifications will be deleted. The Overview's recent list and the Analytics classification distribution will be empty afterwards.</p>
        {clear.error && <div className="mt-space-sm"><ErrorNotice error={clear.error} /></div>}
      </ConfirmDialog>
    </div>
  );
}
