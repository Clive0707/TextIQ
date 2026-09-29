import type { ReactNode } from 'react';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-container text-on-surface-variant border-outline-variant/30',
  primary: 'bg-primary-container/10 text-primary border-primary-container/30',
  success: 'bg-surface-container text-secondary border-outline-variant/30',
  warning: 'bg-tertiary-container/10 text-tertiary border-tertiary/30',
  error: 'bg-error-container/20 text-error border-error/30',
};

/** Category label chip from the Overview "Predicted class" column. */
export function Chip({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-label-sm text-label-sm whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>
  );
}

/** Status dot + label (model table uses a 6px dot to mark the active row). */
export function StatusDot({ active }: { active?: boolean }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-primary-container' : 'bg-outline-variant/40'}`} />;
}
