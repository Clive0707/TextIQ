import { useState } from 'react';

type Props = { labels: string[]; matrix: number[][] };

/**
 * Confusion matrix heatmap. Rows are true classes, columns predicted classes.
 * Shading is row-normalised (recall per cell) so classes of different sizes are comparable;
 * the raw count is shown on hover and in the cell when there is room.
 */
export function ConfusionMatrix({ labels, matrix }: Props) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const n = labels.length;
  const rowSums = matrix.map((r) => r.reduce((a, b) => a + b, 0));
  const cell = n > 12 ? 26 : n > 8 ? 34 : 60;
  const showCounts = n <= 12;

  const info = hover
    ? (() => {
        const [i, j] = hover;
        const v = matrix[i][j];
        const share = rowSums[i] ? v / rowSums[i] : 0;
        return `${v.toLocaleString()} of ${rowSums[i].toLocaleString()} “${labels[i]}” documents predicted as “${labels[j]}” (${(share * 100).toFixed(1)}%)`;
      })()
    : 'Hover a cell for details. Rows: true class · Columns: predicted class · Shading: share of the row.';

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="overflow-x-auto">
        <table className="border-collapse" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th />
              {labels.map((l, j) => (
                <th key={l} className="p-0 align-bottom" style={{ width: cell }}>
                  <span className={`block font-label-sm text-[10px] leading-3 text-center tabular pb-1 truncate ${hover?.[1] === j ? 'text-on-surface' : 'text-outline'}`} title={l}>
                    {n <= 8 ? l.slice(0, 7) : j + 1}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={labels[i]}>
                <th scope="row" className="pr-space-sm text-right font-normal whitespace-nowrap">
                  <span className={`font-label-sm text-label-sm ${hover?.[0] === i ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    <span className="text-outline tabular mr-1.5">{i + 1}</span>
                    {labels[i]}
                  </span>
                </th>
                {row.map((v, j) => {
                  const share = rowSums[i] ? v / rowSums[i] : 0;
                  const diag = i === j;
                  const active = hover && (hover[0] === i || hover[1] === j);
                  return (
                    <td
                      key={j}
                      onMouseEnter={() => setHover([i, j])}
                      title={`${labels[i]} → ${labels[j]}: ${v}`}
                      className={`p-0 border border-surface-container-low transition-[outline] ${hover?.[0] === i && hover?.[1] === j ? 'outline outline-1 outline-on-surface' : ''}`}
                      style={{ width: cell, height: cell }}
                    >
                      <div
                        className={`w-full h-full flex items-center justify-center font-label-sm tabular ${n <= 8 ? 'text-[12px]' : 'text-[10px]'}`}
                        style={{
                          backgroundColor: v === 0 ? '#1f2022' : diag ? `rgba(14,165,233,${0.15 + share * 0.55})` : `rgba(255,184,110,${0.08 + Math.min(1, share * 2.5) * 0.7})`,
                          color: '#e3e2e4',
                          opacity: hover && !active ? 0.55 : 1,
                        }}
                      >
                        {showCounts && v > 0 ? v : ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-label-sm text-label-sm text-outline min-h-[28px]" aria-live="polite">
        {info}
      </p>
      <div className="flex flex-wrap items-center gap-space-md font-label-sm text-label-sm text-outline">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: 'rgba(14,165,233,0.8)' }} /> Correct (diagonal)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: 'rgba(255,184,110,0.6)' }} /> Misclassified
        </span>
      </div>
    </div>
  );
}
