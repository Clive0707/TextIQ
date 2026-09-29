import type { ReactNode } from 'react';

type Props = { label: string; value: ReactNode; meta?: ReactNode; metaTone?: 'outline' | 'primary'; loading?: boolean };

/** Overview metrics bar tile. */
export function StatCard({ label, value, meta, metaTone = 'outline', loading }: Props) {
  return (
    <div className="p-space-md bg-surface-container-low rounded border border-outline-variant/20 flex flex-col justify-between min-w-0">
      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{label}</span>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 min-w-0">
        {loading ? (
          <span className="h-[26px] w-24 rounded bg-surface-container animate-shimmer" />
        ) : (
          <>
            <span className="font-headline-md text-headline-md text-on-surface font-medium tracking-tight whitespace-nowrap">{value}</span>
            {meta != null && (
              <span className={`font-label-sm text-label-sm truncate ${metaTone === 'primary' ? 'text-primary' : 'text-outline'}`}>{meta}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
