import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { ApiError } from '../../services/api';

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 animate-spin rounded-[50%] border-2 border-current border-r-transparent opacity-80 ${className}`}
      style={{ width: size - 2, height: size - 2 }}
    />
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-surface-container animate-shimmer ${className}`} />;
}

/** Placeholder lines inside a panel while data loads. */
export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-space-md py-space-sm" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

/** Quiet empty state that sits inside a panel, in the Stitch type scale. */
export function EmptyState({ icon = 'inbox', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-space-xl px-space-lg gap-space-sm animate-fade-in">
      <span className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-outline">
        <Icon name={icon} size={18} />
      </span>
      <p className="font-headline-sm text-headline-sm text-on-surface">{title}</p>
      {children && <div className="font-body-sm text-body-sm text-on-surface-variant max-w-sm">{children}</div>}
      {action && <div className="mt-space-xs">{action}</div>}
    </div>
  );
}

/** Inline error: short message + reason, no stack traces. */
export function ErrorNotice({ error, title, onRetry }: { error: ApiError | { message: string; details?: string[] }; title?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-space-sm p-space-md rounded border border-error/25 bg-error-container/10 animate-fade-in">
      <Icon name="error" size={16} className="text-error mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-body-sm text-body-sm text-on-surface font-medium">{title}</p>}
        <p className="font-body-sm text-body-sm text-on-surface-variant">{error.message}</p>
        {error.details && error.details.length > 0 && (
          <ul className="mt-1 list-disc pl-4 font-label-sm text-label-sm text-on-surface-variant space-y-0.5">
            {error.details.slice(0, 6).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="font-label-sm text-label-sm text-outline hover:text-on-surface transition-colors shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

export function Notice({ icon = 'info', children, tone = 'neutral' }: { icon?: string; children: ReactNode; tone?: 'neutral' | 'warning' }) {
  return (
    <div className={`flex items-start gap-2 font-label-sm text-label-sm ${tone === 'warning' ? 'text-tertiary' : 'text-outline'}`}>
      <Icon name={icon} size={14} className="mt-px" />
      <span>{children}</span>
    </div>
  );
}
