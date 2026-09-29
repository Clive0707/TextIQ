import { useState } from 'react';

export type BarDatum = {
  key: string;
  label: string;
  value: number;
  /** Text shown at the end of the bar (e.g. "84.5%"). */
  display: string;
  /** Extra line in the hover tooltip. */
  detail?: string;
  /** Emphasised bar (e.g. best model or active model). */
  emphasis?: boolean;
};

type Props = {
  data: BarDatum[];
  /** Upper end of the axis; bars always start at zero. */
  max: number;
  ticks?: number[];
  formatTick?: (v: number) => string;
  labelWidth?: number;
  ariaLabel: string;
};

/**
 * Horizontal bar chart in the TextIQ/Stitch style: one accent hue, zero baseline,
 * recessive gridlines, direct value labels and a per-bar hover tooltip.
 */
export function BarChart({ data, max, ticks = [], formatTick = String, labelWidth = 132, ariaLabel }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / (max || 1)) * 100))}%`;
  return (
    <figure className="flex flex-col gap-1" aria-label={ariaLabel} role="img">
      <div className="relative">
        {/* gridlines */}
        <div className="absolute inset-y-0 right-12 pointer-events-none" style={{ left: labelWidth }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 bottom-0 w-px bg-outline-variant/25" style={{ left: pct(t) }} />
          ))}
        </div>
        <ul className="relative flex flex-col gap-2">
          {data.map((d) => (
            <li
              key={d.key}
              className="flex items-center gap-space-sm group"
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.key)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${d.display}`}
            >
              <span className={`shrink-0 truncate font-body-sm text-body-sm ${d.emphasis ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`} style={{ width: labelWidth - 8 }} title={d.label}>
                {d.label}
              </span>
              <div className="relative flex-1 h-5 flex items-center">
                <div
                  className={`h-3 rounded-r-[4px] origin-left animate-bar-grow transition-opacity ${hover && hover !== d.key ? 'opacity-50' : ''}`}
                  style={{ width: pct(d.value), backgroundColor: d.emphasis ? '#0ea5e9' : 'rgba(14,165,233,0.55)' }}
                />
                {hover === d.key && d.detail && (
                  <span role="tooltip" className="absolute left-0 -top-8 z-20 whitespace-nowrap px-space-sm py-1 rounded border border-outline-variant/30 bg-surface-container-high font-label-sm text-label-sm text-on-surface shadow-xl">
                    {d.label} · {d.display} · {d.detail}
                  </span>
                )}
              </div>
              <span className={`w-12 shrink-0 text-right font-label-md text-label-md tabular ${d.emphasis ? 'text-on-surface' : 'text-on-surface-variant'}`}>{d.display}</span>
            </li>
          ))}
        </ul>
      </div>
      {ticks.length > 0 && (
        <div className="relative h-4 mr-12" style={{ marginLeft: labelWidth }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 font-label-sm text-[10px] text-outline tabular" style={{ left: pct(t) }}>
              {formatTick(t)}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
