const nf = new Intl.NumberFormat('en-US');

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

export const fmtPct = (p: number | null | undefined, digits = 1) => (p == null ? '—' : `${(p * 100).toFixed(digits)}%`);

export const fmtScore = (n: number | null | undefined, digits = 3) => (n == null ? '—' : n.toFixed(digits));

export const fmtSigned = (n: number, digits = 2) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

export function fmtSeconds(s: number | null | undefined) {
  if (s == null) return '—';
  if (s < 1) return `${Math.max(s * 1000, 1).toFixed(0)}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

/** "4m ago" style relative time for ISO timestamps from the API (UTC). */
export function fmtRelative(iso: string | null | undefined) {
  if (!iso) return '—';
  const t = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime();
  const diff = Math.max(0, (Date.now() - t) / 1000);
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const t = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return t.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const pluralize = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

export function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
