import type { ReactNode } from 'react';
import { fmtInt, fmtPct } from '../../utils/format';

/**
 * Overview "Category distribution" row: label, share and count above a flat 6px bar.
 * `tone` steps down the accent opacity row by row, as in the Stitch export.
 */
export function DistributionRow({ label, share, count, tone = 1, muted = false, unit = 'docs' }: { label: string; share: number; count: number; tone?: number; muted?: boolean; unit?: string }) {
  const opacity = muted ? undefined : Math.max(0.5, tone);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 font-label-sm text-label-sm mb-1">
        <span className={`font-body-sm text-body-sm truncate ${muted ? 'text-on-surface-variant' : 'text-on-surface'}`}>{label}</span>
        <span className="text-on-surface-variant shrink-0 tabular">
          {fmtPct(share)} <span className="text-outline text-[10px] ml-1">{fmtInt(count)} {unit}</span>
        </span>
      </div>
      <div className="w-full h-1.5 bg-surface-container-highest overflow-hidden">
        <div
          className={`h-full origin-left animate-bar-grow ${muted ? 'bg-outline-variant/60' : 'bg-primary-container'}`}
          style={{ width: `${Math.min(100, share * 100)}%`, opacity }}
        />
      </div>
    </div>
  );
}

/** Classify "Category distribution" row: compact 4px rounded bar. */
export function ProbabilityRow({ label, value, highlight, right }: { label: string; value: number; highlight?: boolean; right?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 font-label-sm text-label-sm">
        <span className={`truncate ${highlight ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>{label}</span>
        <span className={`tabular shrink-0 ${highlight ? 'text-on-surface' : 'text-on-surface-variant'}`}>{right ?? fmtPct(value)}</span>
      </div>
      <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden">
        <div className={`h-full origin-left animate-bar-grow ${highlight ? 'bg-primary' : 'bg-secondary'}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
      </div>
    </div>
  );
}

/** Classify "Salient n-grams" row: mono feature chip + weight bar + signed value. */
export function FeatureWeightRow({ feature, magnitude, display, negative }: { feature: string; magnitude: number; display: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-space-md text-label-sm font-label-sm py-0.5">
      <span className="text-on-surface bg-surface-container px-2 py-0.5 rounded font-mono truncate min-w-0" title={feature}>
        {feature}
      </span>
      <div className="flex items-center gap-space-sm flex-1 max-w-[160px] shrink-0">
        <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden">
          <div className={`h-full origin-left animate-bar-grow ${negative ? 'bg-tertiary' : 'bg-primary'}`} style={{ width: `${Math.max(2, Math.min(100, magnitude * 100))}%` }} />
        </div>
        <span className={`font-mono w-12 text-right tabular ${negative ? 'text-tertiary' : 'text-primary'}`}>{display}</span>
      </div>
    </div>
  );
}

/** Horizontal metric bar used in comparison tables (value 0..1). */
export function MetricBar({ value, best }: { value: number; best?: boolean }) {
  return (
    <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden">
      <div className={`h-full origin-left animate-bar-grow ${best ? 'bg-primary-container' : 'bg-secondary/60'}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}
