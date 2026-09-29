import type { Experiment } from '../types/api';
import { Chip } from './ui/Chip';

/** Status cell: progress bar while training, chip otherwise. */
export function RunStatus({ run }: { run: Experiment }) {
  if (run.status === 'running' || run.status === 'queued') {
    return (
      <div className="flex flex-col gap-1 min-w-[120px]" title={run.stage ?? undefined}>
        <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{run.status === 'queued' ? 'Queued' : run.stage}</span>
        <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden">
          <div className={`h-full bg-primary-container transition-all duration-500 ${run.status === 'queued' ? 'animate-shimmer' : ''}`} style={{ width: `${Math.max(4, run.progress * 100)}%` }} />
        </div>
      </div>
    );
  }
  if (run.status === 'failed') return <Chip tone="error">Failed</Chip>;
  if (run.is_active) return <Chip tone="primary">Active</Chip>;
  return <Chip>Ready</Chip>;
}
