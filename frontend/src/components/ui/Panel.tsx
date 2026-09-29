import type { ReactNode } from 'react';

type PanelProps = {
  children: ReactNode;
  className?: string;
  /**
   * 'bordered' matches the Overview panels (hairline border, 2px radius);
   * 'plain' matches the Classify workspace cards (no border, 4px radius).
   */
  variant?: 'bordered' | 'plain';
  as?: 'section' | 'div';
  id?: string;
  'aria-label'?: string;
};

export function Panel({ children, className = '', variant = 'bordered', as: Tag = 'section', ...rest }: PanelProps) {
  const base = variant === 'bordered' ? 'rounded border border-outline-variant/20' : 'rounded-lg';
  return (
    <Tag className={`bg-surface-container-low p-space-lg ${base} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Overview-style header row: title left, mono meta right, hairline divider below. */
export function PanelHeader({ title, meta, description, divider = true }: { title: ReactNode; meta?: ReactNode; description?: ReactNode; divider?: boolean }) {
  return (
    <>
      <div className={`flex items-baseline justify-between gap-space-md ${divider ? 'pb-space-sm border-b border-outline-variant/15' : 'pb-space-xs'}`}>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
        {meta != null && <span className="font-label-sm text-label-sm text-outline text-right">{meta}</span>}
      </div>
      {description != null && <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 mb-space-md">{description}</p>}
    </>
  );
}

export function PanelFooter({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="pt-space-md mt-space-md border-t border-outline-variant/15 flex flex-wrap items-center justify-between gap-2 text-on-surface-variant font-label-sm text-label-sm">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/** Small uppercase mono caption used above values ("PREDICTED CATEGORY", "DOCUMENTS"). */
export function Caption({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-label-sm text-label-sm uppercase tracking-wider text-outline ${className}`}>{children}</span>;
}
